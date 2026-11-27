import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AutoResizeTextarea } from './auto-resize-textarea'

/**
 * A Detail text control. Keystrokes stay local. Blur and Enter (single line)
 * commit. Escape restores the saved text and does not write.
 */
export function DetailCommitText({
  value,
  revertTo,
  multiline = false,
  readOnly = false,
  onCommit,
  onRevert,
}: {
  value: string
  revertTo: string
  multiline?: boolean
  readOnly?: boolean
  onCommit: (text: string) => Promise<string>
  onRevert?: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)
  const skipBlur = useRef(false)
  const draftRef = useRef(draft)
  const statusRef = useRef<'idle' | 'saving' | 'error'>('idle')
  draftRef.current = draft

  useEffect(() => {
    if (focused.current) return
    if (statusRef.current === 'error' || statusRef.current === 'saving') return
    setDraft(value)
  }, [value])

  const commit = (text: string) => {
    if (readOnly) return
    if (text === value && statusRef.current !== 'error') return
    statusRef.current = 'saving'
    setInvalid(false)
    void onCommit(text).then((error) => {
      if (error) {
        statusRef.current = 'error'
        setInvalid(true)
        return
      }
      statusRef.current = 'idle'
      setInvalid(false)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (readOnly) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      skipBlur.current = true
      statusRef.current = 'idle'
      setInvalid(false)
      setDraft(revertTo)
      onRevert?.()
      event.currentTarget.blur()
      return
    }
    if (!multiline && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      skipBlur.current = true
      commit(draftRef.current)
      event.currentTarget.blur()
    }
  }

  const shared = {
    'data-field': 'true' as const,
    readOnly,
    value: draft,
    title: draft,
    'aria-invalid': invalid || undefined,
    onFocus: () => {
      focused.current = true
      skipBlur.current = false
    },
    onChange: (event: { target: { value: string } }) => {
      statusRef.current = 'idle'
      setInvalid(false)
      setDraft(event.target.value)
    },
    onBlur: () => {
      focused.current = false
      if (skipBlur.current) {
        skipBlur.current = false
        return
      }
      commit(draftRef.current)
    },
    onKeyDown,
  }

  if (multiline) return <AutoResizeTextarea {...shared} />
  return <input {...shared} />
}
