'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Icon } from '@cafm/ui';
import type { ImportBatchRecord, ImportIssueRecord, ImportPreview } from '@cafm/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';
import { IMPORT_KINDS, type ImportKind } from './kinds';

const MAX_CHARS = 90_000;
const kindOf = (key: string) => IMPORT_KINDS.find((k) => k.key === key)!;
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Checked {
  preview?: ImportPreview;
  /** Problems the import itself reported (the file changed since it was checked, or the plan limit). */
  failure?: { message: string; issues: ImportIssueRecord[] };
}

/** Import and export (admin-14-import): CSV in with a check first, undo for each import, CSV out. */
export function ImportManager({
  kinds,
  exports,
  batches,
}: {
  kinds: ImportKind['key'][];
  exports: ImportKind['key'][];
  batches: Record<string, ImportBatchRecord[]>;
}) {
  const router = useRouter();
  const fileId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<ImportKind['key'] | undefined>(kinds[0]);
  const [file, setFile] = useState<{ name: string; text: string }>();
  const [checked, setChecked] = useState<Checked>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  const kind = active ? kindOf(active) : undefined;
  const issues = checked?.failure?.issues ?? checked?.preview?.issues ?? [];
  const issueCount = checked?.preview?.issueCount ?? issues.length;

  function pick(key: ImportKind['key']) {
    setActive(key);
    setFile(undefined);
    setChecked(undefined);
    setFeedback(undefined);
    if (input.current) input.current.value = '';
  }

  async function choose(selected: File | undefined) {
    setChecked(undefined);
    setFeedback(undefined);
    if (!selected) return setFile(undefined);
    const text = await selected.text();
    if (text.length > MAX_CHARS) {
      setFile(undefined);
      return setFeedback({
        text: 'The file is too large. Split it into smaller files of up to 1,000 rows.',
        error: true,
      });
    }
    setFile({ name: selected.name, text });
    await check({ name: selected.name, text });
  }

  async function check(source = file) {
    if (!kind || !source) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      const preview = await adminWrite<ImportPreview>(`${kind.base}/import/preview`, {
        csv: source.text,
        fileName: source.name,
      });
      setChecked({ preview: preview ?? undefined });
    } catch (error) {
      setChecked(undefined);
      setFeedback({ text: error instanceof Error ? error.message : 'Could not check the file.', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!kind || !file) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      const res = await fetch(`/api${kind.base}/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv: file.text, fileName: file.name }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const rows = (data as ImportBatchRecord).rowCount;
        setFile(undefined);
        setChecked(undefined);
        if (input.current) input.current.value = '';
        setFeedback({ text: `Imported ${rows} ${kind.noun}.` });
        router.refresh();
      } else if (Array.isArray(data?.issues)) {
        setChecked({ failure: { message: data.message, issues: data.issues } });
      } else {
        setFeedback({
          text: (Array.isArray(data?.message) ? data.message.join(' ') : data?.message) || 'Could not import the file.',
          error: true,
        });
      }
    } catch {
      setFeedback({ text: 'Could not import the file. Check your connection and try again.', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function undo(key: ImportKind['key'], batch: ImportBatchRecord) {
    const target = kindOf(key);
    setBusy(true);
    setFeedback(undefined);
    try {
      await adminWrite(`${target.base}/import/${batch.id}/rollback`, {});
      setFeedback({ text: `Undid the import of ${batch.fileName ?? 'the file'}.` });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not undo the import.', error: true });
    } finally {
      setBusy(false);
    }
  }

  const history = kinds.flatMap((key) => (batches[key] ?? []).map((batch) => ({ key, batch })));
  history.sort((a, b) => b.batch.createdAt.localeCompare(a.batch.createdAt));

  const errorReport = async () => {
    if (!kind || !file) return;
    const res = await fetch(`/api${kind.base}/import/preview?format=csv`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: file.text, fileName: file.name }),
    }).catch(() => null);
    if (!res?.ok) return setFeedback({ text: 'Could not make the error report.', error: true });
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `${kind.key}-import-errors.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {kind && (
        <section className="card" aria-labelledby="import-title">
          <div className="card-h">
            <h2 className="card-t" id="import-title">
              Import from CSV
            </h2>
          </div>
          <div className="card-b stack g3">
            <div className="seg" role="group" aria-label="What to import">
              {kinds.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={key === active ? 'on' : undefined}
                  aria-pressed={key === active}
                  onClick={() => pick(key)}
                  disabled={busy}
                >
                  {kindOf(key).label}
                </button>
              ))}
            </div>
            <div className={styles.steps}>
              <div className="stack g2">
                <span className="medium">1. Get the template</span>
                <span className="sm muted">The header row, with a column for each of your custom fields.</span>
                <div>
                  <a className="btn secondary" href={`/api${kind.base}/import/template`} download>
                    <Icon name="download" />
                    <span>Download template</span>
                  </a>
                </div>
              </div>
              <div className="stack g2">
                <span className="medium">2. Choose your file</span>
                <span className="sm muted">CSV, up to 1,000 rows. Nothing is saved until you import.</span>
                <div className="row g2 wrap">
                  <input
                    ref={input}
                    id={fileId}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => void choose(e.target.files?.[0])}
                  />
                  <label htmlFor={fileId} className="btn secondary">
                    <Icon name="upload" />
                    <span>Choose file</span>
                  </label>
                  {file && (
                    <span className="mono sm" style={{ overflowWrap: 'anywhere' }}>
                      {file.name}
                    </span>
                  )}
                  {checked?.preview && <span className="faint sm">{checked.preview.rows} rows</span>}
                </div>
              </div>
            </div>
            {checked && issueCount > 0 && (
              <div className="callout danger" role="alert">
                <Icon name="error" />
                <div className="grow">
                  <b>
                    {issueCount} {issueCount === 1 ? 'problem' : 'problems'} found.
                  </b>{' '}
                  Nothing was imported. Fix the file and check it again.
                  {issueCount > issues.length &&
                    ` The first ${issues.length} are shown; the error report has them all.`}
                </div>
              </div>
            )}
            {checked && issueCount === 0 && checked.preview && (
              <div className="callout" role="status">
                <Icon name="success" />
                <div className="grow">
                  <b>The file is ready.</b> Importing will make {checked.preview.creates} {kind.noun}.
                </div>
              </div>
            )}
            {issues.length > 0 && (
              <div className={styles.tableWrap} role="region" aria-label="Problems found in the file" tabIndex={0}>
                <table className="tbl">
                  <caption className="sr-only">Problems found in the file</caption>
                  <thead>
                    <tr>
                      <th scope="col">Line</th>
                      <th scope="col">Column</th>
                      <th scope="col">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map((issue, i) => (
                      <tr key={i}>
                        <td>{issue.row}</td>
                        <td className="mono">{issue.column}</td>
                        <td>{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row g2 wrap">
              {issueCount > 0 && (
                <Button icon="download" onClick={() => void errorReport()} disabled={busy}>
                  Download error report
                </Button>
              )}
              <span className="grow" />
              <Button icon="refresh" onClick={() => void check()} disabled={busy || !file}>
                Check file
              </Button>
              <Button
                variant="primary"
                onClick={() => void apply()}
                disabled={busy || !file || !checked?.preview || issueCount > 0}
              >
                {checked?.preview && issueCount === 0 ? `Import ${checked.preview.creates} ${kind.noun}` : 'Import'}
              </Button>
            </div>
            <p role="status" className={feedback?.error ? 'field-error' : 'muted'}>
              {feedback?.text}
            </p>
          </div>
        </section>
      )}
      {kinds.length > 0 && (
        <section className="card" aria-labelledby="recent-title">
          <div className="card-h">
            <h2 className="card-t" id="recent-title">
              Recent imports
            </h2>
          </div>
          {history.length === 0 ? (
            <div className="card-b muted">No imports yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">What</th>
                    <th scope="col">Rows</th>
                    <th scope="col">When</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(({ key, batch }) => (
                    <tr key={batch.id}>
                      <td className="mono">{batch.fileName ?? 'Unnamed file'}</td>
                      <td>{kindOf(key).label}</td>
                      <td>{batch.rowCount}</td>
                      <td>{when(batch.createdAt)}</td>
                      <td>
                        <span className={'badge ' + (batch.status === 'applied' ? 'success' : '')}>
                          <span className="d" />
                          {batch.status === 'applied' ? 'Imported' : 'Undone'}
                        </span>
                      </td>
                      <td>
                        {batch.status === 'applied' && (
                          <Button
                            size="sm"
                            icon="undo"
                            onClick={() => void undo(key, batch)}
                            disabled={busy}
                            aria-label={`Undo the import of ${batch.fileName ?? 'the file'}`}
                          >
                            Undo
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {exports.length > 0 && (
        <section className="card" aria-labelledby="export-title">
          <div className="card-h">
            <h2 className="card-t" id="export-title">
              Export to CSV
            </h2>
          </div>
          <div className="card-b stack g2">
            <div className="row wrap g2">
              {exports.map((key) => (
                <a key={key} className="btn secondary" href={`/api${kindOf(key).exportPath}`} download>
                  <Icon name="download" />
                  <span>{kindOf(key).label}</span>
                </a>
              ))}
            </div>
            <p className="xs faint">
              Exports hold only what you can already see, up to 5,000 rows, and are recorded in the audit log.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
