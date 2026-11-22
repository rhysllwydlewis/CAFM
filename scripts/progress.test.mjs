// Tests for scripts/progress.mjs. Run: node --test scripts/*.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { check, overlaps, parse, prProblems, progressLines, weightedPercent } from './progress.mjs';

const real = readFileSync(new URL('../docs/PROGRESS.md', import.meta.url), 'utf8');

/** A small tracker: Phase 0 done, Phase 1 with two items, one split into sub-items. */
function tracker({ claims = [], p101 = ' ', p102 = ' ', subs = null, percent = 6, approved = '1' } = {}) {
  const phase1Done = [p101, p102].filter((x) => x === 'x').length;
  const rows = [
    `| 0 · Foundations | 1 / 1 | Done |`,
    `| 1 · Core | ${phase1Done} / 2 | |`,
    ...['2A', '2B', '3', '4', '5'].map((k) => `| ${k} · Later | 0 / 1 | |`),
  ];
  const phases = ['2A', '2B', '3', '4', '5'].map((k) => `### Phase ${k} · Later\n\n- [ ] **P${k}-01** Later work\n`);
  return [
    '# Build progress',
    '',
    '| | |',
    '|---|---|',
    `| **Overall progress** | **About ${percent}%** |`,
    `<!-- approved-phase: ${approved} -->`,
    '',
    ...rows,
    '',
    '## In progress',
    '',
    '| Item | Who | Branch | Started | Next step |',
    '|---|---|---|---|---|',
    ...claims.map((c) => `| ${c.id} | ${c.who ?? 'Codex'} | \`${c.branch}\` | 2026-11-22 | next |`),
    '',
    '## Phase checklists',
    '',
    '### Phase 0 · Foundations',
    '',
    '- [x] **P0-01** Foundations',
    '',
    '### Phase 1 · Core',
    '',
    `- [${p101}] **P1-01** Locations`,
    `- [${p102}] **P1-02** Assets`,
    ...(subs ?? []).map((s) => `  - [${s.done ? 'x' : ' '}] **${s.id}** ${s.text ?? 'Step'}`),
    '',
    ...phases,
  ].join('\n');
}

test('the real tracker is consistent', () => {
  assert.deepEqual(check(real), []);
});

test('the percentage is weighted by phase length', () => {
  // Phase 0 (4 of 64 weeks) done, plus half of Phase 1 (9 weeks): (4 + 4.5) / 64 = 13%.
  assert.equal(weightedPercent(parse(tracker({ p101: 'x', percent: 13 })).items), 13);
  assert.deepEqual(check(tracker({ p101: 'x', percent: 13 })), []);
});

test('check catches counts, percentages and claims that disagree with the checklist', () => {
  const wrong = tracker({ percent: 7 }).replace('| 1 · Core | 0 / 2 |', '| 1 · Core | 1 / 2 |');
  const problems = check(wrong);
  assert.ok(problems.some((p) => p.includes('Phase 1 is 1 / 2')));
  assert.ok(problems.some((p) => p.includes('says 7%')));
  assert.ok(
    check(tracker({ claims: [{ id: 'P1-09', branch: 'x' }] })).some((p) => p.includes("isn't a checklist item")),
  );
  assert.ok(
    check(tracker({ p101: 'x', percent: 13, claims: [{ id: 'P1-01', branch: 'x' }] })).some((p) =>
      p.includes('still listed'),
    ),
  );
});

test('a split item is done exactly when its sub-items are', () => {
  const subs = [
    { id: 'P1-02a', done: true },
    { id: 'P1-02b', done: false },
  ];
  assert.deepEqual(check(tracker({ subs })), []);
  assert.ok(check(tracker({ subs, p102: 'x', percent: 13 })).some((p) => p.includes('some of its sub-items')));
  const allDone = subs.map((s) => ({ ...s, done: true }));
  assert.ok(check(tracker({ subs: allDone })).some((p) => p.includes('tick P1-02 too')));
});

test('reads Progress lines', () => {
  assert.deepEqual(progressLines('## Progress\n\n- Progress: P1-02 done, P1-03 in progress'), [
    { kind: 'done', ids: ['P1-02', 'P1-03'], raw: 'P1-02 done, P1-03 in progress' },
  ]);
  assert.deepEqual(progressLines('Progress: none - fixes a flaky test'), [
    { kind: 'none', reason: 'fixes a flaky test' },
  ]);
  // The PR template's examples sit in an HTML comment and don't count.
  const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
  assert.deepEqual(progressLines(template), [{ kind: 'unknown', ids: [], raw: '' }]);
  assert.equal(overlaps('P1-04', 'P1-04a'), true);
  assert.equal(overlaps('P1-04a', 'P1-04b'), false);
});

test('a PR must say what it progresses', () => {
  const head = tracker();
  assert.match(prProblems({ body: 'No progress line', base: head, head })[0], /needs a "Progress:" line/);
  assert.match(prProblems({ body: 'Progress: none', base: head, head })[0], /needs a reason/);
  assert.deepEqual(prProblems({ body: 'Progress: none - updates the README wording', base: head, head }), []);
});

test('done means ticked, and in progress means claimed', () => {
  const base = tracker();
  assert.match(prProblems({ body: 'Progress: P1-01 done', base, head: base })[0], /tick it/);
  assert.deepEqual(prProblems({ body: 'Progress: P1-01 done', base, head: tracker({ p101: 'x', percent: 13 }) }), []);
  assert.match(
    prProblems({ body: 'Progress: P1-01 in progress', base, head: base })[0],
    /add it to the "In progress" table/,
  );
  const claimed = tracker({ claims: [{ id: 'P1-01', branch: 'codex/locations' }] });
  assert.deepEqual(
    prProblems({ body: 'Progress: P1-01 in progress', base, head: claimed, headRef: 'codex/locations' }),
    [],
  );
});

test('nobody can take an item that is done or already claimed', () => {
  const doneOnBase = tracker({ p101: 'x', percent: 13 });
  assert.ok(
    prProblems({ body: 'Progress: P1-01 in progress', base: doneOnBase, head: doneOnBase }).some((p) =>
      p.includes('already done'),
    ),
  );

  const claimedOnMain = tracker({ claims: [{ id: 'P1-02', who: 'A12', branch: 'agent/A12-assets-*' }] });
  const mine = tracker({ claims: [{ id: 'P1-02', branch: 'claude/assets' }] });
  assert.ok(
    prProblems({ body: 'Progress: P1-02 in progress', base: claimedOnMain, head: mine, headRef: 'claude/assets' }).some(
      (p) => p.includes('already claimed by A12'),
    ),
  );
  // The claim's own later PRs are fine: the branch pattern covers them.
  assert.deepEqual(
    prProblems({
      body: 'Progress: P1-02 in progress',
      base: claimedOnMain,
      head: claimedOnMain,
      headRef: 'agent/A12-assets-step-2',
    }),
    [],
  );

  // Another open PR claimed it first (or claimed part of it).
  const base = tracker();
  const head = tracker({ claims: [{ id: 'P1-02a', branch: 'claude/assets' }], subs: [{ id: 'P1-02a' }] });
  const clash = prProblems({
    body: 'Progress: P1-02a in progress',
    base,
    head,
    headRef: 'claude/assets',
    otherClaims: [{ id: 'P1-02', number: 30, branch: 'codex/assets' }],
  });
  assert.ok(clash.some((p) => p.includes('open PR #30')));
});

test('nobody starts a phase the product owner hasn’t approved', () => {
  const base = tracker({ approved: '0' });
  const head = tracker({ approved: '0', claims: [{ id: 'P1-01', branch: 'codex/locations' }] });
  const problems = prProblems({ body: 'Progress: P1-01 in progress', base, head, headRef: 'codex/locations' });
  assert.ok(problems.some((p) => p.includes('only Phase 0 is approved')));
  assert.ok(check(tracker().replace(/<!-- approved-phase: 1 -->\n/, '')).some((p) => p.includes('marker is missing')));
});

test('an owner can explicitly transfer a precise base claim without superseding an open PR', () => {
  const base = tracker({ claims: [{ id: 'P1-02', who: 'A12', branch: 'agent/assets' }] });
  const head = tracker({ claims: [{ id: 'P1-02', branch: 'codex/assets' }] });
  const body = 'Progress: P1-02 in progress\nHandover: P1-02 from agent/assets';
  const args = { body, base, head, headRef: 'codex/assets' };
  assert.match(prProblems(args)[0], /already claimed/);
  assert.deepEqual(prProblems({ ...args, ownerHandover: true }), []);
  assert.match(prProblems({ ...args, ownerHandover: true, head: base })[0], /In progress/);
  assert.match(
    prProblems({ ...args, ownerHandover: true, otherClaims: [{ id: 'P1-02', number: 30, branch: 'agent/assets' }] })[0],
    /open PR #30/,
  );
});
