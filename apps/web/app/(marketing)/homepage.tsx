'use client';

import { Fragment, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Icon, Wordmark } from '@fmstead/ui';
import { startFilm } from './film';
import { CHAPTERS, FRAMES, STOPS } from './film-content';
import styles from './home.module.css';

/** The calls to action. A demo site offers the demo first. A real one has only sign in. */
function Actions({ demo, where }: { demo: boolean; where?: 'hero' | 'close' }) {
  const marker = where === 'hero' ? { 'data-hero-actions': '' } : where === 'close' ? { 'data-close-actions': '' } : {};
  return (
    <div className={styles.actions} {...marker}>
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

export function Homepage({ demo }: { demo: boolean }) {
  const film = useRef<HTMLElement>(null);
  useEffect(() => (film.current ? startFilm(film.current) : undefined), []);

  const cta = demo ? { href: '/login#demo-heading', label: 'Try the demo' } : { href: '/login', label: 'Sign in' };

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

      <section ref={film} className={styles.film} data-film-section aria-labelledby="film-title">
        <div className={styles.stage} data-film-stage>
          {/* The first frame, until the film draws */}
          <img className={styles.poster} src={`${FRAMES.path}/f0001.webp`} alt="" fetchPriority="high" />
          <canvas className={styles.canvas} data-canvas aria-hidden="true" />
          <div className={styles.shade} data-shade data-mode="opening" aria-hidden="true" />
          <div className={styles.grain} aria-hidden="true" />

          <div className="sr-only">
            <h2 id="film-title">One flight over a demo estate</h2>
            <ol>
              {STOPS.map((stop, i) => {
                const chapter = CHAPTERS.find((c) => c.stop === i);
                return (
                  <li key={stop.name}>
                    {stop.says}
                    {chapter ? ` ${chapter.lines.join(' ')}` : ''}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className={`${styles.layer} ${styles.hero}`} data-hero data-on="true">
            <h1>
              Run every <em>building.</em>
            </h1>
            <p className={styles.lede}>Facilities management software.</p>
            <Actions demo={demo} where="hero" />
          </div>
          <p className={styles.hint} data-hint data-on="true" aria-hidden="true">
            Scroll
          </p>

          <div className={`${styles.layer} ${styles.altitude}`} data-altitude aria-hidden="true">
            <p>
              <span data-altitude-number>0</span>
              <small>m</small>
            </p>
          </div>
          <div className={`${styles.layer} ${styles.rail}`} aria-hidden="true">
            <b data-rail-fill />
            {STOPS.map((stop, i) => (
              <Fragment key={stop.name}>
                <i
                  className={styles.railDot}
                  data-rail-dot
                  style={{ top: `calc(${(i / (STOPS.length - 1)) * 100}% - 4px)` }}
                />
                <span
                  className={styles.railLabel}
                  data-rail-label
                  style={{ top: `${(i / (STOPS.length - 1)) * 100}%` }}
                >
                  {stop.name}
                </span>
              </Fragment>
            ))}
          </div>

          <div aria-hidden="true">
            {CHAPTERS.map((chapter) => (
              <div
                key={chapter.stop}
                className={`${styles.layer} ${styles.chapter} ${chapter.side === 'right' ? styles.right : styles.left}`}
                data-chapter
                data-on="false"
              >
                <h2>
                  <span className={styles.line}>
                    <span>{chapter.lines[0]}</span>
                  </span>
                  <span className={styles.line}>
                    <span>
                      <em>{chapter.lines[1]}</em>
                    </span>
                  </span>
                </h2>
              </div>
            ))}
          </div>
          <div aria-hidden="true">
            {CHAPTERS.flatMap((chapter, i) =>
              (chapter.tags ?? []).map((tag) => (
                <div
                  key={tag.title}
                  className={styles.callout}
                  data-tag
                  data-tag-chapter={i}
                  data-on="false"
                  data-x={tag.x}
                  data-y={tag.y}
                >
                  <i />
                  <b>{tag.title}</b>
                  <span>{tag.detail}</span>
                </div>
              )),
            )}
          </div>

          <div className={`${styles.layer} ${styles.ending}`} data-close data-on="false">
            <h2>
              Every <em>day.</em>
            </h2>
            <Actions demo={demo} where="close" />
          </div>
        </div>

        <div className={styles.loader} data-loader role="status" aria-label="Loading the film">
          <Wordmark height={30} tone="current" />
          <div className={styles.loadBar} aria-hidden="true">
            <i data-loader-bar />
          </div>
        </div>
        <noscript>
          <style>{'[data-loader]{display:none}[data-film-section]{height:100svh!important}'}</style>
        </noscript>
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
