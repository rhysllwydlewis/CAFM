'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, TextInput } from '@fmstead/ui';
import { FEATURES, type ModuleSettingView } from '@fmstead/shared';
import { adminWrite } from '@/lib/admin-client';
import styles from '../admin.module.css';

interface Row {
  enabled: boolean;
  label: string;
  position: string;
}

/** Modules and navigation (mockup admin-11-modules): switch modules on or off, rename them, set their menu position. */
export function ModulesManager({ modules }: { modules: ModuleSettingView[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      modules.map((m) => [m.key, { enabled: m.enabled, label: m.label ?? '', position: m.position?.toString() ?? '' }]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  const set = (key: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [key]: { ...r[key]!, ...patch } }));

  async function save() {
    setBusy(true);
    setFeedback(undefined);
    try {
      await adminWrite(
        '/admin/modules',
        {
          modules: modules.map((m) => {
            const row = rows[m.key]!;
            return {
              key: m.key,
              enabled: row.enabled,
              label: row.label.trim() || null,
              position: row.position.trim() ? Number(row.position) : null,
            };
          }),
        },
        'PUT',
      );
      setFeedback({ text: 'Modules saved. The menu has changed for everyone in your organisation.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save your changes.', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="modules-title">
      <div className="card-h">
        <h2 className="card-t" id="modules-title">
          Modules and navigation
        </h2>
        <Button variant="primary" onClick={save} disabled={busy}>
          Save
        </Button>
      </div>
      <div className="card-b stack g3">
        <p className="muted">
          Switch modules off to hide them from the menu, use your own name for one, or choose where it sits in its
          section (1 is first). Home, My requests and Administration always show. A module that isn’t in your plan stays
          locked whatever you choose here.
        </p>
        <div className={styles.tableWrap}>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Module</th>
                <th scope="col">Plan</th>
                <th scope="col">Enabled</th>
                <th scope="col">Your name for it</th>
                <th scope="col">Menu position</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => {
                const row = rows[m.key]!;
                return (
                  <tr key={m.key}>
                    <th scope="row">{m.standardLabel}</th>
                    <td className="muted">
                      {m.feature
                        ? m.inPlan
                          ? 'Included'
                          : `Not in your plan (${FEATURES[m.feature].label})`
                        : 'Included'}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="cb"
                        checked={row.enabled}
                        onChange={(e) => set(m.key, { enabled: e.target.checked })}
                        aria-label={`Show ${m.standardLabel} in the menu`}
                        disabled={busy}
                      />
                    </td>
                    <td>
                      <TextInput
                        value={row.label}
                        maxLength={40}
                        placeholder={m.standardLabel}
                        aria-label={`Your name for ${m.standardLabel}`}
                        onChange={(e) => set(m.key, { label: e.target.value })}
                        disabled={busy}
                      />
                    </td>
                    <td>
                      <TextInput
                        type="number"
                        min={1}
                        max={99}
                        value={row.position}
                        placeholder="Standard"
                        aria-label={`Menu position of ${m.standardLabel}`}
                        onChange={(e) => set(m.key, { position: e.target.value })}
                        disabled={busy}
                      />
                    </td>
                  </tr>
                );
              })}
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
