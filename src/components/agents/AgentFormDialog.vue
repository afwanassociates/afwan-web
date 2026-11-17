<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import { createAgent, updateAgent } from '@/api/agents'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { MygramAgent, MygramAgentPayload } from '@/types/agents'

/** Add or edit a MYGRAM agent (the Operations Head). The RL number is required and unique. */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ agent: MygramAgent | null }>()
const emit = defineEmits<{ saved: [agent: MygramAgent, created: boolean] }>()

const id = useId()
const form = ref<MygramAgentPayload>({ name: '', rl_number: '', phone: '', address: '', notes: '' })
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)

const title = computed(() => (props.agent ? `Edit ${props.agent.code}` : 'New MYGRAM agent'))

watch(open, (isOpen) => {
  if (!isOpen) return
  const a = props.agent
  form.value = {
    name: a?.name ?? '',
    rl_number: a?.rl_number ?? '',
    phone: a?.phone ?? '',
    address: a?.address ?? '',
    notes: a?.notes ?? '',
  }
  errors.value = {}
  banner.value = null
})

const squish = (value: string | null) => (value ?? '').trim().replace(/\s+/g, ' ')

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!squish(form.value.name)) e.name = "Enter the agent's name."
  if (!squish(form.value.rl_number)) e.rl_number = 'Enter the RL number.'
  errors.value = e
  if (Object.keys(e).length) return

  const payload: MygramAgentPayload = {
    name: squish(form.value.name),
    rl_number: squish(form.value.rl_number).toUpperCase(),
    phone: squish(form.value.phone) || null,
    address: squish(form.value.address) || null,
    notes: squish(form.value.notes) || null,
  }
  isSaving.value = true
  try {
    const saved = props.agent
      ? await updateAgent(props.agent.id, payload)
      : await createAgent(payload)
    emit('saved', saved, !props.agent)
    open.value = false
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (status === 403) {
      banner.value = 'Only the Operations Head manages MYGRAM agents.'
    } else if (status !== 401) {
      banner.value = errorMessage(error, 'Could not save the agent. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600'
const border = (field: string) => (errors.value[field] ? 'border-red-500' : 'border-slate-300')
const FIELDS = [
  { key: 'name', label: 'Name', required: true, max: 150 },
  { key: 'rl_number', label: 'RL number', required: true, max: 50 },
  { key: 'phone', label: 'Phone', required: false, max: 20 },
  { key: 'address', label: 'Address', required: false, max: 255 },
  { key: 'notes', label: 'Notes', required: false, max: 500 },
] as const
</script>

<template>
  <BaseDialog v-model:open="open" :title="title" :busy="isSaving">
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>
    <form class="space-y-4" novalidate @submit.prevent="save">
      <div v-for="field in FIELDS" :key="field.key" :data-field="field.key">
        <label :for="`${id}-${field.key}`" class="block text-sm font-medium text-slate-700">
          {{ field.label
          }}<span v-if="field.required" class="text-red-700" aria-hidden="true"> *</span>
        </label>
        <input
          :id="`${id}-${field.key}`"
          v-model="form[field.key]"
          type="text"
          :maxlength="field.max"
          autocomplete="off"
          :class="[inputClass, border(field.key), field.key === 'rl_number' ? 'uppercase' : '']"
          :aria-invalid="errors[field.key] ? 'true' : undefined"
        />
        <p v-if="errors[field.key]" class="mt-1 text-sm text-red-700">{{ errors[field.key] }}</p>
      </div>
      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isSaving" data-action="save">
          {{ isSaving ? 'Saving…' : agent ? 'Save changes' : 'Add agent' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
