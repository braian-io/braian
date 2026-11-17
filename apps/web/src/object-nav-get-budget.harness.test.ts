import { describe, expect, it } from 'vitest'
import { OBJECT_NAV_DEBOUNCE_MS } from './object-list-preview'
import {
  ROW269_GET_BUDGET_MAX,
  ROW269_MEASURED_WITH_DEBOUNCE,
  ROW269_PREFETCH_SCHEDULED_WITH_DEBOUNCE,
  ROW269_PREFETCH_SCHEDULED_WITHOUT_DEBOUNCE_MIN,
  countRow269PrefetchGets,
} from './object-nav-get-budget.harness'

describe('row269 object GET budget model', () => {
  it('schedules far fewer prefetches with debounce than without', () => {
    const withDebounce = countRow269PrefetchGets(OBJECT_NAV_DEBOUNCE_MS, false)
    const withoutDebounce = countRow269PrefetchGets(0, true)
    expect(withDebounce).toBeLessThan(withoutDebounce)
    expect(withDebounce).toBe(7)
    expect(withoutDebounce).toBe(27)
  })

  it('keeps the HTTP cap above the measured debounced burst', () => {
    expect(ROW269_GET_BUDGET_MAX).toBeGreaterThan(ROW269_MEASURED_WITH_DEBOUNCE)
    expect(ROW269_PREFETCH_SCHEDULED_WITHOUT_DEBOUNCE_MIN).toBeGreaterThan(ROW269_PREFETCH_SCHEDULED_WITH_DEBOUNCE)
  })
})