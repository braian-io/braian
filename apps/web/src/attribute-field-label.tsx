import { useId, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip'

type AttributeFieldLabelProps = {
  children: ReactNode
  description?: string
  descTestId?: string
  className?: string
  htmlFor?: string
}

/**
 * Detail and create labels. Attribute help text stays in a tooltip on hover and
 * keyboard focus instead of using layout space under the label.
 */
export function AttributeFieldLabel({ children, description, descTestId, className, htmlFor }: AttributeFieldLabelProps) {
  const help = description?.trim() ?? ''
  const descId = useId()
  const label = (
    <label
      htmlFor={htmlFor}
      className={className}
      tabIndex={help ? 0 : undefined}
      title={help || undefined}
      aria-describedby={help ? descId : undefined}
    >
      {children}
    </label>
  )
  if (!help) return label
  return (
    <>
      <span id={descId} className="sr-only">
        {help}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>{label}</TooltipTrigger>
        <TooltipContent data-testid={descTestId}>{help}</TooltipContent>
      </Tooltip>
    </>
  )
}