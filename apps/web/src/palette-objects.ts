import { catalogName, textValue, type Json } from './api'
import { readIndexed } from './index-fields'
import { optionLabel, statusTone, typeLabel } from './chips'
import { uiLanguage } from './i18n'
import type { PaletteItem } from './palette-model'
import { openObjectLabel } from './type-labels'

/** Search hits as palette rows. The title uses the display name, never a hardcoded language field. */
export function objectPaletteRows(hits: Json[] | undefined, defs: Json | undefined): PaletteItem[] {
  return (hits ?? []).map((hit) => {
    const row = (hit.document as Json) ?? hit
    const type = String(row.type_key ?? row.type ?? '')
    const status = readIndexed(row, defs, 'status') || textValue(row.a_status)
    const version = String(row.version ?? '')
    const name = catalogName(row, defs)
    const id = String(row.id ?? '')
    return {
      id: `hit:${id}`,
      sourceId: id,
      group: 'search' as const,
      title: `${String(row.key ?? '')} · ${name || type}`,
      subtitle: openObjectLabel(type ? typeLabel(defs, type, uiLanguage) : ''),
      typeKey: type,
      entity: true,
      chips: [
        ...(type ? [{ text: typeLabel(defs, type, uiLanguage), tone: 'neutral' as const }] : []),
        ...(status ? [{ text: optionLabel(defs, 'status', status, uiLanguage), tone: statusTone(status) }] : []),
        ...(version ? [{ text: version, tone: 'neutral' as const }] : []),
      ],
    }
  })
}
