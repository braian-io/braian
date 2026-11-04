import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster({ theme = 'dark', ...props }: ToasterProps) {
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
