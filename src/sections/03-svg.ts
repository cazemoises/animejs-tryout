import { animate, createTimeline, stagger, svg, utils } from 'animejs'
import { ease } from '../core/tokens'
import { revealOnEnter, type Section, type SectionContext } from './types'

/**
 * Technique 3 — draw, then morph.
 *
 * `svg.createDrawable` proxies a stroked element so its `draw` property becomes
 * animatable as a `"start end"` pair along the path, which is what lets the
 * seal write itself instead of fading in. Then `svg.morphTo` retargets the
 * central polygon's points, generating intermediate points so the two outlines
 * do not need matching vertex counts — a heptagon becomes a 14-point star.
 *
 * The geometry is generated here rather than hand-written into the markup:
 * the shapes are defined by radius and vertex count, so they stay consistent
 * and the morph targets cannot drift apart from the base shape.
 */

export const SVG_SNIPPET = `
// 1) o traço se escreve: 'draw' vai de nada a linha inteira
animate(svg.createDrawable('.seal-line'), {
  draw: ['0 0', '0 1'],
  duration: 1400,
  ease: 'inOutQuad',
  delay: stagger(90),
})

// 2) o polígono central troca de identidade.
//    heptágono (7 pontos) -> estrela (14): morphTo gera os
//    pontos intermediários, não precisa casar as contagens.
animate(shape, {
  points: svg.morphTo(starTarget),
  duration: 900,
  ease: 'inOutCirc',
})
`

const NS = 'http://www.w3.org/2000/svg'
const CENTER = 100
const SIDES = 7

const el = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(NS, name)
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value))
  }
  return node
}

const point = (angleDeg: number, radius: number): [number, number] => {
  const radians = ((angleDeg - 90) * Math.PI) / 180
  return [
    CENTER + Math.cos(radians) * radius,
    CENTER + Math.sin(radians) * radius,
  ]
}

const toPoints = (pairs: Array<[number, number]>): string =>
  pairs.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

/** Regular polygon with `sides` vertices. */
const polygon = (sides: number, radius: number): string =>
  toPoints(
    Array.from({ length: sides }, (_, i) => point((i * 360) / sides, radius)),
  )

/** Star with `sides` points, alternating between two radii. */
const star = (sides: number, outer: number, inner: number): string =>
  toPoints(
    Array.from({ length: sides * 2 }, (_, i) =>
      point((i * 360) / (sides * 2), i % 2 === 0 ? outer : inner),
    ),
  )

/** A circle expressed as a path, since `createDrawable` does not take circles. */
const ringPath = (radius: number): string =>
  `M ${CENTER} ${CENTER - radius} ` +
  `A ${radius} ${radius} 0 1 1 ${CENTER - 0.01} ${CENTER - radius} `

export function createSvgSection({ root, motion }: SectionContext): Section {
  const mount = root.querySelector<HTMLElement>('[data-demo="svg"]')
  if (!mount) return { destroy() {} }

  const canvas = el('svg', {
    viewBox: '0 0 200 200',
    class: 'seal',
    'aria-hidden': 'true',
  })

  // --- strokes that draw themselves ---------------------------------------

  const strokes: SVGElement[] = []

  for (const radius of [86, 68]) {
    strokes.push(el('path', { class: 'seal-line', d: ringPath(radius) }))
  }

  // Radial ticks, longer every third one.
  for (let i = 0; i < 24; i++) {
    const angle = (i * 360) / 24
    const long = i % 3 === 0
    const [x1, y1] = point(angle, 68)
    const [x2, y2] = point(angle, long ? 54 : 61)
    strokes.push(el('line', { class: 'seal-line seal-tick', x1, y1, x2, y2 }))
  }

  // Two chords crossing the middle, to give the seal an axis.
  for (const angle of [30, 150]) {
    const [x1, y1] = point(angle, 68)
    const [x2, y2] = point(angle + 180, 68)
    strokes.push(el('line', { class: 'seal-line', x1, y1, x2, y2 }))
  }

  canvas.append(...strokes)

  // --- morph targets ------------------------------------------------------

  const base = polygon(SIDES, 34)
  const shape = el('polygon', { class: 'seal-shape', points: base })

  // Kept in <defs> so they are parsed and readable but never rendered.
  const defs = el('defs', {})
  const targetBase = el('polygon', { points: base })
  const targetStar = el('polygon', { points: star(SIDES, 42, 17) })
  defs.append(targetBase, targetStar)

  canvas.append(defs, shape)
  mount.append(canvas)

  const drawables = svg.createDrawable(strokes)

  const timeline = createTimeline({ autoplay: false })

  timeline
    .add(drawables, {
      draw: ['0 0', '0 1'],
      duration: 1400,
      ease: ease.draw,
      delay: stagger(90),
    })
    .add(
      shape,
      { opacity: [0, 1], scale: [0.7, 1], duration: 700, ease: ease.seat },
      '-=600',
    )

  const observer = revealOnEnter(root, motion, timeline)

  // --- morph on hover -----------------------------------------------------

  let morphed = false
  let morphing = false

  const toggleMorph = (): void => {
    if (motion.reduced || morphing) return
    morphing = true
    morphed = !morphed

    animate(shape, {
      points: svg.morphTo(morphed ? targetStar : targetBase),
      duration: 900,
      ease: ease.morph,
      onComplete: () => {
        morphing = false
      },
    })
  }

  const onEnter = (): void => toggleMorph()
  const onLeave = (): void => toggleMorph()

  if (!motion.reduced) {
    mount.addEventListener('pointerenter', onEnter)
    mount.addEventListener('pointerleave', onLeave)
  }

  return {
    destroy() {
      mount.removeEventListener('pointerenter', onEnter)
      mount.removeEventListener('pointerleave', onLeave)
      observer?.disconnect()
      timeline.revert()
      utils.remove(shape)
      mount.replaceChildren()
    },
  }
}
