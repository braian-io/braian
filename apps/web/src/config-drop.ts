import { loadAll } from 'js-yaml'

export const CONFIG_API_VERSION = 'braian.io/v1'

const CONFIG_FILE = /\.(ya?ml|json)$/i

function isConfigDocument(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as { apiVersion?: unknown }).apiVersion === CONFIG_API_VERSION,
  )
}

function hasConfigDocument(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasConfigDocument)
  return isConfigDocument(value)
}

function parseDocuments(text: string): unknown[] {
  return loadAll(text).flatMap((document) =>
    Array.isArray(document) ? document : document == null ? [] : [document],
  )
}

/** True when every dropped file is YAML/JSON and contains a Braian config document. */
export async function detectConfigFiles(files: File[]): Promise<File[] | null> {
  if (files.length === 0) return null
  if (!files.every((file) => CONFIG_FILE.test(file.name))) return null
  const matches = await Promise.all(
    files.map(async (file) => {
      try {
        return parseDocuments(await file.text()).some(isConfigDocument)
      } catch {
        return false
      }
    }),
  )
  return matches.every(Boolean) ? files : null
}

/** Every document in the dropped files, ready for the config plan and apply APIs. */
export async function readConfigDocuments(files: File[]): Promise<unknown[]> {
  const documents = await Promise.all(files.map(async (file) => parseDocuments(await file.text())))
  return documents.flat()
}
