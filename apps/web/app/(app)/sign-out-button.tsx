'use client';

import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn ghost icon sm nav-signout"
      aria-label="Sign out"
      title="Sign out"
      onClick={async () => {
        await postJson('/auth/logout');
        router.push('/login');
        router.refresh();
      }}
    >
      <svg className="i s14" aria-hidden="true">
        <use href="/icons.svg#i-log-out" />
      </svg>
    </button>
  );
}
