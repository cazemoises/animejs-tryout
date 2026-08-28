export type PathPoint = {
  x: number
  y: number
}

/** Both symbols are sampled into this many M/L points for point-to-point morphing. */
export const MORPH_POINT_COUNT = 96

function pointsToPath(points: readonly PathPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
    .join(' ')
}

/**
 * The heart uses the classic parametric heart curve, sampled uniformly.
 * The infinity symbol uses a matching figure-eight parameterisation. Both
 * become a path with exactly MORPH_POINT_COUNT line points so anime.js can
 * interpolate every coordinate without inventing geometry.
 */
export function createHeartPath(sampleCount = MORPH_POINT_COUNT): string {
  const points = Array.from({ length: sampleCount }, (_, index) => {
    const t = (index / sampleCount) * Math.PI * 2
    return {
      x: 100 + 16 * Math.sin(t) ** 3,
      y: 96 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    }
  })
  return pointsToPath(points)
}

export function createInfinityPath(sampleCount = MORPH_POINT_COUNT): string {
  const points = Array.from({ length: sampleCount }, (_, index) => {
    const t = (index / sampleCount) * Math.PI * 2
    return {
      x: 100 + 42 * Math.sin(t),
      y: 100 + 22 * Math.sin(2 * t),
    }
  })
  return pointsToPath(points)
}

export const HEART_PATH = createHeartPath()
export const INFINITY_PATH = createInfinityPath()
