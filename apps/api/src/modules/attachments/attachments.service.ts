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
import { missingRequest, requestScope, withRequestWrite } from '../helpdesk/request-scope';
import { type Upload, validateUpload } from './attachment-file';
import { scanAttachment } from './attachment-scanner';
import { AttachmentStore } from './attachment-store';

type Parent = { type: 'asset' | 'ownRequest' | 'staffRequest'; id: string };
type Row = Omit<AttachmentItem, 'createdAt'> & { createdAt: Date };
const metadata = { id: true, filename: true, mediaType: true, byteLength: true, createdAt: true } as const;
const item = (row: Row): AttachmentItem => ({ ...row, createdAt: row.createdAt.toISOString() });

function parentWhere(parent: Parent, tenantId: string) {
  return parent.type === 'asset' ? { tenantId, assetId: parent.id } : { tenantId, requestId: parent.id };
}

async function checkParent(tx: Tx, auth: AuthContext, parent: Parent, writing = false) {
  if (parent.type === 'asset') {
    await requireVisibleAsset(tx, auth, parent.id);
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

  async upload(req: Request, parent: Parent, uploaded: Upload | undefined) {
    const auth = req.auth!;
    const { tenantId } = auth.membership!;
    const where = parentWhere(parent, tenantId);
    const { buffer, ...file } = validateUpload(uploaded, parent.type !== 'asset');
    const checksum = digest(buffer);
    async function existing(tx: Tx, current: AuthContext) {
      await checkParent(tx, current, parent, true);
      const match = await tx.recordAttachment.findFirst({
        where: { ...where, checksum, filename: file.filename },
        select: metadata,
      });
      if (!match && (await tx.recordAttachment.count({ where })) >= ATTACHMENT_LIMIT) {
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
          data: { id, ...where, ...file, checksum },
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
              parent: parent.type === 'asset' ? 'asset' : 'request',
              parentId: parent.id,
              mediaType: file.mediaType,
              byteLength: file.byteLength,
            },
          },
          req.ip,
        );
        return row;
      };
      const row =
        parent.type === 'asset'
          ? await withAssetWrite(this.db, auth, 'assets.manage', save)
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
}
