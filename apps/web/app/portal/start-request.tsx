'use client';

import { type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { TextInput } from '@cafm/ui';
import styles from '../(app)/app/helpdesk/helpdesk.module.css';

export function StartRequest() {
  const router = useRouter();
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get('description') ?? '').trim();
    if (!text) return router.push('/portal/new');
    const draft = crypto.randomUUID();
    try {
      sessionStorage.setItem('cafm-request-' + draft, text);
    } catch {
      return router.push('/portal/new');
    }
    router.push('/portal/new?draft=' + draft);
  }
  return (
    <form onSubmit={start} className={'row wrap g2 ' + styles.actions}>
      <TextInput
        aria-label="Describe the problem"
        name="description"
        placeholder="Describe the problem"
        maxLength={600}
      />
      <button className="btn primary" type="submit">
        Report it
      </button>
    </form>
  );
}
