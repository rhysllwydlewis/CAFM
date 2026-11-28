'use client';

/**
 * The homepage film: one continuous shot cut into one clip per chapter, played by the scroll.
 *
 * Scroll position decides which frame of which clip is on screen, forwards and backwards. Each chapter owns one clip
 * and the clips join on exact frame boundaries, so together they play as one take. All of the per-frame work runs
 * outside React, so a frame never causes a render. Only the active chapter is React state.
 *
 * - Clips are fetched whole and played from a blob URL, so a seek never waits on the network.
 * - Desktop fetches every clip straight away. A phone only fetches the clips near the reader.
 * - Time moves toward the scroll position with a frame-rate independent glide, so it feels the same at 60 and 120 Hz.
 * - With reduced motion no video is fetched: the first frame of each chapter stands in for its clip.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import styles from './home.module.css';

export interface FilmChapter {
  id: string;
  /** Short name for the chapter navigation. */
  label: string;
  title: string;
  body: string;
  tags?: readonly string[];
  side?: 'left' | 'right';
  /** Screens of scrolling this chapter takes. More distance plays its clip more slowly. */
  scroll: number;
  clip: string;
  mobileClip: string;
  /** The exact first frame of the clip, shown until the clip is ready and whenever motion is reduced. */
  poster: string;
  mobilePoster: string;
  actions?: ReactNode;
}

interface Segment {
  chapter: FilmChapter;
  band: HTMLElement;
  layer: HTMLElement;
  start: number;
  end: number;
  /** Where the clip is now and where the scroll says it should be, both 0 to 1. */
  current: number;
  target: number;
  visible: boolean;
  loading: boolean;
  ready: boolean;
  failed: boolean;
  source?: string;
  video?: HTMLVideoElement;
  objectUrl?: string;
  abort?: AbortController;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

export function ScrollScrub({ chapters }: { chapters: readonly FilmChapter[] }) {
  const root = useRef<HTMLElement>(null);
  const jump = useRef<(index: number) => void>(() => undefined);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const layers = Array.from(section.querySelectorAll<HTMLElement>('[data-layer]'));
    const bands = Array.from(section.querySelectorAll<HTMLElement>('[data-band]'));
    if (layers.length !== chapters.length || bands.length !== chapters.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const smallScreen = window.matchMedia('(max-width: 860px)');
    const isMobile = () => coarsePointer || smallScreen.matches;
    const sourceFor = (segment: Segment) => (isMobile() ? segment.chapter.mobileClip : segment.chapter.clip);

    const segments: Segment[] = chapters.map((chapter, index) => ({
      chapter,
      band: bands[index]!,
      layer: layers[index]!,
      start: 0,
      end: 0,
      current: 0,
      target: 0,
      visible: index === 0,
      loading: false,
      ready: false,
      failed: false,
    }));

    let destroyed = false;
    let dirty = true;
    let frame = 0;
    let lastTime = 0;
    let top = 0;
    let total = 1;
    let viewport = window.innerHeight;
    let width = window.innerWidth;
    let userReady = false;
    let activeIndex = -1;

    const updateLoaded = () => {
      if (reduceMotion || destroyed) return;
      const ready = segments.filter((segment) => segment.ready || segment.failed).length;
      section.style.setProperty('--loaded', String(ready / segments.length));
      section.dataset.clipsReady = String(segments.filter((segment) => segment.ready).length);
    };

    const unload = (segment: Segment) => {
      segment.abort?.abort();
      segment.video?.remove();
      if (segment.objectUrl) URL.revokeObjectURL(segment.objectUrl);
      delete segment.abort;
      delete segment.video;
      delete segment.objectUrl;
      delete segment.source;
      segment.loading = false;
      segment.ready = false;
      segment.failed = false;
      segment.current = segment.target;
      delete segment.layer.dataset.painted;
      updateLoaded();
    };

    const layout = () => {
      const pageY = window.scrollY;
      top = section.getBoundingClientRect().top + pageY;
      viewport = window.innerHeight;
      width = window.innerWidth;
      for (const segment of segments) {
        if (segment.source && segment.source !== sourceFor(segment)) unload(segment);
        const rect = segment.band.getBoundingClientRect();
        segment.start = rect.top + pageY - top;
        segment.end = segment.start + rect.height;
      }
      total = Math.max(segments.at(-1)?.end ?? viewport, viewport);
      dirty = true;
    };

    /** A phone only lets a video seek once it has been played by a tap, so the first tap plays and pauses each one. */
    const prime = async (video?: HTMLVideoElement) => {
      if (!video || !isMobile()) return;
      try {
        await video.play();
        video.pause();
      } catch {
        // The poster stays up and a later tap tries again.
      }
    };

    const load = async (segment: Segment) => {
      const source = sourceFor(segment);
      if (reduceMotion || destroyed || segment.loading || segment.ready || segment.failed) return;
      segment.loading = true;
      segment.source = source;
      const abort = new AbortController();
      segment.abort = abort;
      try {
        const response = await fetch(source, { signal: abort.signal });
        if (!response.ok) throw new Error(`Clip ${source} returned ${response.status}`);
        const blob = await response.blob();
        if (destroyed || abort.signal.aborted || segment.source !== source) return;

        const objectUrl = URL.createObjectURL(blob);
        const video = document.createElement('video');
        video.className = styles.video ?? '';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('aria-hidden', 'true');
        video.tabIndex = -1;
        video.src = objectUrl;
        video.addEventListener(
          'loadedmetadata',
          () => {
            if (segment.video !== video) return;
            segment.ready = true;
            segment.loading = false;
            dirty = true;
            updateLoaded();
          },
          { once: true },
        );
        video.addEventListener(
          'loadeddata',
          () => {
            if (userReady && segment.video === video) void prime(video);
          },
          { once: true },
        );
        video.addEventListener(
          'error',
          () => {
            if (segment.video !== video) return;
            video.remove();
            URL.revokeObjectURL(objectUrl);
            delete segment.video;
            delete segment.objectUrl;
            segment.failed = true;
            segment.loading = false;
            segment.ready = false;
            updateLoaded();
          },
          { once: true },
        );
        video.addEventListener(
          'seeked',
          () => {
            if (segment.video === video) segment.layer.dataset.painted = 'true';
          },
          { once: true },
        );
        segment.layer.append(video);
        segment.objectUrl = objectUrl;
        segment.video = video;
      } catch (error) {
        if (abort.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
        segment.failed = true;
        segment.loading = false;
        updateLoaded();
      }
    };

    const readScroll = () => {
      const y = clamp(window.scrollY - top, 0, total);
      const crossfade = 0.1 * viewport;
      let currentIndex = 0;
      for (const [index, segment] of segments.entries()) {
        if (y >= segment.start) currentIndex = index;
        segment.target = clamp((y - segment.start) / Math.max(segment.end - segment.start, 1));
        const outside = y < segment.start ? segment.start - y : y > segment.end ? y - segment.end : 0;
        let opacity = smoothstep(1 - outside / Math.max(crossfade, 1));
        if (reduceMotion) opacity = outside === 0 ? 1 : 0;
        segment.visible = opacity > 0.001;
        segment.layer.style.opacity = String(opacity);
        segment.layer.style.zIndex = index === currentIndex ? '2' : '1';
        // Desktop loads everything at once, so a fast scroll never lands on a clip that is still downloading.
        const near = y > segment.start - 1.5 * viewport && y < segment.end + 1.5 * viewport;
        if (!isMobile() || near) void load(segment);
      }
      if (currentIndex !== activeIndex) {
        activeIndex = currentIndex;
        section.dataset.activeSection = String(currentIndex);
        setActive(currentIndex);
      }
      section.style.setProperty('--progress', String(clamp(y / total)));
    };

    const updateVideos = (dt: number) => {
      const glide = 1 - Math.exp(-dt / 90);
      for (const segment of segments) {
        const { video } = segment;
        if (!video || !segment.ready || video.seeking) continue;
        if (!segment.visible && Math.abs(segment.current - segment.target) < 0.002) continue;
        segment.current += (segment.target - segment.current) * glide;
        const time = clamp(segment.current, 0, 0.999) * (video.duration || 1);
        if (Math.abs(video.currentTime - time) > (isMobile() ? 0.02 : 0.008)) {
          try {
            video.currentTime = time;
          } catch {
            // Keep the last painted frame while the browser catches up.
          }
        }
      }
    };

    const tick = (now: number) => {
      if (destroyed) return;
      const dt = lastTime ? Math.min(now - lastTime, 64) : 16;
      lastTime = now;
      if (dirty) {
        dirty = false;
        readScroll();
      }
      updateVideos(dt);
      frame = window.requestAnimationFrame(tick);
    };

    const onScroll = () => {
      dirty = true;
    };
    const onResize = () => {
      if (coarsePointer && window.innerWidth === width) return;
      layout();
    };
    const onFirstTap = () => {
      if (userReady) return;
      userReady = true;
      for (const segment of segments) void prime(segment.video);
    };

    jump.current = (index) => {
      const segment = segments[index];
      if (!segment) return;
      window.scrollTo({
        behavior: reduceMotion ? 'auto' : 'smooth',
        top: top + segment.start + 0.15 * (segment.end - segment.start),
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', layout);
    window.addEventListener('pointerdown', onFirstTap, { once: true, passive: true });
    window.addEventListener('touchstart', onFirstTap, { once: true, passive: true });

    layout();
    if (!reduceMotion) section.style.setProperty('--loaded', '0');
    frame = window.requestAnimationFrame(tick);
    // A link to a place further down the page lands properly once the film has its full length.
    if (window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) window.requestAnimationFrame(() => target.scrollIntoView());
    }

    return () => {
      destroyed = true;
      jump.current = () => undefined;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', layout);
      window.removeEventListener('pointerdown', onFirstTap);
      window.removeEventListener('touchstart', onFirstTap);
      section.style.removeProperty('--progress');
      section.style.removeProperty('--loaded');
      delete section.dataset.activeSection;
      delete section.dataset.clipsReady;
      for (const segment of segments) {
        unload(segment);
        segment.layer.style.removeProperty('opacity');
        segment.layer.style.removeProperty('z-index');
      }
    };
  }, [chapters]);

  return (
    <section ref={root} className={styles.film} data-film aria-label="One flight over a city, one chapter at a time">
      <div className={styles.stage}>
        <div className={styles.media} aria-hidden="true">
          {chapters.map((chapter) => (
            <figure key={chapter.id} className={styles.layer} data-layer>
              <picture>
                <source media="(max-width: 860px)" srcSet={chapter.mobilePoster} />
                {/* The first frame of the clip. It stays until the clip is ready, and for good with reduced motion. */}
                <img className={styles.poster} src={chapter.poster} alt="" decoding="async" />
              </picture>
            </figure>
          ))}
        </div>
        <div className={styles.shade} aria-hidden="true" />
        <div className={styles.progress} aria-hidden="true">
          <span style={{ transform: 'scaleX(var(--progress, 0))' } as CSSProperties} />
        </div>
        <nav className={styles.route} aria-label="Chapters">
          {chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              className={styles.routeButton}
              aria-current={active === index ? 'step' : undefined}
              onClick={() => jump.current(index)}
            >
              <span>{chapter.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className={styles.story}>
        {chapters.map((chapter, index) => {
          const Heading = index === 0 ? 'h1' : 'h2';
          return (
            <article
              key={chapter.id}
              id={chapter.id}
              className={styles.band}
              data-band
              data-side={chapter.side ?? 'left'}
              style={{ minHeight: `${chapter.scroll * 100}svh` }}
            >
              <div className={styles.pin}>
                <div className={styles.copy}>
                  <Heading className={styles.title}>{chapter.title}</Heading>
                  <p className={styles.body}>{chapter.body}</p>
                  {chapter.tags?.length ? (
                    <ul className={styles.tags}>
                      {chapter.tags.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                  ) : null}
                  {chapter.actions}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
