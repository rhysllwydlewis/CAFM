'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@cafm/ui';
import { contrastWithWhite, LOGO_TYPES, MAX_LOGO_BYTES, type BrandingView } from '@cafm/shared';
import { adminWrite } from '@/lib/admin-client';

/** Branding: the accent colour for buttons, the sign-in message, the logo and the name emails come from. */
export function BrandingManager({ branding }: { branding: BrandingView }) {
  const router = useRouter();
  const [accent, setAccent] = useState(branding.accentColour ?? '');
  const [message, setMessage] = useState(branding.loginMessage ?? '');
  const [sender, setSender] = useState(branding.senderName ?? '');
  const [hasLogo, setHasLogo] = useState(branding.hasLogo);
  const [logoVersion, setLogoVersion] = useState(0);
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
        { accentColour: trimmed || null, loginMessage: message.trim() || null, senderName: sender.trim() || null },
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

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    setFeedback(undefined);
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
      setFeedback({ text: 'Use a PNG, JPEG or WebP image.', error: true });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFeedback({ text: 'The logo must be 64 KB or smaller.', error: true });
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await adminWrite('/admin/branding/logo', { contentType: file.type, dataBase64: btoa(binary) }, 'PUT');
      setHasLogo(true);
      setLogoVersion((v) => v + 1);
      setFeedback({ text: 'Logo saved. It now shows in the menu.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not save the logo.', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    setBusy(true);
    setFeedback(undefined);
    try {
      await adminWrite('/admin/branding/logo', undefined, 'DELETE');
      setHasLogo(false);
      setFeedback({ text: 'Logo removed.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'Could not remove the logo.', error: true });
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
          How the system looks for your organisation. Leave a box empty to keep the standard look. A custom domain and a
          verified email sender address are set up with your account manager.
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
        <Field label="Email sender name" htmlFor="brand-sender">
          <TextInput
            id="brand-sender"
            value={sender}
            maxLength={60}
            placeholder="Demo Estates facilities"
            aria-describedby="brand-sender-hint"
            onChange={(e) => setSender(e.target.value)}
            disabled={busy}
          />
        </Field>
        <p className="faint sm" id="brand-sender-hint">
          The name people see on emails from the system. The sending address stays the same. Leave empty for "FM Stead".
        </p>
        <div className="stack g2">
          <label htmlFor="brand-logo" className="label">
            Logo
          </label>
          {hasLogo ? (
            <img src={'/api/branding/logo?v=' + logoVersion} alt="Your current logo" width={64} height={64} />
          ) : (
            <p className="muted">No logo yet. The menu shows your organisation's initials.</p>
          )}
          <input
            id="brand-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby="brand-logo-hint"
            disabled={busy}
            onChange={(e) => {
              void chooseLogo(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <p className="faint sm" id="brand-logo-hint">
            A square PNG, JPEG or WebP image of 64 KB or smaller. SVG is not accepted.
          </p>
          {hasLogo && (
            <div>
              <Button variant="ghost" onClick={removeLogo} disabled={busy}>
                Remove logo
              </Button>
            </div>
          )}
        </div>
        <p role="status" className={feedback?.error ? 'field-error' : 'muted'}>
          {feedback?.text}
        </p>
      </div>
    </section>
  );
}
