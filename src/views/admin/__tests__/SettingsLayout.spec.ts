import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import SettingsLayout from '../SettingsLayout.vue'
import SettingsIndexView from '../SettingsIndexView.vue'
import { SETTINGS_PAGES } from '@/lib/settingsPages'
import { useAuthStore } from '@/stores/auth'
import { makeUser } from '@/test/helpers'

let wrapper: VueWrapper

async function mountSettings() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role: 'admin' })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings',
        component: SettingsLayout,
        children: [
          { path: '', name: 'settings', component: SettingsIndexView },
          ...SETTINGS_PAGES.map((p) => ({
            path: p.path,
            name: p.name,
            component: { template: '<p>page</p>' },
          })),
        ],
      },
    ],
  })
  await router.push('/admin/settings')
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

afterEach(() => wrapper.unmount())

describe('Settings section', () => {
  it('shows one tab per settings page, after "Overview"', async () => {
    await mountSettings()

    const tabs = wrapper.findAll('nav[aria-label="Settings sections"] a').map((a) => a.text())
    expect(tabs).toEqual(['Overview', ...SETTINGS_PAGES.map((p) => p.label)])
  })

  it('lists every settings page as a card on the overview', async () => {
    await mountSettings()

    const cards = wrapper.findAll('section ul a')
    expect(cards).toHaveLength(SETTINGS_PAGES.length)
    expect(cards[0]!.text()).toContain(SETTINGS_PAGES[0]!.label)
    expect(cards[0]!.text()).toContain(SETTINGS_PAGES[0]!.description)
    expect(cards[0]!.attributes('href')).toBe(`/admin/settings/${SETTINGS_PAGES[0]!.path}`)
  })
})
