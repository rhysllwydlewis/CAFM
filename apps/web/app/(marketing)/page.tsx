import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@cafm/ui';
import { Homepage } from './homepage';
import styles from './home.module.css';

export const metadata: Metadata = {
  title: { absolute: 'CAFM | Facilities management software' },
  description: 'See how facilities teams manage work orders, compliance and assets with CAFM.',
};

// The demo switch is set on the running service, including on Railway after build.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  const demo = process.env.DEMO_MODE === 'true';
  return (
    <main id="top" className={styles.home}>
      <a className={styles.skip} href="#product">
        Skip to product
      </a>
      <Homepage />
      <footer className={styles.footer}>
        <h2>{demo ? 'Try CAFM' : 'Open CAFM'}</h2>
        <Link className="btn primary lg" href={demo ? '/login#demo-heading' : '/login'}>
          {demo ? 'Choose a demo account' : 'Sign in'} <Icon name="chevron-right" />
        </Link>
      </footer>
    </main>
  );
}
