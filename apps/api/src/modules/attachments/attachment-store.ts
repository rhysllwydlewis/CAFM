import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class AttachmentStore {
  private readonly logger = new Logger(AttachmentStore.name);
  private readonly bucket = process.env.ATTACHMENT_S3_BUCKET;
  private readonly client = this.bucket
    ? new S3Client({
        region: process.env.ATTACHMENT_S3_REGION ?? 'us-east-1',
        endpoint: process.env.ATTACHMENT_S3_ENDPOINT || undefined,
        forcePathStyle: !!process.env.ATTACHMENT_S3_ENDPOINT,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      })
    : null;

  get enabled() {
    return !!this.client;
  }

  private key(tenantId: string, id: string) {
    return `${tenantId}/attachments/${id}`;
  }

  async put(tenantId: string, id: string, bytes: Buffer) {
    try {
      await this.client?.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key(tenantId, id),
          Body: bytes,
          ContentType: 'application/octet-stream',
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
    } catch {
      throw new ServiceUnavailableException('File storage is temporarily unavailable. Try again.');
    }
  }

  async get(tenantId: string, id: string, size: number): Promise<Buffer> {
    try {
      const response = await this.client?.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(tenantId, id) }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
      if (response?.Body) {
        const reader = response.Body.transformToWebStream().getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) return Buffer.concat(chunks, bytes);
            bytes += value.byteLength;
            if (bytes > size) break;
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
      }
    } catch {
      this.logger.warn('An authorised attachment could not be read from object storage.');
    }
    throw new ServiceUnavailableException('File storage is temporarily unavailable. Try again.');
  }

  async removeStaged(tenantId: string, id: string) {
    try {
      await this.client?.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(tenantId, id) }), {
        abortSignal: AbortSignal.timeout(5_000),
      });
    } catch {
      this.logger.warn('Could not remove an uncommitted attachment from object storage.');
    }
  }
}
