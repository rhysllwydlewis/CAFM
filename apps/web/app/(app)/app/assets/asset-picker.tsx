'use client';

import { useEffect, useId, useState } from 'react';
import { Button, Field, TextInput } from '@cafm/ui';
import styles from './assets.module.css';

export interface PickerOption {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Chooses one record by searching the API, so it works for any number of
 * records. The chosen ID is sent in a hidden field named `name`.
 */
export function Picker({
  name,
  label,
  endpoint,
  params,
  initial,
  describe,
}: {
  name: string;
  label: string;
  /** A list endpoint that takes `q` and returns `{ items }`. */
  endpoint: string;
  params?: Record<string, string>;
  initial: PickerOption | null;
  describe: (item: Record<string, unknown>) => PickerOption;
}) {
  const id = useId();
  const listId = id + '-list';
  const [chosen, setChosen] = useState<PickerOption | null>(initial);
  const [text, setText] = useState('');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams({ ...params, limit: '8', ...(text.trim() ? { q: text.trim() } : {}) });
        const response = await fetch(`${endpoint}?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const page = (await response.json()) as { items: Record<string, unknown>[] };
        setOptions(page.items.map(describe));
        setIndex(0);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `describe` and `params` are stable for a given picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, endpoint]);

  function choose(option: PickerOption | undefined) {
    if (!option) return;
    setChosen(option);
    setOpen(false);
    setText('');
  }

  if (chosen) {
    return (
      <div className="field">
        <span className="label" id={id + '-label'}>
          {label}
        </span>
        <div className={styles.chosen}>
          <span aria-labelledby={id + '-label'}>
            {chosen.label}
            {chosen.hint && <span className="muted"> · {chosen.hint}</span>}
          </span>
          <input type="hidden" name={name} value={chosen.id} />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setChosen(null);
              setOpen(true);
              setTimeout(() => document.getElementById(id)?.focus());
            }}
          >
            Change<span className="sr-only"> {label.toLowerCase()}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Field label={label} htmlFor={id}>
      <div className={styles.picker}>
        <input type="hidden" name={name} value="" />
        <TextInput
          id={id}
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && options[index] ? `${id}-${options[index]!.id}` : undefined}
          value={text}
          placeholder="Search…"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setIndex((i) => Math.min(i + 1, options.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (event.key === 'Enter' && open && options[index]) {
              event.preventDefault();
              choose(options[index]);
            } else if (event.key === 'Escape') setOpen(false);
          }}
        />
        {open && (
          <ul className={styles.pickerList} id={listId} role="listbox" aria-label={label}>
            {failed && <li aria-disabled="true">Could not search. Try again.</li>}
            {!failed && options.length === 0 && <li aria-disabled="true">Nothing found.</li>}
            {options.map((option, i) => (
              <li
                key={option.id}
                id={`${id}-${option.id}`}
                role="option"
                aria-selected={i === index}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
              >
                <span>{option.label}</span>
                {option.hint && <span className="muted">{option.hint}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}
