import type { MotionProfile } from '../core/motion'

export type Section = {
  destroy(): void
}

export type SectionContext = {
  root: HTMLElement
  motion: MotionProfile
}

/** Minimal surface shared by Animation and Timeline. */
type Revealable = {
  play(): void
  pause(): void
  seek(time: number): unknown
  readonly duration: number
}

/**
 * Play a section's entrance the first time it comes into view, and leave it
 * played.
 *
 * Deliberately an `IntersectionObserver` rather than anime's `onScroll`.
 * Two `onScroll` formulations were measured here and neither held up for a
 * one-shot reveal: `sync: 'play'` also assigns reset behaviour to leaving and
 * to backward crossings, so scrolling past a section and back up left it at
 * progress 0 (blank grid, undrawn seal); and `repeat: false` with an `onEnter`
 * callback failed to fire at all when the threshold was crossed in a single
 * jump. `IntersectionObserver` is the platform primitive for exactly this
 * question and fires reliably however the scroll position arrives.
 *
 * `onScroll` still drives the master timeline, where scroll *synchronisation*
 * — not a one-shot trigger — is the technique being demonstrated.
 *
 * The bottom margin holds the trigger back until the section is meaningfully
 * on screen, rather than firing on its first pixel.
 */
export function revealOnEnter(
  target: HTMLElement,
  motion: MotionProfile,
  playable: Revealable,
): IntersectionObserver | null {
  if (motion.reduced) {
    playable.seek(playable.duration)
    return null
  }

  playable.pause()

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        playable.play()
        observer.disconnect()
      }
    },
    { rootMargin: '0px 0px -20% 0px', threshold: 0.2 },
  )

  observer.observe(target)
  return observer
}
