'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Field, TextInput } from '@cafm/ui';
import {
  defaultRequestPriority,
  type RequestNotificationEvent,
  type RequestPriorityInput,
  type RequestTypeInput,
} from '@cafm/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { RecordPicker } from '../record-picker';
import styles from '../helpdesk.module.css';

type Type = RequestTypeInput & { id: string; version: number };
type Mailbox = {
  id: string;
  version: number;
  address: string;
  active: boolean;
  locationId: string;
  typeId: string;
  location: { name: string; code: string };
};
type Template = { key: RequestNotificationEvent; title: string; body: string; email: boolean; push: boolean };
export type HelpdeskSettings = {
  types: Type[];
  mailboxes: Mailbox[];
  matrix: RequestPriorityInput[];
  templates: Template[];
};
const base = '/helpdesk/settings';

function SettingsForm({
  label,
  children,
  save,
}: {
  label: string;
  children: ReactNode;
  save: (data: FormData) => Promise<unknown>;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(undefined);
    try {
      await save(new FormData(event.currentTarget));
      setFeedback({ text: 'Saved.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save your changes.', error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack g3" onSubmit={submit}>
      {children}
      {feedback && (
        <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'field-error' : 'muted'}>
          {feedback.text}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          {label}
        </Button>
      </div>
    </form>
  );
}

function Level({
  label,
  name,
  initial,
  optional,
}: {
  label: string;
  name: string;
  initial?: number;
  optional?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <select
        className={styles.control}
        id={id}
        name={name}
        defaultValue={initial ?? (optional ? '' : 2)}
        required={!optional}
      >
        {optional && <option value="">Keep default</option>}
        <option value={1}>High</option>
        <option value={2}>Medium</option>
        <option value={3}>Low</option>
      </select>
    </Field>
  );
}

function EditType({ selected }: { selected?: Type }) {
  const [rows, setRows] = useState(() =>
    (selected?.questions ?? []).map((question, index) => ({ id: index, question })),
  );
  const id = useId();
  return (
    <SettingsForm
      label={selected ? 'Save request type' : 'Add request type'}
      save={(data) => {
        const acknowledgement = String(data.get('acknowledgement') ?? '').trim();
        const questions = rows.map(({ id }) => ({
          key: String(data.get('key-' + id)),
          label: String(data.get('label-' + id)),
          required: data.has('required-' + id),
          ...(data.get('impact-' + id) ? { yesImpact: Number(data.get('impact-' + id)) } : {}),
          ...(data.get('urgency-' + id) ? { yesUrgency: Number(data.get('urgency-' + id)) } : {}),
        }));
        return helpdeskWrite(
          base + '/types' + (selected ? '/' + selected.id : ''),
          {
            name: data.get('name'),
            category: data.get('category'),
            problemCode: data.get('problemCode'),
            defaultImpact: Number(data.get('defaultImpact')),
            defaultUrgency: Number(data.get('defaultUrgency')),
            questions,
            duplicateWindowHours: Number(data.get('duplicateWindowHours')),
            acknowledgement: acknowledgement || null,
            active: data.has('active'),
            assigneeId: selected?.assigneeId ?? null,
            ...(selected ? { version: selected.version } : {}),
          },
          selected ? 'PATCH' : 'POST',
        );
      }}
    >
      <div className={styles.columns}>
        {(
          [
            ['name', 'Name', selected?.name],
            ['category', 'Category', selected?.category],
            ['problemCode', 'Problem code', selected?.problemCode],
          ] as const
        ).map(([name, label, value]) => (
          <Field htmlFor={id + name} label={label} key={name}>
            <TextInput id={id + name} name={name} required maxLength={name === 'name' ? 80 : 60} defaultValue={value} />
          </Field>
        ))}
        <Level label="Default impact" name="defaultImpact" initial={selected?.defaultImpact} />
        <Level label="Default urgency" name="defaultUrgency" initial={selected?.defaultUrgency} />
        <Field label="Duplicate window (hours)" htmlFor={id + '-duplicate'}>
          <TextInput
            id={id + '-duplicate'}
            name="duplicateWindowHours"
            type="number"
            min={1}
            max={720}
            defaultValue={selected?.duplicateWindowHours ?? 48}
            required
          />
        </Field>
      </div>
      <Field label="Acknowledgement (optional)" htmlFor={id + '-ack'}>
        <textarea
          id={id + '-ack'}
          className={styles.textarea}
          name="acknowledgement"
          maxLength={1200}
          defaultValue={selected?.acknowledgement ?? ''}
        />
      </Field>
      <Checkbox label="Available to requesters" name="active" defaultChecked={selected?.active ?? true} />
      <h3 className="card-t">Triage questions</h3>
      {rows.map(({ id: rowId, question }, index) => (
        <fieldset className="card card-b stack g3" key={rowId}>
          <legend>Question {index + 1}</legend>
          <div className={styles.columns}>
            <Field label="Question label" htmlFor={id + '-label-' + rowId}>
              <TextInput
                id={id + '-label-' + rowId}
                name={'label-' + rowId}
                required
                maxLength={120}
                defaultValue={question.label}
              />
            </Field>
            <Field label="Field key" htmlFor={id + '-key-' + rowId}>
              <TextInput
                id={id + '-key-' + rowId}
                name={'key-' + rowId}
                required
                maxLength={40}
                pattern="[a-z][a-z0-9_]{0,39}"
                title="Lowercase letters, numbers and underscores. Begin with a letter."
                defaultValue={question.key}
              />
            </Field>
            <Level label="Impact when Yes" name={'impact-' + rowId} initial={question.yesImpact} optional />
            <Level label="Urgency when Yes" name={'urgency-' + rowId} initial={question.yesUrgency} optional />
          </div>
          <Checkbox label="Answer required" name={'required-' + rowId} defaultChecked={question.required} />
          <div>
            <Button size="sm" onClick={() => setRows((old) => old.filter((row) => row.id !== rowId))}>
              Remove question
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button
          icon="add"
          onClick={() =>
            setRows((old) => [
              ...old,
              { id: (old.at(-1)?.id ?? -1) + 1, question: { key: '', label: '', required: false } },
            ])
          }
          disabled={rows.length >= 20}
        >
          Add question
        </Button>
      </div>
    </SettingsForm>
  );
}

function EditPriority({ matrix }: { matrix: RequestPriorityInput[] }) {
  const [impact, setImpact] = useState(2);
  const [urgency, setUrgency] = useState(2);
  const selected =
    matrix.find((rule) => rule.impact === impact && rule.urgency === urgency) ??
    defaultRequestPriority(impact, urgency);
  const id = useId();
  return (
    <div className="stack g3">
      <div className={styles.columns}>
        <Field label="Impact" htmlFor={id + '-impact'}>
          <select
            id={id + '-impact'}
            className={styles.control}
            value={impact}
            onChange={(event) => setImpact(Number(event.target.value))}
          >
            <option value="1">High</option>
            <option value="2">Medium</option>
            <option value="3">Low</option>
          </select>
        </Field>
        <Field label="Urgency" htmlFor={id + '-urgency'}>
          <select
            id={id + '-urgency'}
            className={styles.control}
            value={urgency}
            onChange={(event) => setUrgency(Number(event.target.value))}
          >
            <option value="1">High</option>
            <option value="2">Medium</option>
            <option value="3">Low</option>
          </select>
        </Field>
      </div>
      <SettingsForm
        key={impact + ':' + urgency}
        label="Save targets"
        save={(data) =>
          helpdeskWrite(
            base + '/priority',
            {
              impact,
              urgency,
              priority: Number(data.get('priority')),
              responseMinutes: Number(data.get('responseMinutes')),
              attendMinutes: Number(data.get('attendMinutes')),
              fixMinutes: Number(data.get('fixMinutes')),
              businessHours: data.has('businessHours'),
            },
            'PUT',
          )
        }
      >
        <div className={styles.columns}>
          <Field label="Priority" htmlFor={id + '-priority'}>
            <select id={id + '-priority'} className={styles.control} name="priority" defaultValue={selected.priority}>
              {[1, 2, 3, 4].map((priority) => (
                <option key={priority} value={priority}>
                  P{priority}
                </option>
              ))}
            </select>
          </Field>
          {(
            [
              ['responseMinutes', 'Response target'],
              ['attendMinutes', 'Attendance target'],
              ['fixMinutes', 'Fix target'],
            ] as const
          ).map(([key, label]) => (
            <Field label={label + ' (minutes)'} htmlFor={id + key} key={key}>
              <TextInput
                id={id + key}
                type="number"
                min={1}
                max={43200}
                required
                name={key}
                defaultValue={selected[key]}
              />
            </Field>
          ))}
        </div>
        <Checkbox label="Use site business hours" name="businessHours" defaultChecked={selected.businessHours} />
      </SettingsForm>
    </div>
  );
}

function EditMailbox({ types, selected }: { types: Type[]; selected?: Mailbox }) {
  const [location, setLocation] = useState(selected ? { id: selected.locationId, ...selected.location } : null);
  const id = useId();
  return (
    <SettingsForm
      label={selected ? 'Save mailbox' : 'Add mailbox'}
      save={(data) => {
        if (!location) return Promise.reject(new Error('Choose a location.'));
        return helpdeskWrite(
          base + '/mailboxes' + (selected ? '/' + selected.id : ''),
          {
            address: data.get('address'),
            locationId: location.id,
            typeId: data.get('typeId'),
            active: data.has('active'),
            ...(selected ? { version: selected.version } : {}),
          },
          selected ? 'PATCH' : 'POST',
        );
      }}
    >
      <Field label="Inbound email address" htmlFor={id + '-address'}>
        <TextInput type="email" required id={id + '-address'} name="address" defaultValue={selected?.address} />
      </Field>
      <RecordPicker
        label="Default location"
        path="/helpdesk/locations"
        value={location}
        required
        onChange={(item) => setLocation(item ? { id: item.id, name: item.name, code: item.code ?? '' } : null)}
      />
      <Field label="Default request type" htmlFor={id + '-type'}>
        <select
          id={id + '-type'}
          className={styles.control}
          name="typeId"
          required
          defaultValue={selected?.typeId ?? ''}
        >
          <option value="">Choose a request type</option>
          {types
            .filter((type) => type.active || type.id === selected?.typeId)
            .map((type) => (
              <option key={type.id} value={type.id}>
                {type.category} · {type.name}
              </option>
            ))}
        </select>
      </Field>
      <Checkbox label="Accept incoming email" name="active" defaultChecked={selected?.active ?? true} />
      {selected && (
        <p className="sm muted">
          Mailbox ID <code>{selected.id}</code>
        </p>
      )}
    </SettingsForm>
  );
}

function EditTemplate({ templates }: { templates: Template[] }) {
  const [event, setEvent] = useState<RequestNotificationEvent>('request.received');
  const selected = templates.find(({ key }) => key === event)!;
  const id = useId();
  return (
    <div className="stack g3">
      <Field htmlFor={id + '-event'} label="Request event">
        <select
          id={id + '-event'}
          className={styles.control}
          value={event}
          onChange={(change) => setEvent(change.target.value as RequestNotificationEvent)}
        >
          {templates.map(({ key }, index) => (
            <option key={key} value={key}>
              {['Received', 'Status changed', 'Completed', 'Staff reply'][index]}
            </option>
          ))}
        </select>
      </Field>
      <SettingsForm
        key={event}
        label="Save template"
        save={(data) =>
          helpdeskWrite(
            base + '/notifications/' + event,
            {
              title: data.get('title'),
              body: data.get('body'),
              email: data.has('email'),
              push: data.has('push'),
            },
            'PUT',
          )
        }
      >
        <Field htmlFor={id + '-title'} label="Title">
          <TextInput id={id + '-title'} name="title" required maxLength={160} defaultValue={selected.title} />
        </Field>
        <Field htmlFor={id + '-body'} label="Message">
          <textarea
            id={id + '-body'}
            className={styles.textarea}
            name="body"
            required
            maxLength={1600}
            defaultValue={selected.body}
          />
        </Field>
        <p className="sm muted">
          Use {'{number}'}, {'{title}'} or {'{status}'} to include details from the request.
        </p>
        <Checkbox label="Send email" name="email" defaultChecked={selected.email} />
        <Checkbox label="Send browser push" name="push" defaultChecked={selected.push} />
      </SettingsForm>
    </div>
  );
}

export function SettingsForms({ data }: { data: HelpdeskSettings }) {
  const [typeId, setTypeId] = useState('');
  const [mailboxId, setMailboxId] = useState('');
  const selected = data.types.find(({ id }) => id === typeId);
  const selectedMailbox = data.mailboxes.find(({ id }) => id === mailboxId);
  return (
    <div className={styles.columns}>
      <section className="card card-b stack g4">
        <h2 className="card-t">Request types and triage</h2>
        <Field htmlFor="existing-request-type" label="Request type to edit">
          <select
            id="existing-request-type"
            className={styles.control}
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
          >
            <option value="">New request type</option>
            {data.types.map(({ id, category, name }) => (
              <option key={id} value={id}>
                {category} · {name}
              </option>
            ))}
          </select>
        </Field>
        <EditType key={typeId + (selected?.version ?? 0)} selected={selected} />
      </section>
      <section className="card card-b stack g4">
        <h2 className="card-t">Priority matrix</h2>
        <EditPriority matrix={data.matrix} />
      </section>
      <section className="card card-b stack g4">
        <h2 className="card-t">Inbound mailboxes</h2>
        <Field htmlFor="existing-mailbox" label="Mailbox to edit">
          <select
            id="existing-mailbox"
            className={styles.control}
            value={mailboxId}
            onChange={(event) => setMailboxId(event.target.value)}
          >
            <option value="">New mailbox</option>
            {data.mailboxes.map(({ id, address }) => (
              <option key={id} value={id}>
                {address}
              </option>
            ))}
          </select>
        </Field>
        <EditMailbox key={mailboxId + (selectedMailbox?.version ?? 0)} types={data.types} selected={selectedMailbox} />
      </section>
      <section className="card card-b stack g4">
        <h2 className="card-t">Notification templates</h2>
        <EditTemplate templates={data.templates} />
      </section>
    </div>
  );
}
