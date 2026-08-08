/**
 * Motion policy: how much the machine can afford, and how much the user wants.
 *
 * Tier detection deliberately treats `hardwareConcurrency` as a weak signal —
 * Safari under-reports it by default, so trusting it would demote perfectly
 * capable Macs. The authoritative signal is measured frame rate: we watch the
 * first stretch of real frames and demote if the machine cannot keep up. That
 * also catches the reverse case, a weak desktop that the static heuristics
 * would have promoted.
 *
 * The same "don't guess from a weak signal" logic applies to `mid` vs `low`:
 * screen size says almost nothing about GPU capability — a 2016 iPhone SE and
 * a current-generation phone can report a similar CSS viewport. Nearly every
 * phone sold in the last several years can afford a *cheap* bloom pass, so
 * touch devices default to `mid` (bloom on, at a capped internal resolution)
 * rather than `low` (bloom off entirely), with the runtime FPS probe below as
 * the actual backstop if that assumption turns out wrong for a given device.
 * Only a screen small enough to suggest a genuinely old or unusual device
 * skips straight to `low`.
 */

export type Tier = 'high' | 'mid' | 'low'

export type TierSettings = {
  maxPixelRatio: number
  bloom: boolean
  /**
   * Cap, in CSS px on the long edge, for the resolution fed to the bloom pass
   * — independent of `maxPixelRatio`, which scales the *whole* scene render.
   * UnrealBloomPass builds a 5-level mip chain from this size; halving it
   * roughly quarters the pixel cost of every blur pass in that chain, and
   * bloom's inherent softness hides the resulting drop in internal resolution
   * far better than it would hide on any sharp-edged geometry. Unused when
   * `bloom` is false.
   */
  bloomResolutionCap: number
  shadows: boolean
  shadowMapSize: number
  burstParticles: number
  burstShards: number
  staggerGrid: [columns: number, rows: number]
  orbitNodes: number
  /**
   * Multiplier on the core's emissive colour.
   *
   * Tiers with bloom deliberately drive the linear input past 1.0 so it clips
   * — with bloom, clipping is what produces the spill that reads as light.
   * Without bloom, the low tier's value is chosen by the rendered pixel, not
   * the linear input: Khronos PBR Neutral compresses highlights gently rather
   * than clamping, so "does it clip" and "does the faceted shading stay
   * legible" turn out to be different questions — see the measurement next to
   * `low`'s value below.
   */
  coreEmissive: number
  /**
   * ACES crushes over-range highlights toward white, which only reads as
   * *light* once bloom spills them outward. Without bloom, Khronos PBR Neutral
   * rolls off gently and keeps the cyan hue instead of bleaching it.
   */
  toneMapping: 'aces' | 'neutral'
}

const SETTINGS: Record<Tier, TierSettings> = {
  high: {
    maxPixelRatio: 2,
    bloom: true,
    bloomResolutionCap: 1600,
    shadows: true,
    shadowMapSize: 2048,
    burstParticles: 400,
    burstShards: 60,
    staggerGrid: [13, 7],
    orbitNodes: 7,
    // Over 1 on purpose so it clips and feeds the bloom, but not so far that
    // the core becomes a featureless white blob before the pass even runs.
    coreEmissive: 2.0,
    toneMapping: 'aces',
  },
  mid: {
    // Bloom stays on — see the module doc — everything else drops to the
    // same cheap settings as `low`, since those costs are independent of
    // bloom (DPR affects the whole render; shadow/particle counts are
    // CPU/JS-side). Only bloom's own resolution gets a dedicated cap.
    maxPixelRatio: 1.5,
    bloom: true,
    bloomResolutionCap: 640,
    shadows: true,
    shadowMapSize: 1024,
    burstParticles: 120,
    burstShards: 28,
    staggerGrid: [7, 5],
    orbitNodes: 5,
    coreEmissive: 2.0,
    toneMapping: 'aces',
  },
  low: {
    maxPixelRatio: 1.5,
    bloom: false,
    bloomResolutionCap: 480, // unused while bloom is off; kept for type symmetry
    shadows: true,
    shadowMapSize: 1024,
    burstParticles: 120,
    burstShards: 28,
    staggerGrid: [7, 5],
    orbitNodes: 5,
    /**
     * Measured against the rendered pixel, not the linear input value — the
     * two diverge under Neutral's gentle highlight rolloff. At the core's
     * projected screen position, brightest-pixel-in-a-12px-patch sRGB:
     *
     *   mult   pixel (r,g,b)     facets
     *   1.15   ( 65,229,237)     crisp — the original value, read as dim
     *   1.30   ( 74,234,242)     crisp
     *   1.60   ( 90,239,246)     crisp — clearly more vivid than 1.15
     *   1.90   (102,241,248)     starting to flatten
     *   2.00   (106,242,249)     visibly flattened, reads as a uniform disc
     *
     * None of these hit true white even at 2.0 — Neutral compresses rather
     * than clamps — so "does it clip" isn't the useful question here; "does
     * the faceting stay legible" is, and it stops being true around 1.9.
     * 1.6 is the most vivid value that's still unambiguously on the crisp
     * side of that line.
     */
    coreEmissive: 1.6,
    toneMapping: 'neutral',
  },
}

/** Frames skipped before sampling, so warm-up and shader compilation don't count. */
const PROBE_WARMUP = 24
/** Frames measured before deciding. */
const PROBE_SAMPLE = 90
/** Below this average, the machine is demoted. */
const PROBE_MIN_FPS = 50

export type MotionProfile = {
  /** User asked for reduced motion. Nothing should loop or scroll-drive. */
  readonly reduced: boolean
  readonly tier: Tier
  readonly settings: TierSettings
  /** Feed every frame's delta (seconds). Returns true on the frame it demotes. */
  sampleFrame(delta: number): boolean
  /** Called once if the runtime probe demotes the tier. */
  onDemote(listener: (settings: TierSettings) => void): void
}

function guessTier(): Tier {
  // Primary signals: is this a touch-first device?
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  const touchPoints = navigator.maxTouchPoints ?? 0
  const shortEdge = Math.min(window.innerWidth, window.innerHeight)
  const longEdge = Math.max(window.innerWidth, window.innerHeight)
  const handheld = (coarsePointer || noHover) && touchPoints > 0

  if (handheld) {
    // A screen this small is the closest static proxy we have for "old or
    // unusually constrained device" — genuinely small/ancient hardware, or an
    // embedded webview. Everything bigger defaults to `mid`; a big tablet
    // (long edge past phone territory) is desktop-class and gets `high`.
    if (longEdge < 560 || shortEdge < 340) return 'low'
    return longEdge < 1100 ? 'mid' : 'high'
  }

  if (shortEdge < 560) return 'low'

  // Weak tiebreaker only. A low number here is suggestive, never decisive:
  // Safari reports a capped value regardless of the actual machine, so it may
  // only demote when a primary signal already leans that way.
  const cores = navigator.hardwareConcurrency ?? 0
  if (cores > 0 && cores <= 2 && (coarsePointer || shortEdge < 800)) return 'low'

  return 'high'
}

export function createMotionProfile(forcedTier?: Tier): MotionProfile {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let tier: Tier = forcedTier ?? guessTier()
  let settings = SETTINGS[tier]

  const listeners: Array<(settings: TierSettings) => void> = []
  let frames = 0
  let accumulated = 0
  // A forced tier is an explicit instruction; the probe must not override it.
  let probeDone = tier === 'low' || reduced || forcedTier !== undefined

  const profile: MotionProfile = {
    get reduced() {
      return reduced
    },
    get tier() {
      return tier
    },
    get settings() {
      return settings
    },
    sampleFrame(delta) {
      if (probeDone) return false

      frames++
      if (frames <= PROBE_WARMUP) return false

      accumulated += delta
      if (frames < PROBE_WARMUP + PROBE_SAMPLE) return false

      probeDone = true
      const averageFps = PROBE_SAMPLE / accumulated
      if (averageFps >= PROBE_MIN_FPS) return false

      tier = 'low'
      settings = SETTINGS.low
      for (const listener of listeners) listener(settings)
      return true
    },
    onDemote(listener) {
      listeners.push(listener)
    },
  }

  return profile
}
