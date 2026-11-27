'use client';

import { useEffect, useId, useState } from 'react';
import { Field, TextInput } from '@fmstead/ui';
import styles from './helpdesk.module.css';

type Option = { id: string; name: string; code?: string; number?: string };
type Results = { path: string; query: string; rows: Option[]; error?: string };

export function RecordPicker({
  label,
  path,
  value,
  onChange,
  required,
}: {
  label: string;
  path: string;
  value: Option | null;
  onChange: (option: Option | null) => void;
  required?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>();
  const current = results?.path === path && results.query === query ? results : undefined;
  const rows = current?.rows ?? [];
  const listed = value && !rows.some((item) => item.id === value.id) ? [value, ...rows] : rows;

  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api' + path + '?q=' + encodeURIComponent(query), { signal: abort.signal });
        if (!response.ok) throw new Error();
        const rows = (await response.json()) as Option[];
        if (!abort.signal.aborted) setResults({ path, query, rows });
      } catch {
        if (!abort.signal.aborted) setResults({ path, query, rows: [], error: 'Could not load choices.' });
      }
    };
    const timeout = window.setTimeout(() => void load(), query ? 180 : 0);
    return () => {
      window.clearTimeout(timeout);
      abort.abort();
    };
  }, [path, query]);

  return (
    <div className={styles.picker}>
      <Field label={'Find ' + label.toLowerCase()} htmlFor={id + '-search'}>
        <TextInput id={id + '-search'} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </Field>
      <Field label={label} htmlFor={id}>
        <select
          id={id}
          className={styles.control}
          value={value?.id ?? ''}
          required={required}
          onChange={(event) => onChange(listed.find((item) => item.id === event.target.value) ?? null)}
        >
          <option value="">{current && !listed.length ? 'No matches' : 'Choose ' + label.toLowerCase()}</option>
          {listed.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.code || item.number ? ' · ' + (item.code ?? item.number) : ''}
            </option>
          ))}
        </select>
        {current?.error && (
          <span role="alert" className="field-error">
            {current.error}
          </span>
        )}
      </Field>
    </div>
  );
}
