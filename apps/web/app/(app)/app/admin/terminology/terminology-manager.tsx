'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, TextInput } from '@cafm/ui';
import type { TermView } from '@cafm/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';

interface Row {
  singular: string;
  plural: string;
}

/** Terminology: use your own word for a standard term. An empty pair puts the standard words back. */
export function TerminologyManager({ terms }: { terms: TermView[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      terms.map((t) => [t.key, { singular: t.custom?.singular ?? '', plural: t.custom?.plural ?? '' }]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const set = (key: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [key]: { ...r[key]!, ...patch } }));

  async function save() {
    setFeedback(undefined);
    const payload: Array<{ key: string; custom: Row | null }> = [];
    for (const t of terms) {
      const row = rows[t.key]!;
      const singular = row.singular.trim();
      const plural = row.plural.trim();
      if (!singular && !plural) payload.push({ key: t.key, custom: null });
      else if (!singular || !plural) {
        setFeedback({
          text: `Enter both the singular and the plural for “${t.singular}”, or leave both empty.`,
          error: true,
        });
        return;
      } else payload.push({ key: t.key, custom: { singular, plural } });
    }
    setBusy(true);
    try {
      await adminWrite('/admin/terminology', { terms: payload }, 'PUT');
      setFeedback({ text: 'Terminology saved. Menu names have changed for everyone in your organisation.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save your changes.', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="terms-title">
      <div className="card-h">
        <h2 className="card-t" id="terms-title">
          Terminology
        </h2>
        <Button variant="primary" onClick={save} disabled={busy}>
          Save
        </Button>
      </div>
      <div className="card-b stack g3">
        <p className="muted">
          Use your own words, for example “Job” for “Work order” or “School” for “Site”. They show in the menu now;
          other screens follow as they are built. Leave both boxes empty to keep the standard words.
        </p>
        <div className={styles.tableWrap}>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Standard term</th>
                <th scope="col">Your word (singular)</th>
                <th scope="col">Your word (plural)</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.key}>
                  <th scope="row">
                    {t.singular} <span className="faint sm">/ {t.plural}</span>
                  </th>
                  <td>
                    <TextInput
                      value={rows[t.key]!.singular}
                      maxLength={40}
                      placeholder={t.singular}
                      aria-label={`Your word for ${t.singular}, singular`}
                      onChange={(e) => set(t.key, { singular: e.target.value })}
                      disabled={busy}
                    />
                  </td>
                  <td>
                    <TextInput
                      value={rows[t.key]!.plural}
                      maxLength={40}
                      placeholder={t.plural}
                      aria-label={`Your word for ${t.plural}, plural`}
                      onChange={(e) => set(t.key, { plural: e.target.value })}
                      disabled={busy}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p role="status" className={feedback?.error ? 'field-error' : 'muted'}>
          {feedback?.text}
        </p>
      </div>
    </section>
  );
}
