import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import PassportTable from '../PassportTable.vue'
import { makePassport } from '@/test/helpers'

function mountTable(showEntryNo: boolean) {
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/passports/:id', name: 'passport-detail', component: Empty },
      { path: '/passports/:id/edit', name: 'passport-edit', component: Empty },
    ],
  })
  return mount(PassportTable, {
    props: {
      entries: [makePassport({ id: 1, entry_no: 3 }), makePassport({ id: 2, entry_no: 4 })],
      currentUserId: null,
      showEntryNo,
    },
    global: { plugins: [createPinia(), router] },
  })
}

describe('PassportTable › entry number', () => {
  it('shows "No." first with each passport\'s serial number', () => {
    const wrapper = mountTable(true)

    expect(wrapper.findAll('thead th')[0]!.text()).toBe('No.')
    expect(wrapper.findAll('[data-cell="entry_no"]').map((c) => c.text())).toEqual(['3', '4'])
    expect(wrapper.findAll('[data-entry-no]').map((c) => c.text())).toEqual(['No. 3', 'No. 4'])
  })

  it('leaves it out unless asked', () => {
    const wrapper = mountTable(false)

    expect(wrapper.text()).not.toContain('No.')
    expect(wrapper.find('[data-cell="entry_no"]').exists()).toBe(false)
  })
})
