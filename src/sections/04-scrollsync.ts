import * as THREE from 'three'
import { animate, utils } from 'animejs'
import type { Orrery } from '../three/orrery'
import type { Stage } from '../three/stage'
import type { Master } from '../master'
import type { Section, SectionContext } from './types'

/**
 * Technique 4 — a whole timeline bound to scroll.
 *
 * The section does not create the effect; it *exposes* the one already
 * running. Labels are pinned to real 3D parts by leader lines, and a playhead
 * shows where in the master timeline the current scroll position sits.
 *
 * Leader lines are recomputed in `onAfterRender`, every frame — never in a
 * scroll callback. Two reasons:
 *
 *   1. The instrument keeps moving with the page completely still: idle spin,
 *      counter-rotating rings, orbiting nodes. A scroll-driven update would
 *      leave the labels behind whenever the reader stops scrolling.
 *   2. `onAfterRender` runs once world matrices are current for the frame just
 *      drawn. A normal frame callback runs before `renderer.render()`, so it
 *      would project last frame's transforms and put every label exactly one
 *      frame behind the part it points at.
 */

export const SCROLLSYNC_SNIPPET = `
// a timeline INTEIRA amarrada à barra de rolagem
const master = createTimeline({
  autoplay: onScroll({
    target: page,
    enter: { target: 'top', container: 'top' },
    leave: { target: 'bottom', container: 'bottom' },
    sync: 1,            // mapeamento direto, sem catch-up
  }),
})

// rótulos: projetados TODO frame, depois do render
stage.onAfterRender(() => {
  anchor.getWorldPosition(v).project(stage.camera)
  const x = (v.x * 0.5 + 0.5) * innerWidth
  const y = (-v.y * 0.5 + 0.5) * innerHeight
  line.setAttribute('x2', x)
})
`

export type ScrollSyncContext = SectionContext & {
  stage: Stage
  orrery: Orrery
  master: Master
}

const NS = 'http://www.w3.org/2000/svg'
/** Horizontal distance from the screen edge to the label column. */
const COLUMN_INSET = 56

type Leader = {
  key: string
  anchor: THREE.Object3D
  /** Reads 0..1; the label only shows once the part has actually assembled. */
  assembled: () => number
  line: SVGPolylineElement
  dot: SVGCircleElement
  label: SVGTextElement
}

export function createScrollSyncSection({
  root,
  motion,
  stage,
  orrery,
  master,
}: ScrollSyncContext): Section {
  const svg = document.querySelector<SVGSVGElement>('#leaders')
  const mount = root.querySelector<HTMLElement>('[data-demo="sync"]')
  if (!svg) return { destroy() {} }

  const layer = document.createElementNS(NS, 'g')
  layer.setAttribute('class', 'leaders')
  layer.style.opacity = '0'
  svg.append(layer)

  const leaders: Leader[] = orrery.parts.map((part) => {
    const line = document.createElementNS(NS, 'polyline')
    line.setAttribute('class', 'leader__line')

    const dot = document.createElementNS(NS, 'circle')
    dot.setAttribute('class', 'leader__dot')
    dot.setAttribute('r', '2.5')

    const label = document.createElementNS(NS, 'text')
    label.setAttribute('class', 'leader__label')
    label.textContent = part.label

    layer.append(line, dot, label)

    return {
      key: part.key,
      anchor: part.anchor,
      assembled: part.presence,
      line,
      dot,
      label,
    }
  })

  // --- playhead -----------------------------------------------------------

  let playheadFill: HTMLElement | null = null
  let playheadValue: HTMLElement | null = null

  if (mount) {
    const track = document.createElement('div')
    track.className = 'playhead'
    const fill = document.createElement('div')
    fill.className = 'playhead__fill'
    track.append(fill)

    const readout = document.createElement('div')
    readout.className = 'playhead__readout'
    const left = document.createElement('span')
    left.textContent = 'progresso da timeline'
    const value = document.createElement('span')
    value.textContent = '0%'
    readout.append(left, value)

    mount.append(track, readout)
    playheadFill = fill
    playheadValue = value
  }

  // --- visibility ---------------------------------------------------------

  let visible = false
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const next = entry.isIntersecting
        if (next === visible) continue
        visible = next
        if (motion.reduced) {
          layer.style.opacity = next ? '1' : '0'
          // With no render loop running, the callouts would keep whatever
          // positions the single startup frame left them — which is nothing,
          // since this observer only reports visibility after that frame has
          // already been drawn. One frame on demand places them; it starts no
          // loop and animates nothing.
          if (next) stage.renderOnce()
        } else {
          animate(layer, {
            opacity: next ? 1 : 0,
            duration: next ? 520 : 300,
            ease: next ? 'outQuad' : 'inQuad',
          })
        }
      }
    },
    { threshold: 0.35 },
  )
  observer.observe(root)

  // --- per-frame projection ----------------------------------------------

  const world = new THREE.Vector3()
  let lastProgress = -1

  const update = (): void => {
    if (visible) {
      const width = window.innerWidth
      const height = window.innerHeight

      // Labels stack down the side of the screen the instrument is on.
      const onLeft = stage.camera.position.x > 0
      const columnX = onLeft ? COLUMN_INSET : width - COLUMN_INSET
      const anchorX = onLeft ? COLUMN_INSET + 10 : width - COLUMN_INSET - 10

      const usable = height * 0.52
      const top = height * 0.24

      leaders.forEach((leader, index) => {
        const strength = Math.min(1, Math.max(0, leader.assembled()))
        if (strength < 0.06) {
          leader.line.style.opacity = '0'
          leader.dot.style.opacity = '0'
          leader.label.style.opacity = '0'
          return
        }

        leader.anchor.getWorldPosition(world).project(stage.camera)
        const screenX = (world.x * 0.5 + 0.5) * width
        const screenY = (-world.y * 0.5 + 0.5) * height

        const labelY = top + (usable * index) / Math.max(1, leaders.length - 1)
        // Elbow the line so it leaves the label horizontally before turning
        // towards the part, which reads as an instrument callout.
        const elbowX = onLeft
          ? Math.min(anchorX + 46, screenX)
          : Math.max(anchorX - 46, screenX)

        leader.line.setAttribute(
          'points',
          `${anchorX},${labelY} ${elbowX},${labelY} ${screenX},${screenY}`,
        )
        leader.dot.setAttribute('cx', String(screenX))
        leader.dot.setAttribute('cy', String(screenY))
        leader.label.setAttribute('x', String(columnX))
        leader.label.setAttribute('y', String(labelY - 8))
        leader.label.setAttribute('text-anchor', onLeft ? 'start' : 'end')

        const opacity = String(0.28 + strength * 0.55)
        leader.line.style.opacity = opacity
        leader.dot.style.opacity = String(strength)
        leader.label.style.opacity = String(strength)
      })
    }

    const progress = master.timeline.progress
    if (playheadFill && Math.abs(progress - lastProgress) > 0.001) {
      lastProgress = progress
      playheadFill.style.transform = `scaleX(${progress})`
      if (playheadValue) {
        playheadValue.textContent = `${Math.round(progress * 100)}%`
      }
    }
  }

  stage.onAfterRender(update)

  return {
    destroy() {
      observer.disconnect()
      utils.remove(layer)
      layer.remove()
    },
  }
}
