'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@cafm/ui';
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
      <Icon name="log-out" size={14} />
    </button>
  );
}
