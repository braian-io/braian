import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Json } from './api'
import { Command, CommandInput, CommandItem, CommandList } from './components/ui/command'
import { Kbd } from './components/ui/kbd'
import { MetaChip } from './chips'
import { readFrecency, touch } from './frecency'
import { copy, uiLanguage } from './i18n'
import { filterLinkCandidates, linkEndLabel, linkHitFromDocument, linkPaletteItem, linkPickerRows, visibleText, type LinkDirection, type LinkHit } from './link-choices'
import { pushLinkUi } from './link-ui'
import { paletteKeyEffect, type PaletteKeyEffect } from './palette-core'
import { groupTitle, readPaletteMemory, rememberPaletteItem, resultAnnouncement, type PaletteItem } from './palette-model'

export function LinkObjectPicker({
  sourceId,
  excludeIds,
  defs,
  source,
  relation,
  onClose,
  onChoose,
}: {
  sourceId: string
  excludeIds?: string[]
  defs?: Json
  /** The object the link starts from, named in the crumb. */
  source?: { key?: string; name?: string }
  relation?: { label: string; direction: LinkDirection; targetTypes?: string[] }
  onClose: () => void
  onChoose: (hit: LinkHit) => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  useEffect(() => pushLinkUi(), [])
  useEffect(() => {
    if (!query.trim()) {
      setDebounced('')
      return
    }
    const timer = window.setTimeout(() => setDebounced(query), 120)
    return () => window.clearTimeout(timer)
  }, [query])
  const found = useQuery({
    queryKey: ['link-search', debounced],
    queryFn: () => api.get('/v1/search', { params: { query: { q: debounced, per_page: 8, lang: uiLanguage } } }),
    enabled: debounced.trim().length > 0,
  })
  const excluded = useMemo(() => new Set(excludeIds && excludeIds.length > 0 ? excludeIds : [sourceId]), [excludeIds, sourceId])
  const hits = useMemo(() => {
    const rows = ((found.data?.hits as Json[]) ?? [])
      .map((hit) => linkHitFromDocument((hit.document as Json) ?? hit, defs))
      .filter((hit): hit is LinkHit => hit != null)
    return filterLinkCandidates(rows, relation?.targetTypes, excluded)
  }, [found.data, defs, excluded, relation?.targetTypes])
  const frecency = useMemo(() => readFrecency(), [query])
  const memory = useMemo(
    () =>
      filterLinkCandidates(
        readPaletteMemory().map((item) => ({
          ...item,
          title: visibleText(item.title) || copy.nodeObject,
          subtitle: visibleText(item.subtitle),
        })),
        relation?.targetTypes,
        new Set(),
      ).filter((item) => !excluded.has(selectedId(item) ?? '')),
    [query, excluded, relation?.targetTypes],
  )
  const rows = useMemo(
    () => linkPickerRows({ hits, query: debounced, frecency, memory, defs }),
    [hits, debounced, frecency, memory, defs],
  )
  useEffect(() => {
    setActive(rows.length > 0 ? 0 : -1)
  }, [rows])
  useEffect(() => {
    document.querySelector<HTMLElement>('#link-picker-list .hit.on')?.scrollIntoView({ block: 'nearest' })
  }, [active, rows.length])

  const choose = (row: PaletteItem | undefined) => {
    if (!row) return
    const id = selectedId(row)
    if (!id) return
    const hit = hits.find((item) => item.id === id) ?? hitFromMemory(row)
    if (!hit || excluded.has(hit.id)) return
    touch(`hit:${hit.id}`)
    rememberPaletteItem(linkPaletteItem(hit, defs))
    onChoose(hit)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const effect: PaletteKeyEffect = paletteKeyEffect({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      query,
      inQueryField: event.target instanceof HTMLElement && event.target.matches('[data-testid="link-search"], [cmdk-input]'),
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
    if (effect.type === 'activate') choose(rows[effect.index])
  }

  const showEmpty = debounced.trim().length > 0 && !found.isFetching && rows.length === 0
  return (
    <div
      className="palette"
      role="dialog"
      aria-label={relation ? `${copy.addLink} ${relation.label}` : copy.addLink}
      data-testid="link-picker"
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
          <div className="crumb" data-testid="link-picker-crumb">
            {copy.addLink}
            {source ? (
              <>
                {' · '}
                <span data-testid="link-picker-source">{linkEndLabel({ id: '', key: source.key, name: source.name })}</span>
              </>
            ) : null}
            {relation ? (
              <>
                {' · '}
                <span data-testid="link-picker-relation">
                  {relation.label} · {relation.direction === 'out' ? copy.linkFromHere : copy.linkToHere}
                </span>
              </>
            ) : null}
          </div>
          <CommandInput
            data-testid="link-search"
            autoFocus
            role="combobox"
            aria-autocomplete="list"
            aria-controls="link-picker-list"
            aria-expanded="true"
            data-palette-active={active >= 0 ? String(active) : ''}
            value={query}
            placeholder={copy.linkSearchPlaceholder}
            onValueChange={(value) => setQuery(value)}
          />
        </div>
        <div className="sr-only" aria-live="polite" data-testid="link-picker-results">
          {resultAnnouncement(rows.length, debounced)}
        </div>
        <CommandList id="link-picker-list" role="listbox">
          {showEmpty ? (
            <p className="palette-empty" data-testid="link-picker-empty">{copy.noResultsFor.replace('{query}', debounced.trim())}</p>
          ) : null}
          {rows.length > 0 ? <div className="palette-heading">{rows[0]?.group === 'recent' ? groupTitle.recent : groupTitle.search}</div> : null}
          {rows.map((row, index) => (
            <CommandItem
              key={row.id}
              id={`link-opt-${index}`}
              data-palette-index={index}
              value={row.id}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'hit on' : 'hit'}
              onPointerDown={() => setActive(index)}
              onSelect={() => choose(row)}
            >
              <span className="hit-copy">
                <span className="hit-title">{mark(row.title, query)}</span>
                {row.subtitle ? <small>{row.subtitle}</small> : null}
              </span>
              {row.chips && row.chips.length > 0 ? (
                <span className="hit-chips">
                  {row.chips.map((chip) => (
                    <MetaChip key={chip.text} tone={chip.tone}>{chip.text}</MetaChip>
                  ))}
                </span>
              ) : null}
            </CommandItem>
          ))}
        </CommandList>
        <div className="palette-foot" data-testid="link-picker-foot">
          <span><Kbd>Enter</Kbd> {copy.linkChoose}</span>
          <span><Kbd>Esc</Kbd> {copy.close}</span>
        </div>
      </Command>
    </div>
  )
}

function selectedId(item: PaletteItem) {
  if (item.id.startsWith('hit:')) return item.id.slice('hit:'.length)
  return item.sourceId ?? null
}

function hitFromMemory(row: PaletteItem): LinkHit | null {
  const id = selectedId(row)
  if (!id) return null
  return {
    id,
    key: row.subtitle || '',
    name: visibleText(row.title),
    typeKey: row.typeKey ?? '',
  }
}

function mark(text: string, query: string) {
  const needle = query.trim()
  if (!needle) return text
  const index = text.toLowerCase().indexOf(needle.toLowerCase())
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className="mark">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}
