import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HeroSlider from '../HeroSlider.vue'
import { slides } from '@/data/slides'

describe('HeroSlider', () => {
  it('shows the next banner when the next button is clicked', async () => {
    const wrapper = mount(HeroSlider, { props: { slides } })
    const active = () => wrapper.find('[data-active="true"]')

    expect(active().attributes('data-slide')).toBe('growth')
    expect(active().find('h2').text()).toContain('Building Trust.')

    await wrapper.find('button[aria-label="Next slide"]').trigger('click')

    expect(active().attributes('data-slide')).toBe('solar')
    expect(active().find('h2').text()).toContain('Energy for a Brighter')
    wrapper.unmount()
  })

  it('lists Export / Import, not "Importer", among the lines of business', () => {
    const wrapper = mount(HeroSlider, { props: { slides } })

    for (const id of ['growth', 'property']) {
      const lines = wrapper.find(`[data-slide="${id}"] [data-lines]`).text()
      expect(lines).toContain('Export / Import')
      expect(lines).not.toContain('Importer')
    }
    wrapper.unmount()
  })
})
