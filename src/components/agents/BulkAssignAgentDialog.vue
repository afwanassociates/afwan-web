<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { bulkAssignAgent, searchAgents } from '@/api/agents'
import { listPassports } from '@/api/passports'
import { searchReferences } from '@/api/references'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { businessToday, toDisplayDate } from '@/lib/dates'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { AgentSummary, BulkAgentResult } from '@/types/agents'
import type { PassportEntry, Reference } from '@/types/passport'

/**
 * Data entry: one recruitment agent and date for many passports at once (e.g. the passports that
 * went to agents before this feature). Lists passports with no agent and none waiting, at any
 * stage. Choosing a reference lists only its passports and ticks them all (reference-wise). Each goes to the Operations Head for approval; passports that cannot be assigned are
 * listed with the reason.
 */
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const searchId = useId()
const dateId = useId()
const remarkId = useId()
const today = businessToday()

const PER_PAGE = 100
/** A reference's passports are all listed (the API's most per page). */
const REFERENCE_PER_PAGE = 300

const reference = ref<Reference | null>(null)
const fetchReferences = (q: string) => searchReferences({ q })

const search = ref('')
const passports = ref<PassportEntry[]>([])
const total = ref(0)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const selected = ref<Set<number>>(new Set())

const agent = ref<AgentSummary | null>(null)
const date = ref(today)
const remark = ref('')
const errors = ref<Record<string, string>>({})
const banner = ref<string | null>(null)
const isSaving = ref(false)
const result = ref<BulkAgentResult | null>(null)

let requestId = 0
async function load() {
  const id = ++requestId
  isLoading.value = true
  loadError.value = null
  try {
    const page = await listPassports({
      q: search.value.trim() || undefined,
      reference_id: reference.value?.id,
      agent_status: 'none',
      medical_status: 'all',
      sort: 'passport_received_date',
      direction: 'asc',
      per_page: reference.value ? REFERENCE_PER_PAGE : PER_PAGE,
    })
    if (id !== requestId) return
    passports.value = page.data
    total.value = page.meta.total
    // Reference-wise: every passport of the reference is ticked.
    if (reference.value) selected.value = new Set(page.data.map((p) => p.id))
  } catch (error) {
    if (id === requestId && errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the passports.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}
const debounced = useDebounce(load, 300)

watch(open, (isOpen) => {
  if (!isOpen) return
  search.value = ''
  reference.value = null
  selected.value = new Set()
  agent.value = null
  date.value = today
  remark.value = ''
  errors.value = {}
  banner.value = null
  result.value = null
  load()
})

// A new reference lists (and ticks) its own passports.
watch(reference, () => {
  if (!open.value) return
  selected.value = new Set()
  load()
})

const allSelected = computed(
  () => passports.value.length > 0 && passports.value.every((p) => selected.value.has(p.id)),
)

function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(passports.value.map((p) => p.id))
}

const subtitle = (a: AgentSummary) => `${a.code} · RL ${a.rl_number}`

async function save() {
  if (isSaving.value) return
  banner.value = null
  const e: Record<string, string> = {}
  if (!selected.value.size) e.passport_ids = 'Tick at least one passport.'
  if (!agent.value) e.recruitment_agent_id = 'Choose the recruitment agent.'
  if (!date.value) e.assigned_date = 'Enter the date the passports went to the agent.'
  else if (date.value > today) e.assigned_date = 'The date cannot be in the future.'
  errors.value = e
  if (Object.keys(e).length) return

  isSaving.value = true
  try {
    const done = await bulkAssignAgent([...selected.value], {
      recruitment_agent_id: agent.value!.id,
      assigned_date: date.value,
      remark: remark.value.trim().replace(/\s+/g, ' ') || null,
    })
    result.value = done
    if (done.updated.length)
      toast.success(`${done.updated.length} passport(s) sent to the Operations Head for approval.`)
    emit('saved')
    selected.value = new Set()
    load()
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) banner.value = errorMessage(error)
    } else if (status === 403) {
      banner.value = 'Only the data entry team assigns recruitment agents.'
    } else if (status !== 401) {
      banner.value = errorMessage(error, 'Could not assign the agent. Please try again.')
    }
  } finally {
    isSaving.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 focus:border-primary-600'
const border = (field: string) => (errors.value[field] ? 'border-red-500' : 'border-slate-300')
</script>

<template>
  <BaseDialog
    v-model:open="open"
    title="Assign recruitment agent to many passports"
    :busy="isSaving"
  >
    <p
      v-if="banner"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ banner }}
    </p>

    <div
      v-if="result"
      class="mb-4 rounded-lg border border-stroke bg-surface px-3 py-2.5 text-sm"
      role="status"
      data-bulk-result
    >
      <p class="font-semibold text-ink">
        {{ result.updated.length }} sent for approval · {{ result.skipped.length }} skipped
      </p>
      <ul v-if="result.skipped.length" class="mt-1 list-disc space-y-0.5 pl-5 text-red-800">
        <li v-for="row in result.skipped" :key="row.id">
          {{ row.passport_number ?? `#${row.id}` }}: {{ row.reason }}
        </li>
      </ul>
    </div>

    <form class="space-y-4" novalidate @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <div data-field="recruitment_agent_id">
          <SearchSelect
            v-model="agent"
            :fetch="searchAgents"
            :subtitle-of="subtitle"
            label="Recruitment Agent"
            placeholder="Search name, ID or RL number"
            :error="errors.recruitment_agent_id"
            required
          />
        </div>
        <div data-field="assigned_date">
          <label :for="dateId" class="block text-sm font-medium text-slate-700">
            Date sent to the agent<span class="text-red-700" aria-hidden="true"> *</span>
          </label>
          <input
            :id="dateId"
            v-model="date"
            type="date"
            :max="today"
            :class="[inputClass, border('assigned_date')]"
          />
          <p v-if="errors.assigned_date" class="mt-1 text-sm text-red-700">
            {{ errors.assigned_date }}
          </p>
        </div>
      </div>
      <div>
        <label :for="remarkId" class="block text-sm font-medium text-slate-700">Remark</label>
        <input
          :id="remarkId"
          v-model="remark"
          type="text"
          maxlength="500"
          placeholder="Optional"
          :class="[inputClass, 'border-slate-300']"
        />
      </div>

      <div class="border-t border-stroke pt-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="w-full sm:w-72" data-field="reference">
            <SearchSelect
              v-model="reference"
              :fetch="fetchReferences"
              label="Reference"
              placeholder="All references"
              hint="Choose one to assign all its passports"
              clearable
            />
          </div>
          <div class="w-full sm:w-72">
            <label :for="searchId" class="block text-sm font-medium text-slate-700">
              Passports without an agent
            </label>
            <input
              :id="searchId"
              v-model="search"
              type="search"
              autocomplete="off"
              placeholder="Name or passport number"
              :class="[inputClass, 'border-slate-300']"
              @input="debounced.run()"
            />
          </div>
          <p class="text-sm text-muted">
            {{ selected.size }} ticked · {{ total }} without an agent
            <template v-if="total > passports.length"
              >(first {{ passports.length }} shown)</template
            >
          </p>
        </div>
        <p v-if="errors.passport_ids" class="mt-2 text-sm text-red-700">
          {{ errors.passport_ids }}
        </p>
        <p v-if="loadError" class="mt-3 text-sm text-red-700">{{ loadError }}</p>
        <p v-else-if="!isLoading && passports.length === 0" class="mt-4 text-sm text-muted">
          Every passport has an agent (or one waiting for approval).
        </p>
        <div v-else class="mt-3 max-h-80 overflow-y-auto rounded-lg border border-stroke">
          <table class="w-full text-left text-sm" :aria-busy="isLoading">
            <thead class="sticky top-0 bg-white text-xs tracking-wider text-muted uppercase">
              <tr>
                <th scope="col" class="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    :checked="allSelected"
                    aria-label="Tick all shown passports"
                    data-select-all
                    @change="toggleAll"
                  />
                </th>
                <th scope="col" class="py-2 pr-3 font-semibold">No.</th>
                <th scope="col" class="py-2 pr-3 font-semibold">Passport</th>
                <th scope="col" class="py-2 pr-3 font-semibold">Reference</th>
                <th scope="col" class="py-2 pr-3 font-semibold">Received</th>
                <th scope="col" class="py-2 pr-3 font-semibold">Medical slip</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stroke">
              <tr v-for="p in passports" :key="p.id" :data-bulk-passport="p.id">
                <td class="px-3 py-2">
                  <input
                    type="checkbox"
                    :checked="selected.has(p.id)"
                    :aria-label="`Tick ${p.passport_number}`"
                    @change="toggle(p.id)"
                  />
                </td>
                <td class="py-2 pr-3 tabular-nums">{{ p.entry_no }}</td>
                <td class="py-2 pr-3">
                  <span class="font-medium text-ink">{{ p.passport_name }}</span>
                  <span class="block font-mono text-xs text-slate-600">{{
                    p.passport_number
                  }}</span>
                </td>
                <td class="py-2 pr-3">{{ p.reference?.name ?? '—' }}</td>
                <td class="py-2 pr-3 whitespace-nowrap">
                  {{ toDisplayDate(p.passport_received_date) }}
                </td>
                <td class="py-2 pr-3 whitespace-nowrap">
                  {{ toDisplayDate(p.medical_slip?.date ?? p.medical_slip_date) || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="isSaving"
          @click="open = false"
        >
          Close
        </button>
        <button type="submit" class="btn btn-primary" :disabled="isSaving" data-action="save">
          {{ isSaving ? 'Sending…' : `Send ${selected.size || ''} for approval` }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
