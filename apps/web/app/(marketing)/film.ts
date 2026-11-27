/**
 * Plays the homepage film: scroll position to a frame of the flight, and everything laid over it.
 *
 * Everything here runs outside React so a frame never causes a render. The markup is in homepage.tsx and the words,
 * stops and callouts are in film-content.ts. This file finds its parts by data attributes and only changes
 * attributes and a few styles, so the look stays in home.module.css.
 */
import { CHAPTERS, FEEL, FRAMES, STOPS } from './film-content';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const LAST = STOPS.length - 1;
/** How long a chapter stays up either side of its stop, as a share of the film. */
const HALF = (0.5 / LAST) * 0.62;
const near = (e: number, stop: number) => Math.abs(e - stop / LAST) < HALF;

/** Scroll position to film position. The film slows to a near stop at each stop, then moves on. */
function buildRemap() {
  const n = 2400;
  const cumulative = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const x = i / n;
    let density = 1;
    for (let s = 0; s <= LAST; s++) {
      density += FEEL.dwellPeak * Math.exp(-0.5 * Math.pow((x - s / LAST) / FEEL.dwellWidth, 2));
    }
    cumulative[i] = cumulative[i - 1]! + density / n;
  }
  const total = cumulative[n]!;
  return (p: number) => {
    const t = p * total;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a = cumulative[i - 1]!;
    const b = cumulative[i]!;
    return clamp((i - 1 + (b > a ? (t - a) / (b - a) : 0)) / n);
  };
}

/** The altitude at a point in the film, eased between stops. */
function altitudeAt(e: number) {
  const f = clamp(e) * LAST;
  const i = Math.min(LAST - 1, Math.floor(f));
  const t = f - i;
  return Math.round(lerp(STOPS[i]!.altitude, STOPS[i + 1]!.altitude, t * t * (3 - 2 * t)));
}

const setOn = (el: HTMLElement, on: boolean) => {
  const value = on ? 'true' : 'false';
  if (el.dataset.on !== value) el.dataset.on = value;
};

/** Starts the film on its section. Returns a function that puts the page back as it was. */
export function startFilm(root: HTMLElement): () => void {
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const qa = <T extends HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));

  const stage = q<HTMLElement>('[data-film-stage]');
  const canvas = q<HTMLCanvasElement>('[data-canvas]');
  const ctx = canvas?.getContext('2d');
  if (!stage || !canvas || !ctx) return () => undefined;

  const shade = q<HTMLElement>('[data-shade]')!;
  const hero = q<HTMLElement>('[data-hero]')!;
  const heroActions = q<HTMLElement>('[data-hero-actions]');
  const hint = q<HTMLElement>('[data-hint]')!;
  const altitude = q<HTMLElement>('[data-altitude]')!;
  const altitudeNumber = q<HTMLElement>('[data-altitude-number]')!;
  const railFill = q<HTMLElement>('[data-rail-fill]')!;
  const railDots = qa('[data-rail-dot]');
  const railLabels = qa('[data-rail-label]');
  const chapters = qa('[data-chapter]');
  const tags = qa('[data-tag]');
  const closing = q<HTMLElement>('[data-close]')!;
  const closingActions = q<HTMLElement>('[data-close-actions]');
  const loader = q<HTMLElement>('[data-loader]');
  const loaderBar = q<HTMLElement>('[data-loader-bar]');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smoothing = reduce ? 1 : FEEL.smoothing;
  const remap = buildRemap();

  let disposed = false;
  let raf = 0;
  let revealTimer = 0;
  let resizeFrame = 0;

  // Frames, and the canvas they are drawn on.
  const frames: HTMLImageElement[] = new Array(FRAMES.count);
  const loaded = new Uint8Array(FRAMES.count);
  let frameW = 16;
  let frameH = 9;
  let w = 0;
  let h = 0;
  let last = -1;
  let ready = false;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    last = -1;
  };

  /** Wide screens fill the stage. Tall screens show a feathered widescreen band so the scene is not cropped to its middle. */
  const cover = () => {
    const portrait = w / h < 0.75;
    const s = portrait ? Math.max(w / frameW, (h * 0.56) / frameH) : Math.max(w / frameW, h / frameH);
    return { s, ox: (w - frameW * s) / 2, oy: (h - frameH * s) / 2 - (portrait ? h * 0.02 : 0), portrait };
  };

  /** The nearest loaded frame at or before (dir -1) or after (dir 1) an index, so scrolling never shows a gap. */
  const nearest = (from: number, dir: -1 | 1) => {
    for (let k = from; k >= 0 && k < FRAMES.count; k += dir) if (loaded[k]) return k;
    return -1;
  };

  const draw = (position: number) => {
    const f = clamp(position) * (FRAMES.count - 1);
    let lo = nearest(Math.floor(f), -1);
    let hi = nearest(Math.ceil(f), 1);
    if (lo < 0) lo = hi;
    if (hi < 0) hi = lo;
    if (lo < 0) return;
    const t = hi > lo ? clamp((f - lo) / (hi - lo)) : 0;
    const { s, ox, oy, portrait } = cover();
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(frames[lo]!, ox, oy, frameW * s, frameH * s);
    if (t > 0.02 && hi !== lo) {
      ctx.globalAlpha = t;
      ctx.drawImage(frames[hi]!, ox, oy, frameW * s, frameH * s);
      ctx.globalAlpha = 1;
    }
    if (portrait) {
      const top = oy;
      const bottom = oy + frameH * s;
      const feather = frameH * s * 0.18;
      ctx.globalCompositeOperation = 'destination-out';
      let g = ctx.createLinearGradient(0, top, 0, top + feather);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, top, w, feather);
      g = ctx.createLinearGradient(0, bottom - feather, 0, bottom);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, bottom - feather, w, feather);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!ready) {
      ready = true;
      stage.dataset.ready = '';
    }
  };

  /** Callouts sit on things in the footage, so they follow the same crop as the frames. */
  const placeTags = () => {
    const { s, ox, oy } = cover();
    for (const tag of tags) {
      const x = ox + parseFloat(tag.dataset.x!) * frameW * s;
      tag.style.left = `${clamp(x, 12, Math.max(12, w - tag.offsetWidth - 12))}px`;
      tag.style.top = `${oy + parseFloat(tag.dataset.y!) * frameH * s}px`;
    }
  };

  const progress = () => {
    const rect = root.getBoundingClientRect();
    return clamp(-rect.top / (rect.height - window.innerHeight));
  };

  /** As the film scrolls off the end, fade the closing words so they never slide under the navigation. */
  let leaving = -1;
  const fadeClosing = () => {
    const leave = clamp((window.innerHeight - root.getBoundingClientRect().bottom) / (window.innerHeight * 0.3));
    if (leave === leaving) return;
    leaving = leave;
    closing.style.opacity = leave > 0 ? String(1 - leave) : '';
  };

  const setInert = (el: HTMLElement | null, inert: boolean) => {
    if (el && el.inert !== inert) el.inert = inert;
  };

  const update = (e: number) => {
    const metres = altitudeAt(e).toLocaleString('en-GB');
    if (altitudeNumber.textContent !== metres) altitudeNumber.textContent = metres;
    railFill.style.height = `${clamp(e) * 100}%`;
    const here = Math.round(clamp(e) * LAST);
    railDots.forEach((dot, i) => dot.toggleAttribute('data-on', i <= here && e > i / LAST - 0.01));
    railLabels.forEach((label, i) => label.toggleAttribute('data-on', i === here));

    const opening = e < 0.045;
    const ending = e > 0.955;
    setOn(hero, opening);
    setInert(heroActions, !opening);
    setOn(hint, e < 0.015);
    setOn(closing, ending);
    setInert(closingActions, !ending);
    altitude.toggleAttribute('data-off', ending);

    let leftChapter = false;
    chapters.forEach((chapter, i) => {
      const on = near(e, CHAPTERS[i]!.stop);
      setOn(chapter, on);
      if (on && CHAPTERS[i]!.side === 'left') leftChapter = true;
    });
    for (const tag of tags) setOn(tag, near(e, CHAPTERS[Number(tag.dataset.tagChapter)]!.stop));
    shade.dataset.mode = opening ? 'opening' : leftChapter || ending ? 'left' : 'plain';
  };

  // A reload restores the scroll position. Start there instead of flying up from the ground.
  let startedAt = 0;
  let current = 0;
  const tick = () => {
    const target = remap(progress());
    fadeClosing();
    if (performance.now() - startedAt < 1500 && Math.abs(target - current) > 0.12) current = target;
    current += (target - current) * smoothing;
    if (Math.abs(target - current) < 0.00005) current = target;
    if (current !== last) {
      draw(current);
      update(current);
      last = current;
    }
    raf = requestAnimationFrame(tick);
  };

  // Loading: coarse frames first, then fill in. Light devices load every other frame.
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  const light = matchMedia('(max-width: 720px)').matches || (memory !== undefined && memory <= 4);
  let planned = 0;
  let done = 0;
  let revealed = false;
  const reveal = () => {
    if (revealed || disposed) return;
    revealed = true;
    if (loader) loader.dataset.done = '';
    requestAnimationFrame(() => delete root.dataset.intro);
  };
  const progressed = () => {
    const share = planned ? done / planned : 0;
    if (loaderBar) loaderBar.style.width = `${Math.round(share * 100)}%`;
    if (share >= 0.4) reveal();
  };
  const load = (i: number) =>
    new Promise<void>((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (image.naturalWidth) {
          loaded[i] = 1;
          if (i === 0) {
            frameW = image.naturalWidth;
            frameH = image.naturalHeight;
            resize();
            placeTags();
          }
          last = -1;
        }
        done++;
        progressed();
        resolve();
      };
      image.onerror = () => {
        done++;
        progressed();
        resolve();
      };
      image.src = `${FRAMES.path}/f${String(i + 1).padStart(FRAMES.pad, '0')}.webp`;
      frames[i] = image;
    });

  const onResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (Math.abs(w - canvas.clientWidth) > 1 || Math.abs(h - canvas.clientHeight) > 120) {
        resize();
        placeTags();
      }
    });
  };

  // Switch on.
  root.dataset.film = 'on';
  root.dataset.intro = '';
  window.addEventListener('resize', onResize);
  void document.fonts?.ready.then(() => !disposed && placeTags());
  resize();

  const order: number[] = [];
  const seen = new Uint8Array(FRAMES.count);
  const add = (i: number) => {
    if (i < FRAMES.count && !seen[i] && (!light || i % 2 === 0 || i === FRAMES.count - 1)) {
      seen[i] = 1;
      order.push(i);
    }
  };
  add(0);
  add(FRAMES.count - 1);
  for (const stride of [32, 16, 8, 4, 2, 1]) for (let i = 0; i < FRAMES.count; i += stride) add(i);
  planned = order.length;

  void (async () => {
    await load(order.shift()!);
    if (disposed) return;
    resize();
    placeTags();
    draw(0);
    startedAt = performance.now();
    raf = requestAnimationFrame(tick);
    revealTimer = window.setTimeout(reveal, 7000); // never hold the page longer than this
    const lane = async () => {
      while (order.length && !disposed) await load(order.shift()!);
    };
    await Promise.all(Array.from({ length: 6 }, lane));
    reveal();
  })();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(resizeFrame);
    window.clearTimeout(revealTimer);
    window.removeEventListener('resize', onResize);
    setInert(heroActions, false);
    setInert(closingActions, false);
    closing.style.opacity = '';
    delete root.dataset.film;
    delete root.dataset.intro;
    delete stage.dataset.ready;
    if (loader) delete loader.dataset.done;
  };
}
