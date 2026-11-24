import { createHash } from 'node:crypto';
import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, Prisma } from '@cafm/db';
import type { MobileMutationItem } from '@cafm/shared';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { AssetOperationsController } from '../assets/asset-operations.controller';
import { WorkOrderChecklistsController } from '../work-orders/work-order-checklists.controller';
import { WorkOrderTimeController } from '../work-orders/work-order-time.controller';
import { WorkOrdersController } from '../work-orders/work-orders.controller';

/** How long a request waits for another one that holds the same key before it asks the phone to try again. */
const CLAIM_WAIT_MS = 10_000;
/** A claim this old is from a request that died, so a retry may take the key over. */
const CLAIM_ABANDONED_MS = 2 * 60_000;
const CLAIM_POLL_MS = 100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type MobileMutationResult = {
  key: string;
  status: 'applied' | 'rejected';
  /** For a rejection: conflict (the job changed, refresh it), invalid, forbidden, not_found or rejected. */
  code?: string;
  message?: string;
  replayed?: boolean;
};

const hashOf = (item: MobileMutationItem) => {
  const { key: _key, ...content } = item;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
};

function codeFor(status: number): string {
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'invalid';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  return 'rejected';
}

function messageOf(error: HttpException): string {
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  const { message } = body as { message?: unknown };
  return Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : error.message;
}

/**
 * Applies the changes a phone made offline, each exactly once. A change goes through the same code as the
 * website's endpoint, so permissions, data scope, versions, checklist gates and audit events are the same.
 * The key is claimed before the change runs and the outcome is kept against it, so a retry after a dropped
 * connection, or the same key arriving twice at once, is answered and not repeated.
 */
@Injectable()
export class MobileMutations {
  constructor(
    private readonly db: PrismaService,
    private readonly jobs: WorkOrdersController,
    private readonly checklists: WorkOrderChecklistsController,
    private readonly assets: AssetOperationsController,
    private readonly time: WorkOrderTimeController,
  ) {}

  async apply(auth: AuthContext, ip: string | undefined, items: MobileMutationItem[]): Promise<MobileMutationResult[]> {
    const results: MobileMutationResult[] = [];
    for (const item of items) results.push(await this.applyOne(auth, ip, item));
    return results;
  }

  private async applyOne(auth: AuthContext, ip: string | undefined, item: MobileMutationItem) {
    const { tenantId, id: memberId } = auth.membership!;
    const requestHash = hashOf(item);
    const claim = await this.claim(tenantId, memberId, item, requestHash);
    if (typeof claim !== 'string') return claim;

    let result: MobileMutationResult;
    try {
      await this.dispatch(auth, ip, item);
      result = { key: item.key, status: 'applied' };
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() >= 500) {
        // The change did not finish, so give the key back and let the phone try again.
        await this.release(tenantId, claim);
        throw error;
      }
      result = {
        key: item.key,
        status: 'rejected',
        code: codeFor(error.getStatus()),
        message: messageOf(error),
      };
    }
    await withTenant(this.db, tenantId, (tx) =>
      tx.mobileMutation.update({
        where: { id: claim },
        data: { outcome: result.status, result: { code: result.code ?? null, message: result.message ?? null } },
      }),
    );
    return result;
  }

  /**
   * Claims the key before the change runs, so two requests with the same key at the same moment cannot both run
   * it. Returns the claim's id when this request may run the change, or the answer to give when the key already has
   * an outcome. A request that finds another one still running waits a moment for its outcome, and asks the phone
   * to try again if that takes too long.
   */
  private async claim(
    tenantId: string,
    memberId: string,
    item: MobileMutationItem,
    requestHash: string,
  ): Promise<string | MobileMutationResult> {
    const where = { tenantId_memberId_key: { tenantId, memberId, key: item.key } };
    const deadline = Date.now() + CLAIM_WAIT_MS;
    for (;;) {
      try {
        const row = await withTenant(this.db, tenantId, (tx) =>
          tx.mobileMutation.create({
            data: { tenantId, memberId, key: item.key, kind: item.kind, requestHash, outcome: 'pending' },
            select: { id: true },
          }),
        );
        return row.id;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      }
      const seen = await withTenant(this.db, tenantId, (tx) => tx.mobileMutation.findUnique({ where }));
      if (!seen) continue; // It was released between the two calls: try to claim it again.
      if (seen.requestHash !== requestHash || seen.outcome !== 'pending')
        return this.replay(item.key, seen, requestHash);
      if (Date.now() - seen.createdAt.getTime() > CLAIM_ABANDONED_MS) {
        await this.release(tenantId, seen.id);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new ServiceUnavailableException('This change is still being applied. Try again in a moment.');
      }
      await sleep(CLAIM_POLL_MS);
    }
  }

  /** Gives a claimed key back, but only while it is still pending (an outcome is never deleted). */
  private release(tenantId: string, id: string) {
    return withTenant(this.db, tenantId, (tx) => tx.mobileMutation.deleteMany({ where: { id, outcome: 'pending' } }));
  }

  private replay(
    key: string,
    seen: { requestHash: string; outcome: string; result: Prisma.JsonValue },
    requestHash: string,
  ): MobileMutationResult {
    if (seen.requestHash !== requestHash) {
      return {
        key,
        status: 'rejected',
        code: 'key_reused',
        message: 'This key was already used for a different change.',
      };
    }
    const stored = seen.result as { code: string | null; message: string | null };
    return {
      key,
      status: seen.outcome as 'applied' | 'rejected',
      ...(stored.code ? { code: stored.code } : {}),
      ...(stored.message ? { message: stored.message } : {}),
      replayed: true,
    };
  }

  private dispatch(auth: AuthContext, ip: string | undefined, item: MobileMutationItem): Promise<unknown> {
    const req = { auth, ip } as unknown as Request;
    switch (item.kind) {
      case 'status':
        return this.jobs.status(req, item.workOrderId, item.payload);
      case 'note':
        return this.jobs.comment(req, item.workOrderId, item.payload);
      case 'time':
        return this.time.record(req, item.workOrderId, item.payload);
      case 'checklist_answer':
        return this.checklists.answer(req, item.workOrderId, item.checklistId, item.itemId, item.payload);
      case 'meter_reading':
        return this.assets.recordReading(req, item.assetId, item.meterId, item.payload);
      case 'quick_job':
        // Same endpoint, permission (`work_orders.edit`), location scope and audit as the website's New job.
        return this.jobs.create(req, item.payload);
    }
  }
}
