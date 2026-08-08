import * as THREE from 'three'
import { FOV, hex } from '../core/tokens'
import type { TierSettings } from '../core/motion'
import {
  DEFAULT_PORTRAIT_CARD_TOP,
  depthRange,
  fitFraming,
  fitClearance,
  layoutRegion,
  type Framing,
} from './camera'

export type FrameCallback = (delta: number, elapsed: number) => void

/**
 * Mark an object so `measureContent` ignores it. Use for anything that is
 * visually unbounded or much larger than the subject — a shadow-catching floor,
 * a backdrop — which would otherwise inflate the bounding sphere and push the
 * camera far enough back to shrink the subject to nothing.
 */
export function excludeFromFraming<T extends THREE.Object3D>(object: T): T {
  object.userData.noFrame = true
  return object
}

export type Stage = {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  /** Put content here. Its bounding sphere is auto-centred on the origin. */
  readonly content: THREE.Group
  /**
   * Measure the assembled content and lock the framing to it. Call once, with
   * every part present and at full scale — framing must not drift as the
   * orrery assembles. Objects marked with `excludeFromFraming` are skipped.
   */
  measureContent(): void
  /**
   * Where the text card sits: 0 fully left, 1 fully right. Continuous, so a
   * handover between sections slides the framing instead of jumping it.
   */
  setCardBias(bias: number): void
  /**
   * Portrait layout only: where the active section's card starts, as a
   * fraction of screen height. Ignored by `layoutRegion` in landscape, so
   * harmless to call unconditionally.
   */
  setPortraitCardTop(fraction: number): void
  /** 1 = closest fitted framing, >1 pulls back. Never goes below 1. */
  setDolly(multiplier: number): void
  /** 0 → 1 interpolation between the two background ink tones. */
  setBackgroundMix(mix: number): void
  onFrame(callback: FrameCallback): void
  /**
   * Runs immediately after the frame is drawn, when world matrices are current.
   *
   * Anything that reads world transforms — projecting a 3D anchor to screen
   * space for a leader line, say — must run here. A normal frame callback runs
   * *before* the render, so `updateMatrixWorld` has not happened yet and it
   * would read the previous frame's transforms, putting the DOM one frame
   * behind the object it points at.
   */
  onAfterRender(callback: () => void): void
  /** Notified with the new drawing-buffer size whenever the viewport changes. */
  onResize(callback: (width: number, height: number) => void): void
  /**
   * Replace the draw call, e.g. with a post-processing composer. Pass null to
   * go back to rendering the scene directly.
   */
  setRenderOverride(render: (() => void) | null): void
  applySettings(settings: TierSettings): void
  start(): void
  stop(): void
  /** Run the frame callbacks once and render a single frame. */
  renderOnce(): void
  dispose(): void
}

/** Radius fallback before the content has been measured. */
const PROVISIONAL_RADIUS = 3

function applyToneMapping(
  renderer: THREE.WebGLRenderer,
  settings: TierSettings,
): void {
  if (settings.toneMapping === 'neutral') {
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1
  } else {
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
  }
}

/**
 * Tight world-space bounding sphere of everything that must stay on screen,
 * skipping subtrees flagged with `excludeFromFraming`.
 *
 * Unions per-geometry *spheres* rather than boxing everything first. Taking the
 * sphere of a union of AABBs measures to the box's corner, which for this
 * object over-reports the radius by ~60% and pushes the camera needlessly far
 * back — the subject ends up a speck in a correctly-framed void.
 */
function measureFramedSphere(root: THREE.Object3D): THREE.Sphere | null {
  let bounds: THREE.Sphere | null = null
  const scratch = new THREE.Sphere()

  root.updateWorldMatrix(true, true)
  root.traverse((object) => {
    if (object.userData.noFrame) return
    // A flagged group must take its children with it.
    for (let node = object.parent; node; node = node.parent) {
      if (node.userData.noFrame) return
    }

    const geometry = (object as THREE.Mesh | THREE.Points).geometry
    if (!geometry) return

    if (!geometry.boundingSphere) geometry.computeBoundingSphere()
    const local = geometry.boundingSphere
    if (!local || local.radius < 0) return

    scratch.copy(local).applyMatrix4(object.matrixWorld)
    if (bounds) bounds.union(scratch)
    else bounds = scratch.clone()
  })

  return bounds
}

export function createStage(
  canvas: HTMLCanvasElement,
  settings: TierSettings,
  options: { debug?: boolean } = {},
): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  applyToneMapping(renderer, settings)
  renderer.shadowMap.enabled = settings.shadows
  // PCFSoftShadowMap is deprecated in three 0.185; VSM is the supported route
  // to a genuinely soft contact shadow.
  renderer.shadowMap.type = THREE.VSMShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100)

  /**
   * `scene.background`, not `renderer.setClearColor`.
   *
   * The clear colour is written at the GL level with no colour management. In
   * the direct path that is invisible, because the clear lands straight in the
   * output buffer. Behind the composer it lands in a *linear* target and then
   * `OutputPass` tone-maps and sRGB-encodes it a second time, which lifted the
   * near-black background to slate blue on exactly the tier that has bloom.
   * A scene background is colour-managed by three and survives both paths.
   */
  scene.background = new THREE.Color(hex.ink)

  /**
   * `pivot` recentres the content so its bounding sphere sits on the origin;
   * `content` is what callers populate. Keeping them separate means a caller
   * can freely rotate `content` without fighting the recentring offset.
   */
  const pivot = new THREE.Group()
  const content = new THREE.Group()
  pivot.add(content)
  scene.add(pivot)

  let radius = PROVISIONAL_RADIUS
  let cardBias = 1
  let portraitCardTop = DEFAULT_PORTRAIT_CARD_TOP
  let dolly = 1
  let framing: Framing = { distance: 12, offsetX: 0, offsetY: 0 }

  const backgroundNear = new THREE.Color(hex.ink)
  const backgroundFar = new THREE.Color(hex.inkDeep)
  const backgroundCurrent = new THREE.Color(hex.ink)
  let backgroundMix = -1

  // --- lights -------------------------------------------------------------

  const key = new THREE.DirectionalLight(0xdce8ff, 2.4)
  key.position.set(4, 6, 5)
  key.castShadow = settings.shadows
  key.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize)
  key.shadow.bias = -0.0012
  key.shadow.normalBias = 0.02
  key.shadow.radius = 4
  key.shadow.blurSamples = 12
  scene.add(key)
  scene.add(key.target)

  const rim = new THREE.PointLight(hex.amber, 26, 0, 2)
  rim.position.set(-5, -1.5, -3)
  scene.add(rim)

  const coreGlow = new THREE.PointLight(hex.cyan, 8, 0, 2)
  coreGlow.position.set(0, 0, 0)
  scene.add(coreGlow)

  const fill = new THREE.HemisphereLight(0x2a3550, 0x05070c, 0.55)
  scene.add(fill)

  // --- debug bounding sphere ----------------------------------------------

  let debugSphere: THREE.LineSegments | null = null
  if (options.debug) {
    const geometry = new THREE.WireframeGeometry(
      new THREE.SphereGeometry(1, 24, 16),
    )
    debugSphere = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xff3d81, transparent: true, opacity: 0.35 }),
    )
    scene.add(debugSphere)
  }

  // --- framing ------------------------------------------------------------

  function shadowFrustumFromRadius(): void {
    const shadowCamera = key.shadow.camera
    const extent = radius * 1.6
    shadowCamera.left = -extent
    shadowCamera.right = extent
    shadowCamera.top = extent
    shadowCamera.bottom = -extent
    shadowCamera.near = 0.5
    shadowCamera.far = radius * 8
    shadowCamera.updateProjectionMatrix()
  }

  /**
   * Camera looks straight down -Z with zero rotation and is displaced by the
   * negated offsets. That places the content at camera-space
   * (offsetX, offsetY, -distance) — exactly the configuration camera.ts solves
   * for, so the tested guarantee holds at runtime too.
   *
   * Cheap on purpose: the dolly moves every frame, and nothing here invalidates
   * the projection matrix.
   */
  function placeCamera(): void {
    camera.position.set(
      -framing.offsetX * dolly,
      -framing.offsetY * dolly,
      framing.distance * dolly,
    )
  }

  /** Full recompute. Only needed when the viewport, region or radius changes. */
  function applyFraming(): void {
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    const aspect = width / height
    const region = layoutRegion(aspect, cardBias, portraitCardTop)

    framing = fitFraming(radius, FOV, aspect, region)

    const { near, far } = depthRange(framing.distance, radius)
    camera.aspect = aspect
    camera.near = near
    camera.far = far
    camera.rotation.set(0, 0, 0)
    camera.updateProjectionMatrix()
    placeCamera()

    if (import.meta.env.DEV) {
      // Clearance is tightest at the closest dolly position, and setDolly
      // clamps to >= 1, so checking the base framing covers the worst case.
      const clearance = fitClearance(framing, radius, FOV, aspect, region)
      if (clearance < 0) {
        console.warn(
          `[stage] content would be cropped: clearance ${clearance.toFixed(3)} ` +
            `(aspect ${aspect.toFixed(2)})`,
        )
      }
    }

    if (debugSphere) {
      debugSphere.scale.setScalar(radius)
    }
  }

  const resizeCallbacks: Array<(width: number, height: number) => void> = []

  function resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight

    /**
     * `--app-height`, not CSS `100vh`, is what the fixed background layers
     * (`#stage`, `.vignette`, `#leaders` — see style.css) size themselves with.
     *
     * On a real phone `100vh` resolves against the *large* viewport (address
     * bar hidden) while `window.innerHeight` — used right here for the render
     * resolution and by `applyFraming` for the camera's aspect — tracks the
     * *small*, currently-visible one. Measured with a simulated toolbar
     * (LARGE 926 / SMALL 844, an iPhone-sized ~82px gap): a CSS-height canvas
     * decoupled from this value gets stretched 1.10x vertically, inflating the
     * 3D object visually past the frame `fitFraming` calculated as safe — the
     * scene isn't wrong, the box displaying it is the wrong size. Driving the
     * CSS box from this exact number closes that gap: canvas.clientHeight can
     * no longer diverge from the drawing-buffer height, at any toolbar state.
     */
    document.documentElement.style.setProperty('--app-height', `${height}px`)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxPixelRatio))
    renderer.setSize(width, height, false)
    applyFraming()
    for (const callback of resizeCallbacks) callback(width, height)
  }

  // --- loop ---------------------------------------------------------------

  const frameCallbacks: FrameCallback[] = []
  const afterRenderCallbacks: Array<() => void> = []
  const timer = new THREE.Timer()
  let running = false
  let renderOverride: (() => void) | null = null

  function draw(): void {
    if (renderOverride) renderOverride()
    else renderer.render(scene, camera)
  }

  function tick(): void {
    timer.update()
    const delta = timer.getDelta()
    const elapsed = timer.getElapsed()
    for (const callback of frameCallbacks) callback(delta, elapsed)
    draw()
    for (const callback of afterRenderCallbacks) callback()
  }

  const onResize = () => resize()
  window.addEventListener('resize', onResize, { passive: true })
  // `window`'s own 'resize' has historically been inconsistent on mobile
  // Safari specifically for toolbar-driven size changes; `visualViewport`'s
  // resize event is the platform's purpose-built signal for exactly that and
  // is a no-op safety net everywhere else.
  window.visualViewport?.addEventListener('resize', onResize, { passive: true })
  resize()

  return {
    scene,
    camera,
    renderer,
    content,

    measureContent() {
      const sphere = measureFramedSphere(content)
      if (!sphere) return

      // Recentre so the bounding sphere's centre is the world origin, which is
      // the assumption baked into the framing math.
      pivot.position.copy(sphere.center).multiplyScalar(-1)
      radius = sphere.radius
      key.target.position.set(0, 0, 0)
      shadowFrustumFromRadius()
      applyFraming()

      if (import.meta.env.DEV) {
        console.info(`[stage] content radius ${radius.toFixed(3)}`)
      }
    },

    setCardBias(bias) {
      const next = Math.min(1, Math.max(0, bias))
      if (Math.abs(next - cardBias) < 1e-4) return
      cardBias = next
      // The region's centre moved, so the framing genuinely has to be resolved
      // again — but its width did not, so the fit guarantee still holds.
      applyFraming()
    },

    setPortraitCardTop(fraction) {
      const next = Math.min(1, Math.max(0, fraction))
      if (Math.abs(next - portraitCardTop) < 1e-3) return
      portraitCardTop = next
      applyFraming()
    },

    setDolly(multiplier) {
      const next = Math.max(1, multiplier)
      if (next === dolly) return
      dolly = next
      placeCamera()
    },

    setBackgroundMix(mix) {
      const next = Math.min(1, Math.max(0, mix))
      if (Math.abs(next - backgroundMix) < 1e-3) return
      backgroundMix = next
      backgroundCurrent.copy(backgroundNear).lerp(backgroundFar, next)
      // Mutating the scene's background colour keeps it colour-managed; going
      // back through setClearColor here would reintroduce the composer washout.
      ;(scene.background as THREE.Color).copy(backgroundCurrent)
    },

    onFrame(callback) {
      frameCallbacks.push(callback)
    },

    onAfterRender(callback) {
      afterRenderCallbacks.push(callback)
    },

    onResize(callback) {
      resizeCallbacks.push(callback)
    },

    setRenderOverride(render) {
      renderOverride = render
    },

    applySettings(next) {
      renderer.shadowMap.enabled = next.shadows
      key.castShadow = next.shadows
      key.shadow.mapSize.set(next.shadowMapSize, next.shadowMapSize)
      applyToneMapping(renderer, next)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.maxPixelRatio))
      resize()
    },

    start() {
      if (running) return
      running = true
      timer.reset()
      renderer.setAnimationLoop(tick)
    },

    stop() {
      running = false
      renderer.setAnimationLoop(null)
    },

    renderOnce() {
      timer.update()
      for (const callback of frameCallbacks) callback(0, timer.getElapsed())
      draw()
      for (const callback of afterRenderCallbacks) callback()
    },

    dispose() {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      renderer.setAnimationLoop(null)
      renderer.dispose()
    },
  }
}
