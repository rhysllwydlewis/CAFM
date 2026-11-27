import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant } from '@fmstead/db';
import {
  formatMinor,
  JOB_SHEET_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  type CostKind,
  type PhotoPhase,
  type SignatureRole,
} from '@fmstead/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { queueTenantEmail } from '../../core/mail';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { AttachmentsService } from '../attachments/attachments.service';
import { renderJobSheet, type JobSheetData } from './job-sheet';
import { readChecklists } from './work-order-checklists';
import { PRIORITY_NAMES, getWorkOrder } from './work-order-records';
import { withWorkOrderWrite } from './work-order-scope';

/** Photos are drawn into the sheet only when small enough that the file stays easy to email. */
const EMBED_PHOTO_BYTES = 400_000;
const EMBED_PHOTOS = 6;
const EMBEDDABLE = ['image/jpeg', 'image/png'];
/** An emailed sheet must stay well inside what the outbox and mail servers handle. */
const MAX_EMAIL_PDF_BYTES = 750_000;
const COMPLETED_PREFIX = WORK_ORDER_STATUS_LABELS.completed + ' · ';
/** The note given when completing a job: its entry reads "Completed · note · SLA clock …", and only the note is for the sheet. */
const completionNote = (body: string) =>
  body
    .slice(COMPLETED_PREFIX.length)
    .replace(/( · )?SLA clock .*$/, '')
    .trim();
const EMAILED_NOTE = 'Job sheet emailed to the requester';
/** The requester is not sent the same sheet again within this time, so a double click or a mistake can't flood them. */
const RESEND_AFTER_MS = 60_000;

@Controller('work-orders/:id/job-sheet')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class WorkOrderJobSheetController {
  constructor(
    private readonly db: PrismaService,
    private readonly files: AttachmentsService,
  ) {}

  /**
   * Everything the sheet shows. Money appears only for a copy that is allowed to show it, and internal notes and
   * staff names on the timeline never do.
   */
  private async build(auth: AuthContext, id: string, copy: { costs: boolean; embedPhotos: boolean }) {
    const tenantId = auth.membership!.tenantId;
    const gathered = await withTenant(this.db, tenantId, async (tx) => {
      const job = await getWorkOrder(tx, auth, id);
      const [notes, checklists, photos, signatures, costs, site, location, request] = await Promise.all([
        // What was written for people to read: comments, and the note given when the job was completed.
        tx.workOrderEntry.findMany({
          where: {
            tenantId,
            workOrderId: id,
            internal: false,
            OR: [{ kind: 'comment' }, { kind: 'status', body: { startsWith: COMPLETED_PREFIX } }],
          },
          // The latest fifteen, so a long job keeps its completion note. They are put back in order below.
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 15,
          select: { kind: true, body: true, createdAt: true },
        }),
        readChecklists(tx, tenantId, id),
        tx.recordAttachment.findMany({
          where: { tenantId, workOrderId: id, phase: { not: null } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, filename: true, phase: true, caption: true, mediaType: true, byteLength: true },
        }),
        tx.workOrderSignature.findMany({
          where: { tenantId, workOrderId: id },
          orderBy: [{ signedAt: 'asc' }, { id: 'asc' }],
          select: { role: true, signerName: true, signedAt: true, attachmentId: true },
        }),
        copy.costs
          ? tx.workOrderCost.findMany({
              where: { tenantId, workOrderId: id },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            })
          : null,
        tx.locationPath.findFirst({
          where: { tenantId, descendantId: job.locationId, ancestor: { kind: 'site' } },
          select: { ancestor: { select: { name: true } } },
        }),
        tx.location.findFirst({
          where: { tenantId, id: job.locationId },
          select: { name: true, code: true, details: true },
        }),
        job.requestId
          ? tx.serviceRequest.findFirst({
              where: { tenantId, id: job.requestId },
              select: { requesterId: true, externalEmail: true, number: true },
            })
          : null,
      ]);
      const requesterEmail = request?.requesterId
        ? (
            await tx.membership.findFirst({
              where: { tenantId, id: request.requesterId, status: 'active' },
              select: { account: { select: { email: true } } },
            })
          )?.account.email
        : request?.externalEmail;
      return {
        job,
        notes,
        checklists,
        photos,
        signatures,
        costs,
        site,
        location,
        requesterEmail: requesterEmail ?? null,
      };
    });
    const { job } = gathered;
    const embeddable = copy.embedPhotos
      ? gathered.photos
          .filter((p) => EMBEDDABLE.includes(p.mediaType) && p.byteLength <= EMBED_PHOTO_BYTES)
          .slice(0, EMBED_PHOTOS)
      : [];
    const embedded = new Map(
      await Promise.all(
        embeddable.map(async (photo) => [photo.id, await this.files.readFile(tenantId, photo.id)] as const),
      ),
    );
    const drawings = await Promise.all(
      gathered.signatures.map(async (signature) => ({
        role: signature.role as SignatureRole,
        signerName: signature.signerName,
        signedAt: signature.signedAt,
        image: await this.files.readFile(tenantId, signature.attachmentId),
      })),
    );
    const details = gathered.location?.details as { address?: unknown } | null;
    const data: JobSheetData = {
      organisation: auth.membership!.tenant.name,
      number: job.number,
      title: job.title,
      description: job.description,
      priority: `P${job.priority} ${PRIORITY_NAMES[job.priority - 1] ?? ''}`.trim(),
      status: WORK_ORDER_STATUS_LABELS[job.status as keyof typeof WORK_ORDER_STATUS_LABELS],
      raisedAt: job.createdAt,
      raisedBy: job.createdBy?.account.name ?? null,
      completedAt: job.completedAt,
      site: gathered.site?.ancestor.name ?? null,
      location: {
        name: gathered.location?.name ?? job.location.name,
        code: gathered.location?.code ?? '',
        address: typeof details?.address === 'string' ? details.address : null,
      },
      asset: job.asset?.locationId === job.locationId ? { name: job.asset.name, number: job.asset.number } : null,
      assignee: job.assignee?.account.name ?? (job.contractors[0] ? `${job.contractors[0].name} (contractor)` : null),
      notes: [...gathered.notes].reverse().flatMap((note) => {
        const body = note.kind === 'status' ? completionNote(note.body) : note.body;
        return body ? [{ at: note.createdAt, body }] : [];
      }),
      checklists: gathered.checklists,
      costs: gathered.costs && {
        currency: job.currency,
        items: gathered.costs.map((cost) => ({
          kind: cost.kind as CostKind,
          description: cost.description,
          // Hours or items at a rate. A single amount has no quantity to show.
          detail:
            cost.kind === 'labour' || cost.kind === 'parts'
              ? `${cost.quantityMilli / 1000}${cost.kind === 'labour' ? ' h' : ''} × ${formatMinor(cost.unitCostMinor, job.currency)}`
              : null,
          amountMinor: cost.amountMinor,
        })),
        totalMinor: gathered.costs.reduce((total, cost) => total + cost.amountMinor, 0),
      },
      photos: gathered.photos.map((photo) => ({
        phase: photo.phase as PhotoPhase,
        caption: photo.caption,
        filename: photo.filename,
        image: embedded.get(photo.id) ?? null,
      })),
      signatures: drawings,
      generatedAt: new Date(),
    };
    return { data, job, requesterEmail: gathered.requesterEmail, requestNumber: job.request?.number };
  }

  /** The sheet as a PDF. Money is on it only for people who can see costs. */
  @Get()
  @RequirePermission('work_orders.read')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    const { data } = await this.build(auth, id, {
      costs: auth.access!.permissions.has('costs.read'),
      embedPhotos: true,
    });
    const pdf = await renderJobSheet(data);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="job-sheet-${data.number.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`,
      length: pdf.length,
    });
  }

  /**
   * Emails the customer copy to whoever reported the job: no costs and no internal notes. It can be sent once the
   * work is done.
   */
  @Post('email')
  @RequirePermission('work_orders.edit')
  async email(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    const sheet = await this.build(auth, id, { costs: false, embedPhotos: false });
    if (!(JOB_SHEET_STATUSES as readonly string[]).includes(sheet.job.status)) {
      throw new UnprocessableEntityException('The job sheet can be emailed once the work is completed.');
    }
    if (!sheet.requesterEmail) {
      throw new UnprocessableEntityException('This work order has no requester with an email address to send it to.');
    }
    const pdf = await renderJobSheet(sheet.data);
    if (pdf.length > MAX_EMAIL_PDF_BYTES) {
      throw new UnprocessableEntityException('The job sheet is too large to email. Download it instead.');
    }
    const to = sheet.requesterEmail;
    await withWorkOrderWrite(this.db, auth, 'work_orders.edit', async (tx, current) => {
      const tenantId = current.membership!.tenantId;
      // Rechecked in the transaction: the job may have moved since the sheet was built.
      const job = await getWorkOrder(tx, current, id);
      if (!(JOB_SHEET_STATUSES as readonly string[]).includes(job.status)) {
        throw new UnprocessableEntityException('The job sheet can be emailed once the work is completed.');
      }
      const recent = await tx.workOrderEntry.findFirst({
        where: {
          tenantId,
          workOrderId: id,
          kind: 'system',
          body: EMAILED_NOTE,
          createdAt: { gte: new Date(Date.now() - RESEND_AFTER_MS) },
        },
        select: { id: true },
      });
      if (recent) {
        throw new UnprocessableEntityException(
          'The job sheet was only just sent. Wait a minute before sending it again.',
        );
      }
      await queueTenantEmail(tx, tenantId, {
        to,
        subject: `Job sheet for ${sheet.requestNumber ?? job.number}: ${job.title}`,
        text: [
          `Hello,`,
          ``,
          `The work on "${job.title}" (${job.number}) at ${sheet.data.location.name} is done. The job sheet is attached.`,
          ``,
          `${current.membership!.tenant.name}`,
        ].join('\n'),
        capture: current.membership!.tenant.demo,
        attachments: [
          {
            filename: `job-sheet-${job.number}.pdf`,
            contentType: 'application/pdf',
            contentBase64: pdf.toString('base64'),
          },
        ],
      });
      await tx.workOrderEntry.create({
        data: {
          tenantId,
          workOrderId: id,
          authorId: current.membership!.id,
          kind: 'system',
          body: EMAILED_NOTE,
          internal: true,
        },
      });
      await audit(
        tx,
        current,
        {
          action: 'work_order.job_sheet_emailed',
          entityType: 'work_order',
          entityId: id,
          changes: { to: 'requester', bytes: pdf.length },
        },
        req.ip,
      );
    });
    return { sent: true };
  }
}
