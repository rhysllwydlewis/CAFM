import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { AuthCard } from '../auth-card';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: 'Forgot password' };

async function demoMode(): Promise<boolean> {
  try {
    return (await apiGet('/auth/demo-accounts')).ok;
  } catch {
    return false;
  }
}

export default async function ForgotPasswordPage() {
  const demo = await demoMode();
  return (
    <AuthCard title="Reset your password">
      {demo && (
        <div className="callout">
          <div className="grow">
            This is the demo, so the demo accounts&apos; passwords can&apos;t be reset. They all use the password shown
            on the sign-in page.
          </div>
        </div>
      )}
      <ForgotForm />
      <Link href="/login" className="medium">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
