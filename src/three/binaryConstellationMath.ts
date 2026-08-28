export type Point3 = { x: number; y: number; z: number }

export function sectionProgress(sectionTop: number, sectionHeight: number, viewportHeight: number): number {
  if (sectionHeight <= 0 || viewportHeight <= 0) return 0
  return Math.min(1, Math.max(0, (viewportHeight - sectionTop) / (viewportHeight + sectionHeight)))
}

export function growOrbitRadius(initialRadius: number, growthPerSecond: number, elapsed: number): number {
  return Math.max(initialRadius, initialRadius + Math.max(0, elapsed) * growthPerSecond)
}

export function calculateOrbitalPosition(
  center: Point3,
  radius: number,
  angle: number,
  tilt: number,
): Point3 {
  const planarX = Math.cos(angle) * radius
  const planarY = Math.sin(angle) * radius
  return {
    x: center.x + planarX,
    y: center.y + planarY * Math.cos(tilt),
    z: center.z + planarY * Math.sin(tilt),
  }
}

export function transitionParticlesToTargets(
  free: readonly Point3[],
  targets: readonly Point3[],
  progress: number,
): Point3[] {
  const amount = Math.min(1, Math.max(0, progress))
  if (targets.length === 0) return free.map((point) => ({ ...point }))
  return free.map((point, index) => {
    const target = targets[index % targets.length] ?? point
    return {
      x: point.x + (target.x - point.x) * amount,
      y: point.y + (target.y - point.y) * amount,
      z: point.z + (target.z - point.z) * amount,
    }
  })
}
