'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Icon, Wordmark } from '@fmstead/ui';
import '@fontsource-variable/inter/wght-italic.css';
import { startFilm } from './film';
import styles from './home.module.css';

const media = '/homepage';
/** The evening's scenes, in order. */
const stills = ['building', 'exploded', 'plant', 'window'] as const;
/** What FM Stead did at Cardiff HQ today (demo data). */
const day = [
  { hour: 6, time: '06:00', what: 'Site opens', detail: 'Business hours · SLA clocks start' },
  { hour: 7.5, time: '07:30', what: "Today's planned visits raised", detail: 'PPM generator · work orders' },
  { hour: 9.23, time: '09:14', what: 'Lights flickering at reception', detail: 'REQ-10483 · by QR code' },
  { hour: 10.05, time: '10:03', what: 'WO-10413 completed', detail: 'Within the 24-hour target' },
  { hour: 11, time: '11:00', what: 'Fire alarm weekly test', detail: 'PPM-0144 · passed' },
  { hour: 14.5, time: '14:30', what: 'AHU filter change', detail: 'PPM-0143 · AHU-1' },
  { hour: 16.17, time: '16:10', what: 'Sunset', detail: 'Lighting on · all floors' },
  {
    hour: 17.75,
    time: '17:45',
    what: 'Boiler 2 losing pressure',
    detail: 'WO-10412 · P2 · fix in 8 hours',
    risk: true,
  },
];
const captions = [
  { id: '1', lines: ['Floor', 'by floor.'], meta: 'Sites · floors · spaces' },
  { id: '2', lines: ['Every', 'asset.'], meta: 'Register · history · planned maintenance' },
  { id: '2b', lines: ['Every job,', 'closed.'], meta: 'Checklist · photos · signature' },
  { id: '3', lines: ['Every', 'site.'], meta: 'Twelve sites · one login' },
] as const;
const hours = Array.from({ length: 39 }, (_, i) => 5 + i / 2);
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
        <a className={styles.mark} href="#top" aria-label="FM Stead, back to the top">
          <Wordmark height={22} tone="current" />
        </a>
        {demo && (
          <Link className={styles.link} href="/login">
            Sign in
          </Link>
        )}
        {primary()}
      </header>

      <section ref={film} className={styles.film} aria-label="One day at Cardiff HQ, a demo site">
        <div className={styles.stage} data-film-stage data-scene="0">
          {stills.map((name, i) => (
            <img
              key={name}
              className={styles.still}
              data-still={i}
              data-on={i === 0}
              src={`${media}/${name}.webp`}
              alt=""
              loading={i === 0 ? undefined : 'lazy'}
            />
          ))}
          {/* 05:00: the dawn frame, darkened as the film shows it, until the film draws */}
          <img className={styles.predawn} data-daylight="dawn" src={`${media}/dawn.webp`} alt="" fetchPriority="high" />
          <img className={styles.daylight} data-daylight="noon" src={`${media}/noon.webp`} alt="" loading="lazy" />
          <canvas className={styles.canvas} aria-hidden="true" />
          <div className={styles.shade} data-shade aria-hidden="true" />

          <div className={styles.intro} data-intro data-state="on">
            <h1>
              One day at <em>Cardiff HQ.</em>
            </h1>
            <p className={styles.lede}>
              FM Stead runs the helpdesk, work orders, planned maintenance, assets and locations for UK estates teams.
            </p>
            <div className={styles.actions} data-hero-actions>
              {primary(true)}
              {demo && (
                <Link className={`btn lg ${styles.big} ${styles.onFilm}`} href="/login">
                  Sign in
                </Link>
              )}
            </div>
          </div>

          <ol className={styles.log} data-log aria-label="Cardiff HQ today">
            {day.map(({ hour, time, what, detail, risk }) => (
              <li key={time} className={styles.event} data-hour={hour} data-state="off">
                <time>{time}</time>
                <span>
                  {what}
                  <small className={risk ? styles.risk : undefined}>{detail}</small>
                </span>
              </li>
            ))}
          </ol>
          <div className={styles.clock} data-clock aria-hidden="true">
            <p className={styles.time} data-time>
              05:00
            </p>
            <p className={styles.where}>Cardiff HQ · demo site</p>
          </div>

          <span className={styles.pin} data-pin="boiler-1" aria-hidden="true">
            <i />
            Boiler 1
          </span>
          <span className={styles.pin} data-pin="boiler-2" aria-hidden="true">
            <i />
            Boiler 2 · WO-10412 · <b>P2</b>
          </span>
          <span className={`${styles.pin} ${styles.fixed}`} data-pin="boiler-2-fixed" aria-hidden="true">
            <i />
            Boiler 2 · WO-10412 · <b>Fixed</b>
          </span>

          {captions.map(({ id, lines, meta }) => (
            <div key={id} className={styles.caption} data-caption={id} data-state="next">
              <h2>
                <span className={styles.line}>
                  <span>{lines[0]}</span>
                </span>{' '}
                <span className={styles.line}>
                  <span>
                    <em>{lines[1]}</em>
                  </span>
                </span>
              </h2>
              <p className={styles.meta}>{meta}</p>
            </div>
          ))}

          <p className={styles.corner} data-corner aria-hidden="true">
            18:00
          </p>
          <div className={styles.ruler} data-ruler aria-hidden="true">
            {hours.map((h) => (
              <i
                key={h}
                className={Number.isInteger(h) ? styles.hour : undefined}
                style={{ left: `${((h - 5) / 19) * 100}%` }}
              />
            ))}
            {[6, 9, 12, 15, 18, 21, 24].map((h) => (
              <span key={h} style={{ left: `${((h - 5) / 19) * 100}%` }}>
                {String(h % 24).padStart(2, '0')}
              </span>
            ))}
            <b data-ruler-mark />
          </div>
        </div>
      </section>

      <section className={styles.final} id="start" aria-labelledby="final-title">
        <h2 id="final-title">
          Every day. <em>Every building.</em>
        </h2>
        <div className={styles.links}>
          {primary(true)}
          {demo && (
            <Link className={`btn lg ${styles.big} ${styles.onPaper}`} href="/login">
              Sign in
            </Link>
          )}
        </div>
        <ul className={styles.modules} aria-label="In FM Stead">
          {modules.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <footer className={styles.footer}>
          <span>© 2026 FM Stead</span>
          <span>{demo ? 'Demo data only' : 'Facilities management software'}</span>
        </footer>
      </section>
    </>
  );
}
