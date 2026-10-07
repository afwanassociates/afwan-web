import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ToggleSwitch from '../ToggleSwitch.vue'
import { httpError } from '@/test/helpers'

let wrapper: VueWrapper

function mountSwitch(props: Record<string, unknown> = {}) {
  wrapper = mount(ToggleSwitch, {
    props: {
      modelValue: false,
      label: 'Active: Malaysia',
      'onUpdate:modelValue': (value: boolean) => wrapper.setProps({ modelValue: value }),
      ...props,
    },
    attachTo: document.body,
  }) as unknown as VueWrapper
  return wrapper
}

const button = () => wrapper.get('button')
const checked = () => button().attributes('aria-checked')

/** Dispatches a real keydown and reports whether the default action was prevented. */
function keydown(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  button().element.dispatchEvent(event)
  return event
}

afterEach(() => wrapper.unmount())

describe('ToggleSwitch', () => {
  it('is a switch with an accessible name and state', () => {
    mountSwitch({ modelValue: true })

    expect(button().attributes('role')).toBe('switch')
    expect(button().attributes('aria-label')).toBe('Active: Malaysia')
    expect(checked()).toBe('true')
  })

  it('toggles on click', async () => {
    mountSwitch()

    await button().trigger('click')

    expect(checked()).toBe('true')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it.each([' ', 'Enter'])('toggles once with %j and prevents the native click', async (key) => {
    mountSwitch()

    const event = keydown(key)
    await flushPromises()

    expect(event.defaultPrevented).toBe(true)
    expect(checked()).toBe('true')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('ignores other keys', async () => {
    mountSwitch()

    keydown('a')
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('shows the new value at once and keeps it when saving succeeds', async () => {
    let finish: () => void = () => {}
    const save = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    mountSwitch({ save })

    await button().trigger('click')

    expect(save).toHaveBeenCalledWith(true)
    expect(checked()).toBe('true') // optimistic
    expect(button().attributes('aria-busy')).toBe('true')

    finish()
    await flushPromises()

    expect(checked()).toBe('true')
    expect(wrapper.emitted('error')).toBeUndefined()
  })

  it('rolls back and emits the error when saving fails', async () => {
    const error = httpError(422, {
      message: 'Malaysia is the default company country and cannot be deactivated.',
      errors: { is_active: ['Malaysia is the default company country and cannot be deactivated.'] },
    })
    const save = vi.fn(async () => {
      throw error
    })
    mountSwitch({ modelValue: true, save })

    keydown(' ')
    await flushPromises()

    expect(save).toHaveBeenCalledWith(false)
    expect(checked()).toBe('true')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false], [true]])
    expect(wrapper.emitted('error')).toEqual([[error]])
  })

  it('does not toggle again while a save is pending', async () => {
    const save = vi.fn(() => new Promise<void>(() => {}))
    mountSwitch({ save })

    await button().trigger('click')
    await button().trigger('click')

    expect(save).toHaveBeenCalledTimes(1)
    expect(checked()).toBe('true')
  })

  it('does nothing when disabled', async () => {
    mountSwitch({ disabled: true })

    keydown('Enter')
    await flushPromises()

    expect(checked()).toBe('false')
  })
})
