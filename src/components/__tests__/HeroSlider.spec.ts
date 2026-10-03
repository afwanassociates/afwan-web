import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HeroSlider from '../HeroSlider.vue'
import type { Slide } from '@/data/slides'

const slides: Slide[] = [
  { id: 'a', heading: 'First', text: 'One', cta: { label: 'Go', target: 'x' }, background: 'none' },
  {
    id: 'b',
    heading: 'Second',
    text: 'Two',
    cta: { label: 'Go', target: 'x' },
    background: 'none',
  },
  {
    id: 'c',
    heading: 'Third',
    text: 'Three',
    cta: { label: 'Go', target: 'x' },
    background: 'none',
  },
]

describe('HeroSlider', () => {
  it('shows the next slide when the next button is clicked', async () => {
    const wrapper = mount(HeroSlider, { props: { slides } })
    const activeHeading = () => wrapper.find('[data-active="true"] h2').text()

    expect(activeHeading()).toBe('First')

    await wrapper.find('button[aria-label="Next slide"]').trigger('click')

    expect(activeHeading()).toBe('Second')
    wrapper.unmount()
  })
})
