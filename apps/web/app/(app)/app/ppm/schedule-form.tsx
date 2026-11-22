'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@cafm/ui';
import {
  formatMinor,
  parseMoneyMinor,
  PPM_CALENDAR_UNITS,
  PPM_CRITICALITIES,
  PPM_CRITICALITY_LABELS,
  PPM_MODE_LABELS,
  PPM_MODES,
  PPM_PRIORITY_NAMES,
  PPM_UNIT_LABELS,
  type PpmAssigneeOption,
  type PpmCalendarUnit,
  type PpmCriticality,
  type PpmMode,
  type PpmScheduleRecord,
  type PpmTaskTemplate,
} from '@cafm/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import styles from './ppm.module.css';

/** Planning a schedule, or changing one. A new schedule gets its assets on the page it opens. */
export function ScheduleForm({
  schedule,
  templates,
  assignees,
  today,
  canSetCost,
}: {
  schedule?: PpmScheduleRecord;
  templates: PpmTaskTemplate[];
  assignees: PpmAssigneeOption[];
  today: string;
  canSetCost: boolean;
}) {
  const router = useRouter();
  const editing = !!schedule;
  const [kind, setKind] = useState<'calendar' | 'meter'>(schedule?.frequency.type ?? 'calendar');
  const [templateId, setTemplateId] = useState(schedule?.templateId ?? '');
  const [criticality, setCriticality] = useState<PpmCriticality>(schedule?.criticality ?? 'optimal');
  const [discipline, setDiscipline] = useState(schedule?.discipline ?? '');
  const [minutes, setMinutes] = useState(String(schedule?.durationMinutes ?? 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Choosing a task fills in what it says, which can still be changed.
  function chooseTask(id: string) {
    setTemplateId(id);
    const template = templates.find((candidate) => candidate.id === id);
    if (!template || editing) return;
    setCriticality(template.criticality);
    setDiscipline(template.discipline ?? '');
    setMinutes(String(template.durationMinutes));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const duration = Number(minutes);
    const lead = Number(text('leadDays'));
    if (!Number.isInteger(duration) || duration < 5 || duration > 10_080) {
      setError('Enter the time for each visit in minutes, from 5 to 10,080.');
      return;
    }
    if (!Number.isInteger(lead) || lead < 0 || lead > 365) {
      setError('Enter how many days ahead to raise jobs, from 0 to 365.');
      return;
    }
    let frequency: object;
    if (kind === 'calendar') {
      const interval = Number(text('interval'));
      if (!Number.isInteger(interval) || interval < 1 || interval > 120) {
        setError('Enter how often, as a whole number from 1 to 120.');
        return;
      }
      frequency = { type: 'calendar', unit: text('unit'), interval };
    } else {
      if (!/^\d{1,9}(\.\d{1,3})?$/.test(text('meterInterval')) || Number(text('meterInterval')) <= 0) {
        setError('Enter how far the meter must advance, for example 250.');
        return;
      }
      frequency = { type: 'meter', meterName: text('meterName'), interval: text('meterInterval') };
    }
    let estimatedCostMinor: number | null | undefined;
    if (canSetCost) {
      const cost = text('cost');
      estimatedCostMinor = cost ? parseMoneyMinor(cost) : null;
      if (cost && estimatedCostMinor === null) {
        setError('Enter the cost of a visit in pounds, like 48.90.');
        return;
      }
    }
    const payload = {
      title: text('title'),
      ...(templateId ? { templateId } : {}),
      ...(discipline.trim() ? { discipline: discipline.trim() } : {}),
      criticality,
      frequency,
      mode: kind === 'meter' ? 'floating' : text('mode'),
      startsOn: text('startsOn'),
      leadDays: lead,
      durationMinutes: duration,
      priority: Number(text('priority')),
      assigneeId: text('assigneeId') || null,
      ...(estimatedCostMinor !== undefined ? { estimatedCostMinor } : {}),
      ...(editing ? { active: data.get('active') === 'on', version: schedule.version } : {}),
    };
    setBusy(true);
    setError('');
    try {
      const saved = await helpdeskWrite<{ id: string }>(
        editing ? `/ppm/schedules/${schedule.id}` : '/ppm/schedules',
        payload,
        editing ? 'PUT' : 'POST',
      );
      router.push(`/app/ppm/schedules/${saved.id}`);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save the schedule. Try again.');
      setBusy(false);
    }
  }

  return (
    <form className="card card-b stack g3" onSubmit={submit} aria-label={editing ? 'Edit schedule' : 'New schedule'}>
      <Field label="Title" htmlFor="ppm-title">
        <TextInput id="ppm-title" name="title" required maxLength={150} defaultValue={schedule?.title} />
      </Field>
      <Field label="Task from the library" htmlFor="ppm-task">
        <small className="muted">The steps are copied onto each job as its checklist.</small>
        <select
          id="ppm-task"
          className={styles.control}
          value={templateId}
          onChange={(event) => chooseTask(event.target.value)}
        >
          <option value="">No task</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </Field>
      <div className={styles.filters}>
        <Field label="Criticality" htmlFor="ppm-criticality">
          <select
            id="ppm-criticality"
            className={styles.control}
            value={criticality}
            onChange={(event) => setCriticality(event.target.value as PpmCriticality)}
          >
            {PPM_CRITICALITIES.map((key) => (
              <option key={key} value={key}>
                {PPM_CRITICALITY_LABELS[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Discipline" htmlFor="ppm-discipline">
          <TextInput
            id="ppm-discipline"
            value={discipline}
            maxLength={60}
            onChange={(event) => setDiscipline(event.target.value)}
          />
        </Field>
        <Field label="Time for each visit (minutes)" htmlFor="ppm-minutes">
          <TextInput
            id="ppm-minutes"
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </Field>
      </div>

      <fieldset className="stack g2" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">How often</legend>
        <div className="row wrap g3">
          <label className="row g2">
            <input type="radio" name="kind" checked={kind === 'calendar'} onChange={() => setKind('calendar')} /> On the
            calendar
          </label>
          <label className="row g2">
            <input type="radio" name="kind" checked={kind === 'meter'} onChange={() => setKind('meter')} /> By a meter
            reading
          </label>
        </div>
        {kind === 'calendar' ? (
          <div className={styles.filters}>
            <Field label="Every" htmlFor="ppm-interval">
              <TextInput
                id="ppm-interval"
                name="interval"
                inputMode="numeric"
                defaultValue={schedule?.frequency.type === 'calendar' ? schedule.frequency.interval : 1}
              />
            </Field>
            <Field label="Unit" htmlFor="ppm-unit">
              <select
                id="ppm-unit"
                name="unit"
                className={styles.control}
                defaultValue={schedule?.frequency.type === 'calendar' ? schedule.frequency.unit : 'month'}
              >
                {PPM_CALENDAR_UNITS.map((unit: PpmCalendarUnit) => (
                  <option key={unit} value={unit}>
                    {PPM_UNIT_LABELS[unit].many}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fixed or from the last visit" htmlFor="ppm-mode">
              <select id="ppm-mode" name="mode" className={styles.control} defaultValue={schedule?.mode ?? 'fixed'}>
                {PPM_MODES.map((mode: PpmMode) => (
                  <option key={mode} value={mode}>
                    {PPM_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div className={styles.filters}>
            <Field label="Meter name" htmlFor="ppm-meter">
              <small className="muted">As it is on the asset, for example Run hours.</small>
              <TextInput
                id="ppm-meter"
                name="meterName"
                required
                maxLength={80}
                defaultValue={schedule?.frequency.type === 'meter' ? schedule.frequency.meterName : ''}
              />
            </Field>
            <Field label="Every (units on the meter)" htmlFor="ppm-meter-interval">
              <TextInput
                id="ppm-meter-interval"
                name="meterInterval"
                inputMode="decimal"
                defaultValue={schedule?.frequency.type === 'meter' ? schedule.frequency.interval : ''}
              />
            </Field>
          </div>
        )}
      </fieldset>

      <div className={styles.filters}>
        <Field label={kind === 'meter' ? 'First visit from' : 'First visit'} htmlFor="ppm-starts">
          <TextInput id="ppm-starts" name="startsOn" type="date" required defaultValue={schedule?.startsOn ?? today} />
        </Field>
        <Field label="Raise jobs this many days ahead" htmlFor="ppm-lead">
          <TextInput id="ppm-lead" name="leadDays" inputMode="numeric" defaultValue={schedule?.leadDays ?? 28} />
        </Field>
        <Field label="Priority" htmlFor="ppm-priority">
          <select id="ppm-priority" name="priority" className={styles.control} defaultValue={schedule?.priority ?? 3}>
            {PPM_PRIORITY_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>
                P{index + 1} {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Give the jobs to" htmlFor="ppm-assignee">
          <select
            id="ppm-assignee"
            name="assigneeId"
            className={styles.control}
            defaultValue={schedule?.assigneeId ?? ''}
          >
            <option value="">Nobody yet</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.role})
              </option>
            ))}
          </select>
        </Field>
        {canSetCost && (
          <Field label="Estimated cost of a visit (£)" htmlFor="ppm-cost">
            <TextInput
              id="ppm-cost"
              name="cost"
              inputMode="decimal"
              defaultValue={
                schedule?.estimatedCostMinor != null
                  ? formatMinor(schedule.estimatedCostMinor, schedule.currency).replace(/[£,]/g, '')
                  : ''
              }
            />
          </Field>
        )}
      </div>
      {editing && (
        <label className="row g2">
          <input type="checkbox" name="active" className="cb" defaultChecked={schedule.active} /> Active. Untick to
          archive it.
        </label>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row g2">
        <Button type="submit" variant="primary" disabled={busy}>
          {editing ? 'Save schedule' : 'Create schedule'}
        </Button>
        <Button disabled={busy} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
