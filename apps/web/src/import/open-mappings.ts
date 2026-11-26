export const openImportMappingsEvent = 'braian-open-import-mappings'

export function requestOpenImportMappings() {
  window.dispatchEvent(new Event(openImportMappingsEvent))
}
