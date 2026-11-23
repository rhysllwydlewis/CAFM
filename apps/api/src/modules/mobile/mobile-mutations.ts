import { createHash } from 'node:crypto';
import { HttpException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, Prisma } from '@cafm/db';
import type { MobileMutationItem } from '@cafm/shared';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { AssetOperationsController } from '../assets/asset-operations.controller';
import { WorkOrderChecklistsController } from '../work-orders/work-order-checklists.controller';
import { WorkOrdersController } from '../work-orders/work-orders.controller';

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
 * The outcome is kept against the key, so a retry after a dropped connection is answered, not repeated.
 */
@Injectable()
export class MobileMutations {
  constructor(
    private readonly db: PrismaService,
    private readonly jobs: WorkOrdersController,
    private readonly checklists: WorkOrderChecklistsController,
    private readonly assets: AssetOperationsController,
  ) {}

  async apply(auth: AuthContext, ip: string | undefined, items: MobileMutationItem[]): Promise<MobileMutationResult[]> {
    const results: MobileMutationResult[] = [];
    for (const item of items) results.push(await this.applyOne(auth, ip, item));
    return results;
  }

  private async applyOne(auth: AuthContext, ip: string | undefined, item: MobileMutationItem) {
    const { tenantId, id: memberId } = auth.membership!;
    const requestHash = hashOf(item);
    const find = () =>
      withTenant(this.db, tenantId, (tx) =>
        tx.mobileMutation.findUnique({ where: { tenantId_memberId_key: { tenantId, memberId, key: item.key } } }),
      );
    const seen = await find();
    if (seen) return this.replay(item.key, seen, requestHash);

    let result: MobileMutationResult;
    try {
      await this.dispatch(auth, ip, item);
      result = { key: item.key, status: 'applied' };
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;
      result = {
        key: item.key,
        status: 'rejected',
        code: codeFor(error.getStatus()),
        message: messageOf(error),
      };
    }
    try {
      await withTenant(this.db, tenantId, (tx) =>
        tx.mobileMutation.create({
          data: {
            tenantId,
            memberId,
            key: item.key,
            kind: item.kind,
            requestHash,
            outcome: result.status,
            result: { code: result.code ?? null, message: result.message ?? null },
          },
        }),
      );
    } catch (error) {
      // The same key arrived twice at once: the other request's outcome stands.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const other = await find();
      if (other) return this.replay(item.key, other, requestHash);
    }
    return result;
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
      case 'checklist_answer':
        return this.checklists.answer(req, item.workOrderId, item.checklistId, item.itemId, item.payload);
      case 'meter_reading':
        return this.assets.recordReading(req, item.assetId, item.meterId, item.payload);
    }
  }
}
