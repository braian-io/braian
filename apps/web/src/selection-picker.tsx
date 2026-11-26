import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Json } from './api'
import { memberIdsOf, selectionKind, selectionMatchesType } from './assortment-filter'
import { Button } from './components/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from './components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { Kbd } from './components/ui/kbd'
import { Portal } from './components/ui/portal'
import { copy } from './i18n'
import { paletteKeyEffect } from './palette-core'
import { resultAnnouncement } from './palette-model'
import {
  finishSelectionDrop,
  saveSelectionMembers,
  selectionDragActive,
  setMemberError,
} from './selection-members'
import { writeErrorMessage } from './write-error'

export type AddSelectionRequest = { objectIds: string[]; typeKey: string }

/**
 * Searchable list of manual selections. Selections live in Postgres, so the
 * query filters that list. The table that shows the chosen selection reads
 * the object index with an id filter, the same search Ctrl+K uses.
 */
export function SelectionPicker({
  request,
  onClose,
}: {
  request: AddSelectionRequest
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const list = useQuery({
    queryKey: ['assortments', request.typeKey],
    queryFn: () => api.get('/v1/assortments', { params: { query: { type: request.typeKey } } }),
    enabled: Boolean(request.typeKey),
  })
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return ((list.data?.assortments ?? []) as Json[])
      .filter((item) => selectionKind(item.kind) === 'manual')
      .filter((item) => selectionMatchesType(item, request.typeKey, ''))
      .filter((item) => !needle || String(item.name ?? '').toLowerCase().includes(needle))
      .map((item) => ({
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        count: memberIdsOf(item).length,
      }))
      .filter((item) => item.id)
  }, [list.data, query, request.typeKey])

  useEffect(() => {
    setActive(rows.length > 0 ? 0 : -1)
  }, [rows])

  const choose = (index: number) => {
    const row = rows[index]
    if (!row || saving) return
    setSaving(true)
    setError('')
    void saveSelectionMembers(queryClient, row.id, request.objectIds, 'add')
      .then(() => onClose())
      .catch((reason: unknown) => {
        setError(writeErrorMessage(reason) ?? copy.validation)
      })
      .finally(() => setSaving(false))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      return
    }
    const effect = paletteKeyEffect({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      query,
      inQueryField: event.target instanceof HTMLElement && event.target.matches('input'),
      mode: 'list',
      stackDepth: 0,
      escapeCloses: true,
      activeIndex: active >= 0 ? active : null,
      rowCount: rows.length,
      row: rows[active] ? { entity: false } : undefined,
    })
    if (effect.type === 'caret' || effect.type === 'none' || effect.type === 'ask' || effect.type === 'actions' || effect.type === 'back') return
    event.preventDefault()
    event.stopPropagation()
    if (effect.type === 'close') onClose()
    if (effect.type === 'move') setActive(effect.index)
    if (effect.type === 'activate') choose(effect.index)
  }

  const showEmpty = !list.isLoading && rows.length === 0
  return (
    <Portal>
      <div
        ref={rootRef}
        className="palette"
        role="dialog"
        aria-label={copy.addToSelection}
        data-testid="selection-picker"
        onMouseDown={onClose}
      >
        <Command
          shouldFilter={false}
          loop={false}
          disablePointerSelection
          value={rows[active]?.id ?? ''}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDownCapture={onKeyDown}
        >
          <div className="palette-query">
            <div className="crumb">{copy.addToSelection}</div>
            <CommandInput
              data-testid="selection-picker-input"
              autoFocus
              role="combobox"
              aria-autocomplete="list"
              aria-controls="selection-picker-list"
              aria-expanded="true"
              value={query}
              placeholder={copy.search}
              onValueChange={setQuery}
            />
          </div>
          <div className="sr-only" aria-live="polite">
            {resultAnnouncement(rows.length, query.trim())}
          </div>
          <CommandList id="selection-picker-list" role="listbox">
            {showEmpty ? (
              <p className="palette-empty" data-testid="selection-picker-empty">
                {query.trim() ? copy.noResultsFor.replace('{query}', query.trim()) : copy.noManualSelections}
              </p>
            ) : null}
            {rows.map((row, index) => (
              <CommandItem
                key={row.id}
                value={row.id}
                role="option"
                aria-selected={index === active}
                className={index === active ? 'hit on' : 'hit'}
                disabled={saving}
                onPointerDown={() => setActive(index)}
                onSelect={() => choose(index)}
              >
                <span className="hit-copy">
                  <span className="hit-title">{row.name}</span>
                  <small>{row.count}</small>
                </span>
              </CommandItem>
            ))}
          </CommandList>
          {error ? <p className="error" data-testid="selection-picker-error" role="alert">{error}</p> : null}
          <div className="palette-foot">
            <span><Kbd>Enter</Kbd> {copy.linkChoose}</span>
            <span><Kbd>Esc</Kbd> {copy.close}</span>
          </div>
        </Command>
      </div>
    </Portal>
  )
}

export function RemoveSelectionConfirm({
  count,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  count: number
  pending: boolean
  error: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent data-testid="remove-selection-confirm">
        <DialogTitle className="pr-8">{copy.removeFromSelection}</DialogTitle>
        <DialogDescription>
          {copy.removeFromSelectionConfirm.replace('{count}', String(count))}
        </DialogDescription>
        {error ? <p className="error" data-testid="selection-member-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>{copy.cancel}</Button>
          <Button type="button" variant="danger" disabled={pending} onClick={onConfirm}>{copy.removeFromSelection}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function selectionDropHandlers(
  manual: boolean,
  selectionId: string,
  onIds: (ids: string[]) => void,
) {
  return {
    onDragOver(event: ReactDragEvent) {
      if (!selectionDragActive(event.dataTransfer.types)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = manual ? 'copy' : 'none'
    },
    onDrop(event: ReactDragEvent) {
      if (!selectionDragActive(event.dataTransfer.types)) return
      event.preventDefault()
      event.stopPropagation()
      const ids = finishSelectionDrop(event.dataTransfer)
      if (!manual) {
        setMemberError(selectionId, copy.onlyManualSelection)
        return
      }
      if (ids.length === 0) return
      onIds(ids)
    },
  }
}
