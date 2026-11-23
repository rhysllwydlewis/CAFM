'use client';

import { useState } from 'react';
import {
  checklistAnswerProblem,
  PASS_FAIL_ANSWERS,
  PASS_FAIL_LABELS,
  type Checklist,
  type ChecklistItem,
} from '@cafm/shared';

type Answer = (list: Checklist, item: ChecklistItem, answer: string | null, note: string | null) => Promise<void>;

function Step({ list, item, onAnswer }: { list: Checklist; item: ChecklistItem; onAnswer: Answer }) {
  const [value, setValue] = useState(item.answer ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [error, setError] = useState('');
  const id = 'step-' + item.id;

  async function save(answer: string | null, withNote: string | null = null) {
    const problem = answer === null ? null : checklistAnswerProblem(item.kind, answer, withNote);
    setError(problem ?? '');
    if (!problem) await onAnswer(list, item, answer, withNote);
  }

  return (
    <div className="m-card" style={{ gap: 8 }}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <span className="medium sm" id={id + '-label'}>
          {item.label}
          {item.required && <span className="faint xs"> · required</span>}
        </span>
        {item.answer && <span className="badge success">Answered</span>}
      </div>
      {item.kind === 'tick' && (
        <label className="row" style={{ gap: 10, minHeight: 44 }}>
          <input
            type="checkbox"
            checked={item.answer === 'done'}
            onChange={(event) => void save(event.target.checked ? 'done' : null)}
            style={{ width: 24, height: 24 }}
          />
          <span className="sm">Done</span>
        </label>
      )}
      {item.kind === 'pass_fail' && (
        <>
          <div role="group" aria-labelledby={id + '-label'} className="grid g-3" style={{ gap: 6 }}>
            {PASS_FAIL_ANSWERS.map((choice) => (
              <button
                key={choice}
                type="button"
                className="m-btn secondary"
                aria-pressed={item.answer === choice}
                style={{
                  height: 44,
                  fontSize: 14,
                  ...(item.answer === choice
                    ? { borderColor: 'var(--primary)', background: 'var(--primary-softer)' }
                    : {}),
                }}
                onClick={() => void save(choice, choice === 'fail' ? note.trim() || item.note : null)}
              >
                {PASS_FAIL_LABELS[choice]}
              </button>
            ))}
          </div>
          {(item.answer === 'fail' || error === 'Say what failed.') && (
            <>
              <label className="xs faint" htmlFor={id + '-note'}>
                What failed
              </label>
              <div className="input">
                <input id={id + '-note'} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              </div>
              <button
                type="button"
                className="m-btn secondary"
                style={{ height: 44 }}
                onClick={() => void save('fail', note.trim())}
              >
                Save note
              </button>
            </>
          )}
        </>
      )}
      {(item.kind === 'number' || item.kind === 'text') && (
        <>
          <label className="xs faint" htmlFor={id + '-value'}>
            {item.kind === 'number' ? 'Reading' + (item.unit ? ' (' + item.unit + ')' : '') : 'Comment'}
          </label>
          <div className="input lg">
            <input
              id={id + '-value'}
              value={value}
              inputMode={item.kind === 'number' ? 'decimal' : 'text'}
              maxLength={500}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? id + '-error' : undefined}
            />
          </div>
          <button
            type="button"
            className="m-btn secondary"
            style={{ height: 44 }}
            onClick={() => void save(value.trim() === '' ? null : value.trim())}
          >
            Save answer
          </button>
        </>
      )}
      {error && (
        <div id={id + '-error'} className="sm" role="alert" style={{ color: 'var(--danger-text)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

/** The job's checklists, a step at a time. An answer is saved on the phone at once and sent when there is signal. */
export function ChecklistSteps({ checklists, onAnswer }: { checklists: Checklist[]; onAnswer: Answer }) {
  return (
    <>
      {checklists.map((list) => (
        <section key={list.id} aria-label={list.title} style={{ display: 'contents' }}>
          <div className="row between" style={{ padding: '4px 2px 0' }}>
            <h2 className="medium sm" style={{ margin: 0 }}>
              {list.title}
            </h2>
            <span className="xs faint">
              {list.outstanding === 0 ? 'All required steps answered' : list.outstanding + ' required to go'}
            </span>
          </div>
          {list.items.map((item) => (
            <Step key={item.id + ':' + (item.answer ?? '')} list={list} item={item} onAnswer={onAnswer} />
          ))}
        </section>
      ))}
    </>
  );
}
