import { Command as CommandPrimitive } from 'cmdk'
import { forwardRef, useLayoutEffect, useRef, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('command', className)} {...props} />
}

export const CommandInput = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof CommandPrimitive.Input>
>(function CommandInput({ className, onKeyDown, ...props }, ref) {
  const inner = useRef<HTMLInputElement>(null)
  // cmdk stores the active item id in state that a controlled `value` never updates,
  // so the input's aria-activedescendant stays empty. Point it at the selected row
  // after cmdk has painted that row.
  useLayoutEffect(() => {
    const input = inner.current
    if (!input) return
    const root = input.closest('[cmdk-root]')
    // cmdk's own aria-selected lags a controlled value by an effect, so the
    // palette marks the row it considers active and we follow that.
    const index = input.getAttribute('data-palette-active')
    const list = root?.querySelector<HTMLElement>('[cmdk-list]')
    // cmdk stamps its own id and also sets aria-activedescendant on the list.
    // The combobox owns that attribute, and each row keeps id palette-opt-N.
    list?.removeAttribute('aria-activedescendant')
    const row = index != null && index !== ''
      ? root?.querySelector<HTMLElement>(`[data-palette-index="${index}"]`)
      : null
    if (row && index != null && index !== '') {
      row.id = `palette-opt-${index}`
      input.setAttribute('aria-activedescendant', row.id)
    } else input.removeAttribute('aria-activedescendant')
  })
  return (
    <CommandPrimitive.Input
      ref={(node) => {
        inner.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      className={cn(className)}
      onKeyDown={(event) => {
        // cmdk root maps Home/End to first/last item with preventDefault (no opt-out prop).
        // Stop bubbling so caret / Shift+selection stay with the query field — same idea as
        // isEditingCell (#132) for the object table.
        if (event.key === 'Home' || event.key === 'End') {
          event.stopPropagation()
        }
        onKeyDown?.(event)
      }}
      {...props}
    />
  )
})

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('palette-list', className)} {...props} />
}

export function CommandEmpty({ ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="palette-empty" {...props} />
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group className={cn('palette-group', className)} {...props} />
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item className={cn('hit', className)} {...props} />
}

export function CommandSeparator(props: ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className="palette-sep" {...props} />
}
