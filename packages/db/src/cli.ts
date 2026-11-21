/**
 * Platform tenant CLI (issue #16). Runs as the owner role (DATABASE_URL).
 *
 *   pnpm cafm tenant:list
 *   pnpm cafm tenant:create --name "Riverside Academy Trust" --slug riverside --plan professional --admin-email head@example.org [--demo]
 *   pnpm cafm tenant:set-plan --slug riverside --plan enterprise
 *   pnpm cafm tenant:suspend --slug riverside
 *   pnpm cafm tenant:activate --slug riverside
 */
import { PrismaClient } from '@prisma/client';
import { createTenant, listTenants, setTenantPlan, setTenantStatus } from './tenants';

function args(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else out[a.slice(2)] = argv[++i]!;
  }
  return out;
}

function need(opts: Record<string, string | true>, key: string): string {
  const v = opts[key];
  if (typeof v !== 'string' || !v) throw new Error(`--${key} is required`);
  return v;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const opts = args(rest);
  const db = new PrismaClient();
  try {
    switch (command) {
      case 'tenant:list':
        console.table(await listTenants(db));
        break;
      case 'tenant:create': {
        const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
        const { inviteUrl } = await createTenant(db, {
          name: need(opts, 'name'),
          slug: need(opts, 'slug'),
          plan: need(opts, 'plan'),
          adminEmail: need(opts, 'admin-email'),
          demo: opts.demo === true,
          appUrl,
        });
        console.log(`Created. The Super User invitation has been queued; the link is:\n${inviteUrl}`);
        break;
      }
      case 'tenant:set-plan':
        await setTenantPlan(db, need(opts, 'slug'), need(opts, 'plan'));
        console.log('Plan updated.');
        break;
      case 'tenant:suspend':
        await setTenantStatus(db, need(opts, 'slug'), 'suspended');
        console.log('Suspended. Everyone in it has been signed out.');
        break;
      case 'tenant:activate':
        await setTenantStatus(db, need(opts, 'slug'), 'active');
        console.log('Reactivated.');
        break;
      default:
        console.log(
          'Commands: tenant:list, tenant:create, tenant:set-plan, tenant:suspend, tenant:activate (see src/cli.ts).',
        );
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
