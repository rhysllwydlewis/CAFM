import { randomUUID } from 'node:crypto';
import { createServer as httpServer } from 'node:http';
import { createServer as tcpServer, type Server } from 'node:net';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { AttachmentStore } from '../src/modules/attachments/attachment-store';
import { scanAttachment } from '../src/modules/attachments/attachment-scanner';

afterEach(() => vi.unstubAllEnvs());

async function port(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test listener did not open a TCP port');
  return address.port;
}

it('uses tenant-prefixed keys on authenticated S3 requests and bounds downloads by the stored size', async () => {
  const bytes = Buffer.from('verified fixture bytes');
  const tenantId = randomUUID();
  const id = randomUUID();
  const expected = '/fixture-bucket/' + tenantId + '/attachments/' + id;
  const requests: [string | undefined, string | undefined, string | undefined][] = [];
  let stored = Buffer.alloc(0);
  const server = httpServer(async (req, res) => {
    requests.push([req.method, req.url?.split('?')[0], req.headers.authorization?.split(' ')[0]]);
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const data of req) chunks.push(data);
      stored = Buffer.concat(chunks);
    }
    if (req.method === 'GET') {
      res.setHeader('Content-Length', stored.length);
      res.end(stored);
    } else {
      res.writeHead(204).end();
    }
  });
  try {
    vi.stubEnv('ATTACHMENT_S3_ENDPOINT', 'http://127.0.0.1:' + (await port(server)));
    vi.stubEnv('ATTACHMENT_S3_BUCKET', 'fixture-bucket');
    vi.stubEnv('ATTACHMENT_S3_REGION', 'eu-west-2');
    vi.stubEnv('AWS_ACCESS_KEY_ID', randomUUID().replaceAll('-', ''));
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', randomUUID());
    const store = new AttachmentStore();
    await store.put(tenantId, id, bytes);
    expect(stored).toEqual(bytes);
    expect(await store.get(tenantId, id, bytes.length)).toEqual(bytes);
    await expect(store.get(tenantId, id, bytes.length - 1)).rejects.toMatchObject({ status: 503 });
    await store.removeStaged(tenantId, id);
    expect(requests).toEqual(['PUT', 'GET', 'GET', 'DELETE'].map((method) => [method, expected, 'AWS4-HMAC-SHA256']));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('sends the ClamAV protocol, accepts clean files and fails closed on rejection or interruption', async () => {
  const bytes = Buffer.from('attachment');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  const frame = Buffer.concat([Buffer.from('zINSTREAM\0'), header, bytes, Buffer.alloc(4)]);
  let answer = 'stream: OK\0';
  const received: Buffer[] = [];
  const server = tcpServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      const data = Buffer.concat(chunks);
      if (data.length >= frame.length) {
        received.push(data);
        socket.end(answer);
      }
    });
  });
  try {
    vi.stubEnv('ATTACHMENT_CLAMD_HOST', '127.0.0.1');
    vi.stubEnv('ATTACHMENT_CLAMD_PORT', String(await port(server)));
    await scanAttachment(bytes);
    answer = 'stream: test-malware FOUND\0';
    await expect(scanAttachment(bytes)).rejects.toMatchObject({ status: 422 });
    answer = '';
    await expect(scanAttachment(bytes)).rejects.toMatchObject({ status: 503 });
    expect(received).toEqual([frame, frame, frame]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
