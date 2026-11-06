// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FeedbackDialog } from './feedback-dialog'
import { copy } from './i18n'

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
    const screenshot = screen.getByRole('checkbox', { name: copy.feedbackIncludeScreenshot })
    expect(screenshot.getAttribute('aria-label')).toBeNull()
    const log = screen.getByRole('checkbox', { name: copy.feedbackIncludeLog })
    expect(log.getAttribute('aria-label')).toBeNull()
  })

  it('takes the dialog title and message placeholder from copy', () => {
    render(
      <FeedbackDialog
        open
        onClose={() => undefined}
        user={{ handle: 'ada', role: 'admin' }}
        object={null}
        capture={null}
      />,
    )
    expect(screen.getByRole('heading', { name: copy.sendFeedback })).toBeTruthy()
    expect(screen.getByPlaceholderText(copy.feedbackMessagePlaceholder)).toBeTruthy()
  })
})
