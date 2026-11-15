import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import MedicalCentersAdminView from '../MedicalCentersAdminView.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  createMedicalCenter,
  deleteMedicalCenter,
  listMedicalCenters,
  updateMedicalCenter,
} from '@/api/medicalCenters'
import { useAuthStore } from '@/stores/auth'
import { httpError, makeUser } from '@/test/helpers'
import type { MedicalCenter } from '@/types/medical'

vi.mock('@/api/medicalCenters', () => ({
  listMedicalCenters: vi.fn(),
  createMedicalCenter: vi.fn(),
  updateMedicalCenter: vi.fn(),
  deleteMedicalCenter: vi.fn(),
  searchMedicalCenters: vi.fn(async () => []),
}))

function center(overrides: Partial<MedicalCenter> = {}): MedicalCenter {
  return {
    id: 1,
    name: 'Meem Medical Center',
    is_active: true,
    passports_count: 4,
    can_delete: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const page = (data: MedicalCenter[]) => ({
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
let router: Router

async function mountView(path = '/admin/medical-centers') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'operation_head' })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/medical-centers',
        name: 'admin-medical-centers',
        component: MedicalCentersAdminView,
      },
    ],
  })
  await router.push(path)
  wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router] }, attachTo: document.body },
  )
  await flushPromises()
}

const confirmButton = () => {
  const buttons = wrapper.findComponent(ConfirmDialog).findAll('button')
  return buttons[buttons.length - 1]!
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listMedicalCenters).mockResolvedValue(
    page([
      center(),
      center({ id: 2, name: 'Zain Medical Center', passports_count: 0, can_delete: true }),
    ]),
  )
})
afterEach(() => wrapper.unmount())

describe('Medical Centers (operations head)', () => {
  it('lists every centre with its passports and status; delete only for an unused one', async () => {
    await mountView()

    const used = wrapper.get('[data-center="1"]')
    expect(used.text()).toContain('Meem Medical Center')
    expect(used.get('[data-passports]').text()).toBe('4')
    expect(used.get('[data-active]').text()).toBe('Active')
    expect(used.find('[data-delete]').exists()).toBe(false)
    expect(wrapper.get('[data-center="2"]').find('[data-delete]').exists()).toBe(true)
  })

  it('filters by search and status through the URL', async () => {
    await mountView('/admin/medical-centers?q=meem&status=inactive')

    expect(listMedicalCenters).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'meem', is_active: 0, page: 1 }),
    )
  })

  it('adds a centre and renames one', async () => {
    vi.mocked(createMedicalCenter).mockResolvedValue(center({ id: 3, name: 'Popular' }))
    vi.mocked(updateMedicalCenter).mockResolvedValue(center({ name: 'Meem Medical Centre' }))
    await mountView()

    await wrapper.get('button[data-create]').trigger('click')
    await flushPromises()
    await wrapper.get('form input').setValue('Popular')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(createMedicalCenter).toHaveBeenCalledWith('Popular')

    await wrapper.get('[data-center="1"] [data-edit]').trigger('click')
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('form input')
    expect(input.element.value).toBe('Meem Medical Center')
    await input.setValue('Meem Medical Centre')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(updateMedicalCenter).toHaveBeenCalledWith(1, { name: 'Meem Medical Centre' })
  })

  it('deactivates and activates', async () => {
    vi.mocked(updateMedicalCenter).mockResolvedValue(center({ is_active: false }))
    await mountView()

    await wrapper.get('[data-center="1"] [data-toggle-active="deactivate"]').trigger('click')
    await flushPromises()
    expect(updateMedicalCenter).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('deletes an unused centre', async () => {
    vi.mocked(deleteMedicalCenter).mockResolvedValue()
    await mountView()

    await wrapper.get('[data-center="2"] [data-delete]').trigger('click')
    await flushPromises()
    await confirmButton().trigger('click')
    await flushPromises()
    expect(deleteMedicalCenter).toHaveBeenCalledWith(2)
  })

  it('offers to deactivate when the API refuses the delete (now used on a passport)', async () => {
    vi.mocked(deleteMedicalCenter).mockRejectedValue(
      httpError(422, { message: 'In use.', code: 'medical_center_has_passports' }),
    )
    vi.mocked(updateMedicalCenter).mockResolvedValue(center({ id: 2, is_active: false }))
    await mountView()

    await wrapper.get('[data-center="2"] [data-delete]').trigger('click')
    await flushPromises()
    await confirmButton().trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-delete-blocked]')).not.toBeNull()

    await confirmButton().trigger('click')
    await flushPromises()
    expect(updateMedicalCenter).toHaveBeenCalledWith(2, { is_active: false })
  })
})
