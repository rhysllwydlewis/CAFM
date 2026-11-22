import { createConnection } from 'node:net';
import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';

/** clamd INSTREAM protocol. The socket is private and never accepts a host supplied by a request. */
export async function scanAttachment(bytes: Buffer): Promise<void> {
  const host = process.env.ATTACHMENT_CLAMD_HOST;
  if (!host) return;
  const port = Number(process.env.ATTACHMENT_CLAMD_PORT ?? 3310);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const response = await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const unavailable = () => reject(new ServiceUnavailableException('File scanning is temporarily unavailable.'));
    let answer = '';
    socket.setTimeout(10_000);
    socket.once('connect', () => {
      socket.write('zINSTREAM\0');
      socket.write(size);
      socket.write(bytes);
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (chunk: Buffer) => {
      answer += chunk.toString('utf8');
      const end = answer.indexOf('\0');
      if (end !== -1) {
        resolve(answer.slice(0, end));
        socket.destroy();
      } else if (answer.length > 4096) {
        unavailable();
        socket.destroy();
      }
    });
    socket.once('timeout', () => {
      unavailable();
      socket.destroy();
    });
    socket.once('error', unavailable);
    socket.once('close', unavailable);
  }).catch(() => {
    throw new ServiceUnavailableException('File scanning is temporarily unavailable.');
  });
  if (response.endsWith(' FOUND')) throw new UnprocessableEntityException('This file did not pass the security scan.');
  if (response !== 'stream: OK') throw new ServiceUnavailableException('File scanning is temporarily unavailable.');
}
