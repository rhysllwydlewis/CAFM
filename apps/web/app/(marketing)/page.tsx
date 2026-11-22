import type { Metadata } from 'next';
import { Homepage } from './homepage';
import styles from './home.module.css';

export const metadata: Metadata = {
  title: { absolute: 'CAFM | Facilities management software' },
  description: 'Run every building: helpdesk, work orders, planned maintenance, assets and locations in one place.',
};

// The demo switch is set on the running service, including on Railway after build.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  const demo = process.env.DEMO_MODE === 'true';
  return (
    <main id="top" className={styles.home} data-world="film">
      <a className={styles.skip} href="#start">
        Skip to {demo ? 'the demo' : 'sign in'}
      </a>
      <Homepage demo={demo} />
    </main>
  );
}
