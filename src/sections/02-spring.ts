import { createDraggable, spring, utils, type Draggable } from 'animejs'
import type { Section, SectionContext } from './types'

/**
 * Technique 2 — real spring physics on release.
 *
 * Two identical masses, two opposite temperaments. Dragging either and letting
 * go runs `createSpring` as the release easing, so the return is simulated
 * rather than eased along a fixed curve — the overshoot and settling time fall
 * out of stiffness and damping instead of being drawn by hand.
 *
 * The response curve beside each mass is sampled from the very same `Spring`
 * instance that the draggable uses, so it cannot describe a curve the physics
 * is not actually running.
 */

export const SPRING_SNIPPET = `
createDraggable(ball, {
  container: track,
  releaseEase: spring({ stiffness, damping }),
})

// a curva desenhada ao lado vem da MESMA instância:
const response = spring({ stiffness, damping })
const points = samples.map((t) => response.ease(t))
`

type Preset = {
  key: string
  label: string
  stiffness: number
  damping: number
}

/**
 * Damping ratio ζ = c / (2·√(k·m)) decides the character:
 *   ζ ≈ 0.27 — clearly underdamped, several visible bounces
 *   ζ ≈ 0.92 — nearly critical, arrives and stops
 */
const PRESETS: Preset[] = [
  { key: 'loose', label: 'elástica', stiffness: 120, damping: 6 },
  { key: 'tight', label: 'seca', stiffness: 200, damping: 26 },
]

const CURVE_SAMPLES = 72

/** Draw a spring's normalised response as an SVG polyline. */
function plotSpring(svg: SVGSVGElement, stiffness: number, damping: number): void {
  const response = spring({ stiffness, damping })
  const polyline = svg.querySelector('polyline')
  if (!polyline) return

  const width = 100
  const height = 40
  // Springs overshoot past 1, so the plot is scaled to the actual peak rather
  // than clipping the interesting part off the top.
  let peak = 1
  const values: number[] = []
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const value = response.ease(i / CURVE_SAMPLES)
    values.push(value)
    peak = Math.max(peak, value)
  }

  const headroom = peak * 1.08
  const points = values
    .map((value, i) => {
      const x = (i / CURVE_SAMPLES) * width
      const y = height - (value / headroom) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  polyline.setAttribute('points', points)
}

export function createSpringSection({ root, motion }: SectionContext): Section {
  const mount = root.querySelector<HTMLElement>('[data-demo="spring"]')
  if (!mount) return { destroy() {} }

  const draggables: Draggable[] = []
  const cleanups: Array<() => void> = []

  for (const preset of PRESETS) {
    const lane = document.createElement('div')
    lane.className = 'lane'

    const header = document.createElement('div')
    header.className = 'lane__header'

    const name = document.createElement('span')
    name.className = 'lane__name'
    name.textContent = preset.label

    const readout = document.createElement('span')
    readout.className = 'lane__readout'

    const curve = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    curve.setAttribute('class', 'lane__curve')
    curve.setAttribute('viewBox', '0 0 100 40')
    curve.setAttribute('preserveAspectRatio', 'none')
    const polyline = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'polyline',
    )
    curve.append(polyline)

    header.append(name, readout)

    const track = document.createElement('div')
    track.className = 'lane__track'
    const ball = document.createElement('div')
    ball.className = 'lane__ball'
    ball.setAttribute('role', 'slider')
    ball.setAttribute('aria-label', `massa ${preset.label}`)
    ball.tabIndex = 0
    track.append(ball)

    const controls = document.createElement('div')
    controls.className = 'lane__controls'

    let stiffness = preset.stiffness
    let damping = preset.damping

    const rebuild = (): void => {
      readout.textContent = `k ${stiffness} · c ${damping}`
      plotSpring(curve, stiffness, damping)

      const existing = draggables.findIndex((d) => d.$target === ball)
      if (existing >= 0) {
        draggables[existing]?.revert()
        draggables.splice(existing, 1)
      }

      const draggable = createDraggable(ball, {
        container: track,
        releaseEase: spring({ stiffness, damping }),
      })
      draggables.push(draggable)
    }

    const addSlider = (
      label: string,
      min: number,
      max: number,
      value: number,
      onInput: (next: number) => void,
    ): void => {
      const wrap = document.createElement('label')
      wrap.className = 'slider'
      const text = document.createElement('span')
      text.textContent = label
      const input = document.createElement('input')
      input.type = 'range'
      input.min = String(min)
      input.max = String(max)
      input.value = String(value)
      const handler = (): void => {
        onInput(Number(input.value))
        rebuild()
      }
      input.addEventListener('input', handler)
      cleanups.push(() => input.removeEventListener('input', handler))
      wrap.append(text, input)
      controls.append(wrap)
    }

    addSlider('rigidez', 20, 400, stiffness, (next) => {
      stiffness = next
    })
    addSlider('amortecimento', 3, 60, damping, (next) => {
      damping = next
    })

    lane.append(header, curve, track, controls)
    mount.append(lane)

    rebuild()
  }

  if (motion.reduced) {
    // Dragging is user-initiated so it stays available, but nothing moves on
    // its own and the release is instant rather than a spring oscillation.
    for (const draggable of draggables) draggable.disable()
  }

  return {
    destroy() {
      for (const cleanup of cleanups) cleanup()
      for (const draggable of draggables) draggable.revert()
      utils.remove(mount)
      mount.replaceChildren()
    },
  }
}
