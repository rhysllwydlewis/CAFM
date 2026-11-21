import type { Metadata } from 'next';
import { Logo } from '@cafm/ui';
import { apiGet } from '@/lib/api';
import { LoginForm, type DemoAccounts } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

async function demoAccounts(): Promise<DemoAccounts | null> {
  // The API only serves this when DEMO_MODE=true; anything else means "no demo panel".
  try {
    const res = await apiGet('/auth/demo-accounts');
    return res.ok ? ((await res.json()) as DemoAccounts) : null;
  } catch {
    return null;
  }
}

const STATS = [
  ['96.4%', 'PPM compliance'],
  ['2,418', 'Assets tracked'],
  ['12', 'Sites live'],
];

export default async function LoginPage() {
  const demo = await demoAccounts();
  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="row" style={{ gap: 12 }}>
          <Logo size={34} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--nav-text-strong)',
            }}
          >
            CAFM
          </span>
        </div>
        <div style={{ marginTop: 'auto', maxWidth: 560 }}>
          <p className="auth-headline">Every building safe, compliant and running well.</p>
          <p className="auth-lede">
            Helpdesk, maintenance, compliance, contractors, space and energy in one place, on any device.
          </p>
          {demo && (
            <div className="row" style={{ gap: 28, marginTop: 40 }}>
              {STATS.map(([value, label]) => (
                <div key={label}>
                  <div className="auth-stat">{value}</div>
                  <div className="auth-stat-label">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="auth-foot">© 2026 · UK &amp; EU data centres · Cyber Essentials · ISO 27001 in progress</div>
        <svg className="auth-watermark" width="520" height="520" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="8" y="8" width="16" height="4" rx="1.5" fill="#fff" />
          <rect x="8" y="14" width="12" height="4" rx="1.5" fill="#fff" />
          <rect x="8" y="20" width="8" height="4" rx="1.5" fill="#fff" />
        </svg>
      </aside>
      <main className="auth-main">
        <LoginForm demo={demo} />
      </main>
    </div>
  );
}
