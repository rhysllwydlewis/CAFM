/**
 * The homepage film: one day at Cardiff HQ, with scroll as the clock.
 *
 * 05:00 to 18:00 plays on the facade: three photographs of the same building
 * (dawn, midday, dusk) and the light between them. At 18:00 the dusk frame
 * hands over, seamlessly, to an evening of stills: the floors slide apart,
 * a dive into the plant room, a mist wipe to the last lit window, and a push
 * into its light, which becomes the page below.
 *
 * Everything here runs outside React so a frame never causes a render.
 * Without WebGL the stills cross-fade instead.
 */

type Point = readonly [number, number];

export interface Scene {
  /** Focus point in the frame, x and y from the top left, for wide and for portrait screens. */
  focus: Point;
  portraitFocus: Point;
  /** Push-in across the scene. */
  zoom: Point;
  /** Portrait screens zoom out of wide frames to keep the subject. */
  portraitZoom?: number;
  mist: number;
  flicker: number;
}

/** The evening: the building (dusk), the floors apart, the plant room, the last lit window. */
export const SCENES: readonly Scene[] = [
  { focus: [0.42, 0.56], portraitFocus: [0.56, 0.56], zoom: [1.08, 1.08], portraitZoom: 0.52, mist: 0.9, flicker: 1 },
  { focus: [0.5, 0.5], portraitFocus: [0.5, 0.5], zoom: [1.06, 1.16], portraitZoom: 0.62, mist: 0.25, flicker: 0.6 },
  { focus: [0.5, 0.52], portraitFocus: [0.5, 0.52], zoom: [1.02, 1.14], mist: 0.7, flicker: 0.2 },
  { focus: [0.5, 0.51], portraitFocus: [0.5, 0.51], zoom: [1, 1], mist: 0.3, flicker: 0.3 },
];

/** Floor lines in the building photograph, used when the floors slide apart. */
const FLOORS = [0.325, 0.465, 0.585, 0.705, 0.825] as const;
/** Labels pinned to things in a still: scene, x, y, and the part of the scene's hold they show in. */
const PINS: Record<string, readonly [number, number, number, number, number]> = {
  'boiler-1': [2, 0.335, 0.52, 0.06, 0.94],
  'boiler-2': [2, 0.655, 0.52, 0.06, 0.48],
  'boiler-2-fixed': [2, 0.655, 0.52, 0.54, 0.94],
};

/** Scroll lengths, in screen heights. */
export const DAY = 6.6;
const HOLD = 0.95;
const HANDOVER = 0.75;
const PUSH = 1.35;
/** Handovers between evening scenes: 1 floors slide apart, 3 dive, 0 mist wipe. */
const HANDOVERS = [1, 3, 0] as const;
/** The dusk frame hands over almost at once; the plant room holds twice as long (the job is raised, then closed). */
const holdOf = (i: number) => (i === 0 ? 0.08 : i === 2 ? HOLD * 2 : HOLD);
export const EVENING = [0, 1, 2].reduce((t, i) => t + holdOf(i), 0) + (SCENES.length - 1) * HANDOVER + HOLD + PUSH;
export const FILM_LENGTH = DAY + EVENING;

export interface Moment {
  /** Scene on screen, and the scene being handed over to. */
  from: number;
  to: number;
  /** Progress through the handover, 0 to 1. */
  mix: number;
  /** -2 the day on the facade, -1 a held scene, otherwise the handover. */
  kind: number;
  /** Progress through the held scene, 0 to 1. */
  local: number;
}

/** Where the film is after `u` screen heights of scrolling. */
export function momentAt(u: number): Moment {
  if (u < DAY) return { from: 0, to: 0, mix: 0, kind: -2, local: u / DAY };
  let start = DAY;
  const last = SCENES.length - 1;
  for (let i = 0; i <= last; i++) {
    const hold = i === last ? HOLD + PUSH : holdOf(i);
    if (u < start + hold) return { from: i, to: i, mix: 0, kind: -1, local: (u - start) / hold };
    start += hold;
    if (i < last) {
      if (u < start + HANDOVER)
        return { from: i, to: i + 1, mix: (u - start) / HANDOVER, kind: HANDOVERS[i]!, local: 1 };
      start += HANDOVER;
    }
  }
  return { from: last, to: last, mix: 0, kind: -1, local: 1 };
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The clock: 05:00 to 18:00 across the day, 18:00 to midnight across the evening. */
export const hourAt = (u: number) => (u < DAY ? 5 + 13 * (u / DAY) : 18 + 6 * clamp((u - DAY) / EVENING));
const clockText = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const VERTEX = 'attribute vec2 p; varying vec2 v; void main(){ v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }';
const FRAGMENT = `precision highp float;
varying vec2 v;
uniform sampler2D tA, tB, tD, tN;
uniform vec2 res, sA, sB, fA, fB, ptr;
uniform float zA, zB, mA, mB, kA, kB, mixv, kind, time, white, lift, hour;
uniform vec4 bnd; uniform float bnd4;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a * n2(p); p *= 2.03; a *= .5; } return s; }
float ss(float a, float b, float x){ return smoothstep(a, b, x); }
// Cover-crop the image around its focus point; y runs from the top.
vec2 cover(vec2 uv, vec2 sz, vec2 f, float z){
  float sa = res.x / res.y, ia = sz.x / sz.y;
  vec2 w = sa > ia ? vec2(1., ia / sa) : vec2(sa / ia, 1.);
  w /= z;
  vec2 c = vec2(w.x > 1. ? .5 : clamp(f.x, w.x * .5, 1. - w.x * .5), w.y > 1. ? .5 : clamp(f.y, w.y * .5, 1. - w.y * .5));
  return c + (vec2(uv.x, 1. - uv.y) - .5) * w + ptr * .006 / z;
}
// Outside the still (portrait zoom-out) fades to dark rather than stretching its edge.
vec3 tex(sampler2D t, vec2 q){ float o = max(max(-q.x, q.x - 1.), max(-q.y, q.y - 1.)); return texture2D(t, q).rgb * (1. - ss(0., .14, o) * .88); }
vec3 grade(vec3 c, vec2 q, float mist, float flick, vec2 uv){
  float warm = ss(.06, .22, c.r - c.b) * ss(.28, .62, dot(c, vec3(.299, .587, .114)));
  c += c * warm * flick * (.07 * sin(time * 1.1 + q.x * 31. + q.y * 17.) + .05 * sin(time * 2.7 + q.x * 83.));
  float m = fbm(vec2(uv.x * 2.6 + time * .035, uv.y * 5.5 - time * .01));
  m = ss(.35, .95, m) * ss(.95, .25, 1. - uv.y);
  return mix(c, vec3(.42, .55, .6), m * mist * .32);
}
vec3 look(sampler2D t, vec2 q, float mist, float flick, vec2 uv){ return grade(tex(t, q), q, mist, flick, uv); }
// The day: dawn, midday and dusk photographs of the same building, and the light between them.
// At 18:00 this returns exactly what the evening's first scene shows.
vec3 day(vec2 q, vec2 uv){
  float H = hour;
  vec3 D = tex(tD, q), N = tex(tN, q), K = tex(tA, q), c;
  if (H < 6.5) c = D * mix(.32, 1., ss(5., 6.5, H));
  else if (H < 11.) c = mix(D, N, ss(7.2, 10.6, H));
  else if (H < 15.2) c = N;
  else c = mix(N, K, ss(15.2, 17.4, H));
  float warmth = exp(-pow((H - 7.75) / .55, 2.)) + exp(-pow((H - 16.15) / .5, 2.)) * 1.2;
  c *= mix(vec3(1.), vec3(1.18, .98, .82), warmth * .55);
  c += vec3(.12, .05, 0.) * warmth * (1. - q.y) * .4;
  float mist = .25 + .55 * (1. - ss(6., 9., H)) + .65 * ss(15.5, 18., H);
  return grade(c, q, clamp(mist, 0., .9), ss(15.5, 17.6, H), uv);
}
void main(){
  vec2 uv = v;
  vec3 col;
  vec2 qa = cover(uv, sA, fA, zA), qb = cover(uv, sB, fB, zB);
  if (kind < -1.5) {
    col = day(qa, uv);
  } else if (kind < -.5) {
    col = look(tA, qa, mA, kA, uv);
  } else if (kind < .5) { // mist wipe
    float n = fbm(uv * vec2(2.2, 3.2) + vec2(time * .04, 0.));
    float k = ss(n - .14, n + .14, mixv * 1.5 - .25);
    col = mix(look(tA, qa, mA, kA, uv), look(tB, qb, mB, kB, uv), k) + vec3(.55, .75, .8) * (1. - abs(k * 2. - 1.)) * .14;
  } else if (kind < 1.5) { // the floors slide apart
    float s = ss(0., .72, mixv);
    float b[5]; b[0] = bnd.x; b[1] = bnd.y; b[2] = bnd.z; b[3] = bnd.w; b[4] = bnd4;
    vec3 a = vec3(0.); bool hit = false;
    for (int i = 0; i < 4; i++){
      float y0 = qa.y - (float(i) - 1.5) * .085 * s;
      if (!hit && y0 >= b[i] && y0 < b[i + 1]) {
        a = look(tA, vec2(qa.x, y0), mA, kA, uv); hit = true;
        float e = min(y0 - b[i], b[i + 1] - y0);
        a += vec3(.47, .74, .78) * (1. - ss(0., .0035, e)) * s * .9;
      }
    }
    if (!hit) {
      vec2 g = abs(fract(uv * vec2(res.x / res.y, 1.) * 14.) - .5);
      a = look(tA, qa, mA, kA, uv) * (1. - s) + vec3(.3, .6, .66) * (1. - ss(0., .03, min(g.x, g.y))) * .06 * s;
    }
    float k = ss(.5, .95, mixv);
    float n = fbm(uv * vec2(3., 4.) + 7.);
    float kd = ss(n - .1, n + .1, k * 1.25 - .12);
    col = mix(a, look(tB, cover(uv, sB, fB, zB * mix(.88, 1., k)), mB, kB, uv), kd) + vec3(.47, .74, .78) * (1. - abs(kd * 2. - 1.)) * .1;
  } else { // dive into the frame
    vec2 qa2 = cover(uv, sA, fA, zA * (1. + pow(mixv, 2.2) * 3.2));
    vec3 a = vec3(0.); vec2 dir = qa2 - fA;
    for (int i = 0; i < 8; i++){ a += tex(tA, qa2 - dir * float(i) * .018 * mixv); }
    a /= 8.;
    float k = ss(.45, .95, mixv);
    col = mix(a * (1. - .5 * ss(.3, .6, mixv)), look(tB, cover(uv, sB, fB, zB * mix(1.5, 1., k)), mB, kB, uv), k);
  }
  col *= 1. + lift;
  vec2 d = uv - .5; col *= 1. - dot(d, d) * .55;
  col += (h(uv * res + fract(time) * 91.) - .5) * .035;
  col = mix(col, vec3(.965, .969, .976), white); // graphite-50, the colour of the page below
  gl_FragColor = vec4(col, 1.);
}`;

const UNIFORMS = [
  'tA',
  'tB',
  'tD',
  'tN',
  'res',
  'sA',
  'sB',
  'fA',
  'fB',
  'ptr',
  'zA',
  'zB',
  'mA',
  'mB',
  'kA',
  'kB',
  'mixv',
  'kind',
  'time',
  'white',
  'lift',
  'hour',
  'bnd',
  'bnd4',
] as const;
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

interface Renderer {
  gl: WebGLRenderingContext;
  u: Uniforms;
  textures: WebGLTexture[];
  sizes: [number, number][];
  dispose: () => void;
}

function createRenderer(
  canvas: HTMLCanvasElement,
  stills: HTMLImageElement[],
  daylight: [HTMLImageElement, HTMLImageElement],
  onFirst: () => void,
): Renderer | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
    return shader;
  };
  const program = gl.createProgram()!;
  try {
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
  } catch {
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(program, n)])) as Uniforms;
  gl.uniform1i(u.tA, 0);
  gl.uniform1i(u.tB, 1);
  gl.uniform1i(u.tD, 2);
  gl.uniform1i(u.tN, 3);
  const cleanups: (() => void)[] = [];
  const load = (img: HTMLImageElement, unit: number, onLoad?: () => void) => {
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 16, 22, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const upload = () => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      onLoad?.();
    };
    if (img.complete && img.naturalWidth) upload();
    else {
      img.addEventListener('load', upload, { once: true });
      cleanups.push(() => img.removeEventListener('load', upload));
    }
    return texture;
  };
  const sizes: [number, number][] = stills.map(() => [1344, 752]);
  // The scenes swap through units 0 and 1; the daylight frames stay on units 2 and 3.
  const textures = stills.map((img, i) =>
    load(img, 0, () => {
      sizes[i] = [img.naturalWidth, img.naturalHeight];
      if (i === 0) onFirst();
    }),
  );
  const daylightTextures = [load(daylight[0], 2), load(daylight[1], 3)];
  return {
    gl,
    u,
    textures,
    sizes,
    dispose: () => {
      cleanups.forEach((fn) => fn());
      [...textures, ...daylightTextures].forEach((t) => gl.deleteTexture(t));
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

/** Starts the film inside `root` and returns a function that stops it. */
export function startFilm(root: HTMLElement): () => void {
  const q = <T extends Element>(s: string) => root.querySelector<T>(s);
  const qa = <T extends Element>(s: string) => Array.from(root.querySelectorAll<T>(s));
  const stage = q<HTMLElement>('[data-film-stage]')!;
  const canvas = q<HTMLCanvasElement>('canvas')!;
  const stills = qa<HTMLImageElement>('[data-still]');
  const dawn = q<HTMLImageElement>('[data-daylight="dawn"]')!;
  const noon = q<HTMLImageElement>('[data-daylight="noon"]')!;
  const captions = qa<HTMLElement>('[data-caption]');
  const pins = qa<HTMLElement>('[data-pin]');
  const events = qa<HTMLElement>('[data-hour]');
  const intro = q<HTMLElement>('[data-intro]');
  const heroActions = q<HTMLElement>('[data-hero-actions]');
  const clock = q<HTMLElement>('[data-clock]');
  const time = q<HTMLElement>('[data-time]');
  const log = q<HTMLElement>('[data-log]');
  const corner = q<HTMLElement>('[data-corner]');
  const ruler = q<HTMLElement>('[data-ruler]');
  const mark = q<HTMLElement>('[data-ruler-mark]');
  const shade = q<HTMLElement>('[data-shade]');
  const world = root.closest('main') ?? root;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let still = reduce.matches;
  const onReduce = () => {
    still = reduce.matches;
  };
  reduce.addEventListener('change', onReduce);

  root.style.height = `calc(${(FILM_LENGTH + 1).toFixed(2)} * 100svh)`;
  root.dataset.film = 'on';
  // The film only gets its length now, so a link to a later section lands where it should.
  const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (target && !root.contains(target)) target.scrollIntoView();
  [...stills, dawn, noon].forEach((img) => {
    img.loading = 'eager';
  });

  let renderer = createRenderer(canvas, stills, [dawn, noon], () => {
    canvas.dataset.ready = 'true';
  });
  root.dataset.gl = renderer ? 'on' : 'off';
  const onLost = (event: Event) => {
    event.preventDefault();
    renderer = null;
    root.dataset.gl = 'off';
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onPointer = (event: PointerEvent) => {
    pointer.tx = (event.clientX / innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / innerHeight) * 2 - 1;
  };
  if (fine) addEventListener('pointermove', onPointer, { passive: true });

  let top = 0;
  let height = innerHeight;
  const measure = () => {
    height = stage.clientHeight || innerHeight;
    top = root.getBoundingClientRect().top + scrollY;
  };
  measure();
  addEventListener('resize', measure);

  const CAPTIONS = ['1', '2', '2b', '3'];
  let request = 0;
  let previous = performance.now();
  let seconds = 0;
  let shownCaption: string | null = null;
  let shownMinute = -1;
  let shownScene = -1;
  let y = scrollY;
  let width = 0;
  let canvasHeight = 0;
  let ratioCap = 2;
  let slow = 16;
  let frames = 0;

  const frame = (now: number) => {
    request = requestAnimationFrame(frame);
    const dt = Math.min(64, now - previous);
    previous = now;
    if (!still) seconds += dt / 1000;
    y = still ? scrollY : y + (scrollY - y) * (1 - Math.exp(-dt / 115));
    if (Math.abs(scrollY - y) < 0.5) y = scrollY;
    const u = Math.max(0, (y - top) / height);
    let m = momentAt(u);
    if (still && m.kind >= 0) {
      m =
        m.mix < 0.5
          ? { ...m, to: m.from, mix: 0, kind: -1, local: 1 }
          : { ...m, from: m.to, mix: 0, kind: -1, local: 0 };
    }
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt / 500));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt / 500));
    const daytime = m.kind === -2;

    // The clock runs through the day and the evening.
    let hour = hourAt(u);
    if (still && daytime) hour = Math.round(hour * 2) / 2;
    const minute = Math.min(24 * 60, Math.floor(hour * 60));
    if (minute !== shownMinute) {
      shownMinute = minute;
      const text = clockText(minute);
      if (time) time.textContent = text;
      if (corner) corner.textContent = text;
    }
    mark?.style.setProperty('left', `${(clamp((hour - 5) / 19) * 100).toFixed(2)}%`);

    // The opening words leave as the day starts; the log follows the day.
    const opening = u > 0.16;
    if (intro) intro.dataset.state = opening ? 'gone' : 'on';
    if (heroActions) heroActions.inert = opening;
    if (clock) clock.style.opacity = daytime ? '1' : '0';
    if (log) log.style.opacity = u < DAY + 0.1 ? '1' : '0';
    let latest = -1;
    events.forEach((el, i) => {
      if (hour >= Number(el.dataset.hour)) latest = i;
    });
    events.forEach((el, i) => {
      el.dataset.state = i === latest ? 'on' : i < latest && i > latest - 3 ? 'past' : 'off';
    });

    // Evening captions, in order 1, 2, 2b, 3; never mid-handover.
    const last = SCENES.length - 1;
    const scene = m.kind < 0 || m.mix < 0.5 ? m.from : m.to;
    let caption = '';
    if (m.kind === -1) {
      if (m.from === 1) caption = '1';
      else if (m.from === 2) caption = m.local < 0.5 ? '2' : '2b';
      else if (m.from === last && m.local < 0.2) caption = '3';
    }
    // Empty mid-handover and during the day: keep those apart so scrolling back into the day resets the captions.
    const captionKey = caption || (daytime ? 'day' : 'between');
    if (captionKey !== shownCaption) {
      const here = caption
        ? CAPTIONS.indexOf(caption)
        : daytime
          ? -1
          : CAPTIONS.indexOf(scene === 2 && m.local >= 0.5 ? '2b' : String(scene));
      captions.forEach((el) => {
        const k = CAPTIONS.indexOf(el.dataset.caption ?? '');
        el.dataset.state = el.dataset.caption === caption ? 'on' : k <= here ? 'past' : 'next';
      });
      shownCaption = captionKey;
    }
    if (scene !== shownScene) {
      shownScene = scene;
      stage.dataset.scene = String(scene);
    }

    // The last scene pushes into the lit window until its light becomes the page.
    const push = m.from === last && m.kind === -1 ? smooth(0.25, 1, m.local) : 0;
    const white = still ? (m.from === last && m.kind === -1 && m.local > 0.6 ? 1 : 0) : smooth(0.55, 1, push);
    world.setAttribute('data-world', white > 0.6 || u > FILM_LENGTH ? 'paper' : 'film');
    if (shade) shade.style.opacity = String(1 - white);
    if (ruler) ruler.style.opacity = String(1 - white);
    if (corner) corner.style.opacity = !daytime && white < 0.3 ? '1' : '0';

    const viewW = innerWidth;
    const viewH = stage.clientHeight || innerHeight;
    const portrait = viewW / viewH < 0.9;
    const A = SCENES[m.from]!;
    const B = SCENES[m.to]!;
    const zoomOf = (s: Scene) => (portrait ? (s.portraitZoom ?? 1) : 1);
    const focusOf = (s: Scene) => (portrait ? s.portraitFocus : s.focus);
    let zA = daytime ? 1 + 0.08 * clamp(u / DAY) : A.zoom[0] + (A.zoom[1] - A.zoom[0]) * (still ? 0.5 : m.local);
    if (m.from === last) zA *= 1 + Math.pow(push, 2.4) * 5.5;
    zA *= zoomOf(A);
    const zB = B.zoom[0] * zoomOf(B);

    pins.forEach((pin) => {
      const [s, px, py, from, to] = PINS[pin.dataset.pin ?? ''] ?? [-1, 0, 0, 0, 0];
      let on = m.kind === -1 && m.from === s && m.local > from && m.local < to;
      if (on) {
        const size = renderer?.sizes[s] ?? [1376, 768];
        const at = toScreen(size, focusOf(SCENES[s]!), zA, px, py, viewW, viewH);
        if (at[0] < 12 || at[0] > viewW - 200 || at[1] < 90 || at[1] > viewH * 0.6) on = false;
        else pin.style.transform = `translate3d(${(at[0] - 4.5).toFixed(1)}px,${(at[1] - 4.5).toFixed(1)}px,0)`;
      }
      pin.dataset.on = String(on);
    });

    if (!renderer) {
      stills.forEach((img, i) => {
        img.dataset.on = String(i === scene);
      });
      return;
    }
    if (u > FILM_LENGTH + 1.2 || document.hidden) return;
    const { gl, u: U, textures, sizes } = renderer;
    const ratio = Math.min(
      devicePixelRatio || 1,
      viewW < 700 ? 1.5 : 1.6,
      Math.sqrt(3.2e6 / (viewW * viewH)),
      ratioCap,
    );
    if (!width || Math.round(viewW * ratio) !== width || Math.round(viewH * ratio) !== canvasHeight) {
      width = Math.round(viewW * ratio);
      canvasHeight = Math.round(viewH * ratio);
      canvas.width = width;
      canvas.height = canvasHeight;
    }
    slow = slow * 0.95 + dt * 0.05;
    if (++frames > 120 && slow > 26 && ratioCap > 0.8) {
      ratioCap = Math.max(0.8, ratio - 0.25);
      frames = 0;
    }
    gl.viewport(0, 0, width, canvasHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[m.from]!);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures[m.to]!);
    gl.uniform2f(U.res, width, canvasHeight);
    gl.uniform2fv(U.sA, sizes[m.from]!);
    gl.uniform2fv(U.sB, sizes[m.to]!);
    gl.uniform2fv(U.fA, focusOf(A));
    gl.uniform2fv(U.fB, focusOf(B));
    gl.uniform2f(U.ptr, pointer.x, pointer.y);
    gl.uniform1f(U.zA, zA);
    gl.uniform1f(U.zB, zB);
    gl.uniform1f(U.mA, A.mist);
    gl.uniform1f(U.mB, B.mist);
    gl.uniform1f(U.kA, A.flicker);
    gl.uniform1f(U.kB, B.flicker);
    gl.uniform1f(U.mixv, m.mix);
    gl.uniform1f(U.kind, m.kind);
    gl.uniform1f(U.time, seconds);
    gl.uniform1f(U.hour, hour);
    gl.uniform1f(U.white, white);
    gl.uniform1f(U.lift, push * 0.25);
    gl.uniform4f(U.bnd, FLOORS[0], FLOORS[1], FLOORS[2], FLOORS[3]);
    gl.uniform1f(U.bnd4, FLOORS[4]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  request = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(request);
    reduce.removeEventListener('change', onReduce);
    removeEventListener('pointermove', onPointer);
    removeEventListener('resize', measure);
    canvas.removeEventListener('webglcontextlost', onLost);
    renderer?.dispose();
    root.style.removeProperty('height');
    delete root.dataset.film;
    delete root.dataset.gl;
    if (heroActions) heroActions.inert = false;
  };
}

/** A point in a still, in screen pixels, matching the shader's cover crop. */
function toScreen(size: [number, number], focus: Point, zoom: number, x: number, y: number, w: number, h: number) {
  const sa = w / h;
  const ia = size[0] / size[1];
  const span = (sa > ia ? [1, ia / sa] : [sa / ia, 1]).map((s) => s / zoom) as [number, number];
  const centre = span.map((s, i) => (s > 1 ? 0.5 : clamp(focus[i]!, s / 2, 1 - s / 2)));
  return [((x - centre[0]!) / span[0] + 0.5) * w, ((y - centre[1]!) / span[1] + 0.5) * h] as const;
}
