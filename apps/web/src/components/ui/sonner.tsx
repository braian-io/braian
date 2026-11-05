import { useEffect } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function placeToasts(resize: ResizeObserver, seen: WeakSet<Element>) {
  const tab = document.querySelector('[data-view-type="object_detail"]')
  const pane = tab?.closest('section.pane')
  const box = pane?.getBoundingClientRect()
  // Sit in the detail pane, not over the product and article lists to its left.
  const right = box ? Math.max(12, Math.round(window.innerWidth - box.right + 12)) : 16
  const max = box ? Math.max(160, Math.round(box.width - 24)) : 360
  document.documentElement.style.setProperty('--toast-right', `${right}px`)
  document.documentElement.style.setProperty('--toast-max', `${Math.min(420, max)}px`)
  document.querySelectorAll('section.pane').forEach((node) => {
    if (seen.has(node)) return
    seen.add(node)
    resize.observe(node)
  })
}

export function Toaster({ theme = 'dark', ...props }: ToasterProps) {
  useEffect(() => {
    const seen = new WeakSet<Element>()
    const resize = new ResizeObserver(() => placeToasts(resize, seen))
    const place = () => placeToasts(resize, seen)
    place()
    // The detail pane is mounted after the toaster, and the body box does not
    // change when it appears, so watch the tree as well as the viewport.
    const mutations = new MutationObserver(place)
    mutations.observe(document.body, { childList: true, subtree: true })
    resize.observe(document.documentElement)
    window.addEventListener('resize', place)
    return () => {
      mutations.disconnect()
      resize.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [])
  return (
    <>
      <div id="braian-live" className="sr-only" aria-live="polite" />
      <Sonner
      theme={theme}
      className="toaster"
      offset={16}
      gap={10}
      visibleToasts={4}
      expand
      toastOptions={{
        classNames: {
          toast: 'braian-toast',
          title: 'braian-toast-title',
          description: 'braian-toast-desc',
          actionButton: 'braian-toast-action',
          icon: 'braian-toast-icon',
        },
      }}
      {...props}
    />
    </>
  )
}
