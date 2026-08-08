/**
 * Tracks two continuous, per-scroll-position values derived from the section
 * the reader is currently near — recomputed once per layout change, not once
 * per frame, since both feed the render loop every frame and neither needs a
 * DOM read that often.
 *
 * `bias()` — which side the text card is on (0 left, 1 right). Sections
 * declare it with `data-card="left|right"`; there is no natural in-between
 * DOM measurement for "which side", so the value is synthesised: held at each
 * section's setting and eased only across the middle of the gap to the next,
 * so the handover reads as a deliberate move rather than constant drift.
 *
 * `portraitCardTop()` — in the mobile single-column layout, how far down the
 * screen the current section's card starts, as a fraction of the viewport
 * height. Unlike bias, this genuinely is a real per-section measurement (card
 * height varies enormously — a spring section with two draggable lanes is not
 * the same shape as a one-line hero) — a single fixed budget was measured to
 * leave several sections with their card starting 20-45 percentage points
 * above where the object's static safe band assumed it would. Held at each
 * section's measured value the same hold-move-hold way as bias, so the object
 * settles into a stable frame per section instead of resizing continuously.
 */

export type CardTracker = {
  /** Current card bias: 0 = card fully left, 1 = card fully right. */
  bias(): number
  /** Fraction of the viewport height where the active section's card starts. */
  portraitCardTop(): number
  /** Recompute section positions after a layout change. */
  refresh(): void
  dispose(): void
}

type Anchor = {
  center: number
  bias: number
  cardTop: number
}

/** Fraction of the gap between two sections spent actually moving. */
const HANDOVER_SPAN = 0.5

/** Used when a section has no `.card` to measure (shouldn't happen, but cheap to guard). */
const FALLBACK_CARD_TOP = 0.54

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smoothstep = (t: number) => t * t * (3 - 2 * t)

/**
 * Shared interpolation: given the current scroll focus, find which pair of
 * anchors it falls between and ease the requested field across the middle of
 * that gap. Both `bias` and `portraitCardTop` are plain numbers on the same
 * anchor list, so one function serves both.
 */
function interpolate(anchors: Anchor[], focus: number, field: 'bias' | 'cardTop'): number {
  const first = anchors[0]
  const last = anchors[anchors.length - 1]
  if (!first || !last) return field === 'bias' ? 1 : FALLBACK_CARD_TOP

  if (focus <= first.center) return first[field]
  if (focus >= last.center) return last[field]

  for (let i = 1; i < anchors.length; i++) {
    const from = anchors[i - 1]
    const to = anchors[i]
    if (!from || !to || focus > to.center) continue

    const span = to.center - from.center
    if (span <= 0) return to[field]

    const progress = (focus - from.center) / span
    // Hold, move, hold — instead of easing across the whole gap.
    const edge = (1 - HANDOVER_SPAN) / 2
    const moving = clamp01((progress - edge) / HANDOVER_SPAN)
    return from[field] + (to[field] - from[field]) * smoothstep(moving)
  }

  return last[field]
}

export function createCardTracker(root: HTMLElement): CardTracker {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('.section'))
  let anchors: Anchor[] = []

  const refresh = (): void => {
    anchors = sections.map((section) => {
      const rect = section.getBoundingClientRect()
      const card = section.querySelector<HTMLElement>('.card')

      // `cardRect.top - sectionRect.top` is scroll-invariant — both shift
      // together, so the difference is the card's real offset from its own
      // section's top regardless of where that section currently sits on the
      // page. Normalising by the viewport height (not the section's own,
      // possibly-taller-than-one-screen height) gives "where the card would
      // start on screen if this section were showing," which is exactly what
      // the camera needs, including the case where it's *greater* than 1 —
      // a section taller than one viewport whose card hasn't scrolled into
      // view yet, where the object correctly gets the whole screen.
      const cardTop = card
        ? (card.getBoundingClientRect().top - rect.top) / window.innerHeight
        : FALLBACK_CARD_TOP

      return {
        center: rect.top + window.scrollY + rect.height / 2,
        bias: section.dataset.card === 'left' ? 0 : 1,
        cardTop,
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
      const focus = window.scrollY + window.innerHeight / 2
      return interpolate(anchors, focus, 'bias')
    },

    portraitCardTop() {
      const focus = window.scrollY + window.innerHeight / 2
      return interpolate(anchors, focus, 'cardTop')
    },

    dispose() {
      observer.disconnect()
      window.removeEventListener('resize', refresh)
    },
  }
}
