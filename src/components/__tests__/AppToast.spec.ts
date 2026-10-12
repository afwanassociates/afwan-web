import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppToast from '../AppToast.vue'
import { useToast } from '@/composables/useToast'

afterEach(() => {
  useToast().toasts.value = []
  vi.useRealTimers()
})

describe('AppToast', () => {
  it('shows an action button that runs it and closes the toast', async () => {
    const run = vi.fn()
    useToast().success('Moved to Calling / Work Permit (Online)', {
      action: { label: 'Undo', run },
    })
    const wrapper = mount(AppToast)
    await wrapper.vm.$nextTick()

    const button = wrapper.get('button[data-toast-action]')
    expect(button.text()).toBe('Undo')
    await button.trigger('click')

    expect(run).toHaveBeenCalledTimes(1)
    expect(useToast().toasts.value).toHaveLength(0)
  })

  it('keeps an action toast for the given duration only', () => {
    vi.useFakeTimers()
    useToast().success('Moved', { duration: 6000, action: { label: 'Undo', run: () => {} } })

    vi.advanceTimersByTime(5900)
    expect(useToast().toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(200)
    expect(useToast().toasts.value).toHaveLength(0)
  })
})
