import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ReturnedPassportsView from '../ReturnedPassportsView.vue'
import { listReturnedPassports, undoPassportReturn } from '@/api/passports'
import { useAuthStore } from '@/stores/auth'
import { makePassport, makeUser } from '@/test/helpers'
import type { Role } from '@/types/auth'
import type { ReturnedPassport } from '@/types/passport'

vi.mock('@/api/passports', () => ({
  listReturnedPassports: vi.fn(),
  undoPassportReturn: vi.fn(),
  downloadReturnedPassportsCsv: vi.fn(),
}))
vi.mock('@/api/reports', () => ({ fetchCompanyReport: vi.fn(async () => ({ data: [] })) }))
vi.mock('@/api/companies', () => ({ searchCompanies: vi.fn(async () => []) }))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => null),
  fetchWorkflowConfig: vi.fn(async () => null),
}))

function row(canUndo: boolean): ReturnedPassport {
  return {
    id: 3,
    passport: { id: 20, entry_no: 12, passport_name: 'KARIM MIAH', passport_number: 'NW1234567' },
    reference: { id: 4, name: 'Abdul Agency' },
    company: { id: 5, name: 'Gulf Builders' },
    return_date: '2026-10-28',
    receiver_name: 'Rahim',
    receiver_phone: '01711000000',
    receiver_id_no: '1990123456789',
    remarks: null,
    stage: 'visa',
    stage_label: 'Visa',
    returned_by: { id: 1, name: 'Head One' },
    returned_at: '2026-10-28T06:00:00Z',
    can_undo: canUndo,
  }
}

const page = (data: ReturnedPassport[]) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    last_page: 1,
    per_page: 15,
    total: data.length,
    from: 1,
    to: data.length,
  },
})

let wrapper: VueWrapper

async function mountAs(role: Role, canUndo: boolean) {
  vi.mocked(listReturnedPassports).mockResolvedValue(page([row(canUndo)]) as never)
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/returned', name: 'returned-passports', component: ReturnedPassportsView },
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
    ],
  })
  await router.push('/returned')
  wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  )
  await flushPromises()
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => wrapper?.unmount())

describe('Returned Passports', () => {
  it('lists who collected each passport, read-only for accounts', async () => {
    await mountAs('accounts', false)

    const text = wrapper.get('tr[data-row]').text()
    for (const value of [
      'KARIM MIAH',
      'NW1234567',
      'Abdul Agency',
      'Gulf Builders',
      'Visa',
      '28-10-2026',
      'Rahim',
      '01711000000',
      '1990123456789',
      'Head One',
    ])
      expect(text).toContain(value)
    expect(wrapper.find('button[data-undo-return]').exists()).toBe(false)
    // Accounts cannot open the passport page.
    expect(wrapper.get('tr[data-row]').find('a').exists()).toBe(false)
  })

  it('lets the operations head undo a return', async () => {
    vi.mocked(undoPassportReturn).mockResolvedValue(makePassport({ id: 20 }))
    await mountAs('operation_head', true)

    await wrapper.get('button[data-undo-return]').trigger('click')
    await flushPromises()
    const dialog = wrapper.get('dialog')
    await dialog
      .findAll('button')
      .find((b) => b.text() === 'Undo return')!
      .trigger('click')
    await flushPromises()

    expect(undoPassportReturn).toHaveBeenCalledWith(20)
    expect(listReturnedPassports).toHaveBeenCalledTimes(2)
  })
})
