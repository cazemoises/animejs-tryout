import { animate, stagger, utils } from 'animejs'
import { ease } from '../core/tokens'
import { revealOnEnter, type Section, type SectionContext } from './types'

/**
 * Technique 1 — stagger beyond incremental delay.
 *
 * Two uses of the same utility on the same elements:
 *
 *   entrance   `stagger(v, { grid, from: 'center' })` — a wave that knows the
 *              cells are a 2D grid, not a flat list, so it radiates.
 *   cursor     `from: [column, row]` recomputed from the pointer, which turns
 *              the grid into a field that responds to where you are.
 *
 * The cursor pass is what makes the point: `from` accepts a grid coordinate,
 * so "distance from the pointer" costs one line rather than a per-cell
 * distance calculation.
 */

export const STAGGER_SNIPPET = `
// entrada: onda que irradia do centro da grade
animate(cells, {
  scale: [0, 1],
  opacity: [0, 1],
  delay: stagger(60, { grid: [13, 7], from: 'center' }),
  ease: 'outQuint',
})

// hover: stagger distribui VALORES, não só delays.
// cada célula recebe uma escala pela distância até o cursor.
animate(cells, {
  scale:   stagger([1.62, 1], { grid: [13, 7], from: cursorIndex }),
  opacity: stagger([1, 0.3],  { grid: [13, 7], from: cursorIndex }),
  delay:   stagger(12,        { grid: [13, 7], from: cursorIndex }),
  ease: 'outQuint',
  duration: 420,
})
`

const IDLE_SCALE = 1
/** Capped so a peaked dot still fits its grid track without touching its neighbours. */
const PEAK_SCALE = 1.62
const IDLE_OPACITY = 0.3

export function createStaggerSection({ root, motion }: SectionContext): Section {
  const mount = root.querySelector<HTMLElement>('[data-demo="stagger"]')
  if (!mount) return { destroy() {} }

  const [columns, rows] = motion.settings.staggerGrid
  const grid: [number, number] = [columns, rows]
  const total = columns * rows

  mount.style.setProperty('--columns', String(columns))
  mount.style.setProperty('--rows', String(rows))

  const cells: HTMLElement[] = []
  for (let i = 0; i < total; i++) {
    const cell = document.createElement('span')
    cell.className = 'cell'
    mount.append(cell)
    cells.push(cell)
  }

  // --- entrance -----------------------------------------------------------

  const entrance = animate(cells, {
    scale: [0, IDLE_SCALE],
    opacity: [0, IDLE_OPACITY],
    duration: 900,
    ease: ease.track,
    delay: stagger(60, { grid, from: 'center' }),
    autoplay: false,
  })

  const observer = revealOnEnter(root, motion, entrance)

  // --- cursor field -------------------------------------------------------

  let pointerCell = -1
  let queued = -1
  let frame = 0

  const runField = (): void => {
    frame = 0
    if (queued === pointerCell) return
    pointerCell = queued

    if (pointerCell < 0) {
      animate(cells, {
        scale: IDLE_SCALE,
        opacity: IDLE_OPACITY,
        duration: 620,
        ease: ease.rest,
        delay: stagger(10, { grid, from: 'center' }),
      })
      return
    }

    // `stagger` distributes *values*, not only delays. Handing it a range and
    // a grid origin gives every cell a target scale set by its distance from
    // the pointer, so the field holds a real spatial gradient while the cursor
    // rests — staggering the delay alone would send every cell to the same
    // peak and the grid would just flash uniformly.
    animate(cells, {
      scale: stagger([PEAK_SCALE, IDLE_SCALE], { grid, from: pointerCell }),
      opacity: stagger([1, IDLE_OPACITY], { grid, from: pointerCell }),
      duration: 420,
      ease: ease.track,
      delay: stagger(12, { grid, from: pointerCell }),
    })
  }

  const schedule = (): void => {
    if (frame) return
    frame = requestAnimationFrame(runField)
  }

  const onPointerMove = (event: PointerEvent): void => {
    const rect = mount.getBoundingClientRect()
    const column = Math.floor(((event.clientX - rect.left) / rect.width) * columns)
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * rows)
    if (column < 0 || column >= columns || row < 0 || row >= rows) return

    // `from` takes a flat index into the same grid the stagger describes.
    queued = row * columns + column
    schedule()
  }

  const onPointerLeave = (): void => {
    queued = -1
    schedule()
  }

  if (!motion.reduced) {
    mount.addEventListener('pointermove', onPointerMove)
    mount.addEventListener('pointerleave', onPointerLeave)
  }

  return {
    destroy() {
      mount.removeEventListener('pointermove', onPointerMove)
      mount.removeEventListener('pointerleave', onPointerLeave)
      if (frame) cancelAnimationFrame(frame)
      observer?.disconnect()
      utils.remove(cells)
      mount.replaceChildren()
    },
  }
}
