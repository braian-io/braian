import { describe, expect, it } from 'vitest'
import { shouldHoldTablePaint, shouldRefreshTableSnapshot } from './table-live-paint'

describe('shouldHoldTablePaint', () => {
  it('does not hold before the first paint', () => {
    expect(
      shouldHoldTablePaint({ hasPaintedData: false, objectsFetching: true, pathBusy: true }),
    ).toBe(false)
  })

  it('holds while either side of a live refresh is in flight', () => {
    expect(
      shouldHoldTablePaint({ hasPaintedData: true, objectsFetching: true, pathBusy: false }),
    ).toBe(true)
    expect(
      shouldHoldTablePaint({ hasPaintedData: true, objectsFetching: false, pathBusy: true }),
    ).toBe(true)
  })

  it('releases when both sides have settled', () => {
    expect(
      shouldHoldTablePaint({ hasPaintedData: true, objectsFetching: false, pathBusy: false }),
    ).toBe(false)
  })
})

describe('shouldRefreshTableSnapshot', () => {
  it('keeps a painted snapshot while a live refresh is in flight', () => {
    expect(
      shouldRefreshTableSnapshot({ tableBusy: true, hasSnapshot: true, heldRowCount: 4, liveRowCount: 4 }),
    ).toBe(false)
  })

  it('replaces an empty snapshot once the first rows arrive', () => {
    expect(
      shouldRefreshTableSnapshot({ tableBusy: true, hasSnapshot: true, heldRowCount: 0, liveRowCount: 4 }),
    ).toBe(true)
  })

  it('refreshes whenever the table is idle or there is no snapshot yet', () => {
    expect(
      shouldRefreshTableSnapshot({ tableBusy: false, hasSnapshot: true, heldRowCount: 4, liveRowCount: 5 }),
    ).toBe(true)
    expect(
      shouldRefreshTableSnapshot({ tableBusy: true, hasSnapshot: false, heldRowCount: 0, liveRowCount: 0 }),
    ).toBe(true)
  })
})
