import { createHash, randomUUID } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  StreamableFile,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { withTenant, type Tx } from '@cafm/db';
import { acceptsRequestComments, ATTACHMENT_LIMIT, type AttachmentItem } from '@cafm/shared';
import { audit } from '../../core/audit';
import { PrismaService } from '../../core/prisma.service';
import type { AuthContext } from '../../core/session';
import { requireVisibleAsset, withAssetWrite } from '../assets/asset-scope';
import { getWorkOrder } from '../work-orders/work-order-records';
import { assertCanWorkJob, withWorkOrderWrite } from '../work-orders/work-order-scope';
import { missingRequest, requestScope, withRequestWrite } from '../helpdesk/request-scope';
import { type Upload, validateUpload } from './attachment-file';
import { scanAttachment } from './attachment-scanner';
import { AttachmentStore } from './attachment-store';

type Parent = { type: 'asset' | 'ownRequest' | 'staffRequest' | 'workOrder'; id: string };

/** A job's photos and its two signatures share one allowance. */
const WORK_ORDER_FILE_LIMIT = 42;
/** What the caller adds to the file's record, and what it does in the same transaction once the record exists. */
export interface UploadExtras {
  phase?: string;
  caption?: string;
  after?: (tx: Tx, auth: AuthContext, row: { id: string }) => Promise<void>;
}
type Row = Omit<AttachmentItem, 'createdAt'> & { createdAt: Date };
const metadata = { id: true, filename: true, mediaType: true, byteLength: true, createdAt: true } as const;
const item = (row: Row): AttachmentItem => ({ ...row, createdAt: row.createdAt.toISOString() });

function parentWhere(parent: Parent, tenantId: string) {
  if (parent.type === 'asset') return { tenantId, assetId: parent.id };
  if (parent.type === 'workOrder') return { tenantId, workOrderId: parent.id };
  return { tenantId, requestId: parent.id };
}

const parentLabel = (parent: Parent) =>
  parent.type === 'asset' ? 'asset' : parent.type === 'workOrder' ? 'work_order' : 'request';

async function checkParent(tx: Tx, auth: AuthContext, parent: Parent, writing = false) {
  if (parent.type === 'asset') {
    await requireVisibleAsset(tx, auth, parent.id);
  } else if (parent.type === 'workOrder') {
    const job = await getWorkOrder(tx, auth, parent.id);
    if (writing && ['closed', 'cancelled'].includes(job.status)) {
      throw new UnprocessableEntityException('Photos can’t be added to a closed or cancelled work order.');
    }
  } else {
    const request = await tx.serviceRequest.findFirst({
      where: { ...requestScope(auth, parent.type === 'ownRequest'), id: parent.id },
      select: { status: true },
    });
    if (!request) throw missingRequest();
    if (writing && !acceptsRequestComments(request.status)) {
      throw new UnprocessableEntityException('This request is closed to new photos.');
    }
  }
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly store: AttachmentStore,
  ) {}

  list(req: Request, parent: Parent) {
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    return withTenant(this.db, tenantId, async (tx) => {
      await checkParent(tx, auth, parent);
      const rows = await tx.recordAttachment.findMany({
        where: parentWhere(parent, tenantId),
        select: metadata,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      return rows.map(item);
    });
  }

  async upload(req: Request, parent: Parent, uploaded: Upload | undefined, extras: UploadExtras = {}) {
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    // Checked before anything is looked up, so someone who may only read learns nothing from the answer.
    if (parent.type === 'workOrder') assertCanWorkJob(auth);
    const where = parentWhere(parent, tenantId);
    const { buffer, ...file } = validateUpload(uploaded, parent.type !== 'asset');
    const checksum = digest(buffer);
    async function existing(tx: Tx, current: AuthContext) {
      await checkParent(tx, current, parent, true);
      const match = await tx.recordAttachment.findFirst({
        where: {
          ...where,
          checksum,
          filename: file.filename,
          phase: extras.phase ?? null,
          caption: extras.caption ?? null,
        },
        select: metadata,
      });
      const limit = parent.type === 'workOrder' ? WORK_ORDER_FILE_LIMIT : ATTACHMENT_LIMIT;
      if (!match && (await tx.recordAttachment.count({ where })) >= limit) {
        throw new UnprocessableEntityException('This record already has the maximum number of attachments.');
      }
      return match;
    }

    const replay = await withTenant(this.db, tenantId, (tx) => existing(tx, auth));
    if (replay) return item(replay);

    const demo = auth.membership!.tenant.demo;
    if (process.env.NODE_ENV === 'production' && !demo && (!this.store.enabled || !process.env.ATTACHMENT_CLAMD_HOST)) {
      throw new ServiceUnavailableException('File uploads are not configured for this organisation.');
    }
    await scanAttachment(buffer);
    const id = randomUUID();
    const useObjectStorage = this.store.enabled && !demo;
    try {
      if (useObjectStorage) await this.store.put(tenantId, id, buffer);
      const save = async (tx: Tx, current: AuthContext) => {
        const match = await existing(tx, current);
        if (match) return match;
        const row = await tx.recordAttachment.create({
          data: { id, ...where, ...file, checksum, phase: extras.phase ?? null, caption: extras.caption ?? null },
          select: metadata,
        });
        if (!useObjectStorage)
          await tx.attachmentContent.create({ data: { id, tenantId, data: Uint8Array.from(buffer) } });
        await audit(
          tx,
          current,
          {
            action: 'attachment.upload',
            entityType: 'attachment',
            entityId: id,
            changes: {
              parent: parentLabel(parent),
              parentId: parent.id,
              mediaType: file.mediaType,
              byteLength: file.byteLength,
            },
          },
          req.ip,
        );
        await extras.after?.(tx, current, row);
        return row;
      };
      const row =
        parent.type === 'asset'
          ? await withAssetWrite(this.db, auth, 'assets.manage', save)
          : parent.type === 'workOrder'
            ? await withWorkOrderWrite(this.db, auth, ['work_orders.edit', 'work_orders.close'], save)
            : await withRequestWrite(this.db, auth, 'requests.create', save);
      if (row.id !== id && useObjectStorage) await this.store.removeStaged(tenantId, id);
      return item(row);
    } catch (error) {
      if (useObjectStorage) {
        // A lost commit response must not cause deletion of a committed file.
        const absent = await withTenant(
          this.db,
          tenantId,
          async (tx) => !(await tx.recordAttachment.findFirst({ where: { tenantId, id }, select: { id: true } })),
        ).catch(() => false);
        if (absent) await this.store.removeStaged(tenantId, id);
      }
      throw error;
    }
  }

  async download(req: Request, parent: Parent, id: string) {
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    const file = await withTenant(this.db, tenantId, async (tx) => {
      await checkParent(tx, auth, parent);
      const record = await tx.recordAttachment.findFirst({
        where: { id, ...parentWhere(parent, tenantId) },
        select: {
          filename: true,
          mediaType: true,
          checksum: true,
          byteLength: true,
          storage: { select: { data: true } },
        },
      });
      if (!record) throw new NotFoundException('Attachment not found.');
      return record;
    });
    const data = file.storage ? Buffer.from(file.storage.data) : await this.store.get(tenantId, id, file.byteLength);
    if (data.byteLength !== file.byteLength || digest(data) !== file.checksum) {
      throw new ServiceUnavailableException('File data could not be verified.');
    }
    const encoded = encodeURIComponent(file.filename).replace(
      /['()*]/g,
      (char) => '%' + char.charCodeAt(0).toString(16),
    );
    return new StreamableFile(data, {
      type: file.mediaType,
      disposition: "attachment; filename*=UTF-8''" + encoded,
      length: data.length,
    });
  }

  /** Removes a file from a job. Its bytes go with it: from the database, or from object storage once that commits. */
  async removeFromWorkOrder(
    req: Request,
    jobId: string,
    id: string,
    kind: 'photo' | 'signature',
    inside?: (tx: Tx, auth: AuthContext) => Promise<void>,
  ) {
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    const parent: Parent = { type: 'workOrder', id: jobId };
    const stored = await withWorkOrderWrite(this.db, auth, 'work_orders.edit', async (tx, current) => {
      await checkParent(tx, current, parent, true);
      const record = await tx.recordAttachment.findFirst({
        where: { id, tenantId, workOrderId: jobId },
        select: { id: true, phase: true, mediaType: true, byteLength: true, storage: { select: { id: true } } },
      });
      if (!record || (kind === 'photo') !== (record.phase !== null)) throw new NotFoundException('File not found.');
      await inside?.(tx, current);
      await tx.recordAttachment.delete({ where: { id } });
      await audit(
        tx,
        current,
        {
          action: 'attachment.remove',
          entityType: 'attachment',
          entityId: id,
          changes: {
            parent: 'work_order',
            parentId: jobId,
            mediaType: record.mediaType,
            byteLength: record.byteLength,
          },
        },
        req.ip,
      );
      return !!record.storage;
    });
    if (!stored && this.store.enabled) await this.store.removeStaged(tenantId, id);
  }

  /** A file's verified bytes, for building a document from it. Null when it cannot be read, so one file never stops the rest. */
  async readFile(tenantId: string, id: string): Promise<Buffer | null> {
    const file = await withTenant(this.db, tenantId, (tx) =>
      tx.recordAttachment.findFirst({
        where: { tenantId, id },
        select: { checksum: true, byteLength: true, storage: { select: { data: true } } },
      }),
    );
    if (!file) return null;
    try {
      const data = file.storage ? Buffer.from(file.storage.data) : await this.store.get(tenantId, id, file.byteLength);
      return data.byteLength === file.byteLength && digest(data) === file.checksum ? data : null;
    } catch {
      return null;
    }
  }
}
