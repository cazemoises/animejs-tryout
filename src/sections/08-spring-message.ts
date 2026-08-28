import { createTimeline, spring, stagger, utils } from 'animejs'
import { SPRING_MESSAGE } from '../content/messages'
import { revealOnEnter, type Section, type SectionContext } from './types'

export const SPRING_MESSAGE_SNIPPET = `
const response = spring({ stiffness: 120, damping: 6 })

createTimeline()
  .add(words, {
    y: ['-2.5em', 0],
    rotateZ: [-8, 0],
    opacity: [0, 1],
    ease: response,
    delay: stagger(90),
  })
`

export function createSpringMessageSection({
  root,
  motion,
}: SectionContext): Section {
  const mount = root.querySelector<HTMLElement>('[data-demo="spring-message"]')
  if (!mount) return { destroy() {} }

  const words = SPRING_MESSAGE.trim().split(/\s+/)
  const wordElements: HTMLSpanElement[] = words.map((word) => {
    const element = document.createElement('span')
    element.className = 'spring-message__word'
    element.textContent = word
    element.setAttribute('aria-hidden', 'true')
    mount.append(element)
    return element
  })
  mount.setAttribute('aria-label', SPRING_MESSAGE)

  const stiffness = 120
  const damping = motion.tier === 'low' ? 18 : motion.tier === 'mid' ? 12 : 6
  const timeline = createTimeline({ autoplay: false })
  timeline.add(wordElements, {
    y: ['-2.5em', 0],
    rotateZ: [-8, 0],
    opacity: [0, 1],
    duration: 1100,
    ease: spring({ stiffness, damping }),
    delay: stagger(motion.tier === 'low' ? 55 : 90),
  })

  const replay = document.createElement('button')
  replay.type = 'button'
  replay.className = 'spring-message__replay'
  replay.textContent = 'repetir'
  replay.setAttribute('aria-label', 'repetir mensagem')
  mount.after(replay)

  const play = (): void => {
    if (motion.reduced) {
      timeline.seek(timeline.duration)
      return
    }
    timeline.seek(0)
    timeline.play()
  }
  const onReplay = (): void => play()
  replay.addEventListener('click', onReplay)

  const observer = revealOnEnter(root, motion, timeline)
  if (motion.reduced) timeline.seek(timeline.duration)

  return {
    destroy() {
      replay.removeEventListener('click', onReplay)
      observer?.disconnect()
      timeline.pause()
      utils.remove(wordElements)
      mount.replaceChildren()
      replay.remove()
    },
  }
}
