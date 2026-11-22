'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@cafm/ui';
import {
  COST_KIND_LABELS,
  COST_KINDS,
  costAmountMinor,
  formatMinor,
  LABOUR_TYPE_LABELS,
  LABOUR_TYPES,
  parseMoneyMinor,
  parseQuantityMilli,
  type CostKind,
  type WorkOrderCosts,
} from '@cafm/shared';
import styles from './work-orders.module.css';

type Problem = { code?: string; message: string };

/** Sends a change and returns the job's costs, or what went wrong, including the code the screen may need. */
async function send(path: string, method: string, body?: unknown): Promise<WorkOrderCosts | Problem> {
  const response = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (response.ok) return data as WorkOrderCosts;
  const message = Array.isArray(data.message) ? data.message.join(' ') : data.message;
  const errors = data.errors && typeof data.errors === 'object' ? Object.values(data.errors).join(' ') : '';
  return { code: data.code, message: message || errors || 'Could not save this change. Try again.' };
}

const isProblem = (value: WorkOrderCosts | Problem): value is Problem => 'message' in value;
const today = () => new Date().toISOString().slice(0, 10);

function quantityText(milli: number) {
  return (milli / 1000).toFixed(3).replace(/\.?0+$/, '');
}

export function WorkOrderCostsCard({
  jobId,
  version,
  initial,
  canEdit,
  locked,
}: {
  jobId: string;
  version: number;
  initial: WorkOrderCosts;
  canEdit: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [costs, setCosts] = useState(initial);
  const [kind, setKind] = useState<CostKind>('labour');
  const [message, setMessage] = useState('');
  const [needReason, setNeedReason] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const base = '/work-orders/' + jobId + '/costs';
  const { currency, nteMinor, totalMinor } = costs;
  const money = (minor: number) => formatMinor(minor, currency);
  // A limit of nothing is allowed (it blocks all spend), so zero is a limit like any other.
  const used =
    nteMinor === null ? null : nteMinor === 0 ? (totalMinor > 0 ? 100 : 0) : Math.round((totalMinor / nteMinor) * 100);
  const editable = canEdit && !locked;
  const single = kind === 'subcontract' || kind === 'expense';

  async function run(call: () => Promise<WorkOrderCosts | Problem>, onDone?: () => void) {
    setBusy(true);
    setMessage('');
    const result = await call();
    setBusy(false);
    if (isProblem(result)) {
      setMessage(result.message);
      setNeedReason(result.code === 'over_nte');
      return;
    }
    setCosts(result);
    setNeedReason(false);
    onDone?.();
    router.refresh();
  }

  function figures(form: FormData): { quantityMilli?: number; unitCostMinor?: number; amountMinor?: number } | string {
    if (single) {
      const amountMinor = parseMoneyMinor(String(form.get('amount') ?? ''));
      return amountMinor === null ? 'Enter the amount in pounds, like 48.90.' : { amountMinor };
    }
    const quantityMilli = parseQuantityMilli(String(form.get('quantity') ?? ''));
    if (quantityMilli === null) {
      return kind === 'labour' ? 'Enter the hours, like 2.5.' : 'Enter the quantity, like 2 or 0.5.';
    }
    const unitCostMinor = parseMoneyMinor(String(form.get('unit') ?? ''), 100_000_000);
    if (unitCostMinor === null) return 'Enter the cost in pounds, like 46.00.';
    return { quantityMilli, unitCostMinor };
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const numbers = figures(data);
    if (typeof numbers === 'string') {
      setMessage(numbers);
      return;
    }
    const reason = String(data.get('reason') ?? '').trim();
    void run(
      () =>
        send(base, 'POST', {
          kind,
          ...(kind === 'labour' ? { labourType: data.get('labourType') } : {}),
          description: String(data.get('description') ?? '').trim(),
          ...(String(data.get('reference') ?? '').trim() ? { reference: String(data.get('reference')).trim() } : {}),
          incurredOn: data.get('incurredOn'),
          ...numbers,
          ...(reason ? { overNteReason: reason } : {}),
        }),
      () => {
        form.reset();
        setPreview('');
      },
    );
  }

  function setLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get('limit') ?? '');
    const nteMinor = parseMoneyMinor(text);
    if (nteMinor === null) {
      setMessage('Enter the limit in pounds, like 750.');
      return;
    }
    void run(() => send(base + '/limit', 'PUT', { version, nteMinor }));
  }

  return (
    <section className="card card-b stack g3" aria-labelledby="wo-costs">
      <h2 className="card-t" id="wo-costs">
        Costs
      </h2>
      <div className="stack g2">
        <p>
          <strong className="page-title">{money(totalMinor)}</strong>
          {nteMinor !== null && <span className="muted"> of {money(nteMinor)} limit</span>}
        </p>
        {used !== null && (
          <div className="row wrap g2">
            <progress
              className={styles.meter}
              aria-label="Share of the cost limit used"
              value={Math.min(totalMinor, nteMinor ?? 0)}
              max={Math.max(nteMinor ?? 1, 1)}
            />
            <span className={'badge ' + (totalMinor > (nteMinor ?? 0) ? 'danger' : used >= 80 ? 'warning' : '')}>
              {totalMinor > (nteMinor ?? 0) ? 'Over the limit' : used + '% used'}
            </span>
          </div>
        )}
        {COST_KINDS.some((key) => costs.byKind[key] > 0) && (
          <ul className={styles.jobList}>
            {COST_KINDS.filter((key) => costs.byKind[key] > 0).map((key) => (
              <li key={key} className={styles.jobRow}>
                <span>{COST_KIND_LABELS[key]}</span>
                <span>{money(costs.byKind[key])}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {costs.items.length ? (
        <div className={styles.tableWrap} role="region" aria-label="Cost entries" tabIndex={0}>
          <table className="tbl">
            <thead>
              <tr>
                {['Cost', 'Quantity', 'Amount', 'Date', ''].map((label, index) => (
                  <th key={label + index} scope="col">
                    {label || <span className="sr-only">Remove</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costs.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="medium">{item.description}</div>
                    <div className="sm muted">
                      {COST_KIND_LABELS[item.kind]}
                      {item.labourType ? ' · ' + LABOUR_TYPE_LABELS[item.labourType] : ''}
                      {item.reference ? ' · ' + item.reference : ''}
                      {item.recordedByName ? ' · ' + item.recordedByName : ''}
                    </div>
                    {item.overNte && (
                      <div className="sm">
                        <span className="badge danger">Over the limit</span> {item.overNteReason}
                      </div>
                    )}
                  </td>
                  <td>
                    {item.kind === 'subcontract' || item.kind === 'expense'
                      ? '—'
                      : quantityText(item.quantityMilli) +
                        (item.kind === 'labour' ? ' h' : '') +
                        ' × ' +
                        money(item.unitCostMinor)}
                  </td>
                  <td>{money(item.amountMinor)}</td>
                  <td>{item.incurredOn}</td>
                  <td>
                    {editable && (
                      <Button
                        size="sm"
                        disabled={busy}
                        aria-label={'Remove ' + item.description}
                        onClick={() => void run(() => send(base + '/' + item.id, 'DELETE'))}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No costs have been recorded on this job.</p>
      )}

      {editable && (
        <form className="stack g3" onSubmit={add} aria-label="Add a cost">
          <h3 className="card-t">Add a cost</h3>
          <Field label="Type" htmlFor="cost-kind">
            <select
              id="cost-kind"
              className={styles.control}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as CostKind);
                setPreview('');
              }}
            >
              {COST_KINDS.map((key) => (
                <option key={key} value={key}>
                  {COST_KIND_LABELS[key]}
                </option>
              ))}
            </select>
          </Field>
          {kind === 'labour' && (
            <Field label="Kind of time" htmlFor="cost-labour">
              <select id="cost-labour" name="labourType" className={styles.control} defaultValue="on_site">
                {LABOUR_TYPES.map((key) => (
                  <option key={key} value={key}>
                    {LABOUR_TYPE_LABELS[key]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Description" htmlFor="cost-description">
            <TextInput id="cost-description" name="description" required maxLength={200} />
          </Field>
          {single ? (
            <Field label={'Amount (' + currency + ')'} htmlFor="cost-amount">
              <TextInput id="cost-amount" name="amount" inputMode="decimal" required placeholder="48.90" />
            </Field>
          ) : (
            <div
              className={styles.columns}
              onChange={(event) => {
                const form = (event.currentTarget as HTMLElement).closest('form');
                if (!form) return;
                const data = new FormData(form);
                const quantity = parseQuantityMilli(String(data.get('quantity') ?? ''));
                const unit = parseMoneyMinor(String(data.get('unit') ?? ''), 100_000_000);
                setPreview(quantity !== null && unit !== null ? money(costAmountMinor(quantity, unit)) : '');
              }}
            >
              <Field label={kind === 'labour' ? 'Hours' : 'Quantity'} htmlFor="cost-quantity">
                <TextInput id="cost-quantity" name="quantity" inputMode="decimal" required placeholder="2.5" />
              </Field>
              <Field label={kind === 'labour' ? 'Rate per hour' : 'Cost each'} htmlFor="cost-unit">
                <TextInput id="cost-unit" name="unit" inputMode="decimal" required placeholder="46.00" />
              </Field>
            </div>
          )}
          {preview && <p className="sm muted">This will cost {preview}.</p>}
          <div className={styles.columns}>
            <Field label="Reference (optional)" htmlFor="cost-reference">
              <TextInput id="cost-reference" name="reference" maxLength={80} placeholder="Invoice or part number" />
            </Field>
            <Field label="Date" htmlFor="cost-date">
              <TextInput id="cost-date" name="incurredOn" type="date" required defaultValue={today()} max={today()} />
            </Field>
          </div>
          {needReason && (
            <Field label="Why does this go over the limit?" htmlFor="cost-reason">
              <TextInput id="cost-reason" name="reason" maxLength={500} />
            </Field>
          )}
          <div>
            <Button type="submit" variant="primary" disabled={busy}>
              {needReason ? 'Add it over the limit' : 'Add cost'}
            </Button>
          </div>
        </form>
      )}

      {editable && (
        <form className="stack g3" onSubmit={setLimit} aria-label="Cost limit">
          <h3 className="card-t">Not-to-exceed limit</h3>
          <Field label={'Limit (' + currency + ')'} htmlFor="cost-limit">
            <TextInput
              id="cost-limit"
              name="limit"
              inputMode="decimal"
              key={nteMinor ?? 'none'}
              defaultValue={nteMinor === null ? '' : (nteMinor / 100).toFixed(2)}
              placeholder="750.00"
            />
          </Field>
          <p className="sm muted">Spend that would go over the limit is refused unless the reason is recorded.</p>
          <div className={styles.actions}>
            <Button type="submit" disabled={busy}>
              Save limit
            </Button>
            {nteMinor !== null && (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void run(() => send(base + '/limit', 'PUT', { version, nteMinor: null }))}
              >
                Remove limit
              </Button>
            )}
          </div>
        </form>
      )}

      {message && (
        <p role="alert" className="field-error">
          {message}
        </p>
      )}
    </section>
  );
}
