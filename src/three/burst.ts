import * as THREE from 'three'
import { utils } from 'animejs'
import { hex } from '../core/tokens'
import type { TierSettings } from '../core/motion'
import { excludeFromFraming } from './stage'

/**
 * The particle burst for technique 6, plus the emissive shell that carries the
 * flash on tiers without bloom.
 *
 * Every particle gets its own randomised direction, speed, spin and lifetime
 * from `utils.random`, which is the point of the section: one animated scalar
 * drives dozens of individually-seeded trajectories.
 *
 * Nothing here is animated by anime.js directly. The timeline moves a single
 * `progress` number and the render loop calls `setProgress`, so the burst has
 * exactly one writer regardless of tier.
 */

export type Burst = {
  group: THREE.Group
  /** Re-seed every particle. Call on each trigger so no two bursts match. */
  seed(): void
  /** 0 = at rest, 1 = fully dispersed. */
  setProgress(progress: number): void
  /** 0..1 flash used for the emissive shell (and, elsewhere, bloom strength). */
  setFlash(flash: number): void
  applySettings(settings: TierSettings): void
  dispose(): void
}

type Particle = {
  direction: THREE.Vector3
  distance: number
  /** Staggers arrival so the cloud does not move as one rigid shell. */
  lag: number
  size: number
}

const SHELL_RADIUS = 1.05

export function createBurst(settings: TierSettings): Burst {
  const group = new THREE.Group()

  // --- particles ----------------------------------------------------------

  let count = settings.burstParticles
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.PointsMaterial({
    color: hex.cyan,
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  const points = new THREE.Points(geometry, material)
  // Particles fly well past the instrument; letting them drive the framing
  // would zoom the camera out every time the burst fires.
  group.add(excludeFromFraming(points))

  const particles: Particle[] = []

  const seedParticles = (): void => {
    particles.length = 0
    for (let i = 0; i < count; i++) {
      // Uniform direction on the sphere, so the cloud has no seam or pole.
      const theta = utils.random(0, 1000) / 1000 * Math.PI * 2
      const z = utils.random(-1000, 1000) / 1000
      const planar = Math.sqrt(Math.max(0, 1 - z * z))
      particles.push({
        direction: new THREE.Vector3(
          Math.cos(theta) * planar,
          Math.sin(theta) * planar,
          z,
        ),
        distance: utils.random(15, 42) / 10,
        lag: utils.random(0, 45) / 100,
        size: utils.random(4, 13) / 100,
      })
    }
    for (let i = 0; i < count; i++) {
      sizes[i] = particles[i]?.size ?? 0.05
    }
    geometry.getAttribute('size').needsUpdate = true
  }

  seedParticles()

  // --- flash shell --------------------------------------------------------

  const shellMaterial = new THREE.MeshBasicMaterial({
    color: hex.cyan,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  })
  const shellGeometry = new THREE.SphereGeometry(SHELL_RADIUS, 32, 24)
  const shell = new THREE.Mesh(shellGeometry, shellMaterial)
  group.add(excludeFromFraming(shell))

  /**
   * Without bloom there is no spill to read as light, so the shell has to be
   * substantially brighter to register at all. With bloom it stays subtle and
   * lets the pass do the work.
   */
  let shellGain = settings.bloom ? 0.13 : 0.28

  const scratch = new THREE.Vector3()

  return {
    group,

    seed() {
      seedParticles()
    },

    setProgress(progress) {
      const clamped = Math.min(1, Math.max(0, progress))
      material.opacity = clamped <= 0 ? 0 : Math.sin(clamped * Math.PI) * 0.9

      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i]
        if (!particle) continue

        // Each particle's own clock: it only starts once its lag has elapsed,
        // so identical progress still produces a scattered cloud.
        const own = Math.min(1, Math.max(0, (clamped - particle.lag) / (1 - particle.lag)))
        // Ease out per particle — they decelerate as they fly, like debris.
        const eased = 1 - (1 - own) * (1 - own)

        scratch.copy(particle.direction).multiplyScalar(eased * particle.distance)
        positions[i * 3] = scratch.x
        positions[i * 3 + 1] = scratch.y
        positions[i * 3 + 2] = scratch.z
      }

      geometry.getAttribute('position').needsUpdate = true
      geometry.computeBoundingSphere()
    },

    setFlash(flash) {
      const clamped = Math.min(1, Math.max(0, flash))
      shellMaterial.opacity = clamped * shellGain
      // Kept tight: a shell that grows past the rings stops reading as the
      // core flaring and starts reading as a disc laid over the instrument.
      shell.scale.setScalar(1 + clamped * 0.4)
    },

    applySettings(next) {
      shellGain = next.bloom ? 0.13 : 0.28
      if (next.burstParticles < count) {
        // Hide the surplus rather than reallocating buffers mid-run.
        for (let i = next.burstParticles; i < count; i++) sizes[i] = 0
        geometry.getAttribute('size').needsUpdate = true
        count = next.burstParticles
      }
    },

    dispose() {
      geometry.dispose()
      material.dispose()
      shellGeometry.dispose()
      shellMaterial.dispose()
    },
  }
}
