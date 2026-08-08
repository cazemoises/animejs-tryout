/** Single source of truth for colour and motion vocabulary. */

export const palette = {
  ink: '#07090F',
  inkDeep: '#0D1424',
  cyan: '#4DE1E8',
  amber: '#FFB347',
  text: '#E8ECF2',
  muted: '#8A94A6',
} as const

/** Same palette as three.js-friendly hex numbers. */
export const hex = {
  ink: 0x07090f,
  inkDeep: 0x0d1424,
  cyan: 0x4de1e8,
  amber: 0xffb347,
  steel: 0x8fa3bf,
  text: 0xe8ecf2,
} as const

/**
 * Named easings, so each section can say *why* it moves the way it does
 * instead of scattering magic strings.
 */
export const ease = {
  /** Mass arriving and settling: assembly, reveals. */
  arrive: 'outExpo',
  /** Mechanical parts seating into place, with a hint of overshoot. */
  seat: 'outBack(1.6)',
  /** Something released and wobbling: orbiting nodes locking on. */
  release: 'outElastic(1, .6)',
  /** Light and glow, which should never snap. */
  glow: 'inOutSine',
  /** Cursor-following feedback: fast out, no bounce. */
  track: 'outQuint',
  /** Returning to rest after the cursor leaves. */
  rest: 'outSine',
  /** Drawing a line at a constant, deliberate rate. */
  draw: 'inOutQuad',
  /** Shape changing identity. */
  morph: 'inOutCirc',
} as const

export const FOV = 38
