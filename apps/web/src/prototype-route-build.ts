export const PROTOTYPE_ROUTE_FILE = 'prototype.field-picker.tsx'

/**
 * Matches only the field-picker prototype route file. TanStack Router applies
 * routeFileIgnorePattern to each directory entry name during route generation.
 */
export const PROTOTYPE_ROUTE_IGNORE_PATTERN = '^prototype\\.field-picker\\.tsx$'

/**
 * The field-picker prototype is a development-only tool. Every non-development
 * build ignores its route file, so the route and everything under
 * src/prototype never become part of the production bundle.
 */
export function prototypeRouteIgnorePattern(mode: string): string | undefined {
  return mode === 'development' ? undefined : PROTOTYPE_ROUTE_IGNORE_PATTERN
}
