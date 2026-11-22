#!/usr/bin/env node
// Reads and checks docs/PROGRESS.md, the build tracker every agent keeps up to date.
//
//   node scripts/progress.mjs            where the build is, and the next unclaimed items
//   node scripts/progress.mjs check      the page is consistent (CI runs this)
//   node scripts/progress.mjs pr-check   a pull request follows the progress rules (CI runs this)
//
// pr-check reads PR_TITLE, PR_BODY, PR_NUMBER, HEAD_REF and BASE_SHA from the
// environment. With GITHUB_TOKEN and GITHUB_REPOSITORY it also refuses an item
// that another open PR has already claimed. The rules are in AGENTS.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROGRESS_PATH = 'docs/PROGRESS.md';

/** Planned weeks per phase (doc 08, midpoints), for the weighted percentage. */
export const PHASES = [
  { key: '0', weeks: 4 },
  { key: '1', weeks: 9 },
  { key: '2A', weeks: 8 },
  { key: '2B', weeks: 9 },
  { key: '3', weeks: 10 },
  { key: '4', weeks: 13 },
  { key: '5', weeks: 11 },
];

// A roadmap item, or (indented) a sub-item it was split into, e.g. P1-04a.
const ITEM = /^( {2})?- \[( |x)\] \*\*(P(?:0|1|2A|2B|3|4|5)-\d{2}([a-z])?)\*\* (.+)$/;
const PHASE_HEADING = /^### Phase (0|1|2A|2B|3|4|5) · (.+)$/;
const ID = /\bP(?:0|1|2A|2B|3|4|5)-\d{2}[a-z]?\b/g;

/** The roadmap item a sub-item belongs to (P1-04a → P1-04). */
export const parentOf = (id) => id.replace(/[a-z]$/, '');
/** Two claims clash if they're the same item, or one is part of the other. */
export const overlaps = (a, b) => a === b || parentOf(a) === b || a === parentOf(b);

/** Parses the tracker into phases, items, the phase table, claims and the stated percentage. */
export function parse(text) {
  const lines = text.split('\n');
  const items = [];
  const table = new Map();
  const claims = [];
  let phase = null;
  let section = '';
  let percent = null;
  let approved = null;
  for (const line of lines) {
    const gate = line.match(/<!-- approved-phase: (0|1|2A|2B|3|4|5) -->/);
    if (gate) approved = gate[1];
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      phase = null;
    }
    const heading = line.match(PHASE_HEADING);
    if (heading && section === 'Phase checklists') phase = heading[1];
    const item = line.match(ITEM);
    if (item) items.push({ phase, done: item[2] === 'x', id: item[3], sub: !!item[4], text: item[5] });
    const row = line.match(/^\| (0|1|2A|2B|3|4|5) · [^|]+\| (\d+) \/ (\d+) \|/);
    if (row) table.set(row[1], { done: Number(row[2]), total: Number(row[3]) });
    if (section === 'In progress' && line.startsWith('| P')) {
      const cells = line.split('|').map((c) => c.trim());
      claims.push({ id: cells[1], who: cells[2], branch: cells[3].replace(/`/g, ''), started: cells[4] });
    }
    const pct = line.match(/\*\*About (\d+)%\*\*/);
    if (pct && percent === null) percent = Number(pct[1]);
  }
  return { items, table, claims, percent, approved };
}

/** Progress weighted by each phase's planned length (doc 08). */
export function weightedPercent(items) {
  const total = PHASES.reduce((s, p) => s + p.weeks, 0);
  let done = 0;
  for (const p of PHASES) {
    const phaseItems = items.filter((i) => i.phase === p.key && !i.sub);
    if (phaseItems.length) done += (p.weeks * phaseItems.filter((i) => i.done).length) / phaseItems.length;
  }
  return Math.round((done / total) * 100);
}

/** The first phase with anything left to do. */
export function currentPhase(items) {
  return PHASES.find((p) => items.some((i) => i.phase === p.key && !i.sub && !i.done))?.key ?? null;
}

/** Problems with the tracker itself. Empty when it is consistent. */
export function check(text) {
  const { items, table, claims, percent, approved } = parse(text);
  const problems = [];
  if (approved === null) problems.push('The "<!-- approved-phase: N -->" marker is missing from "Where we are"');
  const seen = new Set();
  for (const i of items) {
    if (seen.has(i.id)) problems.push(`${i.id} appears more than once`);
    seen.add(i.id);
    if (!i.id.startsWith(`P${i.phase}-`)) problems.push(`${i.id} is listed under Phase ${i.phase}`);
    if (i.sub && !items.some((p) => p.id === parentOf(i.id) && !p.sub)) {
      problems.push(`${i.id} has no parent item ${parentOf(i.id)}`);
    }
  }
  // An item that was split is done exactly when all its sub-items are.
  for (const parent of items.filter((i) => !i.sub)) {
    const subs = items.filter((i) => i.sub && parentOf(i.id) === parent.id);
    if (!subs.length) continue;
    const allDone = subs.every((i) => i.done);
    if (parent.done && !allDone) problems.push(`${parent.id} is ticked but some of its sub-items aren't`);
    if (!parent.done && allDone) problems.push(`All of ${parent.id}'s sub-items are done, so tick ${parent.id} too`);
  }
  for (const p of PHASES) {
    const phaseItems = items.filter((i) => i.phase === p.key && !i.sub);
    if (!phaseItems.length) problems.push(`Phase ${p.key} has no checklist items`);
    const row = table.get(p.key);
    const done = phaseItems.filter((i) => i.done).length;
    if (!row) problems.push(`The phase table has no row for Phase ${p.key}`);
    else if (row.done !== done || row.total !== phaseItems.length) {
      problems.push(
        `The phase table says Phase ${p.key} is ${row.done} / ${row.total}; the checklist has ${done} / ${phaseItems.length}`,
      );
    }
  }
  const expected = weightedPercent(items);
  if (percent !== expected)
    problems.push(`"Overall progress" says ${percent}%; the checklist works out at ${expected}%`);
  const claimed = new Set();
  for (const c of claims) {
    const item = items.find((i) => i.id === c.id);
    if (!item) problems.push(`In progress lists ${c.id}, which isn't a checklist item`);
    else if (item.done) problems.push(`${c.id} is ticked but still listed under In progress`);
    if (claimed.has(c.id)) problems.push(`${c.id} is claimed twice under In progress`);
    claimed.add(c.id);
  }
  return problems;
}

/**
 * Reads the PR description's "Progress:" lines, e.g.
 *   Progress: P1-02 done
 *   Progress: P1-03 in progress
 *   Progress: none - fixes a typo in the README
 */
export function progressLines(body) {
  const lines = (body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '') // the template's examples are in a comment
    .split('\n')
    .map((l) => l.replace(/^[\s*>-]+/, '').trim())
    .filter((l) => /^progress:/i.test(l));
  return lines.map((l) => {
    const value = l.replace(/^progress:\s*/i, '');
    const none = value.match(/^none\b\s*[-–—:]?\s*(.*)$/i);
    if (none) return { kind: 'none', reason: none[1].trim() };
    const ids = value.match(ID) ?? [];
    const kind = /\bdone\b/i.test(value) ? 'done' : /\bin progress\b/i.test(value) ? 'in_progress' : 'unknown';
    return { kind, ids, raw: value };
  });
}

/** Problems with a pull request against the progress rules (AGENTS.md § Progress rules). */
export function prProblems({ body, base, head, headRef, otherClaims = [], ownerHandover = false }) {
  const problems = [];
  const lines = progressLines(body);
  if (!lines.length) {
    return [
      'The PR description needs a "Progress:" line: "Progress: P1-02 done", "Progress: P1-02 in progress" or "Progress: none - <reason>".',
    ];
  }
  const handovers = (body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.trim());
  const before = parse(base ?? '');
  const after = parse(head);
  for (const line of lines) {
    if (line.kind === 'none') {
      if (line.reason.length < 10)
        problems.push('"Progress: none" needs a reason, e.g. "Progress: none - fixes a flaky test".');
      continue;
    }
    if (line.kind === 'unknown' || !line.ids.length) {
      problems.push(`Can't read "Progress: ${line.raw}". Use an item ID and "done" or "in progress".`);
      continue;
    }
    for (const id of line.ids) {
      const now = after.items.find((i) => i.id === id);
      const was = before.items.find((i) => i.id === id);
      if (!now) {
        problems.push(`${id} isn't an item in ${PROGRESS_PATH}.`);
        continue;
      }
      if (was?.done) problems.push(`${id} was already done on the base branch. Pick another item.`);
      // Only the product owner approves a new phase, by changing the marker on main.
      const gate = before.approved ?? after.approved;
      if (gate !== null && phaseIndex(now.phase) > phaseIndex(gate)) {
        problems.push(
          `${id} is in Phase ${now.phase}, but only Phase ${gate} is approved. Wait for the product owner's go-ahead.`,
        );
      }
      for (const claim of before.claims.filter((c) => overlaps(c.id, id))) {
        const handedOver = ownerHandover && handovers.includes(`Handover: ${claim.id} from ${claim.branch}`);
        if (headRef && !branchMatches(claim.branch, headRef) && !handedOver) {
          problems.push(
            `${id} is already claimed by ${claim.who} on ${claim.branch}. Pick another item, or agree a handover first.`,
          );
        }
      }
      // Several PRs can work on one claim when the claim's branch pattern covers them all.
      const ours = after.claims.find((c) => overlaps(c.id, id) && headRef && branchMatches(c.branch, headRef));
      const other = otherClaims.find(
        (c) => overlaps(c.id, id) && !(ours && c.branch && branchMatches(ours.branch, c.branch)),
      );
      if (other)
        problems.push(
          `${id} is already claimed by open PR #${other.number}. Pick another item, or agree a handover first.`,
        );
      if (line.kind === 'done') {
        if (!now.done) problems.push(`The PR says ${id} is done, so tick it ([x]) in ${PROGRESS_PATH}.`);
        if (after.claims.some((c) => c.id === id)) problems.push(`${id} is done, so remove it from "In progress".`);
      } else if (headRef ? !ours : !after.claims.some((c) => overlaps(c.id, id))) {
        problems.push(`The PR says ${id} is in progress, so add it to the "In progress" table in ${PROGRESS_PATH}.`);
      }
    }
  }
  return problems;
}

const phaseIndex = (key) => PHASES.findIndex((p) => p.key === key);

/** A claim's branch can end in * to cover several PRs, e.g. agent/A12-wo-*. */
export function branchMatches(pattern, branch) {
  return pattern.endsWith('*') ? branch.startsWith(pattern.slice(0, -1)) : pattern === branch;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Item IDs claimed by other open PRs, oldest first (the oldest claim wins). */
async function openPrClaims(prNumber) {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) return [];
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100`, {
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Couldn't list open PRs: ${res.status}`);
  const claims = [];
  for (const pr of await res.json()) {
    if (pr.number >= prNumber) continue; // only older PRs win a clash
    // A PR by the same branch family (e.g. a follow-up step) doesn't clash with itself.
    for (const line of progressLines(pr.body)) {
      for (const id of line.ids ?? []) claims.push({ id, number: pr.number, branch: pr.head?.ref });
    }
  }
  return claims;
}

async function main() {
  const command = process.argv[2] ?? 'status';
  const text = readFileSync(resolve(root, PROGRESS_PATH), 'utf8');

  if (command === 'check') {
    const problems = check(text);
    for (const p of problems) console.error(`::error file=${PROGRESS_PATH}::${p}`);
    if (problems.length) process.exit(1);
    console.log(`${PROGRESS_PATH} is consistent.`);
    return;
  }

  if (command === 'pr-check') {
    const { PR_BODY, PR_NUMBER, HEAD_REF, BASE_SHA, OWNER_HANDOVER } = process.env;
    let base = '';
    try {
      base = git('show', `${BASE_SHA ?? 'origin/main'}:${PROGRESS_PATH}`);
    } catch {
      base = ''; // the tracker is new in this PR
    }
    const otherClaims = await openPrClaims(Number(PR_NUMBER ?? Infinity));
    const problems = prProblems({
      body: PR_BODY,
      base,
      head: text,
      headRef: HEAD_REF,
      otherClaims,
      ownerHandover: OWNER_HANDOVER === 'true',
    });
    for (const p of problems) console.error(`::error title=Progress::${p} See AGENTS.md § Progress rules.`);
    if (problems.length) process.exit(1);
    console.log('The PR follows the progress rules.');
    return;
  }

  const { items, claims, approved } = parse(text);
  const phase = currentPhase(items);
  const done = items.filter((i) => i.done).length;
  console.log(`Overall: about ${weightedPercent(items)}% (${done} of ${items.length} roadmap items).`);
  if (!phase) return console.log('Every phase is done.');
  // An item that was split shows its open sub-items instead of itself.
  const left = items.filter(
    (i) => i.phase === phase && !i.done && !items.some((s) => s.sub && parentOf(s.id) === i.id),
  );
  console.log(`Current phase: ${phase} (${left.length} items left). Approved to build: Phase ${approved}.`);
  if (phaseIndex(phase) > phaseIndex(approved)) {
    console.log(
      `\nPhase ${phase} hasn't been approved yet: don't start its items. Fixes, tests and docs are still fine.`,
    );
  }
  if (claims.length) {
    console.log('\nIn progress (on main):');
    for (const c of claims) console.log(`  ${c.id}  ${c.who}  ${c.branch}  since ${c.started}`);
  }
  const free = left.filter((i) => !claims.some((c) => overlaps(c.id, i.id)));
  console.log('\nNext unclaimed items (also check open PRs before you start):');
  for (const i of free.slice(0, 5)) console.log(`  ${i.id}  ${i.text.slice(0, 110)}${i.text.length > 110 ? '…' : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
