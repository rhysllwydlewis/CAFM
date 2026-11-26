'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@fmstead/ui';
import { contrastWithWhite, type BrandingView } from '@fmstead/shared';
import { adminWrite } from '@/lib/admin-client';

/** Branding: the accent colour for buttons, and the message on the sign-in screen. */
export function BrandingManager({ branding }: { branding: BrandingView }) {
  const router = useRouter();
  const [accent, setAccent] = useState(branding.accentColour ?? '');
  const [message, setMessage] = useState(branding.loginMessage ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  const trimmed = accent.trim();
  const ratio = trimmed ? contrastWithWhite(trimmed) : null;
  const accentError = !trimmed
    ? undefined
    : ratio === null
      ? 'Use a six-digit colour such as #136676.'
      : ratio < 4.5
        ? `Too light: white text on it has a contrast of ${ratio.toFixed(1)}:1 and needs at least 4.5:1.`
        : undefined;

  async function save() {
    if (accentError) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      await adminWrite(
        '/admin/branding',
        { accentColour: trimmed || null, loginMessage: message.trim() || null },
        'PUT',
      );
      setFeedback({ text: 'Branding saved. Buttons now use your colour for everyone in your organisation.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save your changes.', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="branding-title">
      <div className="card-h">
        <h2 className="card-t" id="branding-title">
          Branding
        </h2>
        <Button variant="primary" onClick={save} disabled={busy || !!accentError}>
          Save
        </Button>
      </div>
      <div className="card-b stack g3">
        <p className="muted">
          How the system looks for your organisation. Leave a box empty to keep the standard look. Logo, custom domain
          and email sender are not built yet.
        </p>
        <Field label="Accent colour" htmlFor="brand-accent" error={accentError}>
          <TextInput
            id="brand-accent"
            value={accent}
            maxLength={7}
            placeholder="#136676"
            invalid={!!accentError}
            aria-describedby={accentError ? 'brand-accent-error' : 'brand-accent-hint'}
            onChange={(e) => setAccent(e.target.value)}
            disabled={busy}
          />
        </Field>
        <p className="faint sm" id="brand-accent-hint">
          Contrast is checked automatically: a colour is rejected if white text on it would be hard to read.
        </p>
        <Field label="Sign-in message" htmlFor="brand-message">
          <TextInput
            id="brand-message"
            value={message}
            maxLength={200}
            placeholder="Welcome to our facilities portal."
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
          />
        </Field>
        <p className="faint sm">The message is saved now. It will appear on the sign-in screen in a later release.</p>
        <p role="status" className={feedback?.error ? 'field-error' : 'muted'}>
          {feedback?.text}
        </p>
      </div>
    </section>
  );
}
