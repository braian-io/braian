import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export function DialogContent({ className, children, onCloseAutoFocus, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="overlay" />
      <DialogPrimitive.Content
        className={cn('dialog', className)}
        {...props}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          if (opener?.isConnected) {
            event.preventDefault()
            opener.focus()
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
