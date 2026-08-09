/**
 * Tracks two per-scroll-position values derived from the section the reader
 * is currently near.
 *
 * `bias()` — which side the text card is on (0 left, 1 right). Sections
 * declare it with `data-card="left|right"`; there is no natural in-between
 * DOM measurement for "which side", so the value is synthesised: held at each
 * section's setting and eased only across the middle of the gap to the next,
 * so the handover reads as a deliberate move rather than constant drift.
 *
 * `portraitCardTop()` — in the mobile single-column layout, how far down the
 * screen the active card starts, as a fraction of the viewport height. Unlike
 * bias, this is measured *live*, every call, not interpolated from a cached
 * snapshot. A card's on-screen position is already a smooth, continuous
 * function of scroll — measured directly, applying bias's hold-move-hold
 * synthesis on top of a stale, refresh-time snapshot let an incoming card
 * arrive up to ~35 percentage points higher than the frame's ceiling still
 * assumed, for as long as the transition's "hold" phase lasted. Reading the
 * real position of whichever card(s) straddle the current scroll focus has no
 * such lag, by construction — there's nothing to synthesise.
 */

export type CardTracker = {
  /** Current card bias: 0 = card fully left, 1 = card fully right. */
  bias(): number
  /** Fraction of the viewport height where the active card actually starts. */
  portraitCardTop(): number
  /** Recompute section positions after a layout change. */
  refresh(): void
  dispose(): void
}

type Anchor = {
  center: number
  bias: number
  cardEl: HTMLElement | null
}

/** Fraction of the gap between two sections spent actually moving. */
const HANDOVER_SPAN = 0.5

/** Used only if a section genuinely has no `.card` to measure. */
const FALLBACK_CARD_TOP = 0.54

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
        cardEl: section.querySelector<HTMLElement>('.card'),
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

    portraitCardTop() {
      if (!anchors.length) return FALLBACK_CARD_TOP

      // Only the section whose focus is nearby can have anything on screen —
      // sections are at least one viewport tall (`min-height: 100svh`), so at
      // most two are ever simultaneously visible, and they're exactly the
      // ones bracketing `focus` by centre. Checking just these two, rather
      // than scanning every section, is what keeps this cheap enough to call
      // once per rendered frame.
      const focus = window.scrollY + window.innerHeight / 2
      const idx = anchors.findIndex((a) => focus <= a.center)
      const candidates =
        idx === -1
          ? [anchors[anchors.length - 1]!]
          : idx > 0
            ? [anchors[idx]!, anchors[idx - 1]!]
            : [anchors[idx]!]

      // Which edge of a card is the real constraint is a property of *that
      // card's own on-screen position* — not of which side of some section
      // centre the scroll focus happens to be on. A section can be a full
      // viewport tall, so focus crosses its centre long before its card
      // visually starts leaving: classifying by centre made an still-fully-
      // visible card (top comfortably positive) get treated as "already
      // leaving" and checked by its far-away bottom edge instead, reporting
      // a ceiling *below* where that card's own top still was.
      let best = Infinity
      for (const candidate of candidates) {
        if (!candidate.cardEl) continue
        const rect = candidate.cardEl.getBoundingClientRect()
        if (rect.top >= 0) {
          // Hasn't started leaving (or is arriving): its top is the ceiling.
          best = Math.min(best, rect.top / window.innerHeight)
        } else if (rect.bottom > 0) {
          // Top already scrolled past; only a bottom remainder still counts.
          best = Math.min(best, rect.bottom / window.innerHeight)
        }
        // Else: fully scrolled past, above the viewport — no constraint.
      }

      return best === Infinity ? FALLBACK_CARD_TOP : best
    },

    dispose() {
      observer.disconnect()
      window.removeEventListener('resize', refresh)
    },
  }
}
