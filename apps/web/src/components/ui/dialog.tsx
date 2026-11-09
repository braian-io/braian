import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useCallback, useRef, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export function DialogContent({ className, children, onOpenAutoFocus, onCloseAutoFocus, ref, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  // Capture the opener while the content is still unmounted, before a child
  // `autoFocus` moves focus into the dialog. `onOpenAutoFocus` runs too late
  // for that: an auto-focused field is already the active element. The content
  // ref is null only until the dialog's content commits, so every open records
  // its own opener and re-renders while open leave it untouched.
  const content = useRef<HTMLDivElement | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const forwarded = useRef(ref)
  forwarded.current = ref
  const setContent = useCallback((node: HTMLDivElement | null) => {
    content.current = node
    const target = forwarded.current
    if (typeof target === 'function') target(node)
    else if (target) target.current = node
  }, [])
  if (!content.current && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    opener.current = document.activeElement
  }
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="overlay" />
      <DialogPrimitive.Content
        className={cn('dialog', className)}
        {...props}
        ref={setContent}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          const target = opener.current
          if (target?.isConnected) {
            event.preventDefault()
            target.focus()
          }
        }}
      >
        {children}
        <DialogPrimitive.Close className="icon-btn dialog-close" aria-label="Close">
          <X />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
