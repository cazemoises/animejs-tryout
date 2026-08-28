import * as THREE from 'three'
import { hex } from '../core/tokens'
import type { TierSettings } from '../core/motion'
import { excludeFromFraming } from './stage'
import {
  calculateOrbitalPosition,
  growOrbitRadius,
  transitionParticlesToTargets,
  type Point3,
} from './binaryConstellationMath'

export type ConstellationMemory = {
  id: string
  label: string
  position: Point3
}

export type BinaryConstellation = {
  group: THREE.Group
  update(elapsed: number): void
  setStage(stage: number): void
  reveal(): void
  hide(): void
  applySettings(settings: TierSettings): void
  dispose(): void
}

export const MOCK_MEMORIES: readonly ConstellationMemory[] = [
  { id: 'first-light', label: 'primeira luz', position: { x: -2.1, y: 1.15, z: -0.3 } },
  { id: 'shared-sky', label: 'mesmo ceu', position: { x: 1.8, y: 1.45, z: -0.8 } },
  { id: 'always', label: 'sempre', position: { x: 2.15, y: -1.25, z: 0.4 } },
]

const HEART_TARGETS: readonly Point3[] = [
  { x: -0.9, y: 0.45, z: 0 }, { x: -0.45, y: 0.8, z: 0 }, { x: 0, y: 0.45, z: 0 },
  { x: 0.45, y: 0.8, z: 0 }, { x: 0.9, y: 0.45, z: 0 }, { x: 0.7, y: 0, z: 0 },
  { x: 0.45, y: -0.45, z: 0 }, { x: 0, y: -0.95, z: 0 }, { x: -0.45, y: -0.45, z: 0 },
  { x: -0.7, y: 0, z: 0 },
]

function pointCloud(points: readonly Point3[], color: number, size: number): THREE.Points {
  const positions = new Float32Array(points.flatMap((point) => [point.x, point.y, point.z]))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  return new THREE.Points(geometry, material)
}

export function createBinaryConstellation(settings: TierSettings): BinaryConstellation {
  const group = new THREE.Group()
  group.visible = false
  const center = new THREE.Vector3()
  const stars: Array<{ mesh: THREE.Mesh; phase: number; speed: number; baseRadius: number }> = []
  const disposables: Array<{ dispose(): void }> = []
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item)
    return item
  }

  const starGeometry = track(new THREE.SphereGeometry(0.23, 20, 14))
  const starMaterial = track(new THREE.MeshStandardMaterial({
    color: hex.amber,
    emissive: hex.amber,
    emissiveIntensity: 2,
    roughness: 0.2,
    metalness: 0.1,
  }))
  for (const [phase, speed, baseRadius] of [[0, 0.7, 0.8], [Math.PI, -0.7, 0.8]] as const) {
    const mesh = new THREE.Mesh(starGeometry, starMaterial)
    mesh.castShadow = settings.shadows
    group.add(mesh)
    stars.push({ mesh, phase, speed, baseRadius })
  }

  const orbitMaterial = track(new THREE.LineBasicMaterial({
    color: hex.amber,
    transparent: true,
    opacity: settings.bloom ? 0.22 : 0,
    blending: THREE.AdditiveBlending,
  }))
  const orbitLines: THREE.Line[] = []
  for (const tilt of [0.2, -0.35]) {
    const points = Array.from({ length: 80 }, (_, index) => {
      const point = calculateOrbitalPosition(center, 0.8, (index / 80) * Math.PI * 2, tilt)
      return new THREE.Vector3(point.x, point.y, point.z)
    })
    const geometry = track(new THREE.BufferGeometry().setFromPoints(points))
    const line = new THREE.Line(geometry, orbitMaterial)
    group.add(line)
    orbitLines.push(line)
  }

  const highDetail = settings.burstParticles > 200
  const clusterPoints = MOCK_MEMORIES.flatMap((memory) =>
    Array.from({ length: highDetail ? 8 : 4 }, (_, index) => ({
      x: memory.position.x + Math.cos(index * 2.4) * 0.18,
      y: memory.position.y + Math.sin(index * 2.4) * 0.18,
      z: memory.position.z + (index % 2) * 0.12,
    })),
  )
  const clusters = pointCloud(clusterPoints, hex.cyan, highDetail ? 0.075 : 0.06)
  clusters.userData.memories = MOCK_MEMORIES
  group.add(clusters)

  const freeParticles = Array.from({ length: highDetail ? 120 : 48 }, (_, index) => ({
    x: Math.sin(index * 12.7) * 2.7,
    y: Math.cos(index * 7.3) * 1.9,
    z: Math.sin(index * 4.1) * 1.3,
  }))
  const formationTargets = HEART_TARGETS
  const formation = pointCloud(freeParticles, hex.amber, 0.065)
  group.add(excludeFromFraming(formation))

  let currentStage = 0
  let currentFormation = transitionParticlesToTargets(freeParticles, formationTargets, 0)
  let lastElapsed = 0

  const updateCloud = (cloud: THREE.Points, points: readonly Point3[], opacity: number): void => {
    const position = cloud.geometry.getAttribute('position') as THREE.BufferAttribute
    points.forEach((point, index) => position.setXYZ(index, point.x, point.y, point.z))
    position.needsUpdate = true
    ;(cloud.material as THREE.PointsMaterial).opacity = opacity
  }

  return {
    group,
    update(elapsed) {
      const delta = elapsed - lastElapsed
      lastElapsed = elapsed
      const radius = growOrbitRadius(0.8, 0.045, elapsed)
      stars.forEach((star) => {
        const point = calculateOrbitalPosition(center, radius, star.phase + elapsed * star.speed, 0.2)
        star.mesh.position.set(point.x, point.y, point.z)
      })
      if (currentStage >= 1) {
        ;(clusters.material as THREE.PointsMaterial).opacity = Math.min(1, (currentStage - 1) * 2) * 0.9
      }
      if (currentStage >= 2) {
        const nextProgress = Math.min(1, Math.max(0, currentStage - 2))
        currentFormation = transitionParticlesToTargets(freeParticles, formationTargets, nextProgress)
        updateCloud(formation, currentFormation, nextProgress * 0.95)
      }
      if (delta > 0) orbitLines.forEach((line) => line.rotation.z += delta * 0.04)
    },
    setStage(stage) {
      currentStage = Math.min(3, Math.max(0, stage))
    },
    reveal() {
      group.visible = true
    },
    hide() {
      group.visible = false
    },
    applySettings(next) {
      orbitMaterial.opacity = next.bloom ? 0.22 : 0
    },
    dispose() {
      for (const item of disposables) item.dispose()
    },
  }
}
