/**
 * Motion policy: how much the machine can afford, and how much the user wants.
 *
 * Tier detection deliberately treats `hardwareConcurrency` as a weak signal —
 * Safari under-reports it by default, so trusting it would demote perfectly
 * capable Macs. The authoritative signal is measured frame rate: we watch the
 * first stretch of real frames and demote if the machine cannot keep up. That
 * also catches the reverse case, a weak desktop that the static heuristics
 * would have promoted.
 */

export type Tier = 'high' | 'low'

export type TierSettings = {
  maxPixelRatio: number
  bloom: boolean
  shadows: boolean
  shadowMapSize: number
  burstParticles: number
  burstShards: number
  staggerGrid: [columns: number, rows: number]
  orbitNodes: number
  /**
   * Multiplier on the core's emissive colour.
   *
   * The high tier deliberately drives the core past 1.0 so it clips — with
   * bloom, clipping is what produces the spill that reads as light. Without
   * bloom the same value is just a flat white ball with its facets erased, so
   * the low tier stays inside the displayable range and keeps its shading.
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
  low: {
    maxPixelRatio: 1.5,
    bloom: false,
    shadows: true,
    shadowMapSize: 1024,
    burstParticles: 120,
    burstShards: 28,
    staggerGrid: [7, 5],
    orbitNodes: 5,
    coreEmissive: 1.15,
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
  // Primary signals: is this a touch-first device on a small viewport?
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  const touchPoints = navigator.maxTouchPoints ?? 0
  const shortEdge = Math.min(window.innerWidth, window.innerHeight)
  const longEdge = Math.max(window.innerWidth, window.innerHeight)

  const handheld = (coarsePointer || noHover) && touchPoints > 0 && longEdge < 1100
  if (handheld) return 'low'

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
