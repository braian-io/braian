import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PROTOTYPE_ROUTE_FILE,
  PROTOTYPE_ROUTE_IGNORE_PATTERN,
  prototypeRouteIgnorePattern,
} from './prototype-route-build'

const routesDirectory = fileURLToPath(new URL('./routes', import.meta.url))

function routeFilesIncludedIn(mode: string): string[] {
  const pattern = prototypeRouteIgnorePattern(mode)
  const ignore = pattern ? new RegExp(pattern, 'g') : undefined
  return readdirSync(routesDirectory).filter((name) => !ignore || !name.match(ignore))
}

describe('prototype route build wiring', () => {
  it('keeps /prototype/field-picker in development', () => {
    expect(prototypeRouteIgnorePattern('development')).toBeUndefined()
    expect(routeFilesIncludedIn('development')).toContain(PROTOTYPE_ROUTE_FILE)
  })

  it('omits /prototype/field-picker from production route generation', () => {
    expect(prototypeRouteIgnorePattern('production')).toBe(PROTOTYPE_ROUTE_IGNORE_PATTERN)

    const included = routeFilesIncludedIn('production')
    expect(included).not.toContain(PROTOTYPE_ROUTE_FILE)
    expect(included).toContain('__root.tsx')
    expect(included).toContain('index.tsx')
    expect(included).toContain('api.chat.ts')
  })

  it('ignores only the prototype route file', () => {
    const ignore = new RegExp(PROTOTYPE_ROUTE_IGNORE_PATTERN)
    expect(ignore.test(PROTOTYPE_ROUTE_FILE)).toBe(true)
    expect(ignore.test('__root.tsx')).toBe(false)
    expect(ignore.test('index.tsx')).toBe(false)
    expect(ignore.test('api.chat.ts')).toBe(false)
  })
})
