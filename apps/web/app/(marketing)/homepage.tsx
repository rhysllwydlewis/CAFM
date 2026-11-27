'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Icon, Wordmark } from '@fmstead/ui';
import { AUDIENCES, CHAPTERS, SCREENS, STRENGTHS } from './home-content';
import { ScrollScrub } from './scroll-scrub';
import styles from './home.module.css';

/** The calls to action. A demo site offers the demo first. A real one has only sign in. */
function Actions({ demo }: { demo: boolean }) {
  return (
    <div className={styles.actions}>
      {demo ? (
        <>
          <Link className={`btn primary lg ${styles.big}`} href="/login#demo-heading">
            Try the demo <Icon name="chevron-right" />
          </Link>
          <Link className={`btn lg ${styles.big} ${styles.ghost}`} href="/login">
            Sign in
          </Link>
        </>
      ) : (
        <Link className={`btn primary lg ${styles.big}`} href="/login">
          Sign in <Icon name="chevron-right" />
        </Link>
      )}
    </div>
  );
}

function Shot({ shot, className }: { shot: (typeof SCREENS)[keyof typeof SCREENS]; className?: string }) {
  return (
    <figure className={`${styles.shot} ${className ?? ''}`}>
      <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" decoding="async" />
      <figcaption>{shot.caption}</figcaption>
    </figure>
  );
}

export function Homepage({ demo }: { demo: boolean }) {
  const cta = demo ? { href: '/login#demo-heading', label: 'Try the demo' } : { href: '/login', label: 'Sign in' };
  // The chapters must keep the same identity from one render to the next, or the film would be rebuilt.
  const chapters = useMemo(
    () => CHAPTERS.map((chapter, i) => (i === 0 ? { ...chapter, actions: <Actions demo={demo} /> } : chapter)),
    [demo],
  );

  return (
    <>
      <header className={styles.masthead}>
        <a className={styles.mark} href="#top" aria-label="FM Stead, back to the top">
          <Wordmark height={22} tone="current" />
        </a>
        {demo && (
          <Link className={styles.link} href="/login">
            Sign in
          </Link>
        )}
        <Link className="btn primary lg" href={cta.href}>
          {cta.label} <Icon name="chevron-right" />
        </Link>
      </header>

      <ScrollScrub chapters={chapters} />

      <section className={styles.section} id="screens" aria-labelledby="screens-title">
        <h2 id="screens-title">Everything in one clear view.</h2>
        <p className={styles.lede}>
          From the morning overview to a single job on an engineer&apos;s phone, every screen works from the same live
          record.
        </p>
        <div className={styles.shots}>
          <Shot shot={SCREENS.overview} />
          <div className={styles.shotRow}>
            <Shot shot={SCREENS.workOrder} />
            <Shot shot={SCREENS.compliance} />
          </div>
          <Shot shot={SCREENS.technician} className={styles.device} />
        </div>
        <p className={styles.footnote}>Design screens, shown with demo data.</p>
      </section>

      <section className={styles.section} aria-labelledby="who-title">
        <h2 id="who-title">Made for UK estates and FM teams.</h2>
        <ul className={styles.rows}>
          {AUDIENCES.map((audience) => (
            <li key={audience.name}>
              <h3>{audience.name}</h3>
              <p>{audience.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="apart-title">
        <div className={styles.apart}>
          <div className={styles.apartHead}>
            <h2 id="apart-title">What sets it apart.</h2>
          </div>
          <ul>
            {STRENGTHS.map((strength) => (
              <li key={strength.name}>
                <h3>{strength.name}</h3>
                <p>{strength.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.final} id="start" aria-labelledby="final-title">
        <h2 id="final-title">One login for every site you look after.</h2>
        <Actions demo={demo} />
        <footer className={styles.footer}>
          <span>© 2026 FM Stead · {demo ? 'Demo data only' : 'Facilities management software'}</span>
          <a href="#top">Back to the top</a>
        </footer>
      </section>
    </>
  );
}
