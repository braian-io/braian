import { useEffect, useRef } from 'react'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogTitle } from './components/ui/dialog'
import { Kbd } from './components/ui/kbd'
import { copy } from './i18n'
import { shortcuts } from './shortcuts'

export function HelpDialog({ onClose, placeholder }: { onClose: () => void; placeholder: string }) {
  const opener = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )
  const rows = shortcuts.filter((item) => item.id !== 'help.close' && item.id !== 'palette.search')
  useEffect(() => () => {
    if (opener.current?.isConnected) opener.current.focus()
  }, [])
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        className="help-dialog"
        data-testid="help-shortcuts"
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (opener.current?.isConnected) opener.current.focus()
        }}
      >
        <DialogTitle>{copy.shortcuts}</DialogTitle>
        <p><Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> {placeholder}</p>
        {rows.map((item) => (
          <p key={item.id} data-shortcut-id={item.id}>
            <Kbd>{item.chord}</Kbd> {item.description}
          </p>
        ))}
        <Button type="button" variant="default" onClick={onClose}>{copy.close}</Button>
      </DialogContent>
    </Dialog>
  )
}
