'use client';

import { Suspense, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@fmstead/ui';
import { LABOUR_TYPES, LABOUR_TYPE_LABELS, MAX_TIME_MINUTES, type LabourType } from '@fmstead/shared';
import { SignaturePad } from '../../signature-pad';
import { useJob } from '../../use-job';

function Complete() {
  const id = useSearchParams().get('id') ?? '';
  const { job, status, checklists, queueChange, changeStatus } = useJob(id);
  const pad = useRef<HTMLCanvasElement | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState('');
  const [labourType, setLabourType] = useState<LabourType>('on_site');
  const [rootCause, setRootCause] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const back = (
    <a
      href={'/m/job?id=' + id}
      className="row"
      style={{
        padding: '4px 14px 0',
        gap: 4,
        fontWeight: 500,
        color: 'var(--primary-text)',
        textDecoration: 'none',
        minHeight: 44,
        alignItems: 'center',
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
        <Icon name="chevron-right" size={18} />
      </span>
      Job
    </a>
  );

  if (!job) {
    return (
      <>
        {back}
        <div className="m-body">
          <div className="m-card">
            <div className="medium">{job === null ? 'This job is not on your phone' : 'Loading the job'}</div>
          </div>
        </div>
      </>
    );
  }

  const blocking = checklists.filter((list) => list.gate === 'completion' && list.outstanding > 0);
  const outstanding = blocking.reduce((sum, list) => sum + list.outstanding, 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (outstanding > 0) {
      setError('Answer ' + outstanding + ' required checklist ' + (outstanding === 1 ? 'step' : 'steps') + ' first.');
      return;
    }
    const canvas = pad.current;
    if (!canvas || !drawn) {
      setError('Ask the customer to sign first.');
      return;
    }
    if (!name.trim()) {
      setError('Enter the customer’s name.');
      return;
    }
    const spent = minutes.trim() ? Number(minutes) : 0;
    if (!Number.isInteger(spent) || spent < 0 || spent > MAX_TIME_MINUTES) {
      setError('Enter the time on the job as whole minutes, for example 45.');
      return;
    }
    setError('');
    // A second tap while saving would queue the sign-off and the status change twice.
    setSaving(true);
    try {
      // Time and the root cause are saved first. Costs from the time are worked out on the server.
      if (spent > 0) {
        await queueChange({
          type: 'mutation',
          item: {
            key: '',
            kind: 'time',
            workOrderId: job!.id,
            payload: {
              labourType,
              minutes: spent,
              workedOn: new Date().toISOString().slice(0, 10),
              submission: crypto.randomUUID(),
            },
          },
        });
      }
      if (rootCause.trim()) {
        // Kept as an internal note on the job, so the customer and contractors never see it.
        await queueChange({
          type: 'mutation',
          item: {
            key: '',
            kind: 'note',
            workOrderId: job!.id,
            payload: { body: 'Root cause: ' + rootCause.trim(), internal: true },
          },
        });
      }
      // Order matters: the sign-off is sent while the job is still on site, then the job is completed.
      await queueChange(
        { type: 'signature', role: 'customer', signerName: name.trim() },
        { image: canvas.toDataURL('image/png') },
      );
      await changeStatus('completed', note.trim() || undefined);
      setDone(true);
    } finally {
      setSaving(false);
    }
  }

  if (done || status === 'completed') {
    return (
      <>
        {back}
        <div className="m-body">
          <div className="m-card" role="status">
            <div className="medium">Job completed on this phone</div>
            <div className="sm faint">
              The sign-off and the status change are saved and will sync when you have signal.
            </div>
            <a href="/m/sync" className="m-btn secondary" style={{ textDecoration: 'none' }}>
              See what is waiting to sync
            </a>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {back}
      <div className="m-head">
        <div className="xs faint medium">{job.number}</div>
        <h1 className="m-title" style={{ margin: 0 }}>
          Complete job
        </h1>
      </div>
      <form className="m-body" style={{ overflow: 'visible' }} onSubmit={submit} noValidate>
        {outstanding > 0 && (
          <div
            className="m-card"
            role="alert"
            style={{ background: 'var(--warning-soft)', borderColor: 'transparent' }}
          >
            <span className="sm medium">
              {outstanding} required checklist {outstanding === 1 ? 'step is' : 'steps are'} not answered.
            </span>
            <a href={'/m/job?id=' + job.id} className="sm">
              Go to the checklist
            </a>
          </div>
        )}
        <div className="m-card">
          <label className="medium sm" htmlFor="complete-note">
            Note for the job sheet (optional)
          </label>
          <div className="input">
            <input id="complete-note" value={note} maxLength={1200} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="m-card">
          <label className="medium sm" htmlFor="complete-minutes">
            Time on the job, in minutes (optional)
          </label>
          <div className="input lg">
            <input
              id="complete-minutes"
              inputMode="numeric"
              value={minutes}
              maxLength={4}
              autoComplete="off"
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <label className="medium sm" htmlFor="complete-labour">
            Kind of time
          </label>
          <div className="input lg">
            <select
              id="complete-labour"
              value={labourType}
              onChange={(e) => setLabourType(e.target.value as LabourType)}
            >
              {LABOUR_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LABOUR_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <label className="medium sm" htmlFor="complete-root">
            Root cause (optional, internal)
          </label>
          <div className="input">
            <input
              id="complete-root"
              value={rootCause}
              maxLength={500}
              onChange={(e) => setRootCause(e.target.value)}
            />
          </div>
        </div>
        <div className="m-card">
          <label className="medium sm" htmlFor="complete-name">
            Customer sign-off
          </label>
          <div className="input lg">
            <input
              id="complete-name"
              value={name}
              maxLength={100}
              autoComplete="off"
              placeholder="Customer’s name"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <SignaturePad padRef={pad} onDrawn={setDrawn} label="Customer signature: draw with a finger or stylus" />
          <button
            type="button"
            className="m-btn secondary"
            style={{ height: 44 }}
            onClick={() => {
              pad.current?.getContext('2d')?.clearRect(0, 0, pad.current.width, pad.current.height);
              setDrawn(false);
            }}
          >
            Clear drawing
          </button>
        </div>
        {error && (
          <div className="sm" role="alert" style={{ color: 'var(--danger-text)' }}>
            {error}
          </div>
        )}
        <button type="submit" className="m-btn primary" disabled={saving}>
          <Icon name="send" size={18} />
          Complete and sign off
        </button>
      </form>
    </>
  );
}

export default function CompletePage() {
  return (
    <Suspense>
      <Complete />
    </Suspense>
  );
}
