import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

export function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

export function AutoResizeTextarea({ value, onInput, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (ref.current) resizeTextarea(ref.current)
  }, [value])

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      onInput={(event) => {
        resizeTextarea(event.currentTarget)
        onInput?.(event)
      }}
    />
  )
}
