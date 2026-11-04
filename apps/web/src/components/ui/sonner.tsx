import { Toaster as Sonner, type ToasterProps } from 'sonner'

export function Toaster({ theme = 'dark', ...props }: ToasterProps) {
  return (
    <>
      <div id="braian-live" className="sr-only" aria-live="polite" />
      <Sonner
      theme={theme}
      className="toaster"
      toastOptions={{
        classNames: {
          toast: 'braian-toast',
          title: 'braian-toast-title',
          description: 'braian-toast-desc',
        },
      }}
      {...props}
    />
    </>
  )
}
