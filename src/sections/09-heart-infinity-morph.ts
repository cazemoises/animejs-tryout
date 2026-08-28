import { animate, createTimeline, svg, utils, type JSAnimation } from 'animejs'
import { ease } from '../core/tokens'
import { revealOnEnter, type Section, type SectionContext } from './types'
import { HEART_PATH, INFINITY_PATH } from './heartInfinityPaths'

const NS = 'http://www.w3.org/2000/svg'

export const HEART_INFINITY_SNIPPET = `
const drawable = svg.createDrawable(heart)

timeline
  .add(drawable, { draw: ['0 0', '0 1'], duration: 1600 })
  .add(heart, { d: svg.morphTo(infinity), duration: 1500 }, '+=350')
`

export function createHeartInfinitySection({
  root,
  motion,
}: SectionContext): Section {
  const mount = root.querySelector<HTMLElement>('[data-demo="heart-infinity"]')
  if (!mount) return { destroy() {} }

  const canvas = document.createElementNS(NS, 'svg')
  canvas.setAttribute('viewBox', '0 0 200 200')
  canvas.setAttribute('class', 'heart-infinity')
  canvas.setAttribute('aria-hidden', 'true')

  const heart = document.createElementNS(NS, 'path')
  heart.setAttribute('class', 'heart-infinity__path')
  heart.setAttribute('d', HEART_PATH)

  const infinity = document.createElementNS(NS, 'path')
  infinity.setAttribute('d', INFINITY_PATH)
  infinity.setAttribute('visibility', 'hidden')

  canvas.append(heart, infinity)
  mount.append(canvas)

  const timeline = createTimeline({ autoplay: false })
  timeline
    .add(svg.createDrawable(heart), {
      draw: ['0 0', '0 1'],
      duration: 1600,
      ease: ease.draw,
    })
    .add(
      heart,
      { d: svg.morphTo(infinity), duration: 1500, ease: ease.morph },
      '+=350',
    )

  let pulse: JSAnimation | null = null
  const startPulse = (): void => {
    pulse?.pause()
    pulse = animate(heart, {
      strokeWidth: [2, 2.7, 2],
      opacity: [0.78, 1, 0.78],
      duration: 2200,
      ease: 'inOutSine',
      loop: true,
    })
  }
  const play = (): void => {
    if (motion.reduced) {
      timeline.seek(timeline.duration)
      startPulse()
      return
    }
    pulse?.pause()
    timeline.seek(0)
    timeline.play()
    timeline.then(startPulse)
  }

  const replay = document.createElement('button')
  replay.type = 'button'
  replay.className = 'heart-infinity__replay'
  replay.textContent = 'repetir'
  replay.setAttribute('aria-label', 'repetir desenho do coração')
  mount.after(replay)
  const onReplay = (): void => play()
  replay.addEventListener('click', onReplay)

  const observer = revealOnEnter(root, motion, timeline)
  if (motion.reduced) {
    timeline.seek(timeline.duration)
    startPulse()
  }

  return {
    destroy() {
      replay.removeEventListener('click', onReplay)
      observer?.disconnect()
      pulse?.pause()
      timeline.pause()
      utils.remove(heart)
      mount.replaceChildren()
      replay.remove()
    },
  }
}
