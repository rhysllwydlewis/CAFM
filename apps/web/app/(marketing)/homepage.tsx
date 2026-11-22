'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Icon, Logo } from '@cafm/ui';
import '@fontsource-variable/inter/wght-italic.css';
import { startFilm } from './film';
import styles from './home.module.css';

const media = '/homepage';
const stills = ['building', 'exploded', 'plant', 'hands', 'mist', 'window'] as const;
const captions = [
  { lines: ['Run every', 'building.'], meta: 'Facilities management software' },
  { lines: ['Floor', 'by floor.'], meta: 'Sites · floors · spaces' },
  { lines: ['Every', 'asset.'], meta: 'Register · history · planned maintenance' },
  { lines: ['Every job,', 'closed.'], meta: 'Checklist · photos · signature' },
  { lines: ['Every', 'site.'], meta: 'Twelve sites · one login' },
] as const;
const modules = ['Helpdesk', 'Work orders', 'Planned maintenance', 'Assets', 'Locations'];

export function Homepage({ demo }: { demo: boolean }) {
  const film = useRef<HTMLElement>(null);
  useEffect(() => (film.current ? startFilm(film.current) : undefined), []);

  const cta = demo ? { href: '/login#demo-heading', label: 'Try the demo' } : { href: '/login', label: 'Sign in' };
  const primary = (big?: boolean) => (
    <Link className={`btn primary lg ${big ? styles.big : ''}`} href={cta.href}>
      {cta.label} <Icon name="chevron-right" />
    </Link>
  );

  return (
    <>
      <header className={styles.masthead}>
        <a className={styles.mark} href="#top" aria-label="CAFM, back to the top">
          <Logo size={26} /> CAFM
        </a>
        {demo && (
          <Link className={styles.link} href="/login">
            Sign in
          </Link>
        )}
        {primary()}
      </header>

      <section ref={film} className={styles.film} aria-label="Cardiff HQ, a demo site">
        <div className={styles.stage} data-film-stage data-scene="0">
          {stills.map((name, i) => (
            <img
              key={name}
              className={styles.still}
              data-still={i}
              data-on={i === 0}
              src={`${media}/${name}.webp`}
              alt=""
              {...(i === 0 ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
            />
          ))}
          <canvas className={styles.canvas} aria-hidden="true" />
          <div className={styles.shade} data-shade aria-hidden="true" />

          <span className={styles.pin} data-pin="boiler-1" aria-hidden="true">
            <i />
            Boiler 1
          </span>
          <span className={styles.pin} data-pin="boiler-2" aria-hidden="true">
            <i />
            Boiler 2 · WO-10412 · <b>P2</b>
          </span>
          <span className={styles.pin} data-pin="checklist" aria-hidden="true">
            <i />
            WO-10413 · 3 of 6
          </span>

          {captions.map(({ lines, meta }, i) => {
            const Heading = i === 0 ? 'h1' : 'h2';
            return (
              <div key={meta} className={styles.caption} data-caption={i} data-state={i === 0 ? 'on' : 'next'}>
                <Heading>
                  <span className={styles.line}>
                    <span>{lines[0]}</span>
                  </span>{' '}
                  <span className={styles.line}>
                    <span>
                      <em>{lines[1]}</em>
                    </span>
                  </span>
                </Heading>
                <p className={styles.meta}>{meta}</p>
                {i === 0 && (
                  <div className={styles.actions} data-hero-actions>
                    {primary(true)}
                    {demo && (
                      <Link className={`btn lg ${styles.big} ${styles.onFilm}`} href="/login">
                        Sign in
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className={styles.counter} aria-hidden="true">
            <b data-counter>01</b>
            <i data-bar />
            <span>06</span>
          </div>
          <span className={styles.cue} data-cue aria-hidden="true" />
        </div>
      </section>

      <section className={styles.final} id="start" aria-labelledby="final-title">
        <h2 id="final-title">
          See it <em>for yourself.</em>
        </h2>
        <div className={styles.links}>
          {primary(true)}
          {demo && (
            <Link className={`btn lg ${styles.big} ${styles.onPaper}`} href="/login">
              Sign in
            </Link>
          )}
        </div>
        <ul className={styles.modules} aria-label="In CAFM">
          {modules.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <footer className={styles.footer}>
          <span>© 2026 CAFM</span>
          <span>{demo ? 'Demo data only' : 'Facilities management software'}</span>
        </footer>
      </section>
    </>
  );
}
