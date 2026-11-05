// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FeedbackDialog } from './feedback-dialog'

afterEach(() => {
  cleanup()
})

describe('feedback dialog', () => {
  it('names the include checkboxes from their visible labels, without a duplicate aria-label', () => {
    render(
      <FeedbackDialog
        open
        onClose={() => undefined}
        user={{ handle: 'ada', role: 'admin' }}
        object={null}
        capture={null}
      />,
    )
    const screenshot = screen.getByRole('checkbox', { name: /Include screenshot/i })
    expect(screenshot.getAttribute('aria-label')).toBeNull()
    const log = screen.getByRole('checkbox', { name: /Include recent log/i })
    expect(log.getAttribute('aria-label')).toBeNull()
  })
})
