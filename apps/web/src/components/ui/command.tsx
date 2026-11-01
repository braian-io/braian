import { Command as CommandPrimitive } from 'cmdk'
import { forwardRef, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('command', className)} {...props} />
}

export const CommandInput = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof CommandPrimitive.Input>
>(function CommandInput({ className, onKeyDown, ...props }, ref) {
  return (
    <CommandPrimitive.Input
      ref={ref}
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
