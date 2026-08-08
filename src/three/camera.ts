/**
 * Camera framing math.
 *
 * The whole point of this module: guarantee that a sphere of radius `radius`
 * is fully visible inside an arbitrary sub-rectangle of the viewport, at every
 * aspect ratio and every point of the scroll dolly. Nothing here touches
 * three.js, so it is directly unit-testable.
 *
 * Conventions
 * -----------
 * Camera sits at the origin of camera space looking down -Z. The content
 * sphere is at camera-space position `(offsetX, offsetY, -distance)`.
 * Screen coordinates are NDC: x and y both run -1 (left/bottom) to +1
 * (right/top).
 *
 * Why a *region* instead of a plain "fit to viewport"
 * ---------------------------------------------------
 * The text cards cover part of the screen. Framing against the full viewport
 * would let the orrery slide under a card; framing against a centered but
 * narrower viewport would keep it centered on screen, which is not where the
 * free space is. So we frame against the actual free rectangle and let the
 * camera go off-axis to point at that rectangle's center.
 */

/** A sub-rectangle of the viewport in NDC. Full viewport is x:[-1,1] y:[-1,1]. */
export type Region = {
  x: [number, number]
  y: [number, number]
}

export type Framing = {
  /** Camera distance from the content sphere's center, along +Z. */
  distance: number
  /** Camera-space X of the content center (camera shifts by -offsetX). */
  offsetX: number
  /** Camera-space Y of the content center (camera shifts by -offsetY). */
  offsetY: number
}

export const FULL_REGION: Region = { x: [-1, 1], y: [-1, 1] }

/** Extra breathing room on top of the mathematically tight fit. */
export const DEFAULT_SAFETY = 1.18

const degToRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Solve the tight fit along one axis.
 *
 * A frustum side plane passes through the camera origin. For a boundary at NDC
 * coordinate `s`, the plane's unit normal (pointing into the region) gives a
 * signed distance to the content center of
 *
 *     (k·d - s·t·d) / sqrt(1 + s²t²)      where t = tan(halfFov), k = center·t
 *
 * Requiring that to be >= radius for both boundaries and solving for `d` gives
 * the expression below. With a full-viewport region (s = ±1, k = 0) it reduces
 * to the familiar `d = radius / sin(halfFov)` — note `sin`, not `tan`: `tan`
 * frames the plane through the center and lets a sphere bulge past the corners.
 */
function fitAxis(
  radius: number,
  tanHalfFov: number,
  [lo, hi]: [number, number],
): { distance: number; centerRatio: number } {
  const halfSpan = (tanHalfFov * (hi - lo)) / 2
  const worstBoundary = Math.max(lo * lo, hi * hi) * tanHalfFov * tanHalfFov
  return {
    distance: (radius * Math.sqrt(1 + worstBoundary)) / halfSpan,
    centerRatio: ((lo + hi) / 2) * tanHalfFov,
  }
}

/**
 * Compute the camera distance and off-axis offsets that fit a sphere of
 * `radius` inside `region`.
 *
 * @param fovDeg  Vertical field of view, degrees.
 * @param aspect  Viewport width / height (the real canvas aspect, not a fudged one).
 */
export function fitFraming(
  radius: number,
  fovDeg: number,
  aspect: number,
  region: Region = FULL_REGION,
  safety: number = DEFAULT_SAFETY,
): Framing {
  const tanV = Math.tan(degToRad(fovDeg) / 2)
  const tanH = tanV * aspect

  const horizontal = fitAxis(radius, tanH, region.x)
  const vertical = fitAxis(radius, tanV, region.y)

  // The binding axis sets the distance. The other axis simply gains margin;
  // the centering ratios stay valid either way, since they are ratios of d.
  const distance = Math.max(horizontal.distance, vertical.distance) * safety

  return {
    distance,
    offsetX: horizontal.centerRatio * distance,
    offsetY: vertical.centerRatio * distance,
  }
}

/**
 * Signed distance from the content center to one frustum side plane, in world
 * units. Positive means inside. Used by the fit check and by the tests.
 *
 * `sign` is +1 for a low boundary (interior lies at higher NDC) and -1 for a
 * high boundary.
 */
function planeClearance(
  center: number,
  distance: number,
  boundary: number,
  tanHalfFov: number,
  sign: 1 | -1,
): number {
  const t = boundary * tanHalfFov
  return (sign * (center - t * distance)) / Math.sqrt(1 + t * t)
}

/**
 * Verify a framing actually contains the sphere. Returns the smallest clearance
 * across the four side planes minus the radius — >= 0 means it fits.
 *
 * This is the property the tests assert, expressed independently of how
 * `fitFraming` derives its numbers.
 */
export function fitClearance(
  framing: Framing,
  radius: number,
  fovDeg: number,
  aspect: number,
  region: Region = FULL_REGION,
): number {
  const tanV = Math.tan(degToRad(fovDeg) / 2)
  const tanH = tanV * aspect
  const { distance, offsetX, offsetY } = framing

  const clearances = [
    planeClearance(offsetX, distance, region.x[0], tanH, 1),
    planeClearance(offsetX, distance, region.x[1], tanH, -1),
    planeClearance(offsetY, distance, region.y[0], tanV, 1),
    planeClearance(offsetY, distance, region.y[1], tanV, -1),
  ]

  return Math.min(...clearances) - radius
}

/** Near/far planes that comfortably bracket the content at a given framing. */
export function depthRange(
  distance: number,
  radius: number,
): { near: number; far: number } {
  return {
    near: Math.max(0.1, (distance - radius) * 0.5),
    far: (distance + radius) * 2.5,
  }
}

/** Fraction of the viewport width a desktop text card occupies. */
const CARD_FRACTION = 0.42

/**
 * Default `portraitCardTop`: where the card starts, as a fraction of screen
 * height, before a real per-section measurement is available (first frame,
 * landscape, tests). Not load-bearing for correctness — every caller that
 * matters passes a measured value — just a sane placeholder.
 */
export const DEFAULT_PORTRAIT_CARD_TOP = 0.54

/**
 * Gap kept between the object's lowest point and the card's measured top, so
 * the two don't visually touch even when the fit is otherwise exact.
 */
const PORTRAIT_GAP = 0.03

/**
 * However tall a card gets, the object keeps at least this share of the
 * screen. Below this the free region's height approaches zero, which sends
 * `fitAxis`'s distance toward infinity — a floor here is not a style choice,
 * it keeps the solve well-conditioned. A card taller than the budget this
 * implies (see style.css's mobile block for the sections that needed their
 * content trimmed to fit) will touch the object rather than the reverse.
 */
const MIN_PORTRAIT_OBJECT_SHARE = 0.22

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * The free rectangle left over by the layout, in NDC.
 *
 * Desktop: a text card occupies a vertical strip on one side, so the orrery
 * lives in the opposite strip. Portrait: the card sits along the bottom, so the
 * orrery lives in the upper band whose height is *measured*, not fixed — see
 * below.
 *
 * `cardBias` is continuous — 0 puts the card fully left, 1 fully right — so
 * sections can hand the card from one side to the other and have the camera
 * follow smoothly. Crucially, the *width* of the free region is identical at
 * every bias, only its centre slides. That means the fit guarantee holds
 * throughout the handover, not just at the two ends: at bias 0.5 the region is
 * simply the middle 58% of the screen, which is genuinely free while both cards
 * are mid-crossfade.
 *
 * `portraitCardTop` is the mobile analogue of `cardBias`: where the *current*
 * section's card starts, as a fraction of screen height (0 = top, 1 = bottom),
 * fed in from `core/cardTracker.ts`'s live measurement. A single fixed split
 * was tried first and measured against the built page — some sections' cards
 * started 20-45 percentage points above where a static ~54% boundary assumed,
 * because card height varies hugely with content (a hero's three lines of text
 * versus a section with two full demo lanes are not the same shape). A fixed
 * number cannot fit both without either cropping the tall ones or wasting
 * space above the short ones.
 */
export function layoutRegion(
  aspect: number,
  cardBias: number = 1,
  portraitCardTop: number = DEFAULT_PORTRAIT_CARD_TOP,
): Region {
  const isPortrait = aspect < 1.05

  if (isPortrait) {
    const budget = Math.max(
      MIN_PORTRAIT_OBJECT_SHARE,
      Math.min(1, portraitCardTop) - PORTRAIT_GAP,
    )
    return { x: [-1, 1], y: [1 - 2 * budget, 1] }
  }

  const bias = Math.min(1, Math.max(0, cardBias))
  const cardWidth = CARD_FRACTION * 2 // NDC units

  // Card left  (bias 0) => content occupies [-1 + cardWidth,  1]
  // Card right (bias 1) => content occupies [-1, 1 - cardWidth]
  return {
    x: [lerp(-1 + cardWidth, -1, bias), lerp(1, 1 - cardWidth, bias)],
    y: [-1, 1],
  }
}
