import { createTimeline, stagger, utils } from 'animejs'
import { ease } from '../core/tokens'
import type { Burst } from '../three/burst'
import type { Section, SectionContext } from './types'

/**
 * Technique 6 — mass random() + stagger, with the scene's light responding.
 *
 * One click seeds dozens of DOM shards, each with its own randomised distance,
 * angle, spin, scale and duration, and simultaneously drives a particle burst
 * and a light flash in the 3D scene.
 *
 * The flash is a plain number on a shared state object, not a write to the
 * bloom pass. On tiers without bloom there *is* no pass, and a timeline that
 * animated `bloomPass.strength` directly would either need a guard at every
 * call site or would break outright — including in the case a static guard
 * cannot cover, where the tier is demoted at runtime after the timeline has
 * already been built. The render loop reads the number and decides what it can
 * do with it; the emissive shell picks up the slack when bloom is absent.
 */

export const BURST_SNIPPET = `
// cada fragmento sorteia os próprios valores
animate(shards, {
  x: () => utils.random(-260, 260),
  y: () => utils.random(-220, 220),
  rotate: () => utils.random(-220, 220),
  scale: () => utils.random(4, 14) / 10,
  duration: () => utils.random(700, 1500),
  delay: stagger(9, { from: 'center' }),
  ease: 'outExpo',
})

// a luz da cena responde na MESMA timeline.
// 'flash' é só um número: quem consome é o render loop,
// então o tier sem bloom não quebra nem precisa de guard.
timeline.add(burstState, { flash: [0, 1, 0], duration: 900 }, 0)
`

export type BurstState = {
  /** 0 = at rest, 1 = fully dispersed. Consumed by the render loop. */
  progress: number
  /** 0..1 light response. Becomes bloom strength when a composer exists. */
  flash: number
}

export type BurstSectionContext = SectionContext & {
  state: BurstState
  burst: Burst
  shardCount: number
}

export function createBurstSection({
  root,
  motion,
  state,
  burst,
  shardCount,
}: BurstSectionContext): Section {
  const mount = root.querySelector<HTMLElement>('[data-demo="burst"]')
  if (!mount) return { destroy() {} }

  const arena = document.createElement('button')
  arena.type = 'button'
  arena.className = 'arena'
  arena.setAttribute('aria-label', 'disparar ruptura')

  const hint = document.createElement('span')
  hint.className = 'arena__hint'
  hint.textContent = 'clique'
  arena.append(hint)

  const shards: HTMLElement[] = []
  for (let i = 0; i < shardCount; i++) {
    const shard = document.createElement('i')
    shard.className = 'shard'
    if (i % 5 === 0) shard.classList.add('shard--amber')
    arena.append(shard)
    shards.push(shard)
  }

  mount.append(arena)
  utils.set(shards, { opacity: 0, scale: 0 })

  let running = false

  const fire = (): void => {
    if (motion.reduced || running) return
    running = true

    burst.seed()
    utils.set(shards, { x: 0, y: 0, rotate: 0, scale: 0, opacity: 0 })

    const timeline = createTimeline({
      onComplete: () => {
        running = false
        state.progress = 0
        state.flash = 0
      },
    })

    timeline
      // Per-target functions: every shard resolves its own random values, so
      // dozens of trajectories come out of a single call.
      .add(
        shards,
        {
          x: () => utils.random(-260, 260),
          y: () => utils.random(-220, 220),
          rotate: () => utils.random(-220, 220),
          scale: () => utils.random(4, 14) / 10,
          opacity: [1, 1],
          duration: () => utils.random(700, 1500),
          ease: ease.arrive,
          delay: stagger(9, { from: 'center' }),
        },
        0,
      )
      .add(
        shards,
        {
          opacity: 0,
          duration: () => utils.random(400, 900),
          ease: 'inQuad',
          delay: stagger(9, { from: 'center' }),
        },
        '-=700',
      )
      // The 3D burst and the light response ride the same timeline.
      .add(state, { progress: [0, 1], duration: 1400, ease: 'outQuart' }, 0)
      .add(state, { flash: [0, 1], duration: 180, ease: 'outQuad' }, 0)
      .add(state, { flash: [1, 0], duration: 900, ease: 'inQuad' }, 180)

    if (import.meta.env.DEV) {
      Object.assign(window, { __burstTimeline: timeline })
    }

    hint.textContent = 'de novo'
  }

  const onClick = (): void => fire()
  arena.addEventListener('click', onClick)

  if (motion.reduced) {
    arena.disabled = true
    hint.textContent = 'animação reduzida'
    // Show the shards at rest rather than an empty box.
    utils.set(shards, {
      opacity: 0.5,
      scale: 0.7,
      x: () => utils.random(-140, 140),
      y: () => utils.random(-110, 110),
      rotate: () => utils.random(-40, 40),
    })
  }

  return {
    destroy() {
      arena.removeEventListener('click', onClick)
      utils.remove(shards)
      utils.remove(state)
      mount.replaceChildren()
    },
  }
}
