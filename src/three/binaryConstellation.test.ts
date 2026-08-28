import { describe, expect, it } from 'vitest'
import {
  calculateOrbitalPosition,
  growOrbitRadius,
  transitionParticlesToTargets,
  type Point3,
} from './binaryConstellationMath'

describe('binary constellation math', () => {
  it('calculates a point on a tilted circular orbit', () => {
    expect(
      calculateOrbitalPosition({ x: 1, y: 2, z: 3 }, 2, Math.PI / 2, Math.PI / 2),
    ).toEqual(expect.objectContaining({ x: expect.closeTo(1), y: 2, z: 5 }))
  })

  it('grows the orbit smoothly and never below its initial radius', () => {
    expect(growOrbitRadius(1.5, 0.25, 0)).toBe(1.5)
    expect(growOrbitRadius(1.5, 0.25, 4)).toBe(2.5)
    expect(growOrbitRadius(1.5, 0.25, -2)).toBe(1.5)
  })

  it('moves every free particle toward the corresponding configurable target', () => {
    const free: Point3[] = [
      { x: -2, y: 1, z: 0 },
      { x: 3, y: -1, z: 2 },
    ]
    const targets: Point3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ]

    expect(transitionParticlesToTargets(free, targets, 0.5)).toEqual([
      { x: -1, y: 0.5, z: 0 },
      { x: 2, y: 0, z: 1.5 },
    ])
  })
})
