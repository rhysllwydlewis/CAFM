'use client';

import { useState } from 'react';
import { Field, TextInput } from '@cafm/ui';

/** New password and confirmation, with the rules stated up front. */
export function NewPasswordFields({
  onChange,
  invalid,
}: {
  onChange: (password: string, matches: boolean) => void;
  invalid?: boolean;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const update = (p: string, c: string) => {
    setPassword(p);
    setConfirm(c);
    onChange(p, p === c);
  };
  return (
    <>
      <Field label="New password" htmlFor="new-password">
        <TextInput
          lg
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          invalid={invalid}
          aria-describedby="password-hint"
          onChange={(e) => update(e.target.value, confirm)}
        />
        <span className="hint" id="password-hint">
          At least 12 characters. A few unrelated words make a strong password.
        </span>
      </Field>
      <Field label="Confirm new password" htmlFor="confirm-password">
        <TextInput
          lg
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          invalid={invalid}
          onChange={(e) => update(password, e.target.value)}
        />
      </Field>
    </>
  );
}
