import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import type { TierSettings } from '../core/motion'
import type { Stage } from './stage'

/**
 * Real bloom, via EffectComposer.
 *
 * Selection is by threshold rather than by render layers: on a near-black
 * scene, only the emissive core, the brass markers and the halo ever exceed
 * it, so a second layer pass would be a lot of machinery to reach the same
 * pixels. The trade-off is that bloom cannot be applied to something dark —
 * if that is ever needed, this is the place that has to change.
 *
 * `createPost` returns null when the tier has bloom disabled. Callers must
 * cope with its absence rather than assume it exists; nothing in the burst
 * timeline writes to the pass directly for exactly that reason.
 */

export type Post = {
  /** Base bloom strength, before any burst flash is added. */
  readonly baseStrength: number
  /** Current bloom strength. Exposed so it can be asserted, not guessed at. */
  readonly strength: number
  setStrength(value: number): void
  dispose(): void
}

/**
 * Tuned against the built page, not by eye in isolation.
 *
 * `radius` is what decides whether this reads as a glowing object or as fog:
 * UnrealBloomPass spreads across mip levels, so a wide radius lifts the entire
 * background and eats the vignette. Keeping it tight and the threshold high
 * confines the spill to the few genuinely over-range pixels.
 */
const BASE_STRENGTH = 0.4
const RADIUS = 0.18
const THRESHOLD = 0.95

/**
 * UnrealBloomPass builds its whole mip chain from whatever resolution it's
 * given — it takes a plain `Vector2`, no separate "quality" knob — so the mid
 * tier's cheap bloom is just this same pass fed a smaller number. Scaled to
 * fit `cap` on the long edge, aspect preserved; the exact pixel count doesn't
 * matter; bloom's own softness is what hides the reduced internal resolution.
 */
function cappedBloomResolution(width: number, height: number, cap: number): THREE.Vector2 {
  const longEdge = Math.max(width, height)
  const scale = Math.min(1, cap / longEdge)
  return new THREE.Vector2(Math.round(width * scale), Math.round(height * scale))
}

export function createPost(stage: Stage, settings: TierSettings): Post | null {
  if (!settings.bloom) return null

  const composer = new EffectComposer(stage.renderer)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxPixelRatio))
  composer.setSize(window.innerWidth, window.innerHeight)

  const renderPass = new RenderPass(stage.scene, stage.camera)
  const bloomSize = cappedBloomResolution(
    window.innerWidth,
    window.innerHeight,
    settings.bloomResolutionCap,
  )
  const bloomPass = new UnrealBloomPass(bloomSize, BASE_STRENGTH, RADIUS, THRESHOLD)
  // OutputPass applies tone mapping and colour space conversion at the end of
  // the chain; without it the composer would double-convert and wash out.
  const outputPass = new OutputPass()

  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(outputPass)

  stage.setRenderOverride(() => composer.render())
  stage.onResize((width, height) => {
    composer.setSize(width, height)
    const resized = cappedBloomResolution(width, height, settings.bloomResolutionCap)
    bloomPass.setSize(resized.x, resized.y)
  })

  return {
    baseStrength: BASE_STRENGTH,

    get strength() {
      return bloomPass.strength
    },

    setStrength(value) {
      bloomPass.strength = value
    },

    dispose() {
      stage.setRenderOverride(null)
      bloomPass.dispose()
      composer.dispose()
    },
  }
}
