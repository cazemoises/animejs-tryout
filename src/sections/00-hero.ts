import { createTimeline, splitText, stagger } from 'animejs'
import { ease } from '../core/tokens'
import type { Section, SectionContext } from './types'

/**
 * Technique 0 — cascading typography.
 *
 * Title enters character by character, each one hinged backwards in 3D and
 * swinging down into place. The stagger runs from the centre outwards so the
 * word assembles from its middle rather than reading left to right, which
 * would just look like typing.
 */

export const HERO_SNIPPET = `
const title = splitText('.title', { chars: { class: 'split-char' } })

createTimeline()
  .add(title.chars, {
    rotateX: [-96, 0],          // hinged back, swinging down
    y: ['0.5em', 0],
    opacity: [0, 1],
    duration: 1100,
    ease: 'outExpo',
    delay: stagger(38, { from: 'center' }),
  })
  .add(lede.words, {
    opacity: [0, 1],
    y: ['0.4em', 0],
    delay: stagger(22),
  }, '-=700')
`

export function createHeroSection({ root, motion }: SectionContext): Section {
  const title = root.querySelector<HTMLElement>('[data-split="chars"]')
  const lede = root.querySelector<HTMLElement>('[data-split="words"]')
  if (!title || !lede) return { destroy() {} }

  // `accessible` keeps the original text available to screen readers, so
  // splitting it into spans does not turn the heading into letter soup.
  const titleSplit = splitText(title, {
    chars: { class: 'split-char' },
    accessible: true,
  })
  const ledeSplit = splitText(lede, {
    words: { class: 'split-word' },
    accessible: true,
  })

  const timeline = createTimeline({ autoplay: false })

  timeline
    .add(titleSplit.chars, {
      rotateX: [-96, 0],
      y: ['0.5em', 0],
      opacity: [0, 1],
      duration: 1100,
      ease: ease.arrive,
      delay: stagger(38, { from: 'center' }),
    })
    .add(
      ledeSplit.words,
      {
        opacity: [0, 1],
        y: ['0.4em', 0],
        duration: 700,
        ease: 'outQuart',
        delay: stagger(22),
      },
      '-=700',
    )

  if (motion.reduced) {
    timeline.seek(timeline.duration)
  } else {
    // The hero is above the fold, so it plays on load rather than on scroll.
    timeline.play()
  }

  return {
    destroy() {
      timeline.revert()
      titleSplit.revert()
      ledeSplit.revert()
    },
  }
}
