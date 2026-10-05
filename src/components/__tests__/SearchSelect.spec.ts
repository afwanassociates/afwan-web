import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import SearchSelect from '../SearchSelect.vue'

interface Item {
  id: number
  name: string
}

const ITEMS: Item[] = [
  { id: 1, name: 'Alpha Trading' },
  { id: 2, name: 'Beta Builders' },
  { id: 3, name: 'Gamma Group' },
]

let wrapper: VueWrapper
let fetch: ReturnType<typeof vi.fn<(query: string) => Promise<Item[]>>>

function mountSelect(props: Record<string, unknown> = {}) {
  fetch = vi.fn(async (query: string) =>
    ITEMS.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
  )
  wrapper = mount(SearchSelect, {
    props: {
      modelValue: null,
      fetch,
      label: 'Company name',
      addLabel: 'Add new company',
      'onUpdate:modelValue': (value: Item | null) => wrapper.setProps({ modelValue: value }),
      ...props,
    },
    attachTo: document.body,
  }) as unknown as VueWrapper
  return wrapper
}

/** Last element (the test tsconfig has no Array.prototype.at). */
const last = <T>(items: T[]): T | undefined => items[items.length - 1]

const input = () => wrapper.get('input[role="combobox"]')
const listbox = () => wrapper.get('[role="listbox"]')
const options = () => wrapper.findAll('[role="option"]')
const isOpen = () => input().attributes('aria-expanded') === 'true'
const press = (key: string) => input().trigger('keydown', { key })

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  wrapper.unmount()
  vi.useRealTimers()
})

describe('SearchSelect', () => {
  it('is an accessible combobox linked to its label and listbox', () => {
    mountSelect({ error: 'Select a company.' })

    const el = input()
    expect(el.attributes('aria-controls')).toBe(listbox().attributes('id'))
    expect(wrapper.get('label').attributes('for')).toBe(el.attributes('id'))
    expect(el.attributes('aria-invalid')).toBe('true')
    const errorId = el.attributes('aria-describedby')
    expect(wrapper.get(`#${errorId}`).text()).toBe('Select a company.')
  })

  describe('search', () => {
    it('waits 300 ms after the last keystroke before searching', async () => {
      mountSelect()

      await input().setValue('be')
      vi.advanceTimersByTime(299)
      expect(fetch).not.toHaveBeenCalled()

      await input().setValue('bet')
      vi.advanceTimersByTime(299)
      expect(fetch).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith('bet')

      await flushPromises()
      expect(isOpen()).toBe(true)
      expect(options().map((o) => o.text())).toEqual(['Beta Builders', '+ Add new company'])
    })

    it('shows a loading state, then "no results"', async () => {
      mountSelect()

      await input().setValue('zzz')
      expect(listbox().text()).toContain('Searching…')

      vi.advanceTimersByTime(300)
      await flushPromises()
      expect(listbox().text()).toContain('No results for “zzz”.')
      // The "add new" option is still offered.
      expect(options().map((o) => o.text())).toEqual(['+ Add new company'])
    })

    it('ignores a slow response that arrives after a newer one', async () => {
      mountSelect()
      let resolveSlow: (items: Item[]) => void = () => {}
      fetch.mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)))
      fetch.mockImplementationOnce(async () => [ITEMS[2]!])

      await input().setValue('a')
      vi.advanceTimersByTime(300)
      await input().setValue('gam')
      vi.advanceTimersByTime(300)
      await flushPromises()
      resolveSlow([ITEMS[0]!])
      await flushPromises()

      expect(options()[0]!.text()).toBe('Gamma Group')
    })
  })

  describe('selecting', () => {
    it('selects an option on click and closes the list', async () => {
      mountSelect()
      await input().trigger('focus')
      await flushPromises()
      expect(options()).toHaveLength(4)

      await options()[1]!.trigger('mousedown')

      expect(last(wrapper.emitted('update:modelValue') ?? [])).toEqual([ITEMS[1]])
      expect(isOpen()).toBe(false)
      expect((input().element as HTMLInputElement).value).toBe('Beta Builders')
    })

    it('clears the selection when the text is edited', async () => {
      mountSelect({ modelValue: ITEMS[0] })
      expect((input().element as HTMLInputElement).value).toBe('Alpha Trading')

      await input().setValue('Alpha Trad')

      expect(last(wrapper.emitted('update:modelValue') ?? [])).toEqual([null])
    })

    it('emits "add" with the typed text from the add-new option', async () => {
      mountSelect()
      await input().setValue('New Co')
      vi.advanceTimersByTime(300)
      await flushPromises()

      await last(options())!.trigger('mousedown')

      expect(wrapper.emitted('add')).toEqual([['New Co']])
      expect(isOpen()).toBe(false)
    })
  })

  describe('keyboard', () => {
    it('ArrowDown opens the list; arrows move; Enter selects', async () => {
      mountSelect()

      await press('ArrowDown')
      await flushPromises()
      expect(isOpen()).toBe(true)
      expect(input().attributes('aria-activedescendant')).toBe(options()[0]!.attributes('id'))

      await press('ArrowDown')
      expect(input().attributes('aria-activedescendant')).toBe(options()[1]!.attributes('id'))
      await press('ArrowUp')
      await press('ArrowUp') // wraps to the last option ("add new")
      expect(input().attributes('aria-activedescendant')).toBe(options()[3]!.attributes('id'))
      await press('ArrowDown') // wraps back to the first
      await press('ArrowDown')

      await press('Enter')

      expect(last(wrapper.emitted('update:modelValue') ?? [])).toEqual([ITEMS[1]])
      expect(isOpen()).toBe(false)
    })

    it('Enter on the add-new option emits "add"', async () => {
      mountSelect()
      await press('ArrowDown')
      await flushPromises()

      await press('ArrowUp')
      await press('Enter')

      expect(wrapper.emitted('add')).toHaveLength(1)
    })

    it('Escape closes the list without selecting', async () => {
      mountSelect()
      await press('ArrowDown')
      await flushPromises()
      expect(isOpen()).toBe(true)

      await press('Escape')

      expect(isOpen()).toBe(false)
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('lets Enter submit the form when the list is closed', () => {
      mountSelect()
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })

      input().element.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
    })
  })

  it('closes when clicking outside', async () => {
    mountSelect()
    await press('ArrowDown')
    await flushPromises()

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(isOpen()).toBe(false)
  })
})
