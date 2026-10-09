import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MedicalStatusBadge from '../MedicalStatusBadge.vue'
import type { MedicalStatus } from '@/types/medical'

describe('MedicalStatusBadge', () => {
  it.each([
    ['pending', null, 'Pending'],
    ['fit', '2027-01-07', 'Fit until 07-01-2027'],
    ['fit', null, 'Fit'],
    ['expiring_soon', '2026-10-15', 'Expiring soon'],
    ['expired', '2026-09-01', 'Expired'],
    ['unfit', null, 'Unfit'],
  ] as [MedicalStatus, string | null, string][])(
    '%s (valid until %s) reads "%s" and has an icon',
    (status, validUntil, text) => {
      const wrapper = mount(MedicalStatusBadge, { props: { status, validUntil } })

      expect(wrapper.text()).toBe(text)
      // Not colour alone: every badge has an icon next to its text.
      expect(wrapper.find('svg').exists()).toBe(true)
    },
  )
})
