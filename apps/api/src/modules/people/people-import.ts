import type { Tx } from '@cafm/db';
import { inviteCreateSchema, licenceForRole } from '@cafm/shared';
import { assertCanGrant } from '../../core/access-rules';
import { CsvError, parseCsv } from '../../core/csv-parse';
import { IMPORT_MAX_ROWS, type ImportIssue } from '../../core/import-fields';
import type { AuthContext } from '../../core/session';

export const PEOPLE_COLUMNS = ['email', 'role'] as const;

export interface PlannedInvite {
  row: number;
  email: string;
  role: string;
  roleName: string;
  licence: string;
}

export interface PeoplePlan {
  /** Data rows in the file, whether or not they have problems. */
  rows: number;
  ordered: PlannedInvite[];
  issues: ImportIssue[];
}

export const peopleTemplate = (): string => PEOPLE_COLUMNS.join(',');

/**
 * Checks a people file. Each row becomes an invitation, never an account: the person chooses their own
 * name and password when they accept. Every problem is collected so one preview lists them all.
 */
export async function planPeopleImport(tx: Tx, auth: AuthContext, csv: string): Promise<PeoplePlan> {
  const membership = auth.membership!;
  const tenantId = membership.tenantId;
  const fail = (issues: ImportIssue[], rows = 0): PeoplePlan => ({ rows, ordered: [], issues });
  let parsed;
  try {
    parsed = parseCsv(csv, IMPORT_MAX_ROWS);
  } catch (error) {
    if (error instanceof CsvError) return fail([{ row: 1, column: '', message: error.message }]);
    throw error;
  }
  const { header, rows, lines } = parsed;
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  header.forEach((column) => {
    if (seen.has(column)) issues.push({ row: 1, column, message: 'This column appears twice.' });
    else if (!(PEOPLE_COLUMNS as readonly string[]).includes(column))
      issues.push({ row: 1, column, message: 'This column is not recognised. Remove it or rename it.' });
    seen.add(column);
  });
  for (const column of PEOPLE_COLUMNS) {
    if (!seen.has(column)) issues.push({ row: 1, column, message: 'This column is missing.' });
  }
  if (issues.length) return fail(issues);
  if (!rows.length) return fail([{ row: 1, column: '', message: 'The file has no rows to import.' }]);

  const roles = new Map((await tx.role.findMany({ where: { tenantId } })).map((role) => [role.key, role]));
  const emailAt = header.indexOf('email');
  const roleAt = header.indexOf('role');
  const emails = rows.map((cells) => (cells[emailAt] ?? '').trim().toLowerCase()).filter(Boolean);
  const members = new Set(
    (
      await tx.membership.findMany({
        where: { tenantId, account: { email: { in: emails } } },
        select: { account: { select: { email: true } } },
      })
    ).flatMap(({ account }) => (account.email ? [account.email.toLowerCase()] : [])),
  );
  const firstLine = new Map<string, number>();
  const ordered: PlannedInvite[] = [];

  rows.forEach((cells, index) => {
    const row = lines[index]!;
    const before = issues.length;
    const parsedEmail = inviteCreateSchema.shape.email.safeParse(cells[emailAt] ?? '');
    const email = parsedEmail.success ? parsedEmail.data : '';
    if (!parsedEmail.success) {
      issues.push({
        row,
        column: 'email',
        message: (cells[emailAt] ?? '').trim() ? 'Enter a valid email address.' : 'Enter an email address.',
      });
    } else if (members.has(email)) {
      issues.push({ row, column: 'email', message: 'That person is already in this organisation.' });
    } else if (firstLine.has(email)) {
      issues.push({ row, column: 'email', message: `This address is already on line ${firstLine.get(email)}.` });
    } else {
      firstLine.set(email, row);
    }
    const roleKey = (cells[roleAt] ?? '').trim().toLowerCase();
    const role = roles.get(roleKey);
    if (!roleKey) issues.push({ row, column: 'role', message: 'Enter a role.' });
    else if (!role) issues.push({ row, column: 'role', message: `No role has the key "${roleKey}".` });
    else {
      try {
        // Inviting into a role is granting it: the same escalation rules as the invite form.
        assertCanGrant(auth.access!, membership.role, role.permissions);
      } catch {
        issues.push({ row, column: 'role', message: 'You cannot give people this role.' });
      }
    }
    if (issues.length === before && role)
      ordered.push({ row, email, role: role.key, roleName: role.name, licence: licenceForRole(role.key) });
  });

  // Seats: new full-licence invitations must fit what the plan has left.
  const limit = auth.access!.entitlements.limits.full_users;
  const full = ordered.filter((item) => item.licence === 'full');
  if (!issues.length && limit !== null && full.length) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`full_users:${tenantId}`}))`;
    const replacing = full.map((item) => item.email);
    const [active, pending] = await Promise.all([
      tx.membership.count({ where: { tenantId, status: 'active', licence: 'full' } }),
      tx.invite.count({
        where: {
          tenantId,
          licence: 'full',
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          NOT: { email: { in: replacing } },
        },
      }),
    ]);
    const free = Math.max(0, limit - active - pending);
    if (full.length > free)
      issues.push({
        row: 1,
        column: 'role',
        message: `Your plan includes ${limit} full users and has room for ${free} more, but the file adds ${full.length}. Use roles with a lighter licence, or ask your Super User about upgrading.`,
      });
  }
  return issues.length ? fail(issues, rows.length) : { rows: rows.length, ordered, issues };
}
