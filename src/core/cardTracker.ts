/**
 * Tracks which side the text card is on as the page scrolls, as a continuous
 * 0..1 value the camera can follow.
 *
 * Sections declare their side with `data-card="left|right"`. Rather than
 * snapping when a new section becomes active, the bias interpolates between
 * neighbouring sections — but only across the middle of the gap between them,
 * so each section holds a settled framing and the handover reads as a
 * deliberate move rather than constant drift.
 */

export type CardTracker = {
  /** Current card bias: 0 = card fully left, 1 = card fully right. */
  bias(): number
  /** Recompute section positions after a layout change. */
  refresh(): void
  dispose(): void
}

type Anchor = {
  center: number
  bias: number
}

/** Fraction of the gap between two sections spent actually moving. */
const HANDOVER_SPAN = 0.5

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smoothstep = (t: number) => t * t * (3 - 2 * t)

export function createCardTracker(root: HTMLElement): CardTracker {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('.section'))
  let anchors: Anchor[] = []

  const refresh = (): void => {
    anchors = sections.map((section) => {
      const rect = section.getBoundingClientRect()
      return {
        center: rect.top + window.scrollY + rect.height / 2,
        bias: section.dataset.card === 'left' ? 0 : 1,
      }
    })
  }

  refresh()

  const observer = new ResizeObserver(refresh)
  observer.observe(root)
  window.addEventListener('resize', refresh, { passive: true })

  return {
    refresh,

    bias() {
      const first = anchors[0]
      const last = anchors[anchors.length - 1]
      if (!first || !last) return 1

      const focus = window.scrollY + window.innerHeight / 2
      if (focus <= first.center) return first.bias
      if (focus >= last.center) return last.bias

      for (let i = 1; i < anchors.length; i++) {
        const from = anchors[i - 1]
        const to = anchors[i]
        if (!from || !to || focus > to.center) continue

        const span = to.center - from.center
        if (span <= 0) return to.bias

        const progress = (focus - from.center) / span
        // Hold, move, hold — instead of easing across the whole gap.
        const edge = (1 - HANDOVER_SPAN) / 2
        const moving = clamp01((progress - edge) / HANDOVER_SPAN)
        return from.bias + (to.bias - from.bias) * smoothstep(moving)
      }

      return last.bias
    },

    dispose() {
      observer.disconnect()
      window.removeEventListener('resize', refresh)
    },
  }
}
