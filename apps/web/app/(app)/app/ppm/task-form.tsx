'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@cafm/ui';
import {
  CHECKLIST_ITEM_KIND_LABELS,
  CHECKLIST_ITEM_KINDS,
  MAX_PPM_STEPS,
  PPM_CRITICALITIES,
  PPM_CRITICALITY_LABELS,
  type ChecklistItemKind,
  type PpmCriticality,
  type PpmTaskTemplate,
} from '@cafm/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import styles from './ppm.module.css';

type Step = { key: number; label: string; kind: ChecklistItemKind; required: boolean; unit: string };

/** A task in the library: what is done, how long it takes, and the steps to follow. */
export function TaskForm({ task }: { task?: PpmTaskTemplate }) {
  const router = useRouter();
  const editing = !!task;
  const next = useRef(0);
  const blank = (): Step => ({ key: next.current++, label: '', kind: 'tick', required: true, unit: '' });
  const [steps, setSteps] = useState<Step[]>(() =>
    (task?.steps ?? []).map((step) => ({
      key: next.current++,
      label: step.label,
      kind: step.kind,
      required: step.required ?? false,
      unit: step.unit ?? '',
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const change = (key: number, patch: Partial<Step>) =>
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...patch } : step)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const duration = Number(text('duration'));
    if (!Number.isInteger(duration) || duration < 5 || duration > 10_080) {
      setError('Enter the time for a visit in minutes, from 5 to 10,080.');
      return;
    }
    if (steps.some((step) => !step.label.trim())) {
      setError('Give every step a name, or remove it.');
      return;
    }
    const payload = {
      name: text('name'),
      ...(text('description') ? { description: text('description') } : {}),
      ...(text('discipline') ? { discipline: text('discipline') } : {}),
      criticality: text('criticality') as PpmCriticality,
      durationMinutes: duration,
      ...(text('skills') ? { skills: text('skills') } : {}),
      ...(text('safetyNotes') ? { safetyNotes: text('safetyNotes') } : {}),
      steps: steps.map((step) => ({
        label: step.label.trim(),
        kind: step.kind,
        required: step.required,
        ...(step.kind === 'number' && step.unit.trim() ? { unit: step.unit.trim() } : {}),
      })),
      ...(editing ? { version: task.version } : {}),
    };
    setBusy(true);
    setError('');
    try {
      await helpdeskWrite(editing ? `/ppm/templates/${task.id}` : '/ppm/templates', payload, editing ? 'PUT' : 'POST');
      router.push('/app/ppm/tasks');
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save the task. Try again.');
      setBusy(false);
    }
  }

  async function retire() {
    if (!task) return;
    setBusy(true);
    setError('');
    try {
      await helpdeskWrite(`/ppm/templates/${task.id}`, {}, 'DELETE');
      router.push('/app/ppm/tasks');
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not retire the task. Try again.');
      setBusy(false);
    }
  }

  return (
    <form className="card card-b stack g3" onSubmit={submit} aria-label={editing ? 'Edit task' : 'New task'}>
      <Field label="Name" htmlFor="task-name">
        <TextInput id="task-name" name="name" required maxLength={120} defaultValue={task?.name} />
      </Field>
      <Field label="What is done" htmlFor="task-description">
        <textarea
          id="task-description"
          name="description"
          className={styles.textarea}
          maxLength={1000}
          defaultValue={task?.description ?? ''}
        />
      </Field>
      <div className={styles.filters}>
        <Field label="Discipline" htmlFor="task-discipline">
          <TextInput id="task-discipline" name="discipline" maxLength={60} defaultValue={task?.discipline ?? ''} />
        </Field>
        <Field label="Criticality" htmlFor="task-criticality">
          <select
            id="task-criticality"
            name="criticality"
            className={styles.control}
            defaultValue={task?.criticality ?? 'optimal'}
          >
            {PPM_CRITICALITIES.map((key) => (
              <option key={key} value={key}>
                {PPM_CRITICALITY_LABELS[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Time for a visit (minutes)" htmlFor="task-duration">
          <TextInput
            id="task-duration"
            name="duration"
            inputMode="numeric"
            defaultValue={task?.durationMinutes ?? 60}
          />
        </Field>
      </div>
      <Field label="Skills needed" htmlFor="task-skills">
        <TextInput id="task-skills" name="skills" maxLength={200} defaultValue={task?.skills ?? ''} />
      </Field>
      <Field label="Safety notes" htmlFor="task-safety">
        <textarea
          id="task-safety"
          name="safetyNotes"
          className={styles.textarea}
          maxLength={1000}
          defaultValue={task?.safetyNotes ?? ''}
        />
      </Field>

      <fieldset className={'stack g3 ' + styles.plain}>
        <legend className="card-t">Steps</legend>
        <p className="sm muted">
          These are copied onto each job as its checklist. Required steps must be answered before the job can be
          completed.
        </p>
        {steps.map((step, index) => (
          <div key={step.key} className={styles.stepRow} role="group" aria-label={`Step ${index + 1}`}>
            <Field label={`Step ${index + 1} name`} htmlFor={`step-${step.key}`}>
              <TextInput
                id={`step-${step.key}`}
                value={step.label}
                maxLength={200}
                onChange={(event) => change(step.key, { label: event.target.value })}
              />
            </Field>
            <Field label="Response" htmlFor={`kind-${step.key}`}>
              <select
                id={`kind-${step.key}`}
                className={styles.control}
                value={step.kind}
                onChange={(event) => change(step.key, { kind: event.target.value as ChecklistItemKind })}
              >
                {CHECKLIST_ITEM_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {CHECKLIST_ITEM_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </Field>
            <label className="row g2">
              <input
                type="checkbox"
                className="cb"
                checked={step.required}
                onChange={(event) => change(step.key, { required: event.target.checked })}
              />
              Required
            </label>
            {step.kind === 'number' ? (
              <Field label="Unit" htmlFor={`unit-${step.key}`}>
                <TextInput
                  id={`unit-${step.key}`}
                  value={step.unit}
                  maxLength={20}
                  onChange={(event) => change(step.key, { unit: event.target.value })}
                />
              </Field>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => setSteps((current) => current.filter((candidate) => candidate.key !== step.key))}
            >
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button
            size="sm"
            disabled={steps.length >= MAX_PPM_STEPS}
            onClick={() => setSteps((current) => [...current, blank()])}
          >
            Add a step
          </Button>
        </div>
      </fieldset>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row wrap g2">
        <Button type="submit" variant="primary" disabled={busy}>
          {editing ? 'Save task' : 'Create task'}
        </Button>
        <Button disabled={busy} onClick={() => router.push('/app/ppm/tasks')}>
          Cancel
        </Button>
        {editing && (
          <Button disabled={busy} onClick={() => void retire()}>
            Retire this task
          </Button>
        )}
      </div>
    </form>
  );
}
