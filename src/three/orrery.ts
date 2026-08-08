import * as THREE from 'three'
import { hex } from '../core/tokens'
import type { TierSettings } from '../core/motion'
import { excludeFromFraming } from './stage'

/**
 * The orrery: a nested gimbal instrument. Three assemblies on orthogonal axes
 * around an emissive core, plus orbiting nodes and a halo.
 *
 * Ownership rule for every animatable property here — exactly one writer:
 *
 *   anime.js (three adapter)   scale, emissiveIntensity, opacity  (assembly)
 *   render loop                spin.rotation.y, per-ring idle spin, node
 *                              orbits, halo billboard
 *
 * `spin.rotation.y` is the one value with two conceptual sources (idle drift +
 * scroll rotation), so it is summed in the loop from a plain state object
 * rather than written by an animation.
 */

export type PartKey = 'core' | 'cage' | 'ringX' | 'ringZ' | 'nodes' | 'halo'

export type OrreryPart = {
  key: PartKey
  /** Shown next to the object in the scroll-sync section. */
  label: string
  /**
   * Empty object marking where the leader line should touch the part.
   *
   * Deliberately a point *on* the geometry, parented to whichever group
   * carries that part's motion — not the part itself. `getWorldPosition`
   * returns an object's origin, and the core, both rings and the halo are all
   * centred on (0,0,0), so anchoring to the parts themselves collapsed every
   * label onto the same pixel and, because an origin does not move under
   * rotation, left the lines frozen while the instrument spun.
   */
  anchor: THREE.Object3D
  /** 0..1 — how far this part has assembled. Labels fade in with it. */
  presence(): number
}

export type Orrery = {
  root: THREE.Group
  /** Carries the summed idle + scroll rotation. Nothing else writes to it. */
  spin: THREE.Group
  core: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>
  cage: THREE.LineSegments
  ringX: THREE.Group
  ringZ: THREE.Group
  nodes: THREE.Mesh[]
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  parts: OrreryPart[]
  /**
   * Collapse every assembled part to its pre-assembly state.
   *
   * Parts are *built* at full scale so the framing can measure the assembled
   * object — measuring a collapsed orrery would fit the camera to nothing. Call
   * this once, after `stage.measureContent()` and before the first render, so
   * the opening frame is deterministic instead of depending on when the scroll
   * observer first seeks the timeline.
   */
  collapse(): void
  /** Re-apply tier-dependent look. Safe to call after a runtime demotion. */
  applySettings(settings: TierSettings): void
  /** Advance idle-only motion. Assembly progress is anime.js's business. */
  update(elapsed: number): void
  dispose(): void
}

const CORE_RADIUS = 0.55
const CAGE_RADIUS = 0.82
const RING_X_RADIUS = 1.5
const RING_Z_RADIUS = 2.1
const HALO_INNER = 2.7
const HALO_OUTER = 2.75
const NODE_ORBIT = 1.85

/**
 * An empty marker at a point on a part's geometry. Carries no geometry, so
 * `measureFramedSphere` ignores it and the framing is unaffected.
 */
function anchorOn(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
): THREE.Object3D {
  const anchor = new THREE.Object3D()
  anchor.position.set(x, y, z)
  parent.add(anchor)
  return anchor
}

export function createOrrery(settings: TierSettings): Orrery {
  const root = new THREE.Group()
  const spin = new THREE.Group()
  root.add(spin)

  const disposables: Array<{ dispose(): void }> = []
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item)
    return item
  }

  // --- core ---------------------------------------------------------------

  const coreGeometry = track(new THREE.IcosahedronGeometry(CORE_RADIUS, 3))
  /**
   * The tier scale lives in the emissive *colour*, not in `emissiveIntensity`.
   *
   * That keeps the ownership rule intact: the timeline animates
   * `emissiveIntensity` from 0 to 1 through the adapter and is its only writer,
   * while the tier owns the colour and can rescale it at any time — including
   * after a runtime demotion — without the two ever writing the same property.
   */
  const coreEmissiveBase = new THREE.Color(hex.cyan)
  const coreMaterial = track(
    new THREE.MeshStandardMaterial({
      color: 0x081a22,
      emissive: hex.cyan,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0.15,
    }),
  )
  const core = new THREE.Mesh(coreGeometry, coreMaterial)
  core.castShadow = settings.shadows
  spin.add(core)

  // --- cage ---------------------------------------------------------------

  const cageGeometry = track(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(CAGE_RADIUS, 1)),
  )
  const cageMaterial = track(
    new THREE.LineBasicMaterial({
      color: hex.cyan,
      transparent: true,
      opacity: 0,
    }),
  )
  const cage = new THREE.LineSegments(cageGeometry, cageMaterial)
  spin.add(cage)

  // --- shared metal -------------------------------------------------------

  const metal = track(
    new THREE.MeshStandardMaterial({
      color: hex.steel,
      roughness: 0.25,
      metalness: 0.96,
    }),
  )
  const brass = track(
    new THREE.MeshStandardMaterial({
      color: hex.amber,
      emissive: hex.amber,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.8,
    }),
  )

  // --- ring X: toothed band on the vertical axis --------------------------

  const ringX = new THREE.Group()
  ringX.rotation.x = Math.PI / 2
  spin.add(ringX)

  const ringXBand = new THREE.Mesh(
    track(new THREE.TorusGeometry(RING_X_RADIUS, 0.028, 16, 200)),
    metal,
  )
  ringXBand.castShadow = settings.shadows
  ringX.add(ringXBand)

  const TEETH = 24
  const toothGeometry = track(new THREE.BoxGeometry(0.05, 0.14, 0.05))
  const teeth = new THREE.InstancedMesh(toothGeometry, metal, TEETH)
  teeth.castShadow = settings.shadows
  const matrix = new THREE.Matrix4()
  const euler = new THREE.Euler()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  for (let i = 0; i < TEETH; i++) {
    const angle = (i / TEETH) * Math.PI * 2
    position.set(Math.cos(angle) * RING_X_RADIUS, Math.sin(angle) * RING_X_RADIUS, 0)
    euler.set(0, 0, angle)
    quaternion.setFromEuler(euler)
    matrix.compose(position, quaternion, one)
    teeth.setMatrixAt(i, matrix)
  }
  teeth.instanceMatrix.needsUpdate = true
  ringX.add(teeth)

  // --- ring Z: outer band with brass markers ------------------------------

  const ringZ = new THREE.Group()
  ringZ.rotation.y = Math.PI / 2.6
  spin.add(ringZ)

  const ringZBand = new THREE.Mesh(
    track(new THREE.TorusGeometry(RING_Z_RADIUS, 0.02, 14, 240)),
    metal,
  )
  ringZBand.castShadow = settings.shadows
  ringZ.add(ringZBand)

  const markerGeometry = track(new THREE.SphereGeometry(0.07, 16, 12))
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6
    const marker = new THREE.Mesh(markerGeometry, brass)
    marker.position.set(
      Math.cos(angle) * RING_Z_RADIUS,
      Math.sin(angle) * RING_Z_RADIUS,
      0,
    )
    marker.castShadow = settings.shadows
    ringZ.add(marker)
  }

  // --- orbiting nodes -----------------------------------------------------

  const nodeGeometry = track(new THREE.SphereGeometry(0.075, 20, 14))
  const nodeMaterial = track(
    new THREE.MeshStandardMaterial({
      color: 0x0c2b33,
      emissive: hex.cyan,
      emissiveIntensity: 1.8,
      roughness: 0.4,
      metalness: 0.2,
    }),
  )

  const nodes: THREE.Mesh[] = []
  const nodeOrbits: Array<{ tilt: number; phase: number; speed: number; radius: number }> = []
  for (let i = 0; i < settings.orbitNodes; i++) {
    // Individual meshes rather than an InstancedMesh: there are only a handful,
    // each needs its own anchor for the leader lines, and the three adapter
    // animates plain Object3D scale directly.
    const node = new THREE.Mesh(nodeGeometry, nodeMaterial)
    node.castShadow = settings.shadows
    spin.add(node)
    nodes.push(node)
    nodeOrbits.push({
      tilt: (i / settings.orbitNodes) * Math.PI - Math.PI / 2,
      phase: (i / settings.orbitNodes) * Math.PI * 2,
      speed: 0.22 + (i % 3) * 0.06,
      radius: NODE_ORBIT + (i % 2) * 0.22,
    })
  }

  // --- halo ---------------------------------------------------------------

  const haloBase = new THREE.Color(hex.cyan)
  const haloGeometry = track(new THREE.RingGeometry(HALO_INNER, HALO_OUTER, 160))
  const haloMaterial = track(
    new THREE.MeshBasicMaterial({
      color: hex.cyan,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  // Outside `spin`: the halo faces the camera and must not inherit the
  // instrument's rotation.
  const halo = new THREE.Mesh(haloGeometry, haloMaterial)
  root.add(halo)

  // --- shadow catcher -----------------------------------------------------

  const floorGeometry = track(new THREE.PlaneGeometry(16, 16))
  const floorMaterial = track(new THREE.ShadowMaterial({ opacity: 0.42 }))
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -2.85
  floor.receiveShadow = true
  root.add(excludeFromFraming(floor))

  // --- idle motion --------------------------------------------------------

  const orbitPosition = new THREE.Vector3()
  const billboard = new THREE.Quaternion()

  // Establish the tier-dependent look before the first render.
  coreMaterial.emissive.copy(coreEmissiveBase).multiplyScalar(settings.coreEmissive)
  haloMaterial.color.copy(haloBase).multiplyScalar(settings.bloom ? 1 : 1.4)
  nodeMaterial.emissiveIntensity = settings.bloom ? 1.8 : 1.15

  return {
    root,
    spin,
    core,
    cage,
    ringX,
    ringZ,
    nodes,
    halo,

    parts: [
      {
        key: 'core',
        label: 'núcleo',
        // Deliberately off the Y axis: a point sitting on the axis of the
        // idle spin never moves, so its label would sit dead still while
        // everything around it turned.
        anchor: anchorOn(core, CORE_RADIUS * 0.72, CORE_RADIUS * 0.72, 0),
        presence: () => core.scale.x,
      },
      {
        key: 'ringX',
        label: 'anel primário',
        // Parented to the ring group, so the anchor rides its rotation.
        anchor: anchorOn(ringX, RING_X_RADIUS, 0, 0),
        presence: () => ringX.scale.x,
      },
      {
        key: 'ringZ',
        label: 'anel secundário',
        anchor: anchorOn(ringZ, RING_Z_RADIUS, 0, 0),
        presence: () => ringZ.scale.x,
      },
      {
        key: 'nodes',
        label: 'nós orbitais',
        anchor: nodes[0] ?? core,
        presence: () => nodes[0]?.scale.x ?? 0,
      },
      {
        key: 'halo',
        label: 'halo',
        anchor: anchorOn(halo, HALO_OUTER, 0, 0),
        presence: () => haloMaterial.opacity / 0.55,
      },
    ],

    applySettings(next) {
      coreMaterial.emissive.copy(coreEmissiveBase).multiplyScalar(next.coreEmissive)

      // Same split for the halo: the timeline owns `opacity`, so the tier
      // adjusts brightness through the colour instead. Without bloom the halo
      // loses the spill that sold it as light and has to carry more itself.
      haloMaterial.color.copy(haloBase).multiplyScalar(next.bloom ? 1 : 1.4)

      // Nothing animates the nodes' emissive, so this one is a plain write.
      nodeMaterial.emissiveIntensity = next.bloom ? 1.8 : 1.15
    },

    collapse() {
      core.scale.setScalar(0)
      cage.scale.setScalar(0)
      cageMaterial.opacity = 0
      ringX.scale.setScalar(0)
      ringZ.scale.setScalar(0)
      for (const node of nodes) node.scale.setScalar(0)
      halo.scale.setScalar(0.6)
      haloMaterial.opacity = 0
      coreMaterial.emissiveIntensity = 0
    },

    update(elapsed) {
      // Billboard the halo. The camera has zero rotation by construction, so
      // "facing the camera" means "world rotation identity", which is the
      // inverse of whatever the parent chain contributes.
      if (halo.parent) {
        halo.parent.getWorldQuaternion(billboard).invert()
        halo.quaternion.copy(billboard)
      }

      // Each assembly drifts on its own axis. These are single-source writes
      // that never collide with the assembly tweens, which touch only `scale`.
      ringX.rotation.z = elapsed * 0.12
      ringZ.rotation.z = -elapsed * 0.08
      cage.rotation.y = -elapsed * 0.3
      cage.rotation.x = elapsed * 0.14

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const orbit = nodeOrbits[i]
        if (!node || !orbit) continue
        const angle = orbit.phase + elapsed * orbit.speed * Math.PI
        orbitPosition.set(
          Math.cos(angle) * orbit.radius,
          Math.sin(angle) * orbit.radius * Math.sin(orbit.tilt),
          Math.sin(angle) * orbit.radius * Math.cos(orbit.tilt),
        )
        node.position.copy(orbitPosition)
      }
    },

    dispose() {
      for (const item of disposables) item.dispose()
      teeth.dispose()
    },
  }
}
