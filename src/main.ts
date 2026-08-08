import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'
import './style.css'

import * as THREE from 'three'
import { createMotionProfile } from './core/motion'
import { createStage } from './three/stage'
import { createOrrery } from './three/orrery'
import { createBurst } from './three/burst'
import { createPost, type Post } from './three/post'
import { createMaster } from './master'
import { createCardTracker } from './core/cardTracker'
import { mountSections, type BurstState } from './sections'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')
const app = document.querySelector<HTMLElement>('#app')
if (!canvas || !app) throw new Error('missing #stage or #app')

const params = new URLSearchParams(location.search)
const debug = params.has('debug')

// Dev affordance: `?tier=low` to inspect the degraded look on a desktop.
const forcedTier = import.meta.env.DEV ? params.get('tier') : null
const motion = createMotionProfile(
  forcedTier === 'low' || forcedTier === 'high' ? forcedTier : undefined,
)

const stage = createStage(canvas, motion.settings, { debug })
const orrery = createOrrery(motion.settings)
const burst = createBurst(motion.settings)

stage.content.add(orrery.root)
stage.content.add(burst.group)

// Tilt lives on the parent so the idle spin owns `spin.rotation.y` outright.
// Set before measuring, since framing is measured in world space.
stage.content.rotation.set(-0.3, 0, 0.1)

// Measure while fully assembled, then collapse. Doing it the other way round
// would fit the camera to an object that is not there yet.
stage.measureContent()
orrery.collapse()

// Dev affordance: `?sync=0.5` to feel out the scroll catch-up rate live.
const syncOverride = import.meta.env.DEV ? Number(params.get('sync')) : Number.NaN

const master = createMaster(
  orrery,
  motion,
  app,
  Number.isFinite(syncOverride) && syncOverride > 0 ? syncOverride : undefined,
)

const cards = createCardTracker(app)

/**
 * Written by the burst timeline, read here. Deliberately a plain object: on
 * tiers without bloom there is no pass to write to, and after a runtime
 * demotion the pass a timeline captured would be gone. Keeping it a number and
 * deciding what to do with it here means neither case needs a guard inside an
 * animation.
 */
const burstState: BurstState = { progress: 0, flash: 0 }

let post: Post | null = createPost(stage, motion.settings)

const sections = mountSections({
  motion,
  stage,
  orrery,
  master,
  burst,
  burstState,
})

// Splitting text and building demos changes section heights, so the card
// tracker has to re-measure before its first read.
cards.refresh()

/** Radians per second of drift the instrument keeps even when nothing scrolls. */
const IDLE_RATE = 0.14
/** How far a full flash pushes bloom above its resting strength. */
const FLASH_BLOOM_GAIN = 1.6

let idleSpin = 0

stage.onFrame((delta, elapsed) => {
  if (motion.sampleFrame(delta)) {
    stage.applySettings(motion.settings)
    orrery.applySettings(motion.settings)
    burst.applySettings(motion.settings)
    if (!motion.settings.bloom && post) {
      post.dispose()
      post = null
    }
  }

  if (!motion.reduced) idleSpin += delta * IDLE_RATE

  // The one value with two contributors, summed here rather than written twice.
  orrery.spin.rotation.y = idleSpin + THREE.MathUtils.degToRad(master.state.spin)

  orrery.update(motion.reduced ? 0 : elapsed)

  stage.setDolly(master.state.dolly)
  stage.setBackgroundMix(master.state.background)

  // Under reduced motion the render loop does not run, so the camera can never
  // follow a card that changes sides — the instrument would end up sitting
  // under a card further down the page. The stylesheet pins every card to one
  // side in that mode, and the bias is pinned to match.
  stage.setCardBias(motion.reduced ? 1 : cards.bias())

  // The flash is consumed here, where whether a composer exists is known.
  burst.setProgress(burstState.progress)
  burst.setFlash(burstState.flash)
  if (post) {
    post.setStrength(post.baseStrength + burstState.flash * FLASH_BLOOM_GAIN)
  }
})

if (import.meta.env.DEV) {
  Object.assign(window, {
    __orrery: {
      stage,
      orrery,
      master,
      cards,
      motion,
      sections,
      burst,
      burstState,
      get post() {
        return post
      },
    },
  })
}

if (motion.reduced) {
  stage.renderOnce()
  window.addEventListener('resize', () => stage.renderOnce(), { passive: true })
} else {
  stage.start()
}
