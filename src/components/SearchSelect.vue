<script setup lang="ts" generic="T extends { id: number; name: string }">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue'
import { useDebounce } from '@/composables/useDebounce'

/**
 * Searchable single-select combobox (WAI-ARIA combobox + listbox pattern).
 * Typing searches through `fetch` (debounced); an optional "add new" option emits `add`
 * with the text typed so far.
 */
const model = defineModel<T | null>({ required: true })
const props = withDefaults(
  defineProps<{
    fetch: (query: string) => Promise<T[]>
    label: string
    placeholder?: string
    error?: string
    hint?: string
    /** Text of the "add new" option, e.g. "Add new company". Omit to hide it. */
    addLabel?: string
    required?: boolean
    disabled?: boolean
    /** Search delay in milliseconds. */
    debounce?: number
    /** Show a button that clears the selection (useful for filters). */
    clearable?: boolean
  }>(),
  {
    placeholder: undefined,
    error: undefined,
    hint: undefined,
    addLabel: undefined,
    required: false,
    disabled: false,
    debounce: 300,
    clearable: false,
  },
)
const emit = defineEmits<{ add: [query: string] }>()
defineSlots<{ option?(props: { item: T; active: boolean; selected: boolean }): unknown }>()

const inputId = useId()
const listboxId = `${inputId}-listbox`
const hintId = `${inputId}-hint`
const errorId = `${inputId}-error`

const root = useTemplateRef<HTMLDivElement>('root')
const input = useTemplateRef<HTMLInputElement>('input')

const query = ref(model.value?.name ?? '')
const isOpen = ref(false)
const items = shallowRef<T[]>([])
const isLoading = ref(false)
const loadFailed = ref(false)
const activeIndex = ref(-1)

/** Index of the "add new" option (after the results), or -1 when there is none. */
const addIndex = computed(() => (props.addLabel ? items.value.length : -1))
const optionCount = computed(() => items.value.length + (props.addLabel ? 1 : 0))

const optionId = (index: number) => `${listboxId}-option-${index}`

const describedBy = computed(
  () => [props.hint && hintId, props.error && errorId].filter(Boolean).join(' ') || undefined,
)

const statusText = computed(() => {
  if (!isOpen.value) return ''
  if (isLoading.value) return 'Searching…'
  if (loadFailed.value) return 'Could not load results.'
  const n = items.value.length
  return n === 0 ? 'No results.' : `${n} result${n === 1 ? '' : 's'} available.`
})

// Keep the text in sync when the parent sets or clears the value (prefill, form reset).
watch(model, (value) => {
  if (value) query.value = value.name
  else if (!isOpen.value) query.value = ''
})

/* ---------- Searching ---------- */

let requestId = 0

async function load(text: string) {
  const id = ++requestId
  isLoading.value = true
  loadFailed.value = false
  try {
    const result = await props.fetch(text.trim())
    if (id !== requestId) return
    items.value = result
    activeIndex.value = result.length > 0 ? 0 : -1
  } catch {
    if (id !== requestId) return
    items.value = []
    activeIndex.value = -1
    loadFailed.value = true
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

const debouncedLoad = useDebounce((text: string) => load(text), props.debounce)

function openList() {
  if (props.disabled || isOpen.value) return
  isOpen.value = true
  debouncedLoad.cancel()
  // When an item is selected, show the full list rather than only that item.
  load(model.value ? '' : query.value)
}

function close() {
  isOpen.value = false
  activeIndex.value = -1
  debouncedLoad.cancel()
  if (model.value) query.value = model.value.name
}

/* ---------- Choosing ---------- */

function select(item: T) {
  model.value = item
  query.value = item.name
  close()
}

function chooseAdd() {
  const text = query.value.trim()
  close()
  emit('add', model.value ? '' : text)
}

function choose(index: number) {
  if (index === addIndex.value) chooseAdd()
  else {
    const item = items.value[index]
    if (item) select(item)
  }
}

/* ---------- Events ---------- */

function onInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value
  // Editing the text drops the previous selection until a new item is chosen.
  if (model.value && query.value !== model.value.name) model.value = null
  isOpen.value = true
  isLoading.value = true
  loadFailed.value = false
  debouncedLoad.run(query.value)
}

function onFocus() {
  // Tabbing into an empty field shows the list straight away (fast data entry).
  if (!model.value) openList()
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (!isOpen.value) openList()
      else if (optionCount.value > 0)
        activeIndex.value = (activeIndex.value + 1) % optionCount.value
      break
    case 'ArrowUp':
      event.preventDefault()
      if (!isOpen.value) openList()
      else if (optionCount.value > 0)
        activeIndex.value = activeIndex.value <= 0 ? optionCount.value - 1 : activeIndex.value - 1
      break
    case 'Enter':
      // With an option highlighted, Enter picks it; otherwise it submits the form as usual.
      if (isOpen.value && activeIndex.value >= 0) {
        event.preventDefault()
        choose(activeIndex.value)
      }
      break
    case 'Escape':
      if (isOpen.value) {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
      break
    case 'Tab':
      if (isOpen.value) close()
      break
  }
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (isOpen.value && !root.value?.contains(next)) close()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (isOpen.value && !root.value?.contains(event.target as Node)) close()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

// Keep the highlighted option visible while moving with the arrow keys.
watch(activeIndex, async (index) => {
  if (index < 0) return
  await nextTick()
  const el = document.getElementById(optionId(index))
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
})

function clear() {
  model.value = null
  query.value = ''
  input.value?.focus()
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div ref="root" class="relative" @focusout="onFocusOut">
    <label :for="inputId" class="block text-sm font-medium text-slate-700">
      {{ label }}<span v-if="required" class="text-red-700" aria-hidden="true"> *</span>
    </label>
    <div class="relative mt-1">
      <input
        :id="inputId"
        ref="input"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        :aria-expanded="isOpen"
        :aria-controls="listboxId"
        :aria-activedescendant="isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :aria-required="required ? 'true' : undefined"
        :value="query"
        :placeholder="placeholder"
        :disabled="disabled"
        class="block w-full rounded-lg border bg-white py-2.5 pl-3 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600 disabled:bg-slate-100"
        :class="[
          error ? 'border-red-500' : 'border-slate-300',
          clearable && model ? 'pr-16' : 'pr-10',
        ]"
        @input="onInput"
        @focus="onFocus"
        @click="openList"
        @keydown="onKeydown"
      />
      <button
        v-if="clearable && model && !disabled"
        type="button"
        class="absolute inset-y-0 right-8 my-auto flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        @click="clear"
      >
        <span class="sr-only">Clear {{ label }}</span>
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <span
        class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500"
        aria-hidden="true"
      >
        <svg
          v-if="isOpen && isLoading"
          class="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M12 3a9 9 0 1 0 9 9" stroke-linecap="round" />
        </svg>
        <svg
          v-else
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </div>

    <ul
      v-show="isOpen"
      :id="listboxId"
      role="listbox"
      :aria-label="label"
      class="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-stroke bg-white py-1 text-sm shadow-[0_18px_40px_-18px_rgb(0_0_100/0.4)]"
    >
      <li
        v-for="(item, i) in items"
        :id="optionId(i)"
        :key="item.id"
        role="option"
        :aria-selected="model?.id === item.id"
        class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5"
        :class="i === activeIndex ? 'bg-primary-50 text-primary-900' : 'text-slate-800'"
        @mousedown.prevent="select(item)"
        @mousemove="activeIndex = i"
      >
        <slot
          name="option"
          :item="item"
          :active="i === activeIndex"
          :selected="model?.id === item.id"
        >
          <span class="truncate">{{ item.name }}</span>
        </slot>
        <svg
          v-if="model?.id === item.id"
          class="h-4 w-4 shrink-0 text-primary-700"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </li>

      <li v-if="isLoading && items.length === 0" role="presentation" class="px-3 py-2.5 text-muted">
        Searching…
      </li>
      <li v-else-if="loadFailed" role="presentation" class="px-3 py-2.5 text-red-700">
        Could not load results. Type to try again.
      </li>
      <li
        v-else-if="!isLoading && items.length === 0"
        role="presentation"
        class="px-3 py-2.5 text-muted"
      >
        No results{{ query.trim() ? ` for “${query.trim()}”` : '' }}.
      </li>

      <li
        v-if="addLabel"
        :id="optionId(addIndex)"
        role="option"
        aria-selected="false"
        class="cursor-pointer border-t border-stroke px-3 py-2.5 font-semibold text-primary-700"
        :class="{ 'bg-primary-50': activeIndex === addIndex }"
        @mousedown.prevent="chooseAdd"
        @mousemove="activeIndex = addIndex"
      >
        + {{ addLabel }}
      </li>
    </ul>

    <p class="sr-only" role="status" aria-live="polite">{{ statusText }}</p>
    <p v-if="hint" :id="hintId" class="mt-1 text-xs text-muted">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="mt-1 text-sm text-red-700">{{ error }}</p>
  </div>
</template>
