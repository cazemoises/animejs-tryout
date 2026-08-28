import { createTimeline } from 'animejs'
import { ease } from '../core/tokens'
import type { BinaryConstellation } from '../three/binaryConstellation'
import type { Section, SectionContext } from './types'

export const BINARY_CONSTELLATION_SNIPPET = `
timeline
  .add(state, { stage: [0, 1], duration: 1800, ease: 'inOutSine' })
  .add(state, { stage: [1, 2], duration: 1800, ease: 'outQuad' })
  .add(state, { stage: [2, 3], duration: 2200, ease: 'outExpo' })
`

export type BinaryState = {
  stage: number
  dolly: number
}

export type BinarySectionContext = SectionContext & {
  binary: BinaryConstellation
  state: BinaryState
}

export function createBinaryConstellationSection({
  root,
  motion,
  binary,
  state,
}: BinarySectionContext): Section {
  const mount = root.querySelector<HTMLElement>('[data-demo="constellation"]')
  if (!mount) return { destroy() {} }

  const timeline = createTimeline({ autoplay: false })
  timeline
    .add(state, { stage: [0, 1], duration: 1800, ease: ease.glow })
    .add(state, { stage: [1, 2], duration: 1800, ease: ease.arrive }, '-=200')
    .add(state, { stage: [2, 3], duration: 2200, ease: ease.arrive }, '-=200')
    .add(state, { dolly: [1, 1.55], duration: 5800, ease: 'inOutSine' }, 0)

  const observer = motion.reduced ? null : new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      binary.reveal()
      timeline.play()
      observer?.disconnect()
    },
    { threshold: 0.2 },
  )

  if (motion.reduced) {
    binary.reveal()
    timeline.seek(timeline.duration)
  } else {
    observer?.observe(root)
  }

  mount.setAttribute('aria-label', 'revelação da constelação binária')
  return {
    destroy() {
      observer?.disconnect()
      timeline.pause()
      binary.hide()
      binary.dispose()
      mount.replaceChildren()
    },
  }
}
