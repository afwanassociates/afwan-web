<script setup lang="ts">
import { usePerPage } from '@/composables/usePerPage'
import PerPageSelect from '@/components/PerPageSelect.vue'
import { computed, nextTick, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import QuickAddModal, { type QuickAddValues } from '@/components/QuickAddModal.vue'
import {
  createMedicalCenter,
  deleteMedicalCenter,
  listMedicalCenters,
  updateMedicalCenter,
} from '@/api/medicalCenters'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { Paginated } from '@/types/auth'
import type { MedicalCenter } from '@/types/medical'

/** Rows per page (the dropdown by the pagination): reload from page 1 when it changes. */
const perPage = usePerPage(() => load())

/**
 * Medical centers (the operations head): every centre with search and an active filter,
 * plus add, rename, (de)activate and delete. Delete shows only for a centre no passport
 * names (deleted ones included); any other one is deactivated instead, so it stays on its
 * passports but can no longer be chosen on a medical slip.
 */

const route = useRoute()
const router = useRouter()
const toast = useToast()

const searchId = useId()
const statusId = useId()

type StatusFilter = '' | 'active' | 'inactive'

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const query = computed(() => {
  const status = text(route.query.status)
  const page = Number(text(route.query.page))
  return {
    q: text(route.query.q).trim(),
    status: (status === 'active' || status === 'inactive' ? status : '') as StatusFilter,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
const hasFilters = computed(() => Boolean(query.value.q || query.value.status))

function queryWith(changes: Partial<{ q: string; status: StatusFilter; page: number }>) {
  const next = { ...query.value, page: 1, ...changes }
  const result: LocationQuery = {}
  if (next.q) result.q = next.q
  if (next.status) result.status = next.status
  if (next.page > 1) result.page = String(next.page)
  return result
}

const search = ref(query.value.q)
const debounced = useDebounce(
  () => router.replace({ query: queryWith({ q: search.value.trim() }) }),
  300,
)

const status = computed({
  get: () => query.value.status,
  set: (value: StatusFilter) => router.replace({ query: queryWith({ status: value }) }),
})

function clearFilters() {
  search.value = ''
  debounced.cancel()
  router.replace({ query: {} })
}

/* ---------- Loading ---------- */

const list = shallowRef<Paginated<MedicalCenter> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const q = query.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listMedicalCenters({
      q: q.q || undefined,
      is_active: q.status === 'active' ? 1 : q.status === 'inactive' ? 0 : undefined,
      page: q.page,
      per_page: perPage.value,
    })
    if (id === requestId) list.value = result
  } catch (error) {
    if (id === requestId && errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the medical centers. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => JSON.stringify(query.value),
  () => {
    if (search.value.trim() !== query.value.q) search.value = query.value.q
    load()
  },
  { immediate: true },
)

const pageLink = (page: number) => ({ query: queryWith({ ...query.value, page }) })

/* ---------- Add / rename ---------- */

const formOpen = ref(false)
const editing = ref<MedicalCenter | null>(null)

/** The dialog takes its name when it opens, so set the target first. */
async function openForm(center: MedicalCenter | null) {
  editing.value = center
  await nextTick()
  formOpen.value = true
}
const openCreate = () => openForm(null)
const openEdit = (center: MedicalCenter) => openForm(center)

function saveCenter(values: QuickAddValues): Promise<MedicalCenter> {
  return editing.value
    ? updateMedicalCenter(editing.value.id, { name: values.name })
    : createMedicalCenter(values.name)
}

function onSaved(center: MedicalCenter) {
  toast.success(
    editing.value
      ? `Medical center “${center.name}” saved.`
      : `Medical center “${center.name}” added.`,
  )
  load()
}

/* ---------- Activate / deactivate ---------- */

const busyId = ref<number | null>(null)

async function setActive(center: MedicalCenter, active: boolean) {
  busyId.value = center.id
  try {
    await updateMedicalCenter(center.id, { is_active: active })
    toast.success(
      active
        ? `Medical center “${center.name}” activated.`
        : `Medical center “${center.name}” deactivated.`,
    )
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not change the medical center. Please try again.'))
  } finally {
    busyId.value = null
  }
}

/* ---------- Delete ---------- */

const deleteTarget = ref<MedicalCenter | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)
/** The API refused: a passport names the centre. Offer to deactivate instead. */
const deleteBlocked = ref(false)

function askDelete(center: MedicalCenter) {
  deleteTarget.value = center
  deleteError.value = null
  deleteBlocked.value = false
  deleteOpen.value = true
}

async function confirmDelete() {
  const center = deleteTarget.value
  if (!center) return
  if (deleteBlocked.value) {
    // The confirm button now means "Deactivate instead".
    deleteOpen.value = false
    await setActive(center, false)
    return
  }
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteMedicalCenter(center.id)
    deleteOpen.value = false
    toast.success(`Medical center “${center.name}” deleted.`)
    load()
  } catch (error) {
    const code = (error as { response?: { data?: { code?: string } } }).response?.data?.code
    if (errorStatus(error) === 422 && code === 'medical_center_has_passports') {
      deleteBlocked.value = true
    } else if (errorStatus(error) === 404) {
      deleteOpen.value = false
      load()
    } else if (errorStatus(error) !== 401) {
      deleteError.value = errorMessage(
        error,
        'Could not delete the medical center. Please try again.',
      )
    }
  } finally {
    deleteBusy.value = false
  }
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
const actionClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold whitespace-nowrap hover:bg-primary-50 focus-visible:bg-primary-50 disabled:opacity-50'
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Medical Centers</h1>
        <p class="mt-1 text-sm text-muted">
          Add, rename and deactivate the medical centers chosen on medical slips.
        </p>
      </div>
      <button type="button" class="btn btn-accent" data-create @click="openCreate">
        New medical center
      </button>
    </div>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="Medical centers">
      <div role="search" class="flex flex-wrap items-end gap-4">
        <div class="w-full sm:w-72">
          <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="searchId"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Medical center name"
            :class="inputClass"
            data-search
            @input="debounced.run()"
          />
        </div>
        <div class="w-full sm:w-44">
          <label :for="statusId" class="block text-sm font-medium text-slate-700">Status</label>
          <select :id="statusId" v-model="status" :class="inputClass" data-status-filter>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button
          v-if="hasFilters"
          type="button"
          class="pb-3 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>

      <div class="mt-6 border-t border-stroke pt-2" :aria-busy="isLoading">
        <div v-if="loadError" role="alert" class="space-y-4 py-10 text-center" data-error>
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>

        <div v-else-if="!list" class="animate-pulse space-y-3 py-4" data-skeleton>
          <div v-for="n in 6" :key="n" class="flex gap-4">
            <div class="h-4 w-1/3 rounded bg-slate-200" />
            <div class="h-4 w-1/6 rounded bg-slate-200" />
          </div>
          <span class="sr-only">Loading medical centers…</span>
        </div>

        <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No medical centers match these filters.' : 'No medical centers yet.' }}
          </p>
          <button
            v-if="!hasFilters"
            type="button"
            class="btn btn-accent mt-5 text-sm"
            @click="openCreate"
          >
            New medical center
          </button>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th scope="col" class="py-3 pr-4 font-semibold">Medical center</th>
                  <th scope="col" class="py-3 pr-4 text-right font-semibold">Passports</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Status</th>
                  <th scope="col" class="py-3 font-semibold">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="c in list.data" :key="c.id" class="align-top" :data-center="c.id">
                  <th scope="row" class="py-3 pr-4 text-left font-semibold text-ink">
                    {{ c.name }}
                  </th>
                  <td class="py-3 pr-4 text-right tabular-nums" data-passports>
                    {{ c.passports_count }}
                  </td>
                  <td class="py-3 pr-4">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                      :class="
                        c.is_active
                          ? 'bg-green-50 text-green-800 ring-green-300'
                          : 'bg-slate-100 text-slate-700 ring-slate-300'
                      "
                      data-active
                    >
                      {{ c.is_active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="py-3">
                    <div class="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        :class="[actionClass, 'text-primary-700']"
                        data-edit
                        @click="openEdit(c)"
                      >
                        Rename<span class="sr-only"> {{ c.name }}</span>
                      </button>
                      <button
                        type="button"
                        :class="[actionClass, c.is_active ? 'text-amber-800' : 'text-green-800']"
                        :disabled="busyId === c.id"
                        :data-toggle-active="c.is_active ? 'deactivate' : 'activate'"
                        @click="setActive(c, !c.is_active)"
                      >
                        {{ c.is_active ? 'Deactivate' : 'Activate'
                        }}<span class="sr-only"> {{ c.name }}</span>
                      </button>
                      <!-- Only a centre no passport names (deleted ones included) can be deleted. -->
                      <button
                        v-if="c.can_delete"
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-delete
                        @click="askDelete(c)"
                      >
                        Delete<span class="sr-only"> {{ c.name }}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <nav
            aria-label="Pagination"
            class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-stroke pt-4 sm:flex-row"
          >
            <div class="flex flex-wrap items-center justify-center gap-4">
              <p class="text-sm text-muted">
                Showing {{ list.meta.from ?? 0 }}–{{ list.meta.to ?? 0 }} of {{ list.meta.total }}
              </p>
              <PerPageSelect />
            </div>
            <div v-if="list.meta.last_page > 1" class="flex items-center gap-2">
              <RouterLink
                v-if="list.meta.current_page > 1"
                :to="pageLink(list.meta.current_page - 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Previous
              </RouterLink>
              <span class="px-2 text-sm text-muted">
                Page {{ list.meta.current_page }} of {{ list.meta.last_page }}
              </span>
              <RouterLink
                v-if="list.meta.current_page < list.meta.last_page"
                :to="pageLink(list.meta.current_page + 1)"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Next
              </RouterLink>
            </div>
          </nav>
        </div>
      </div>
    </section>

    <QuickAddModal
      v-model:open="formOpen"
      :title="editing ? 'Rename medical center' : 'New medical center'"
      name-label="Medical center name"
      :initial-name="editing?.name ?? ''"
      :save="saveCenter"
      @saved="onSaved"
    />

    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="deleteBlocked ? 'This medical center cannot be deleted' : 'Delete medical center'"
      :confirm-label="deleteBlocked ? 'Deactivate instead' : 'Delete'"
      :danger="!deleteBlocked"
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteBlocked && deleteTarget" data-delete-blocked>
        <strong>{{ deleteTarget.name }}</strong> is used on passports, so it can't be deleted. You
        can deactivate it instead: it stays on its passports, but can no longer be chosen on a
        medical slip.
      </p>
      <p v-else-if="deleteTarget">
        Delete the medical center <strong>{{ deleteTarget.name }}</strong
        >? This cannot be undone.
      </p>
    </ConfirmDialog>
  </div>
</template>
