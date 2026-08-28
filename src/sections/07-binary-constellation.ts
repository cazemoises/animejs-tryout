import { createTimeline } from 'animejs'
import { ease } from '../core/tokens'
import type { BinaryConstellation } from '../three/binaryConstellation'
import type { Section, SectionContext } from './types'
import { sectionProgress } from '../three/binaryConstellationMath'

export const BINARY_CONSTELLATION_SNIPPET = `
timeline
  .add(state, { stage: [0, 1], duration: 1800, ease: 'inOutSine' })
  .add(state, { stage: [1, 2], duration: 1800, ease: 'outQuad' })
  .add(state, { stage: [2, 3], duration: 2200, ease: 'outExpo' })
`

export type BinaryState = {
  stage: number
  dolly: number
  climax: number
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
    .add(state, { stage: [0, 1], duration: 2400, ease: ease.glow }, 0)
    .add(state, { stage: [1, 2], duration: 2400, ease: ease.arrive }, 2400)
    .add(state, { stage: [2, 3], duration: 2400, ease: ease.arrive }, 4800)
    .add(state, { dolly: [1, 1.55], duration: 7200, ease: 'inOutSine' }, 0)
    .add(state, { climax: [0, 1, 0], duration: 2400, ease: ease.glow }, 4800)

  const debugStage = import.meta.env.DEV
    ? Number(new URLSearchParams(location.search).get('debugStage'))
    : Number.NaN
  const debugProgress = debugStage === 1 ? 0.2 : debugStage === 2 ? 0.55 : debugStage === 3 ? 0.92 : null
  let activeProgress = 0

  const applyProgress = (progress: number): void => {
    activeProgress = Math.min(1, Math.max(0, progress))
    binary.reveal()
    timeline.seek(activeProgress * timeline.duration)
  }

  const onScroll = (): void => {
    if (motion.reduced || debugProgress !== null) return
    const rect = root.getBoundingClientRect()
    applyProgress(sectionProgress(rect.top, rect.height, window.innerHeight))
  }

  if (debugProgress !== null) {
    applyProgress(debugProgress)
    root.classList.add('section--debug-stage')
  } else if (motion.reduced) {
    applyProgress(1)
  } else {
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
  }

  mount.setAttribute('aria-label', 'revelação da constelação binária')
  return {
    destroy() {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      timeline.pause()
      binary.hide()
      binary.dispose()
      mount.replaceChildren()
    },
  }
}
