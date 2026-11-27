/**
 * The homepage film: one flight over a demo estate, with scroll as the controls.
 *
 * The camera starts in a city square, rises up the facade of a tower, over its roof plant, above the city and out
 * across the estate at night, then drops back to the square. It is one 30-second video, cut into frames
 * (public/homepage/frames) and played by scrolling. Everything a person reads, and where it appears, is here.
 */

/** The frames: f0001.webp to f0200.webp, 1024 by 576. */
export const FRAMES = { count: 200, pad: 4, path: '/homepage/frames' } as const;

export interface Stop {
  /** The label on the stage rail. */
  name: string;
  /** The altitude readout at this stop, in metres. */
  altitude: number;
  /** What the film shows here, for people who can't see it. */
  says: string;
}

/** Seven keyframes, six clips: the camera reaches stop i at i / 6 of the film. */
export const STOPS: readonly Stop[] = [
  { name: 'Ground', altitude: 0, says: 'The tower from the square at golden hour.' },
  { name: 'Facade', altitude: 118, says: 'Rising up the facade, past a technician cleaning the glass.' },
  {
    name: 'Roof',
    altitude: 168,
    says: 'Over the edge onto the roof deck with chillers, air handling units and solar panels.',
  },
  { name: 'Skyline', altitude: 540, says: 'Lifting above the roof at dusk, with the river and the city below.' },
  { name: 'Estate', altitude: 1400, says: 'Pulling back over the district as beacons light up on twelve buildings.' },
  { name: 'Network', altitude: 1100, says: 'Night falls and lines of light join the buildings into one network.' },
  { name: 'Square', altitude: 0, says: 'Back down to the square, with the tower lit.' },
];

/** A label pinned to something in the footage. x and y are shares of the frame, from the top left. */
export interface Tag {
  x: number;
  y: number;
  title: string;
  detail: string;
}

export interface Chapter {
  /** The stop it shows around. */
  stop: number;
  /** Two lines: the second is in the accent colour. */
  lines: readonly [string, string];
  side: 'left' | 'right';
  tags?: readonly Tag[];
}

/** Demo figures and names only. */
export const CHAPTERS: readonly Chapter[] = [
  {
    stop: 1,
    lines: ['Every', 'asset.'],
    side: 'left',
    tags: [{ x: 0.53, y: 0.46, title: 'Facade clean', detail: 'In progress' }],
  },
  {
    stop: 2,
    lines: ['Planned,', 'not reactive.'],
    side: 'left',
    tags: [
      { x: 0.56, y: 0.47, title: 'Chiller 2', detail: 'Serviced' },
      { x: 0.26, y: 0.6, title: 'Solar array', detail: 'Checked' },
    ],
  },
  { stop: 3, lines: ['Compliance,', 'tracked.'], side: 'left' },
  {
    stop: 4,
    lines: ['Twelve sites.', 'One login.'],
    side: 'left',
    tags: [
      { x: 0.5, y: 0.34, title: 'Head office', detail: '14 open jobs' },
      { x: 0.78, y: 0.58, title: 'Riverside depot', detail: '3 open jobs' },
    ],
  },
  { stop: 5, lines: ['Every job,', 'connected.'], side: 'right' },
];

/** How the scroll feels: the film slows to a near stop at each stop, then moves on. */
export const FEEL = { dwellWidth: 0.022, dwellPeak: 3.4, smoothing: 0.1 } as const;
