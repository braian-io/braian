import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ComponentProps,
  type MutableRefObject,
  type Ref,
  type RefObject,
} from 'react'
import { cn } from '@/lib/utils'
import { focusAfterMenuTab } from '../../menu-keyboard'

type TabDismiss = { backward: boolean }

const DropdownMenuTriggerRefContext = createContext<RefObject<HTMLElement | null> | null>(null)
const DropdownMenuOpenTriggerRefContext = createContext<RefObject<HTMLElement | null> | null>(null)
const DropdownMenuTabDismissContext = createContext<MutableRefObject<TabDismiss | null> | null>(null)

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function DropdownMenu({
  onOpenChange,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const triggerRef = useRef<HTMLElement | null>(null)
  const openTriggerRef = useRef<HTMLElement | null>(null)
  const tabDismissRef = useRef<TabDismiss | null>(null)
  return (
    <DropdownMenuTriggerRefContext.Provider value={triggerRef}>
      <DropdownMenuOpenTriggerRefContext.Provider value={openTriggerRef}>
        <DropdownMenuTabDismissContext.Provider value={tabDismissRef}>
        <DropdownMenuPrimitive.Root
          onOpenChange={(open) => {
            if (open) openTriggerRef.current = triggerRef.current
            else if (!tabDismissRef.current) openTriggerRef.current = null
            onOpenChange?.(open)
          }}
          {...props}
        />
        </DropdownMenuTabDismissContext.Provider>
      </DropdownMenuOpenTriggerRefContext.Provider>
    </DropdownMenuTriggerRefContext.Provider>
  )
}

export const DropdownMenuTrigger = ({
  ref,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) => {
  const triggerRef = useContext(DropdownMenuTriggerRefContext)
  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      if (triggerRef) triggerRef.current = node
      assignRef(ref, node)
    },
    [ref, triggerRef],
  )
  return <DropdownMenuPrimitive.Trigger ref={mergedRef} {...props} />
}

export const DropdownMenuGroup = DropdownMenuPrimitive.Group

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  onKeyDown,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const triggerRef = useContext(DropdownMenuTriggerRefContext)
  const openTriggerRef = useContext(DropdownMenuOpenTriggerRefContext)
  const tabDismissRef = useContext(DropdownMenuTabDismissContext)
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn('menu', className)}
        onKeyDown={(event) => {
          if (event.key === 'Tab' && tabDismissRef) {
            event.preventDefault()
            tabDismissRef.current = { backward: event.shiftKey }
            event.currentTarget.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
            )
          }
          onKeyDown?.(event)
        }}
        onCloseAutoFocus={(event) => {
          const tabDismiss = tabDismissRef?.current
          if (tabDismiss) {
            event.preventDefault()
            const trigger = openTriggerRef?.current ?? triggerRef?.current
            tabDismissRef!.current = null
            if (openTriggerRef) openTriggerRef.current = null
            if (trigger) focusAfterMenuTab(trigger, tabDismiss.backward)
            return
          }
          onCloseAutoFocus?.(event)
        }}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item className={cn('menu-item', className)} {...props} />
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn('menu-label', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('menu-sep', className)} {...props} />
}