'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@cafm/ui';
import { t } from '@/lib/i18n';
import type { ShellNavItem } from './types';

/** ⌘K / Ctrl+K: jump to any page (mockup home-03-command-palette). Record search arrives with the modules. */
export function CommandPalette({ items, onClose }: { items: ShellNavItem[]; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  }, [items, query]);

  useEffect(() => {
    opener.current = document.activeElement;
    input.current?.focus();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);
  useEffect(() => setIndex(0), [query]);

  function go(item: ShellNavItem | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="popover palette" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
        <div className="row palette-input">
          <Icon name="search" size={18} />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[index] ? `palette-${results[index]!.key}` : undefined}
            aria-label={t('palette.placeholder')}
            placeholder={t('palette.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(results[index]);
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <ul className="palette-results" id="palette-results" role="listbox" aria-label={t('palette.title')}>
          {results.length === 0 && <li className="empty">{t('palette.empty')}</li>}
          {results.map((item, i) => (
            <li
              key={item.key}
              id={`palette-${item.key}`}
              role="option"
              aria-selected={i === index}
              className={`menu-i ${i === index ? 'on' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(item)}
            >
              <Icon name={item.icon} />
              <span className="grow">{item.label}</span>
              {item.locked && <Icon name="locked" size={14} label={t('shell.locked')} />}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
