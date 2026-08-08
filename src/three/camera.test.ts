import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTRAIT_CARD_TOP,
  DEFAULT_SAFETY,
  FULL_REGION,
  depthRange,
  fitClearance,
  fitFraming,
  layoutRegion,
  type Region,
} from './camera'

const FOV = 38
const RADIUS = 2.9 // orrery incl. halo

/** Aspect ratios from tall phone to ultrawide desktop. */
const ASPECTS = [0.42, 0.56, 0.75, 1, 1.33, 1.6, 1.78, 2.2, 3.0]

/** Every multiplier the scroll dolly can apply. 1.0 is the closest approach. */
const DOLLY_STEPS = Array.from({ length: 13 }, (_, i) => 1 + (i * 0.6) / 12)

describe('fitFraming', () => {
  it('fits the sphere at every aspect ratio, full viewport', () => {
    for (const aspect of ASPECTS) {
      const framing = fitFraming(RADIUS, FOV, aspect)
      const clearance = fitClearance(framing, RADIUS, FOV, aspect)
      expect(clearance, `aspect ${aspect}`).toBeGreaterThanOrEqual(0)
    }
  })

  it('fits the sphere inside the real layout region at every aspect', () => {
    for (const aspect of ASPECTS) {
      for (const bias of [0, 1]) {
        const region = layoutRegion(aspect, bias)
        const framing = fitFraming(RADIUS, FOV, aspect, region)
        const clearance = fitClearance(framing, RADIUS, FOV, aspect, region)
        expect(clearance, `aspect ${aspect} / bias ${bias}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('holds the fit through a card handover, not just at the ends', () => {
    // The whole point of a continuous bias: the free region slides across the
    // screen without narrowing, so mid-transition frames are as safe as the
    // endpoints. A naive lerp of the two *framings* would not guarantee this.
    const biases = Array.from({ length: 21 }, (_, i) => i / 20)

    for (const aspect of [1.33, 1.78, 2.2, 3.0]) {
      for (const bias of biases) {
        const region = layoutRegion(aspect, bias)
        const framing = fitFraming(RADIUS, FOV, aspect, region)
        const clearance = fitClearance(framing, RADIUS, FOV, aspect, region)
        expect(clearance, `aspect ${aspect} @ bias ${bias.toFixed(2)}`)
          .toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('keeps the free region the same width at every bias', () => {
    const widthAt = (bias: number) => {
      const { x } = layoutRegion(1.78, bias)
      return x[1] - x[0]
    }
    const reference = widthAt(1)
    for (const bias of [0, 0.25, 0.5, 0.75, 1]) {
      expect(widthAt(bias)).toBeCloseTo(reference, 12)
    }
  })

  it('never crops during the scroll dolly, at any aspect', () => {
    // The dolly only ever pulls back from the fitted distance, so clearance
    // must stay non-negative across the whole travel.
    for (const aspect of ASPECTS) {
      const region = layoutRegion(aspect)
      const base = fitFraming(RADIUS, FOV, aspect, region)

      for (const step of DOLLY_STEPS) {
        // Offsets are ratios of distance, so they scale with the dolly.
        const dollied = {
          distance: base.distance * step,
          offsetX: base.offsetX * step,
          offsetY: base.offsetY * step,
        }
        const clearance = fitClearance(dollied, RADIUS, FOV, aspect, region)
        expect(clearance, `aspect ${aspect} @ dolly ${step.toFixed(2)}`)
          .toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('reduces to radius / sin(halfFov) for a centered full viewport', () => {
    // Square viewport so the horizontal and vertical constraints coincide.
    const framing = fitFraming(RADIUS, FOV, 1, FULL_REGION, 1)
    const expected = RADIUS / Math.sin((FOV * Math.PI) / 180 / 2)
    expect(framing.distance).toBeCloseTo(expected, 10)
    expect(framing.offsetX).toBeCloseTo(0, 12)
    expect(framing.offsetY).toBeCloseTo(0, 12)
  })

  it('is strictly safer than the naive tan() fit', () => {
    // The classic mistake: distance = radius / tan(halfFov). It frames the
    // plane through the sphere's center and crops the silhouette.
    const half = (FOV * Math.PI) / 180 / 2
    const naive = RADIUS / Math.tan(half)
    const framing = fitFraming(RADIUS, FOV, 1, FULL_REGION, 1)

    expect(framing.distance).toBeGreaterThan(naive)
    expect(fitClearance({ distance: naive, offsetX: 0, offsetY: 0 }, RADIUS, FOV, 1))
      .toBeLessThan(0)
  })

  it('pushes the camera off-axis toward the free region, not the screen center', () => {
    const framing = fitFraming(RADIUS, FOV, 1.78, layoutRegion(1.78, 1))

    // Card on the right => free space on the left => content sits at negative X.
    expect(framing.offsetX).toBeLessThan(0)

    const mirrored = fitFraming(RADIUS, FOV, 1.78, layoutRegion(1.78, 0))
    expect(mirrored.offsetX).toBeCloseTo(-framing.offsetX, 10)
    expect(mirrored.distance).toBeCloseTo(framing.distance, 10)

    // Halfway through the handover the content is centred on screen.
    const midway = fitFraming(RADIUS, FOV, 1.78, layoutRegion(1.78, 0.5))
    expect(midway.offsetX).toBeCloseTo(0, 10)
  })

  it('applies the safety margin as real extra clearance', () => {
    const tight = fitFraming(RADIUS, FOV, 1.78, FULL_REGION, 1)
    const padded = fitFraming(RADIUS, FOV, 1.78, FULL_REGION, DEFAULT_SAFETY)

    expect(fitClearance(tight, RADIUS, FOV, 1.78)).toBeCloseTo(0, 9)
    expect(fitClearance(padded, RADIUS, FOV, 1.78)).toBeGreaterThan(0)
    expect(padded.distance / tight.distance).toBeCloseTo(DEFAULT_SAFETY, 10)
  })

  it('grows the distance as the viewport narrows', () => {
    const distances = ASPECTS.map(
      (aspect) => fitFraming(RADIUS, FOV, aspect, FULL_REGION).distance,
    )
    distances.reduce((previous, current) => {
      expect(current).toBeLessThanOrEqual(previous + 1e-9)
      return current
    })
  })
})

describe('depthRange', () => {
  it('brackets the whole sphere with margin at every aspect', () => {
    for (const aspect of ASPECTS) {
      const { distance } = fitFraming(RADIUS, FOV, aspect, layoutRegion(aspect))
      // Worst case for the near plane is the closest dolly position.
      const { near, far } = depthRange(distance, RADIUS)
      expect(near, `near @ ${aspect}`).toBeLessThan(distance - RADIUS)
      expect(far, `far @ ${aspect}`).toBeGreaterThan(distance + RADIUS)
      expect(near).toBeGreaterThan(0)
    }
  })
})

describe('layoutRegion', () => {
  it('uses full width and an upper band in portrait', () => {
    const region: Region = layoutRegion(0.56)
    expect(region.x).toEqual([-1, 1])
    expect(region.y[1]).toBe(1)
    expect(region.y[0]).toBeGreaterThan(-1)
  })

  it('fits the sphere in portrait across the whole range of measured card tops', () => {
    // portraitCardTop is a live per-section DOM measurement (see
    // core/cardTracker.ts), not a hand-picked constant — it can land anywhere
    // from "card fills almost the whole screen" to "card barely dips in from
    // the bottom." The fit guarantee has to hold everywhere in that range, not
    // just at the DEFAULT_PORTRAIT_CARD_TOP the old static split used.
    const cardTops = Array.from({ length: 21 }, (_, i) => i / 20)

    for (const aspect of [0.42, 0.56, 0.75]) {
      for (const cardTop of cardTops) {
        const region = layoutRegion(aspect, 1, cardTop)
        const framing = fitFraming(RADIUS, FOV, aspect, region)
        const clearance = fitClearance(framing, RADIUS, FOV, aspect, region)
        expect(clearance, `aspect ${aspect} @ cardTop ${cardTop.toFixed(2)}`)
          .toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('shrinks the object band as the card claims more of the screen, down to a floor', () => {
    const heightAt = (cardTop: number) => {
      const { y } = layoutRegion(0.56, 1, cardTop)
      return y[1] - y[0]
    }

    // A card starting higher up (smaller cardTop) leaves less room, so the
    // object's band should never be taller than one measured with a lower card.
    const heights = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map(heightAt)
    heights.reduce((previous, current) => {
      expect(current).toBeGreaterThanOrEqual(previous - 1e-9)
      return current
    })

    // Even a card claiming the entire screen (cardTop = 0) leaves the object
    // its floor share, not nothing.
    expect(heightAt(0)).toBeCloseTo(2 * 0.22, 10)
  })

  it('falls back to the documented default when no card top is measured yet', () => {
    const withDefault = layoutRegion(0.56, 1)
    const explicit = layoutRegion(0.56, 1, DEFAULT_PORTRAIT_CARD_TOP)
    expect(withDefault).toEqual(explicit)
  })

  it('leaves the card side free in landscape', () => {
    expect(layoutRegion(1.78, 1).x[1]).toBeLessThan(1)
    expect(layoutRegion(1.78, 0).x[0]).toBeGreaterThan(-1)
  })

  it('clamps out-of-range bias instead of drifting off screen', () => {
    expect(layoutRegion(1.78, -3)).toEqual(layoutRegion(1.78, 0))
    expect(layoutRegion(1.78, 9)).toEqual(layoutRegion(1.78, 1))
  })
})
