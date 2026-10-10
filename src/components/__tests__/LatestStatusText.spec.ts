import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LatestStatusText from '../LatestStatusText.vue'
import type { LatestStatus, StatusTone } from '@/types/passport'

const status = (
  tone: StatusTone,
  text: string,
  date: string | null = '2026-10-08',
): LatestStatus => ({
  stage: 'medical',
  stage_label: 'Medical',
  status: 'x',
  status_label: 'X',
  text,
  tone,
  date,
})

describe('LatestStatusText', () => {
  it.each([
    ['red', 'Medical: Unfit', 'text-red-700'],
    ['amber', 'Medical: Pending', 'text-amber-700'],
    ['blue', 'Step 3: Waiting', 'text-blue-700'],
    ['green', 'Step 3: Done', 'text-green-700'],
    ['gray', 'Step 3: Locked', 'text-gray-600'],
  ] as [StatusTone, string, string][])(
    '%s: always shows the text, the date and the matching colour',
    (tone, text, colour) => {
      const wrapper = mount(LatestStatusText, { props: { latestStatus: status(tone, text) } })

      expect(wrapper.attributes('data-tone')).toBe(tone)
      const label = wrapper.get('[data-status-text]')
      expect(label.text()).toBe(text)
      expect(label.classes()).toContain(colour)
      expect(wrapper.get('[data-status-date]').text()).toBe('08-10-2026')
    },
  )

  it('leaves out the date when there is none', () => {
    const wrapper = mount(LatestStatusText, {
      props: { latestStatus: status('gray', 'Medical: Pending', null) },
    })

    expect(wrapper.find('[data-status-date]').exists()).toBe(false)
    expect(wrapper.text()).toBe('Medical: Pending')
  })

  it('falls back to gray for an unknown tone, still with text', () => {
    const wrapper = mount(LatestStatusText, {
      props: { latestStatus: status('purple' as StatusTone, 'Other: Unknown') },
    })

    expect(wrapper.attributes('data-tone')).toBe('gray')
    expect(wrapper.get('[data-status-text]').text()).toBe('Other: Unknown')
  })

  it.each([
    // Not started: no medical slip yet.
    [{ stage: 'passport', status: 'not_started', tone: 'amber' }, 'Passport entered', 'gray'],
    // Slip date entered, no result yet.
    [{ stage: 'medical', status: 'pending', tone: 'amber' }, 'Medical pending', 'amber'],
  ] as const)('words %o as "%s" (%s)', (overrides, text, tone) => {
    const wrapper = mount(LatestStatusText, {
      props: { latestStatus: { ...status(overrides.tone, 'API text'), ...overrides } },
    })

    expect(wrapper.get('[data-status-text]').text()).toBe(text)
    expect(wrapper.attributes('data-tone')).toBe(tone)
  })
})
