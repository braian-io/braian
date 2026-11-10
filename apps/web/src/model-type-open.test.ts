// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { clearPendingModelType, OPEN_MODEL_TYPE, peekPendingModelType, requestOpenModelType } from './model-type-open'

afterEach(() => clearPendingModelType())

describe('open a model type in Object types', () => {
  it('keeps the key queued until the table has selected a row', () => {
    const opened: string[] = []
    const onOpen = (event: Event) => opened.push(String((event as CustomEvent<{ key?: string }>).detail?.key ?? ''))
    window.addEventListener(OPEN_MODEL_TYPE, onOpen)
    try {
      requestOpenModelType('product')
      expect(opened).toEqual(['product'])
      expect(peekPendingModelType()).toBe('product')
      // A remount reads the same key; only applying the selection clears it.
      expect(peekPendingModelType()).toBe('product')
      clearPendingModelType('supplier')
      expect(peekPendingModelType()).toBe('product')
      clearPendingModelType('product')
      expect(peekPendingModelType()).toBe('')
    } finally {
      window.removeEventListener(OPEN_MODEL_TYPE, onOpen)
    }
  })

  it('ignores an empty type key', () => {
    requestOpenModelType('')
    expect(peekPendingModelType()).toBe('')
  })
})
