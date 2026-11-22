'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@cafm/ui';

/** Raises the jobs that are due now, instead of waiting for the hourly run. `path` is for one schedule, or all of them. */
export function GenerateButton({ path, label = 'Generate now' }: { path: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');

  async function run() {
    setBusy(true);
    setMessage('');
    setProblem('');
    let response: Response;
    try {
      response = await fetch('/api' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
    } catch {
      setBusy(false);
      setProblem('Could not raise the jobs. Check your connection and try again.');
      return;
    }
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok || typeof data?.created !== 'number') {
      setProblem(typeof data?.message === 'string' ? data.message : 'Could not raise the jobs. Try again.');
      return;
    }
    const { created } = data as { created: number };
    setMessage(
      created === 0
        ? 'Nothing is due to be raised yet.'
        : `${created} ${created === 1 ? 'job has' : 'jobs have'} been raised.`,
    );
    router.refresh();
  }

  return (
    <span className="row wrap g2">
      <Button disabled={busy} onClick={() => void run()}>
        {label}
      </Button>
      {message && (
        <span className="sm" role="status">
          {message}
        </span>
      )}
      {problem && (
        <span className="sm field-error" role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}
