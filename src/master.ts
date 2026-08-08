import { createTimeline, onScroll, stagger, type Timeline } from 'animejs'
// Side-effect import: registers the three.js target adapter and property
// resolvers, which is what lets `animate()` write Object3D and material
// properties directly.
import 'animejs/adapters/three'

import { ease } from './core/tokens'
import type { MotionProfile } from './core/motion'
import type { Orrery } from './three/orrery'

/**
 * Values with more than one contributor. The render loop reads these and
 * combines them; no animation writes to the objects they feed.
 */
export type ScrollState = {
  /** Degrees of rotation contributed by scroll, summed with the idle drift. */
  spin: number
  /** Camera dolly multiplier, 1.6 (far) → 1 (fitted). */
  dolly: number
  /** 0 → 1 background interpolation between the two ink tones. */
  background: number
}

export type Master = {
  timeline: Timeline
  state: ScrollState
}

/** Total timeline length. Only the ratios matter — scroll remaps this to 0..1. */
const SPAN = 6000

/**
 * Scroll synchronisation rate. 1 maps the timeline directly onto the scrollbar;
 * lower values smooth the catch-up.
 *
 * Measured, not guessed. Scrolling the page gradually and sampling timeline
 * progress against scroll position:
 *
 *   sync   mean lag   max lag   progress at page bottom
 *   1.0      5.5%      20.0%     1.000  (assembled)
 *   0.95    25.7%      55.4%     0.677  (halo barely started)
 *   0.85    29.2%      56.9%     0.645
 *   0.60    32.9%      60.9%     0.466  (half-built)
 *
 * Anything below 1 leaves the instrument unfinished when the reader reaches the
 * end of the page, and only converges over tens of seconds of sitting still.
 * Native scroll is already smooth on trackpads and smooth wheels, so direct
 * mapping is both the faithful reading of "in sync with scroll" and the one
 * that actually completes. `?sync=` overrides this in dev to feel the others.
 */
const DEFAULT_SYNC = 1

export function createMaster(
  orrery: Orrery,
  motion: MotionProfile,
  scrollTarget: HTMLElement,
  sync: number = DEFAULT_SYNC,
): Master {
  const state: ScrollState = { spin: 0, dolly: 1.6, background: 0 }

  const timeline = createTimeline({
    autoplay: motion.reduced
      ? false
      : onScroll({
          target: scrollTarget,
          // Progress 0 when the page top meets the viewport top, 1 when the
          // page bottom meets the viewport bottom: the full scroll range.
          enter: { target: 'top', container: 'top' },
          leave: { target: 'bottom', container: 'bottom' },
          // Smooth catch-up. High enough that the timeline actually reaches
          // the scroll position, low enough to absorb wheel jitter.
          sync,
        }),
  })

  timeline
    // 1 — the core ignites and grows.
    .add(orrery.core, { scale: [0, 1], ease: ease.arrive, duration: 900 }, 0)
    // Peaks at 1, not at the tier's brightness: the tier scales the emissive
    // colour instead, so this tween stays the sole writer of the intensity.
    .add(
      orrery.core,
      { emissiveIntensity: [0, 1], ease: ease.glow, duration: 1500 },
      150,
    )

    // 2 — the cage snaps around it.
    .add(
      orrery.cage,
      { scale: [0, 1], opacity: [0, 0.5], ease: ease.arrive, duration: 800 },
      600,
    )

    // 3 & 4 — rings seat into place, with overshoot: they are mechanical parts
    // dropping into a mount, not things fading in.
    .add(orrery.ringX, { scale: [0, 1], ease: ease.seat, duration: 1100 }, 1150)
    .add(orrery.ringZ, { scale: [0, 1], ease: ease.seat, duration: 1100 }, 1950)

    // 5 — nodes are released into orbit and wobble to rest.
    .add(
      orrery.nodes,
      {
        scale: [0, 1],
        ease: ease.release,
        duration: 1500,
        delay: stagger(90),
      },
      2750,
    )

    // 6 — the halo blooms open last.
    .add(
      orrery.halo,
      { scale: [0.6, 1], opacity: [0, 0.55], ease: ease.glow, duration: 1300 },
      3700,
    )

    // Continuous, scroll-locked values. Linear on purpose: these track the
    // scrollbar directly, and any easing here would read as lag.
    .add(
      state,
      {
        spin: 540,
        dolly: 1,
        background: 1,
        ease: 'linear',
        duration: SPAN,
      },
      0,
    )

  if (motion.reduced) {
    // Present the finished instrument, static. No observer is attached, so
    // nothing will move it again.
    timeline.seek(timeline.duration)
  }

  return { timeline, state }
}
