import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import PassportCell from '../PassportCell.vue'
import { makePassport } from '@/test/helpers'
import type { PassportEntry } from '@/types/passport'

function enteredBy(entry: Partial<PassportEntry>, currentUserId: number | null = 5) {
  return mount(PassportCell, {
    props: {
      entry: makePassport(entry),
      column: 'entered_by',
      today: '2026-10-27',
      currentUserId,
    },
    global: { plugins: [createPinia()] },
  }).text()
}

describe('PassportCell › Entered by', () => {
  it('shows the real name of who entered the passport', () => {
    expect(enteredBy({ created_by: 9, entered_by: { id: 9, name: 'Rahima Akter' } })).toBe(
      'Rahima Akter',
    )
  })

  it('shows the real name for the logged-in user too, not "You"', () => {
    expect(enteredBy({ created_by: 5, entered_by: { id: 5, name: 'Karim Uddin' } }, 5)).toBe(
      'Karim Uddin',
    )
  })

  it('falls back to the user number without a name, and a dash without a user', () => {
    expect(enteredBy({ created_by: 9, entered_by: null })).toBe('Staff #9')
    expect(enteredBy({ created_by: null, entered_by: null })).toBe('—')
  })
})
