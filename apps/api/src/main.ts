import { createApp } from './app';

async function main(): Promise<void> {
  const app = await createApp();
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api`);
}

void main();
