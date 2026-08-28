import { describe, expect, it } from 'vitest'
import {
  HEART_PATH,
  INFINITY_PATH,
  MORPH_POINT_COUNT,
  createHeartPath,
  createInfinityPath,
} from './heartInfinityPaths'

function pointCount(path: string): number {
  return (path.match(/[ML]\s/g) ?? []).length
}

describe('heart and infinity morph paths', () => {
  it('creates both paths with the same control-point count', () => {
    expect(pointCount(HEART_PATH)).toBe(MORPH_POINT_COUNT)
    expect(pointCount(INFINITY_PATH)).toBe(MORPH_POINT_COUNT)
  })

  it('allows a shared configurable sample count', () => {
    expect(pointCount(createHeartPath(12))).toBe(12)
    expect(pointCount(createInfinityPath(12))).toBe(12)
  })
})
