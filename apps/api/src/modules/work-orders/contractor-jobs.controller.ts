import {
  Body,
  Controller,
  Get,
  GoneException,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { hashToken, withTenant, type Tx } from '@cafm/db';
import {
  contractorNoteSchema,
  contractorStatusSchema,
  resolveEntitlements,
  WORK_ORDER_FIELD_STATUSES,
  WORK_ORDER_PAUSE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  workOrderNextStatuses,
  type ContractorJob,
  type WorkOrderPauseReason,
  type WorkOrderStatus,
} from '@cafm/shared';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/validation';
import { syncRequest } from './request-sync';
import { statusChange } from './work-order-records';
import { lockWorkOrders } from './work-order-scope';

/** What someone with only a link may do: the steps of doing the job, and nothing that needs an account. */
const LINK_PERMISSIONS = ['work_orders.close'];
const CLOSED_FOR_NOTES: readonly WorkOrderStatus[] = ['closed', 'cancelled'];

const gone = () =>
  new GoneException({ code: 'link_unusable', message: 'This link has expired or been withdrawn. Ask for a new one.' });

/**
 * The page a contractor opens from the emailed link. There is no session: the token is the only key,
 * it is stored as a hash, and it works for one job until it expires or is withdrawn.
 */
@Controller('contractor-jobs')
export class ContractorJobsController {
  constructor(private readonly db: PrismaService) {}

  /** Finds the link's organisation from the token alone (find_work_order_contractor), then works inside it. */
  private async locate(token: string): Promise<{ id: string; tenantId: string }> {
    const [found] = await this.db.$queryRaw<
      { id: string; tenant_id: string }[]
    >`SELECT id, tenant_id FROM find_work_order_contractor(${hashToken(token)})`;
    if (!found) throw new NotFoundException({ code: 'link_not_found', message: 'This link isn’t valid.' });
    return { id: found.id, tenantId: found.tenant_id };
  }

  /** The link, its job and the organisation, checked as usable now. */
  private async open(tx: Tx, id: string, tenantId: string) {
    const link = await tx.workOrderContractor.findUniqueOrThrow({
      where: { id },
      include: {
        tenant: { select: { status: true, plan: true, entitlements: true } },
        workOrder: {
          include: {
            location: { select: { name: true, code: true, details: true } },
            asset: { select: { name: true, number: true, locationId: true } },
          },
        },
      },
    });
    const { tenant } = link;
    if (
      tenant.status !== 'active' ||
      !resolveEntitlements(tenant.plan, tenant.entitlements).features.includes('work_orders')
    ) {
      throw new NotFoundException({ code: 'link_not_found', message: 'This link isn’t valid.' });
    }
    if (link.revokedAt || link.expiresAt <= new Date()) throw gone();
    return { link, job: link.workOrder, tenantId };
  }

  private async view(tx: Tx, opened: Awaited<ReturnType<ContractorJobsController['open']>>): Promise<ContractorJob> {
    const { link, job, tenantId } = opened;
    const entries = await tx.workOrderEntry.findMany({
      where: { tenantId, workOrderId: job.id, kind: 'comment', internal: false },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const details = job.location.details as { address?: unknown } | null;
    const status = job.status as WorkOrderStatus;
    return {
      contractorName: link.name,
      number: job.number,
      title: job.title,
      description: job.description,
      status,
      pauseReason: job.pauseReason as WorkOrderPauseReason | null,
      priority: job.priority,
      location: {
        name: job.location.name,
        code: job.location.code,
        address: typeof details?.address === 'string' ? details.address : null,
      },
      asset: job.asset?.locationId === job.locationId ? { name: job.asset.name, number: job.asset.number } : null,
      attendDueAt: job.attendDueAt?.toISOString() ?? null,
      fixDueAt: job.fixDueAt?.toISOString() ?? null,
      expiresAt: link.expiresAt.toISOString(),
      nextStatuses: workOrderNextStatuses(status, LINK_PERMISSIONS).filter((next) =>
        WORK_ORDER_FIELD_STATUSES.includes(next),
      ),
      // Staff notes are shown as the team's, so no one's name is passed to someone outside the organisation.
      notes: entries.map(({ id, body, actorName, createdAt }) => ({
        id,
        author: actorName ?? 'Facilities team',
        body,
        createdAt: createdAt.toISOString(),
      })),
    };
  }

  @Get(':token')
  async details(@Param('token') token: string): Promise<ContractorJob> {
    const { id, tenantId } = await this.locate(token);
    return withTenant(this.db, tenantId, async (tx) => this.view(tx, await this.open(tx, id, tenantId)));
  }

  @Post(':token/status')
  async status(@Param('token') token: string, @Body() body: unknown): Promise<ContractorJob> {
    const input = parse(contractorStatusSchema, body);
    const { id, tenantId } = await this.locate(token);
    return withTenant(this.db, tenantId, async (tx) => {
      await lockWorkOrders(tx, tenantId);
      const opened = await this.open(tx, id, tenantId);
      const { link, job } = opened;
      const current = job.status as WorkOrderStatus;
      if (!workOrderNextStatuses(current, LINK_PERMISSIONS).includes(input.status)) {
        throw new UnprocessableEntityException('That status change is unavailable.');
      }
      const now = new Date();
      const { reopened, data } = statusChange(job, current, input.status, input.pauseReason, now);
      const next = await tx.workOrder.update({ where: { id: job.id }, data: { ...data, version: { increment: 1 } } });
      await tx.workOrderEntry.create({
        data: {
          tenantId,
          workOrderId: job.id,
          actorName: link.name,
          kind: 'status',
          body: [
            WORK_ORDER_STATUS_LABELS[input.status],
            input.pauseReason ? WORK_ORDER_PAUSE_LABELS[input.pauseReason] : null,
            input.note,
          ]
            .filter(Boolean)
            .join(' · '),
        },
      });
      await tx.workOrderContractor.update({ where: { id: link.id }, data: { lastUsedAt: now } });
      await tx.auditEvent.create({
        data: {
          tenantId,
          entityType: 'work_order',
          entityId: job.id,
          action: 'work_order.status',
          changes: {
            before: { status: current },
            after: { status: input.status },
            via: 'contractor_link',
            contractor: link.name,
          },
        },
      });
      if (next.requestId && (input.status === 'completed' || reopened)) {
        await syncRequest(tx, tenantId, next.requestId, null);
      }
      return this.view(tx, { ...opened, job: { ...job, ...next } });
    });
  }

  @Post(':token/notes')
  async note(@Param('token') token: string, @Body() body: unknown): Promise<ContractorJob> {
    const input = parse(contractorNoteSchema, body);
    const { id, tenantId } = await this.locate(token);
    return withTenant(this.db, tenantId, async (tx) => {
      await lockWorkOrders(tx, tenantId);
      const opened = await this.open(tx, id, tenantId);
      const { link, job } = opened;
      if (CLOSED_FOR_NOTES.includes(job.status as WorkOrderStatus)) {
        throw new UnprocessableEntityException('This work order is closed to new notes.');
      }
      const now = new Date();
      await tx.workOrderEntry.create({
        data: { tenantId, workOrderId: job.id, actorName: link.name, kind: 'comment', body: input.body },
      });
      await tx.workOrder.update({ where: { id: job.id }, data: { firstResponseAt: job.firstResponseAt ?? now } });
      await tx.workOrderContractor.update({ where: { id: link.id }, data: { lastUsedAt: now } });
      await tx.auditEvent.create({
        data: {
          tenantId,
          entityType: 'work_order',
          entityId: job.id,
          action: 'work_order.comment',
          changes: { internal: false, via: 'contractor_link', contractor: link.name },
        },
      });
      return this.view(tx, opened);
    });
  }
}
