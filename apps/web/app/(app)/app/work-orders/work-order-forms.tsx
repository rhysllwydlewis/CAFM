'use client';

import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@cafm/ui';
import {
  CHECKLIST_GATE_LABELS,
  CHECKLIST_GATES,
  checklistAnswerProblem,
  JOB_SHEET_STATUSES,
  PASS_FAIL_LABELS,
  PHOTO_PHASE_LABELS,
  PHOTO_PHASES,
  SIGNATURE_ROLE_LABELS,
  SIGNATURE_ROLES,
  SIGNATURE_STATUSES,
  type Checklist,
  type ChecklistGate,
  type ChecklistItem,
  type ChecklistTemplateItem,
  type SignatureRole,
  type WorkOrderPhoto,
  type WorkOrderSignature,
} from '@cafm/shared';
import { uploadFile } from '@/lib/attachment-client';
import { requestTime } from '@/lib/helpdesk-format';
import styles from './work-orders.module.css';

type Problem = { message: string };
const isProblem = (value: unknown): value is Problem =>
  typeof value === 'object' && value !== null && 'message' in value && typeof (value as Problem).message === 'string';

/** Sends a change and returns the new list, or what went wrong. */
async function send<T>(path: string, method: string, body?: unknown): Promise<T | Problem> {
  const response = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => null);
  if (response.ok) return data as T;
  const message = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
  const errors = data?.errors && typeof data.errors === 'object' ? Object.values(data.errors).join(' ') : '';
  return { message: message || errors || 'Could not save this change. Try again.' };
}

/* Checklists ----------------------------------------------------------------------------------------------- */

function StepRow({
  jobId,
  listId,
  item,
  editable,
  onResult,
}: {
  jobId: string;
  listId: string;
  item: ChecklistItem;
  editable: boolean;
  onResult: (result: Checklist[] | Problem) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(item.answer ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path = `/work-orders/${jobId}/checklists/${listId}/items/${item.id}`;

  async function save(answer: string | null, answerNote: string | null) {
    if (answer !== null) {
      const problem = checklistAnswerProblem(item.kind, answer, answerNote?.trim() || null);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError('');
    const result = await send<Checklist[]>(path, 'PUT', { answer, note: answerNote });
    setBusy(false);
    if (isProblem(result)) setError(result.message);
    onResult(result);
  }

  const label = (
    <>
      {item.label}
      {item.required && <span className="muted"> (required)</span>}
    </>
  );
  const answered = item.answer !== null;
  const meta = answered && item.answeredByName ? `Answered by ${item.answeredByName}` : null;

  let control: ReactNode;
  if (item.kind === 'tick') {
    control = (
      <label className="row g2" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="cb"
          checked={item.answer === 'done'}
          disabled={!editable || busy}
          onChange={(event) => void save(event.target.checked ? 'done' : null, null)}
        />
        <span>{label}</span>
      </label>
    );
  } else {
    control = (
      <div className="stack g2">
        <label className="label" htmlFor={id}>
          {label}
        </label>
        {item.kind === 'pass_fail' ? (
          <select
            id={id}
            className={styles.control}
            value={value}
            disabled={!editable}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="">Not answered</option>
            {(Object.keys(PASS_FAIL_LABELS) as (keyof typeof PASS_FAIL_LABELS)[]).map((key) => (
              <option key={key} value={key}>
                {PASS_FAIL_LABELS[key]}
              </option>
            ))}
          </select>
        ) : (
          <div className={styles.inline}>
            <input
              id={id}
              className={styles.control}
              value={value}
              inputMode={item.kind === 'number' ? 'decimal' : undefined}
              maxLength={500}
              disabled={!editable}
              onChange={(event) => setValue(event.target.value)}
            />
            {item.unit && <span className="muted">{item.unit}</span>}
          </div>
        )}
        {item.kind === 'pass_fail' && value === 'fail' && (
          <input
            className={styles.control}
            aria-label={`What failed: ${item.label}`}
            placeholder="What failed?"
            value={note}
            maxLength={500}
            disabled={!editable}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
        {editable && (
          <div className={styles.actions}>
            <Button size="sm" disabled={busy || !value} onClick={() => void save(value, note)}>
              Save answer
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <li className={styles.checkItem}>
      {control}
      {item.kind === 'tick' && item.note && <p className="sm muted">{item.note}</p>}
      {answered && item.kind !== 'tick' && !editable && (
        <p className="sm">
          <strong>{item.answer}</strong>
          {item.note ? ' · ' + item.note : ''}
        </p>
      )}
      {(meta || (answered && editable && item.kind !== 'tick')) && (
        <div className="row wrap g2 sm muted">
          {meta && <span>{meta}</span>}
          {answered && editable && item.kind !== 'tick' && (
            <Button
              size="sm"
              disabled={busy}
              aria-label={`Clear the answer to ${item.label}`}
              onClick={() => {
                setValue('');
                setNote('');
                void save(null, null);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

const gateBadge = (gate: ChecklistGate) =>
  gate === 'none' ? null : <span className="badge outline">{CHECKLIST_GATE_LABELS[gate]}</span>;

/** Own steps typed one per line. A line that starts with * must be answered. */
function parseSteps(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const required = line.startsWith('*');
      return { label: line.replace(/^\*\s*/, '').slice(0, 200), kind: 'tick' as const, required };
    })
    .filter((step) => step.label);
}

export function ChecklistsCard({
  jobId,
  initial,
  templates,
  canAnswer,
  canEdit,
  locked,
}: {
  jobId: string;
  initial: Checklist[];
  templates: ChecklistTemplateItem[];
  canAnswer: boolean;
  canEdit: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [lists, setLists] = useState(initial);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/work-orders/${jobId}/checklists`;
  const editable = canAnswer && !locked;

  function accept(result: Checklist[] | Problem) {
    if (isProblem(result)) return;
    setLists(result);
    router.refresh();
  }

  async function change(call: () => Promise<Checklist[] | Problem>, done?: () => void) {
    setBusy(true);
    setMessage('');
    const result = await call();
    setBusy(false);
    if (isProblem(result)) {
      setMessage(result.message);
      return;
    }
    setLists(result);
    done?.();
    router.refresh();
  }

  function fromTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const templateId = String(new FormData(event.currentTarget).get('template') ?? '');
    if (!templateId) {
      setMessage('Choose a template.');
      return;
    }
    void change(() => send<Checklist[]>(base, 'POST', { templateId }));
  }

  function own(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const items = parseSteps(String(data.get('steps') ?? ''));
    if (!items.length) {
      setMessage('Write at least one step.');
      return;
    }
    void change(
      () =>
        send<Checklist[]>(base, 'POST', {
          title: String(data.get('title') ?? '').trim(),
          gate: data.get('gate'),
          items,
        }),
      () => form.reset(),
    );
  }

  return (
    <section className="card card-b stack g3" aria-labelledby="wo-checklists">
      <h2 className="card-t" id="wo-checklists">
        Checklists
      </h2>
      {lists.length === 0 && <p className="muted">No checklists on this job.</p>}
      {lists.map((list) => (
        <div key={list.id} className="stack g2">
          <div className="row wrap between g2">
            <h3 className="medium">{list.title}</h3>
            <div className="row wrap g2">
              {gateBadge(list.gate)}
              <span className={'badge ' + (list.outstanding ? 'warning' : 'success')}>
                {list.outstanding ? `${list.outstanding} required to answer` : 'Complete'}
              </span>
            </div>
          </div>
          <ol className={styles.checklist}>
            {list.items.map((item) => (
              <StepRow
                key={item.id + ':' + (item.answeredAt ?? '')}
                jobId={jobId}
                listId={list.id}
                item={item}
                editable={editable}
                onResult={accept}
              />
            ))}
          </ol>
          {canEdit && !locked && (
            <div>
              <Button
                size="sm"
                disabled={busy}
                aria-label={`Remove checklist ${list.title}`}
                onClick={() => void change(() => send<Checklist[]>(`${base}/${list.id}`, 'DELETE'))}
              >
                Remove checklist
              </Button>
            </div>
          )}
        </div>
      ))}

      {canEdit && !locked && (
        <div className="stack g3">
          {templates.length > 0 && (
            <form className="stack g2" onSubmit={fromTemplate} aria-label="Add a checklist from a template">
              <Field label="Add from a template" htmlFor="checklist-template">
                <select id="checklist-template" name="template" className={styles.control} defaultValue="">
                  <option value="">Choose a template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <Button type="submit" size="sm" disabled={busy}>
                  Add checklist
                </Button>
              </div>
            </form>
          )}
          <details>
            <summary>Write your own checklist</summary>
            <form className="stack g2" onSubmit={own} aria-label="Write a checklist">
              <Field label="Title" htmlFor="checklist-title">
                <TextInput id="checklist-title" name="title" required maxLength={120} />
              </Field>
              <Field label="What it holds back" htmlFor="checklist-gate">
                <select id="checklist-gate" name="gate" className={styles.control} defaultValue="none">
                  {CHECKLIST_GATES.map((gate) => (
                    <option key={gate} value={gate}>
                      {CHECKLIST_GATE_LABELS[gate]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Steps" htmlFor="checklist-steps">
                <small className="muted">One step per line. Start a line with * if it must be done.</small>
                <textarea id="checklist-steps" name="steps" className={styles.textarea} required />
              </Field>
              <div>
                <Button type="submit" size="sm" disabled={busy}>
                  Add checklist
                </Button>
              </div>
            </form>
          </details>
        </div>
      )}
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

/* Photos ---------------------------------------------------------------------------------------------------- */

export function PhotosCard({
  jobId,
  photos,
  canAdd,
  canRemove,
  locked,
}: {
  jobId: string;
  photos: WorkOrderPhoto[];
  canAdd: boolean;
  canRemove: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const base = `/work-orders/${jobId}/photos`;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || !file.size) return;
    const query = new URLSearchParams({ phase: String(data.get('phase') ?? 'other') });
    const caption = String(data.get('caption') ?? '').trim();
    if (caption) query.set('caption', caption);
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await uploadFile(base + '?' + query.toString(), file, true);
      form.reset();
      setStatus('Photo added.');
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not upload the photo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: WorkOrderPhoto) {
    setBusy(true);
    setError('');
    const result = await send<{ ok: true }>(`${base}/${photo.id}`, 'DELETE');
    setBusy(false);
    if (isProblem(result)) setError(result.message);
    else router.refresh();
  }

  return (
    <section className="card card-b stack g3" aria-labelledby="wo-photos">
      <h2 className="card-t" id="wo-photos">
        Photos
      </h2>
      {photos.length ? (
        <ul className={styles.photoGrid}>
          {photos.map((photo) => (
            <li key={photo.id} className={styles.photo}>
              <img
                src={`/api${base}/${photo.id}`}
                alt={`${PHOTO_PHASE_LABELS[photo.phase]} photo${photo.caption ? ': ' + photo.caption : ''}`}
                loading="lazy"
              />
              <div className="sm">
                <strong>{PHOTO_PHASE_LABELS[photo.phase]}</strong>
                {photo.caption ? ' · ' + photo.caption : ''}
              </div>
              {canRemove && !locked && (
                <Button
                  size="sm"
                  disabled={busy}
                  aria-label={`Remove the ${PHOTO_PHASE_LABELS[photo.phase].toLowerCase()} photo ${photo.filename}`}
                  onClick={() => void remove(photo)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No photos on this job.</p>
      )}
      {canAdd && !locked && (
        <form className="stack g2" onSubmit={upload} aria-label="Add a photo">
          <Field label="Choose a photo" htmlFor={id}>
            <small className="muted" id={id + '-hint'}>
              JPEG, PNG or WebP, up to 8 MB.
            </small>
            <input
              id={id}
              aria-describedby={id + '-hint'}
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              required
            />
          </Field>
          <Field label="When was it taken?" htmlFor={id + '-phase'}>
            <select id={id + '-phase'} name="phase" className={styles.control} defaultValue="before" disabled={busy}>
              {PHOTO_PHASES.map((phase) => (
                <option key={phase} value={phase}>
                  {PHOTO_PHASE_LABELS[phase]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Caption (optional)" htmlFor={id + '-caption'}>
            <TextInput id={id + '-caption'} name="caption" maxLength={150} disabled={busy} />
          </Field>
          <div>
            <Button type="submit" size="sm" disabled={busy}>
              Add photo
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="sm" role="status">
          {status}
        </p>
      )}
    </section>
  );
}

/* Sign-off -------------------------------------------------------------------------------------------------- */

const PAD = { width: 600, height: 200 };

/** A drawing pad for a finger, stylus or mouse. It tells the form whether anything has been drawn. */
function SignaturePad({
  label,
  onDrawn,
  padRef,
}: {
  label: string;
  onDrawn: (drawn: boolean) => void;
  padRef: RefObject<HTMLCanvasElement | null>;
}) {
  const drawing = useRef(false);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * PAD.width,
      y: ((event.clientY - box.top) / box.height) * PAD.height,
    };
  };
  const context = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Always dark ink on the light pad, in either theme, because the drawing is printed on white.
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--graphite-900').trim() || 'black';
    }
    return ctx;
  };
  return (
    <canvas
      ref={padRef}
      className={styles.pad}
      width={PAD.width}
      height={PAD.height}
      role="img"
      aria-label={label}
      onPointerDown={(event) => {
        const ctx = context(event.currentTarget);
        if (!ctx) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        const { x, y } = point(event);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.01, y);
        ctx.stroke();
        onDrawn(true);
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        const ctx = context(event.currentTarget);
        const { x, y } = point(event);
        ctx?.lineTo(x, y);
        ctx?.stroke();
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerCancel={() => {
        drawing.current = false;
      }}
    />
  );
}

function SignForm({
  jobId,
  role,
  onSigned,
}: {
  jobId: string;
  role: SignatureRole;
  onSigned: (list: WorkOrderSignature[]) => void;
}) {
  const id = useId();
  const pad = useRef<HTMLCanvasElement | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function clear() {
    const canvas = pad.current;
    canvas?.getContext('2d')?.clearRect(0, 0, PAD.width, PAD.height);
    setDrawn(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const canvas = pad.current;
    if (!canvas || !drawn) {
      setError('Draw a signature first.');
      return;
    }
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (role === 'customer' && !name) {
      setError('Enter the customer’s name.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await send<WorkOrderSignature[]>(`/work-orders/${jobId}/signatures`, 'POST', {
      role,
      ...(role === 'customer' ? { signerName: name } : {}),
      image: canvas.toDataURL('image/png'),
    });
    setBusy(false);
    if (isProblem(result)) {
      setError(result.message);
      return;
    }
    onSigned(result);
  }

  return (
    <form className="stack g2" onSubmit={submit} aria-label={SIGNATURE_ROLE_LABELS[role]}>
      <h3 className="medium">{SIGNATURE_ROLE_LABELS[role]}</h3>
      {role === 'customer' ? (
        <Field label="Customer’s name" htmlFor={id + '-name'}>
          <TextInput id={id + '-name'} name="name" maxLength={100} autoComplete="off" />
        </Field>
      ) : (
        <p className="sm muted">Signing as you.</p>
      )}
      <SignaturePad
        padRef={pad}
        onDrawn={setDrawn}
        label={`${SIGNATURE_ROLE_LABELS[role]}: draw a signature with a finger, stylus or mouse`}
      />
      <div className={styles.actions}>
        <Button size="sm" disabled={busy || !drawn} onClick={clear}>
          Clear drawing
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={busy}>
          Save sign-off
        </Button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function SignOffCard({
  jobId,
  status,
  initial,
  canSign,
  canRemove,
  locked,
}: {
  jobId: string;
  status: string;
  initial: WorkOrderSignature[];
  canSign: boolean;
  canRemove: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [signatures, setSignatures] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signed = new Set(signatures.map((signature) => signature.role));
  const open = (SIGNATURE_STATUSES as readonly string[]).includes(status) && !locked;

  async function remove(signature: WorkOrderSignature) {
    setBusy(true);
    setError('');
    const result = await send<WorkOrderSignature[]>(`/work-orders/${jobId}/signatures/${signature.id}`, 'DELETE');
    setBusy(false);
    if (isProblem(result)) {
      setError(result.message);
      return;
    }
    setSignatures(result);
    router.refresh();
  }

  return (
    <section className="card card-b stack g3" aria-labelledby="wo-signoff">
      <h2 className="card-t" id="wo-signoff">
        Sign-off
      </h2>
      {signatures.map((signature) => (
        <div key={signature.id} className={'stack g2 ' + styles.signature}>
          <h3 className="medium">{SIGNATURE_ROLE_LABELS[signature.role]}</h3>
          <img
            src={`/api/work-orders/${jobId}/signatures/${signature.id}/image`}
            alt={`Signature of ${signature.signerName}`}
          />
          <p className="sm">
            {signature.signerName} · <time dateTime={signature.signedAt}>{requestTime(signature.signedAt)}</time>
          </p>
          {canRemove && !locked && (
            <div>
              <Button
                size="sm"
                disabled={busy}
                aria-label={`Remove sign-off: ${SIGNATURE_ROLE_LABELS[signature.role].toLowerCase()}`}
                onClick={() => void remove(signature)}
              >
                Remove sign-off
              </Button>
            </div>
          )}
        </div>
      ))}
      {signatures.length === 0 && <p className="muted">Nobody has signed this job off.</p>}
      {canSign &&
        open &&
        SIGNATURE_ROLES.filter((role) => !signed.has(role)).map((role) => (
          <SignForm
            key={role}
            jobId={jobId}
            role={role}
            onSigned={(list) => {
              setSignatures(list);
              router.refresh();
            }}
          />
        ))}
      {canSign && !open && !locked && signatures.length < SIGNATURE_ROLES.length && (
        <p className="muted sm">The job can be signed off once the work has started.</p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/* Job sheet ------------------------------------------------------------------------------------------------- */

export function JobSheetCard({ jobId, status, canEmail }: { jobId: string; status: string; canEmail: boolean }) {
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const done = (JOB_SHEET_STATUSES as readonly string[]).includes(status);

  async function email() {
    setBusy(true);
    setMessage('');
    setProblem('');
    const result = await send<{ sent: true }>(`/work-orders/${jobId}/job-sheet/email`, 'POST', {});
    setBusy(false);
    if (isProblem(result)) setProblem(result.message);
    else setMessage('The job sheet has been emailed to the requester.');
  }

  return (
    <section className="card card-b stack g3" aria-labelledby="wo-sheet">
      <h2 className="card-t" id="wo-sheet">
        Job sheet
      </h2>
      <p className="muted">
        A PDF of the job, its checklists, photos and sign-off. The copy sent to the requester has no costs.
      </p>
      <div className={styles.actions}>
        <a className="btn secondary sm" href={`/api/work-orders/${jobId}/job-sheet`} download>
          Download job sheet (PDF)
        </a>
        {canEmail && done && (
          <Button size="sm" disabled={busy} onClick={() => void email()}>
            Email to the requester
          </Button>
        )}
      </div>
      {message && (
        <p className="sm" role="status">
          {message}
        </p>
      )}
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
