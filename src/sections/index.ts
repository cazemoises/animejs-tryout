import { attachCodePanel } from '../core/codePanel'
import type { MotionProfile } from '../core/motion'
import type { Burst } from '../three/burst'
import type { Orrery } from '../three/orrery'
import type { Stage } from '../three/stage'
import type { Master } from '../master'
import { createHeroSection, HERO_SNIPPET } from './00-hero'
import { createStaggerSection, STAGGER_SNIPPET } from './01-stagger'
import { createSpringSection, SPRING_SNIPPET } from './02-spring'
import { createSvgSection, SVG_SNIPPET } from './03-svg'
import { createScrollSyncSection, SCROLLSYNC_SNIPPET } from './04-scrollsync'
import { createTimelineSection, TIMELINE_SNIPPET } from './05-timeline'
import { createBurstSection, BURST_SNIPPET, type BurstState } from './06-burst'
import type { Section, SectionContext } from './types'

export type { BurstState }

export type SectionDeps = {
  motion: MotionProfile
  stage: Stage
  orrery: Orrery
  master: Master
  burst: Burst
  burstState: BurstState
}

type Entry = {
  id: string
  snippet: string
  create: (context: SectionContext, deps: SectionDeps) => Section
}

const ENTRIES: Entry[] = [
  { id: 'hero', snippet: HERO_SNIPPET, create: (c) => createHeroSection(c) },
  { id: 'stagger', snippet: STAGGER_SNIPPET, create: (c) => createStaggerSection(c) },
  { id: 'spring', snippet: SPRING_SNIPPET, create: (c) => createSpringSection(c) },
  { id: 'svg', snippet: SVG_SNIPPET, create: (c) => createSvgSection(c) },
  {
    id: 'sync',
    snippet: SCROLLSYNC_SNIPPET,
    create: (c, d) =>
      createScrollSyncSection({
        ...c,
        stage: d.stage,
        orrery: d.orrery,
        master: d.master,
      }),
  },
  { id: 'sequence', snippet: TIMELINE_SNIPPET, create: (c) => createTimelineSection(c) },
  {
    id: 'burst',
    snippet: BURST_SNIPPET,
    create: (c, d) =>
      createBurstSection({
        ...c,
        state: d.burstState,
        burst: d.burst,
        shardCount: d.motion.settings.burstShards,
      }),
  },
]

export function mountSections(deps: SectionDeps): { destroy(): void } {
  const mounted: Array<{ destroy(): void }> = []

  for (const entry of ENTRIES) {
    const root = document.getElementById(entry.id)
    if (!root) continue

    mounted.push(entry.create({ root, motion: deps.motion }, deps))

    const card = root.querySelector<HTMLElement>('.card')
    if (card) mounted.push(attachCodePanel(card, entry.snippet, deps.motion))
  }

  return {
    destroy() {
      for (const item of mounted) item.destroy()
    },
  }
}
