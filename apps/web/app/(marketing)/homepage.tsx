'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Icon, Logo } from '@cafm/ui';
import styles from './home.module.css';

const media = '/homepage';
type DeviceFormat = 'compact' | 'tablet' | 'wide';
const chapters = [
  { label: 'Overview', title: 'Run the estate.', start: 0, stop: 0 },
  { label: 'At the desk', title: 'At the desk.', start: 0.075, stop: 0.13 },
  { label: 'Plant room', title: 'In the plant room.', start: 0.245, stop: 0.4 },
  { label: 'On the job', title: 'On the job.', start: 0.505, stop: 0.64 },
  { label: 'Complete', title: 'Job complete.', start: 0.79, stop: 0.93 },
] as const;
const fieldChapter = 3;
const completeChapter = 4;
const inProgress = 'In progress';
const done = 'Completed';
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => clamp(value) ** 2 * (3 - 2 * clamp(value));

function useJourney() {
  const journey = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [chapter, setChapter] = useState(0);
  const [previewedCompletion, setPreviewedCompletion] = useState(false);
  const [presentation, setPresentation] = useState<DeviceFormat | 'static' | null>(null);

  useEffect(() => {
    const track = journey.current!;
    const frame = stage.current!;
    const still = matchMedia(
      '(prefers-reduced-motion: reduce), (max-height: 545px), (min-width: 901px) and (max-height: 580px)',
    );
    const compact = matchMedia('(max-width: 900px)');
    const handset = matchMedia('(max-width: 560px)');
    let request = 0;
    let previous = -1;
    let lastProgress = -1;
    let completionShown = false;

    function render() {
      request = 0;
      const travel = track.offsetHeight - frame.offsetHeight;
      const progress = still.matches || travel <= 0 ? 0 : clamp(-track.getBoundingClientRect().top / travel);
      const next = chapters.reduce((chapter, scene, index) => (progress >= scene.start ? index : chapter), 0);
      // The job preview may finish during the story. A jump straight to #product skips it.
      if (!completionShown && next === completeChapter && progress < 1) {
        completionShown = true;
        setPreviewedCompletion(true);
      }
      if (next !== previous) {
        const focused = document.activeElement;
        const keepsWorkOrderLink =
          previous >= fieldChapter && next >= fieldChapter && focused?.id === 'completed-order';
        if (!keepsWorkOrderLink && frame.contains(focused?.closest('[data-stage-copy]') ?? null)) {
          frame.querySelector<HTMLButtonElement>(`[data-jump="${next}"]`)?.focus({ preventScroll: true });
        }
        previous = next;
        setChapter(next);
      }
      const dissolve = ease((progress - 0.205) / 0.16);
      if (progress !== lastProgress) {
        lastProgress = progress;
        const fadeIn = next === 0 ? 1 : ease((progress - chapters[next]!.start) / 0.032);
        const upcoming = chapters[next + 1];
        const fadeOut = upcoming ? ease((upcoming.start - progress) / 0.032) : 1;
        const variables = {
          progress,
          dissolve,
          zoom: 1.015 + clamp((progress - 0.2) / 0.8) * 0.11,
          'copy-alpha': Math.min(fadeIn, fadeOut),
          equipment: clamp((progress - 0.337) / 0.065),
          phone: clamp((progress - 0.54) / 0.065),
          'equipment-alpha': 1 - ease((progress - 0.48) / 0.033),
          'phone-alpha': 1 - ease((progress - 0.755) / 0.033),
        };
        for (const [name, value] of Object.entries(variables)) frame.style.setProperty(`--${name}`, String(value));
      }
      const clip = video.current;
      if (clip && dissolve < 1 && Number.isFinite(clip.duration)) {
        const time = clamp(progress / chapters[1].stop) * Math.max(0, clip.duration - 0.03);
        if (Math.abs(clip.currentTime - time) > 0.015) clip.currentTime = time;
      }
    }

    function schedule() {
      if (!request) request = requestAnimationFrame(render);
    }

    function resize() {
      setPresentation(still.matches ? 'static' : handset.matches ? 'compact' : compact.matches ? 'tablet' : 'wide');
      schedule();
    }

    resize();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', resize);
    still.addEventListener('change', resize);
    compact.addEventListener('change', resize);
    track.addEventListener('loadedmetadata', schedule, true);
    return () => {
      cancelAnimationFrame(request);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', resize);
      still.removeEventListener('change', resize);
      compact.removeEventListener('change', resize);
      track.removeEventListener('loadedmetadata', schedule, true);
    };
  }, []);

  function goTo(index: number) {
    const track = journey.current;
    const stop = chapters[index]?.stop;
    if (!track || !stage.current || stop === undefined) return;
    const travel = track.offsetHeight - stage.current.offsetHeight;
    window.scrollTo({
      top: window.scrollY + track.getBoundingClientRect().top + travel * stop,
      behavior: 'smooth',
    });
  }

  const format = presentation === 'static' ? null : presentation;
  return { journey, stage, video, chapter, format, interactive: presentation !== null, previewedCompletion, goTo };
}

function JobCard({
  checked,
  completed,
  interactive,
  onCheck,
  onFinish,
  onOpen,
}: {
  checked: boolean;
  completed: boolean;
  interactive: boolean;
  onCheck: (checked: boolean) => void;
  onFinish: () => void;
  onOpen: () => void;
}) {
  return (
    <article className={styles.order} aria-label="Work order WO 142">
      <header>
        <strong>WO 142</strong>
        <span role={interactive ? 'status' : undefined}>{completed ? done : inProgress}</span>
      </header>
      <div>
        <h3>Replace supply air filter</h3>
        <p>AHU 02</p>
        {interactive && (
          <Checkbox
            label="Filter replaced"
            checked={checked || completed}
            disabled={completed}
            onChange={(event) => onCheck(event.target.checked)}
          />
        )}
        {!interactive ? (
          <a className="btn primary" href="#product">
            View work order <Icon name="chevron-down" />
          </a>
        ) : completed ? (
          <a id="completed-order" className="btn primary" href="#product" onClick={onOpen}>
            View work order <Icon name="chevron-down" />
          </a>
        ) : (
          <Button variant="primary" block disabled={!checked} onClick={onFinish}>
            Complete work order
          </Button>
        )}
      </div>
    </article>
  );
}

const previews = [
  {
    title: 'Work orders',
    headers: ['Reference', 'Work order', 'Status'],
    rows: [
      ['WO 142', 'Replace supply air filter', inProgress],
      ['WO 137', 'Test emergency lighting', 'Scheduled'],
      ['WO 128', 'Check circulation pumps', 'In progress'],
    ],
  },
  {
    title: 'Compliance',
    headers: ['Reference', 'Inspection', 'Status'],
    rows: [
      ['IN 056', 'Emergency lighting test', 'Due soon'],
      ['IN 047', 'Fire door checks', 'Complete'],
      ['IN 031', 'Water hygiene review', 'Complete'],
    ],
  },
  {
    title: 'Assets',
    headers: ['Reference', 'Asset', 'Location'],
    rows: [
      ['AHU 02', 'Air handling unit', 'Basement'],
      ['CP 01', 'Circulation pump', 'Basement'],
      ['EP 04', 'Lighting panel', 'Level 1'],
    ],
  },
];

function Product({
  active,
  select,
  completed,
  interactive,
}: {
  active: number;
  select: (index: number) => void;
  completed: boolean;
  interactive: boolean;
}) {
  function move(event: KeyboardEvent, index: number) {
    const next = { ArrowLeft: (index + 2) % 3, ArrowRight: (index + 1) % 3, Home: 0, End: 2 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next);
    document.getElementById(`preview-tab-${next}`)?.focus();
  }

  return (
    <section id="product" className={styles.product} tabIndex={-1} aria-labelledby="product-title">
      <header>
        <h2 id="product-title">Explore CAFM</h2>
        {interactive && (
          <div role="tablist" aria-label="Product previews" className={styles.tabs}>
            {previews.map(({ title }, index) => (
              <button
                key={title}
                id={`preview-tab-${index}`}
                type="button"
                role="tab"
                aria-controls={`preview-${index}`}
                aria-selected={active === index}
                tabIndex={active === index ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={(event) => move(event, index)}
              >
                {title}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className={styles.previewBand}>
        <div className={styles.preview} data-static={!interactive || undefined}>
          {interactive && (
            <aside aria-hidden="true">
              <div>
                <Logo size={24} /> CAFM
              </div>
              {previews.map(({ title }, index) => (
                <p key={title} data-active={active === index}>
                  {title}
                </p>
              ))}
            </aside>
          )}
          <header>
            <strong>Cardiff HQ</strong>
            <span>Demo data</span>
          </header>
          {previews.map(
            ({ title, headers, rows }, index) =>
              (interactive || index === 0) && (
                <div
                  key={title}
                  id={`preview-${index}`}
                  className={styles.panel}
                  role={interactive ? 'tabpanel' : undefined}
                  aria-labelledby={interactive ? `preview-tab-${index}` : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  hidden={active !== index}
                >
                  <h3>{title}</h3>
                  <div className={index === 0 ? styles.records : undefined}>
                    <table>
                      <thead>
                        <tr>
                          {headers.map((header) => (
                            <th key={header} scope="col">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([reference, name, status]) => (
                          <tr key={reference}>
                            <td>{reference}</td>
                            <td>{name}</td>
                            <td>{reference === 'WO 142' && completed ? done : status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {index === 0 && (
                      <div className={styles.jobDetail}>
                        <strong>WO 142</strong>
                        <p>Basement plant room</p>
                        {interactive ? (
                          <button
                            type="button"
                            onClick={() => {
                              select(2);
                              document.getElementById('preview-tab-2')?.focus();
                            }}
                          >
                            View asset AHU 02 <Icon name="chevron-right" />
                          </button>
                        ) : (
                          <p>Asset AHU 02</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ),
          )}
        </div>
      </div>
    </section>
  );
}

export function Homepage() {
  const {
    journey,
    stage,
    video,
    chapter: motionChapter,
    format,
    interactive,
    previewedCompletion,
    goTo,
  } = useJourney();
  const chapter = format ? motionChapter : 0;
  const [checked, setChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [active, select] = useState(0);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (completed && restoreFocus.current) {
      restoreFocus.current = false;
      document.getElementById('completed-order')?.focus({ preventScroll: true });
    }
  }, [completed]);

  function finish() {
    restoreFocus.current = true;
    setCompleted(true);
    if (format) goTo(completeChapter);
  }

  const card = (showCompleted: boolean) => (
    <JobCard
      checked={checked}
      completed={showCompleted}
      interactive={interactive}
      onCheck={setChecked}
      onFinish={finish}
      onOpen={() => {
        setCompleted(true);
        select(0);
      }}
    />
  );
  return (
    <>
      <section
        ref={journey}
        className={styles.journey}
        data-motion={format ? '' : undefined}
        aria-label="From desk to plant room"
      >
        <div ref={stage} className={styles.stage} data-chapter={chapter}>
          <h1 className="sr-only">Run the estate. From anywhere.</h1>
          <picture className={styles.devices} aria-hidden="true">
            <source media="(max-width: 560px)" srcSet={`${media}/devices-compact.webp`} />
            <source media="(max-width: 900px)" srcSet={`${media}/devices-tablet.webp`} />
            <img src={`${media}/devices-wide.webp`} alt="" fetchPriority="high" />
          </picture>
          {format && (
            <video
              key={format}
              ref={video}
              className={styles.devices}
              data-ready="false"
              src={`${media}/devices-${format}.mp4`}
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              onLoadedData={(event) => {
                event.currentTarget.dataset.ready = 'true';
              }}
            />
          )}
          <div className={styles.plant} aria-hidden="true">
            <div className={styles.photo}>
              <div className={styles.assetCue}>
                <span>AHU 02</span>
              </div>
              <div className={styles.phoneCue}>
                <span>WO 142</span>
              </div>
            </div>
          </div>
          <header className={styles.masthead}>
            <a href="#top" aria-label="CAFM home">
              <Logo size={30} /> CAFM
            </a>
            <nav aria-label="Main">
              <a href="#product">Product</a>
              <Link href="/login">Sign in</Link>
            </nav>
          </header>
          <div className={styles.copy} data-stage-copy hidden={chapter !== 0}>
            <p className={styles.opening} aria-hidden="true">
              {chapters[0].title} <span>From anywhere.</span>
            </p>
            <p>Facilities management software.</p>
            <a className="btn primary lg" href="#product">
              Explore CAFM <Icon name="chevron-down" />
            </a>
          </div>
          {chapter !== 0 && (
            <div className={`${styles.copy} ${chapter >= fieldChapter ? styles.fieldCopy : ''}`} data-stage-copy>
              {chapter === 1 && <p>WO 142</p>}
              <h2>{chapters[chapter]?.title}</h2>
              {chapter === 2 && (
                <p className="sr-only">The technician opens work order WO 142 beside air handling unit AHU 02.</p>
              )}
              {chapter >= fieldChapter && card(chapter === completeChapter || completed)}
            </div>
          )}
          {format && (
            <nav className={styles.chapters} aria-label="Work order sequence">
              {chapters.map(({ label }, index) => (
                <button
                  key={label}
                  type="button"
                  data-jump={index}
                  onClick={() => goTo(index)}
                  aria-current={chapter === index ? 'step' : undefined}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </section>
      {!format && (
        <section className={styles.fallback} aria-labelledby="plant-title">
          <div>
            <h2 id="plant-title">In the plant room.</h2>
            {card(completed)}
          </div>
          <div className={styles.still} role="img" aria-label="Technician beside an air handling unit" />
        </section>
      )}
      <Product
        active={active}
        select={select}
        completed={completed || (chapter === completeChapter && previewedCompletion)}
        interactive={interactive}
      />
    </>
  );
}
