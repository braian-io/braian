import { describe, expect, it } from 'vitest'
import { formatBatchLogLine } from './batch-log'

const at = new Date(2026, 9, 27, 10, 42).toISOString()

describe('formatBatchLogLine', () => {
  it('prints actor, diff count, op and local time as a sentence', () => {
    const line = formatBatchLogLine({
      seq: 4178,
      at,
      op: 'definitions',
      actor: 'admin@braian.io',
      diff: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`key${index}`, index])),
    })
    expect(line).toContain('admin@braian.io')
    expect(line).toContain('updated')
    expect(line).toContain('12')
    expect(line).toContain('definitions')
    expect(line).toContain('· 10:42')
  })

  it('omits the count when there is no diff', () => {
    const line = formatBatchLogLine({ seq: 4178, at, op: 'definitions', actor: 'admin@braian.io' })
    expect(line).toBe('admin@braian.io updated definitions · 10:42')
    expect(line).not.toMatch(/updated \d+/)
  })

  it('does not start with the sequence number', () => {
    const line = formatBatchLogLine({ seq: 4178, at, op: 'definitions', actor: 'admin@braian.io', diff: { a: 1 } })
    expect(line.startsWith('#4178')).toBe(false)
    expect(line.startsWith('admin@braian.io')).toBe(true)
  })
})
