import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { withTenant, type Tx } from '@cafm/db';
import {
  addSignatureSchema,
  SIGNATURE_DATA_URL,
  SIGNATURE_MAX_BYTES,
  SIGNATURE_STATUSES,
  uploadPhotoQuerySchema,
  type PhotoPhase,
  type SignatureRole,
  type WorkOrderPhoto,
  type WorkOrderSignature,
} from '@cafm/shared';
import { audit } from '../../core/audit';
import { PermissionGuard, RequireFeature, RequirePermission, SessionGuard, TenantGuard } from '../../core/auth.guards';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { type Upload, uploadOptions } from '../attachments/attachment-file';
import { AttachmentsService } from '../attachments/attachments.service';
import { getWorkOrder } from './work-order-records';
import { assertCanWorkJob } from './work-order-scope';

const downloadHeaders = {
  cache: 'private, no-store',
  sniff: 'nosniff',
  csp: "default-src 'none'; sandbox",
};

/** The PNG inside a signature's data URL, or null when it isn't a PNG or is larger than a drawing should be. */
export function decodeSignatureImage(dataUrl: string): Buffer | null {
  const match = SIGNATURE_DATA_URL.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[1]!, 'base64');
  const png = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  return png && bytes.length > 0 && bytes.length <= SIGNATURE_MAX_BYTES ? bytes : null;
}

export async function readPhotos(tx: Tx, tenantId: string, workOrderId: string): Promise<WorkOrderPhoto[]> {
  const rows = await tx.recordAttachment.findMany({
    where: { tenantId, workOrderId, phase: { not: null } },
    select: { id: true, filename: true, phase: true, caption: true, byteLength: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    phase: row.phase as PhotoPhase,
    caption: row.caption,
    byteLength: row.byteLength,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function readSignatures(tx: Tx, tenantId: string, workOrderId: string): Promise<WorkOrderSignature[]> {
  const rows = await tx.workOrderSignature.findMany({
    where: { tenantId, workOrderId },
    include: { recordedBy: { select: { account: { select: { name: true } } } } },
    orderBy: [{ signedAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role as SignatureRole,
    signerName: row.signerName,
    signedAt: row.signedAt.toISOString(),
    recordedByName: row.recordedBy?.account.name ?? null,
  }));
}

/** The technician's sign-off says they did the work, so only the person the job is assigned to can give it. */
function assertMaySign(role: SignatureRole, assigneeId: string | null, memberId: string) {
  if (role === 'technician' && assigneeId !== memberId) {
    throw new ForbiddenException('Only the technician the job is assigned to can give the technician’s sign-off.');
  }
}

/** Before and after photos on a job. Whoever does the job can add them; removing one is a supervisor's. */
@Controller('work-orders/:id/photos')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class WorkOrderPhotosController {
  constructor(
    private readonly db: PrismaService,
    private readonly files: AttachmentsService,
  ) {}

  @Get()
  @RequirePermission('work_orders.read')
  list(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      await getWorkOrder(tx, auth, id);
      return readPhotos(tx, auth.membership!.tenantId, id);
    });
  }

  /** `?phase=before|after|other&caption=…` with the photo as the `file` part. */
  @Put()
  @RequirePermission('work_orders.read')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async upload(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Upload) {
    const { phase, caption } = parse(uploadPhotoQuerySchema, req.query);
    const saved = await this.files.upload(req, { type: 'workOrder', id }, file, { phase, caption });
    return { ...saved, phase, caption: caption ?? null };
  }

  @Get(':fileId')
  @RequirePermission('work_orders.read')
  @Header('Cache-Control', downloadHeaders.cache)
  @Header('X-Content-Type-Options', downloadHeaders.sniff)
  @Header('Content-Security-Policy', downloadHeaders.csp)
  download(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.files.download(req, { type: 'workOrder', id }, fileId);
  }

  @Delete(':fileId')
  @RequirePermission('work_orders.edit')
  async remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    await this.files.removeFromWorkOrder(req, id, fileId, 'photo');
    return { ok: true };
  }
}

/**
 * Sign-off on a job: the customer's and the technician's. The drawing is a small PNG, kept as a private file. A
 * job has at most one of each; to sign again, a supervisor removes the earlier one first, and that is audited.
 */
@Controller('work-orders/:id/signatures')
@UseGuards(SessionGuard, TenantGuard, PermissionGuard)
@RequireFeature('work_orders')
export class WorkOrderSignaturesController {
  constructor(
    private readonly db: PrismaService,
    private readonly files: AttachmentsService,
  ) {}

  @Get()
  @RequirePermission('work_orders.read')
  list(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const auth = req.auth!;
    return withTenant(this.db, auth.membership!.tenantId, async (tx) => {
      await getWorkOrder(tx, auth, id);
      return readSignatures(tx, auth.membership!.tenantId, id);
    });
  }

  @Post()
  @RequirePermission('work_orders.read')
  async add(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    assertCanWorkJob(req.auth!);
    const input = parse(addSignatureSchema, body);
    const png = decodeSignatureImage(input.image);
    if (!png) throw new UnprocessableEntityException('Draw a signature first.');
    const auth = req.auth!;
    const signerName = input.role === 'technician' ? auth.account.name : input.signerName?.trim();
    if (!signerName) throw new UnprocessableEntityException('Enter the customer’s name.');
    const tenantId = auth.membership!.tenantId;
    // Checked before anything is stored, so a refused signature leaves nothing behind.
    await withTenant(this.db, tenantId, async (tx) => {
      const job = await getWorkOrder(tx, auth, id);
      if (!(SIGNATURE_STATUSES as readonly string[]).includes(job.status)) {
        throw new UnprocessableEntityException('A job can be signed off once the work has started.');
      }
      assertMaySign(input.role, job.assigneeId, auth.membership!.id);
      if (await tx.workOrderSignature.count({ where: { tenantId, workOrderId: id, role: input.role } })) {
        throw new ConflictException('This job already has that sign-off. A supervisor can remove it to sign again.');
      }
    });
    await this.files.upload(
      req,
      { type: 'workOrder', id },
      { originalname: `signature-${input.role}.png`, buffer: png },
      {
        after: async (tx, current, row) => {
          const job = await getWorkOrder(tx, current, id);
          if (!(SIGNATURE_STATUSES as readonly string[]).includes(job.status)) {
            throw new UnprocessableEntityException('A job can be signed off once the work has started.');
          }
          assertMaySign(input.role, job.assigneeId, current.membership!.id);
          const clash = await tx.workOrderSignature.count({ where: { tenantId, workOrderId: id, role: input.role } });
          if (clash) throw new ConflictException('This job already has that sign-off.');
          await tx.workOrderSignature.create({
            data: {
              tenantId,
              workOrderId: id,
              role: input.role,
              signerName,
              attachmentId: row.id,
              recordedById: current.membership!.id,
            },
          });
          await audit(
            tx,
            current,
            {
              action: 'work_order_signature.add',
              entityType: 'work_order',
              entityId: id,
              changes: { role: input.role, signerName },
            },
            req.ip,
          );
        },
      },
    );
    return withTenant(this.db, tenantId, async (tx) => readSignatures(tx, tenantId, id));
  }

  /** The drawing. */
  @Get(':signatureId/image')
  @RequirePermission('work_orders.read')
  @Header('Cache-Control', downloadHeaders.cache)
  @Header('X-Content-Type-Options', downloadHeaders.sniff)
  @Header('Content-Security-Policy', downloadHeaders.csp)
  async image(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signatureId', ParseUUIDPipe) signatureId: string,
  ) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const attachmentId = await withTenant(this.db, tenantId, async (tx) => {
      await getWorkOrder(tx, auth, id);
      const row = await tx.workOrderSignature.findFirst({
        where: { tenantId, workOrderId: id, id: signatureId },
        select: { attachmentId: true },
      });
      if (!row) throw new NotFoundException('Signature not found.');
      return row.attachmentId;
    });
    return this.files.download(req, { type: 'workOrder', id }, attachmentId);
  }

  @Delete(':signatureId')
  @RequirePermission('work_orders.edit')
  async remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signatureId', ParseUUIDPipe) signatureId: string,
  ) {
    const auth = req.auth!;
    const tenantId = auth.membership!.tenantId;
    const found = await withTenant(this.db, tenantId, async (tx) => {
      await getWorkOrder(tx, auth, id);
      const row = await tx.workOrderSignature.findFirst({ where: { tenantId, workOrderId: id, id: signatureId } });
      if (!row) throw new NotFoundException('Signature not found.');
      return row;
    });
    // The drawing goes with it (the signature row follows the file), and the removal is audited with it.
    await this.files.removeFromWorkOrder(req, id, found.attachmentId, 'signature', (tx, current) =>
      audit(
        tx,
        current,
        {
          action: 'work_order_signature.remove',
          entityType: 'work_order',
          entityId: id,
          changes: { role: found.role, signerName: found.signerName },
        },
        req.ip,
      ),
    );
    return withTenant(this.db, tenantId, async (tx) => readSignatures(tx, tenantId, id));
  }
}
