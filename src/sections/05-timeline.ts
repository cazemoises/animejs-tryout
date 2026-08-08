import { createTimeline, stagger, utils } from 'animejs'
import { ease } from '../core/tokens'
import { revealOnEnter, type Section, type SectionContext } from './types'

/**
 * Technique 5 — a choreographed timeline.
 *
 * Five actors take turns telling one abstract story: a line is drawn, it
 * gathers into a mass, the mass is measured, it splits, and the pieces settle
 * into an ordered row. Positions are relative (`'<-=200'`, `'+=120'`, labels)
 * so the sequence stays editable — retiming one beat shifts the rest instead
 * of requiring every later offset to be recalculated by hand.
 *
 * Each beat carries the easing that matches what it represents rather than one
 * house curve applied everywhere.
 */

export const TIMELINE_SNIPPET = `
createTimeline()
  .label('traço')
  .add(rule,   { scaleX: [0, 1], ease: 'inOutExpo', duration: 900 })
  .label('massa')
  .add(blob,   { scale: [0, 1], ease: 'outBack(1.7)' }, '<-=200')
  .add(ticks,  { opacity: [0, 1], delay: stagger(40) }, '+=120')
  .label('ruptura')
  .add(shards, {
    x: stagger([-120, 120]),
    rotate: stagger([-40, 40]),
    ease: 'outQuint',
  }, 'ruptura')
  .add(shards, { y: 0, ease: 'outElastic(1, .55)' }, '+=180')
`

const SHARD_COUNT = 7

export function createTimelineSection({ root, motion }: SectionContext): Section {
  const mount = root.querySelector<HTMLElement>('[data-demo="timeline"]')
  if (!mount) return { destroy() {} }

  const make = (className: string): HTMLElement => {
    const element = document.createElement('div')
    element.className = className
    mount.append(element)
    return element
  }

  const stagePanel = make('beat beat--stage')

  const rule = document.createElement('i')
  rule.className = 'beat__rule'
  stagePanel.append(rule)

  const blob = document.createElement('i')
  blob.className = 'beat__blob'
  stagePanel.append(blob)

  const ticks: HTMLElement[] = []
  for (let i = 0; i < 5; i++) {
    const tick = document.createElement('i')
    tick.className = 'beat__tick'
    tick.style.left = `${12 + i * 19}%`
    stagePanel.append(tick)
    ticks.push(tick)
  }

  const shards: HTMLElement[] = []
  for (let i = 0; i < SHARD_COUNT; i++) {
    const shard = document.createElement('i')
    shard.className = 'beat__shard'
    stagePanel.append(shard)
    shards.push(shard)
  }

  utils.set(rule, { scaleX: 0, opacity: 1 })
  utils.set(blob, { scale: 0 })
  utils.set(ticks, { opacity: 0, scaleY: 0 })
  utils.set(shards, { opacity: 0, x: 0, y: 0, rotate: 0, scale: 0 })

  const timeline = createTimeline({ autoplay: false, loop: true })

  timeline
    // 1 — a line is drawn. Mechanical, no overshoot: it is a measurement.
    .label('traço')
    .add(rule, {
      scaleX: [0, 1],
      duration: 900,
      ease: 'inOutExpo',
    })

    // 2 — matter gathers at the centre. Overshoot: it has mass and inertia.
    .label('massa')
    .add(
      blob,
      { scale: [0, 1], duration: 800, ease: ease.seat },
      '<-=200',
    )

    // 3 — it gets measured. Ticks are instruments: crisp, staggered, no bounce.
    .add(
      ticks,
      {
        opacity: [0, 0.8],
        scaleY: [0, 1],
        duration: 420,
        ease: 'outQuart',
        delay: stagger(40),
      },
      '+=120',
    )

    // 4 — rupture. The blob collapses as the shards take over.
    .label('ruptura')
    .add(blob, { scale: 0, duration: 380, ease: 'inBack' }, 'ruptura')
    .add(
      shards,
      {
        opacity: [0, 1],
        scale: [0, 1],
        x: stagger([-132, 132]),
        y: stagger([-46, 46], { from: 'center' }),
        rotate: stagger([-50, 50]),
        duration: 760,
        ease: ease.track,
        delay: stagger(26),
      },
      'ruptura',
    )
    .add(ticks, { opacity: 0, duration: 300, ease: 'inQuad' }, '<-=200')

    // 5 — the pieces settle into an ordered row. Elastic: they are finding rest.
    .add(
      shards,
      {
        y: 0,
        rotate: 0,
        x: stagger([-132, 132]),
        duration: 1100,
        ease: ease.release,
        delay: stagger(30),
      },
      '+=180',
    )

    // Reset for the loop, quietly.
    .add(
      [rule, ...shards],
      { opacity: 0, duration: 500, ease: 'inQuad' },
      '+=700',
    )
    .add(rule, { scaleX: 0, duration: 1 })
    .add(shards, { x: 0, scale: 0, duration: 1 })
    .add([rule], { opacity: 1, duration: 1 })

  let observer: IntersectionObserver | null = null

  if (motion.reduced) {
    // A looping sequence is precisely what reduced motion asks us not to run.
    // Hold a composed mid-state rather than the cleared final frame, which
    // exists only to reset the loop and would show an empty panel.
    timeline.pause()
    timeline.seek(timeline.duration * 0.55)
  } else {
    observer = revealOnEnter(root, motion, timeline)
  }

  return {
    destroy() {
      observer?.disconnect()
      timeline.revert()
      mount.replaceChildren()
    },
  }
}
