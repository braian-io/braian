import { useEffect } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function placeToasts() {
  const tab = document.querySelector('[data-view-type="object_detail"]')
  const pane = tab?.closest('section.pane')
  const right = pane
    ? Math.max(20, Math.round(window.innerWidth - pane.getBoundingClientRect().left + 10))
    : 24
  document.documentElement.style.setProperty('--toast-right', `${right}px`)
}

export function Toaster({ theme = 'dark', ...props }: ToasterProps) {
  useEffect(() => {
    placeToasts()
    // The detail pane is mounted after the toaster, and the body box does not
    // change when it appears, so watch the tree as well as the viewport.
    const mutations = new MutationObserver(() => placeToasts())
    mutations.observe(document.body, { childList: true, subtree: true })
    const resize = new ResizeObserver(() => placeToasts())
    resize.observe(document.documentElement)
    window.addEventListener('resize', placeToasts)
    return () => {
      mutations.disconnect()
      resize.disconnect()
      window.removeEventListener('resize', placeToasts)
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
