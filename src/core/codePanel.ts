import { animate, utils } from 'animejs'
import { ease } from './tokens'
import type { MotionProfile } from './motion'

/**
 * The collapsible "show the code" panel each section carries.
 *
 * Snippets live in TypeScript next to the code they describe rather than in
 * markup, so they cannot drift out of sync with the section they document
 * without someone editing the same file.
 */

export type CodePanel = {
  destroy(): void
}

export function attachCodePanel(
  card: HTMLElement,
  snippet: string,
  motion: MotionProfile,
): CodePanel {
  const wrapper = document.createElement('div')
  wrapper.className = 'code'

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'code__toggle'
  toggle.setAttribute('aria-expanded', 'false')
  toggle.textContent = 'ver código'

  const panel = document.createElement('div')
  panel.className = 'code__panel'
  panel.hidden = true

  const pre = document.createElement('pre')
  const code = document.createElement('code')
  code.textContent = snippet.trim()
  pre.append(code)
  panel.append(pre)

  const panelId = `code-${Math.random().toString(36).slice(2, 8)}`
  panel.id = panelId
  toggle.setAttribute('aria-controls', panelId)

  wrapper.append(toggle, panel)
  card.append(wrapper)

  let open = false

  const onClick = (): void => {
    open = !open
    toggle.setAttribute('aria-expanded', String(open))
    toggle.textContent = open ? 'ocultar código' : 'ver código'

    if (open) panel.hidden = false

    if (motion.reduced) {
      // No height animation, but keep the same end states.
      utils.set(panel, { height: open ? 'auto' : 0, opacity: open ? 1 : 0 })
      if (!open) panel.hidden = true
      return
    }

    // Measure the natural height, then animate to it — `auto` is not tweenable.
    const target = open ? pre.getBoundingClientRect().height : 0

    animate(panel, {
      height: target,
      opacity: open ? 1 : 0,
      duration: open ? 420 : 300,
      ease: open ? ease.arrive : 'inQuad',
      onComplete: () => {
        if (open) {
          // Release the fixed height so the panel reflows with the viewport.
          utils.set(panel, { height: 'auto' })
        } else {
          panel.hidden = true
        }
      },
    })
  }

  toggle.addEventListener('click', onClick)
  utils.set(panel, { height: 0, opacity: 0 })

  return {
    destroy() {
      toggle.removeEventListener('click', onClick)
      wrapper.remove()
    },
  }
}
