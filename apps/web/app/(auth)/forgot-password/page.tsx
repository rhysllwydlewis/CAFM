import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@cafm/ui';

export const metadata: Metadata = { title: 'Forgot password' };

// Self-service reset by email is a later Phase 0 item (doc 06). Until then, say plainly what to do.
export default function ForgotPasswordPage() {
  return (
    <div className="center-screen">
      <div className="card" style={{ width: 420, maxWidth: '100%', boxShadow: 'var(--shadow-md)' }}>
        <div className="card-b stack" style={{ padding: 28 }}>
          <Logo size={28} />
          <h1 className="dialog-title">Reset your password</h1>
          <p className="muted" style={{ margin: 0 }}>
            Resetting a password by email isn&apos;t available yet. Ask your organisation&apos;s Super User or an
            administrator to set a new one for you.
          </p>
          <Link href="/login" className="medium">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
