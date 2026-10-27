<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import ReferenceFormDialog from '@/components/ReferenceFormDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { deleteAdminReference, listAdminReferences, updateAdminReference } from '@/api/references'
import { useDebounce } from '@/composables/useDebounce'
import { useToast } from '@/composables/useToast'
import { errorMessage, errorStatus } from '@/lib/errors'
import type { Paginated } from '@/types/auth'
import type { Reference, ReferenceType } from '@/types/passport'

/**
 * References (the operations head), the same way as Companies: every reference with search, a
 * type and an active filter, plus create, edit, (de)activate and delete. A reference with
 * passports cannot be deleted; it is deactivated instead.
 */
const PER_PAGE = 15

const route = useRoute()
const router = useRouter()
const toast = useToast()

const searchId = useId()
const typeId = useId()
const statusId = useId()

type StatusFilter = '' | 'active' | 'inactive'
type TypeFilter = '' | ReferenceType

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const query = computed(() => {
  const status = text(route.query.status)
  const type = text(route.query.type)
  const page = Number(text(route.query.page))
  return {
    q: text(route.query.q).trim(),
    type: (type === 'person' || type === 'agency' ? type : '') as TypeFilter,
    status: (status === 'active' || status === 'inactive' ? status : '') as StatusFilter,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
})
const hasFilters = computed(() => Boolean(query.value.q || query.value.type || query.value.status))

function queryWith(
  changes: Partial<{ q: string; type: TypeFilter; status: StatusFilter; page: number }>,
) {
  const next = { ...query.value, page: 1, ...changes }
  const result: LocationQuery = {}
  if (next.q) result.q = next.q
  if (next.type) result.type = next.type
  if (next.status) result.status = next.status
  if (next.page > 1) result.page = String(next.page)
  return result
}

const search = ref(query.value.q)
const debounced = useDebounce(
  () => router.replace({ query: queryWith({ q: search.value.trim() }) }),
  300,
)

const type = computed({
  get: () => query.value.type,
  set: (value: TypeFilter) => router.replace({ query: queryWith({ type: value }) }),
})

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

const list = shallowRef<Paginated<Reference> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const q = query.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listAdminReferences({
      q: q.q || undefined,
      type: q.type || undefined,
      is_active: q.status === 'active' ? 1 : q.status === 'inactive' ? 0 : undefined,
      page: q.page,
      per_page: PER_PAGE,
    })
    if (id === requestId) list.value = result
  } catch (error) {
    if (id === requestId && errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the references. Please try again.')
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

/* ---------- Create / edit ---------- */

const formOpen = ref(false)
const editing = ref<Reference | null>(null)

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(reference: Reference) {
  editing.value = reference
  formOpen.value = true
}

function onSaved(reference: Reference, created: boolean) {
  toast.success(
    created ? `Reference “${reference.name}” created.` : `Reference “${reference.name}” saved.`,
  )
  load()
}

/* ---------- Activate / deactivate ---------- */

const busyId = ref<number | null>(null)

async function setActive(reference: Reference, active: boolean) {
  busyId.value = reference.id
  try {
    await updateAdminReference(reference.id, { is_active: active })
    toast.success(
      active
        ? `Reference “${reference.name}” activated.`
        : `Reference “${reference.name}” deactivated.`,
    )
    load()
  } catch (error) {
    toast.error(errorMessage(error, 'Could not change the reference. Please try again.'))
  } finally {
    busyId.value = null
  }
}

/* ---------- Delete ---------- */

const deleteTarget = ref<Reference | null>(null)
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)
/** The API refused: the reference has passports. Offer to deactivate instead. */
const deleteBlocked = ref(false)

function askDelete(reference: Reference) {
  deleteTarget.value = reference
  deleteError.value = null
  deleteBlocked.value = false
  deleteOpen.value = true
}

async function confirmDelete() {
  const reference = deleteTarget.value
  if (!reference) return
  if (deleteBlocked.value) {
    // The confirm button now means "Deactivate instead".
    deleteOpen.value = false
    await setActive(reference, false)
    return
  }
  deleteBusy.value = true
  deleteError.value = null
  try {
    await deleteAdminReference(reference.id)
    deleteOpen.value = false
    toast.success(`Reference “${reference.name}” deleted.`)
    load()
  } catch (error) {
    const code = (error as { response?: { data?: { code?: string } } }).response?.data?.code
    if (errorStatus(error) === 422 && code === 'reference_has_passports') {
      deleteBlocked.value = true
    } else if (errorStatus(error) === 404) {
      deleteOpen.value = false
      load()
    } else if (errorStatus(error) !== 401) {
      deleteError.value = errorMessage(error, 'Could not delete the reference. Please try again.')
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
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">References</h1>
        <p class="mt-1 text-sm text-muted">
          Create, edit and deactivate the people and agencies who refer passports.
        </p>
      </div>
      <button type="button" class="btn btn-accent" data-create @click="openCreate">
        New reference
      </button>
    </div>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-label="References">
      <div role="search" class="flex flex-wrap items-end gap-4">
        <div class="w-full sm:w-72">
          <label :for="searchId" class="block text-sm font-medium text-slate-700">Search</label>
          <input
            :id="searchId"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Reference name"
            :class="inputClass"
            data-search
            @input="debounced.run()"
          />
        </div>
        <div class="w-full sm:w-44">
          <label :for="typeId" class="block text-sm font-medium text-slate-700">Type</label>
          <select :id="typeId" v-model="type" :class="inputClass" data-type-filter>
            <option value="">All</option>
            <option value="person">Person</option>
            <option value="agency">Agency</option>
          </select>
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
            <div class="h-4 w-1/4 rounded bg-slate-200" />
            <div class="h-4 w-1/6 rounded bg-slate-200" />
            <div class="h-4 w-1/5 rounded bg-slate-200" />
          </div>
          <span class="sr-only">Loading references…</span>
        </div>

        <div v-else-if="list.data.length === 0" class="py-12 text-center" data-empty>
          <p class="font-semibold text-ink">
            {{ hasFilters ? 'No references match these filters.' : 'No references yet.' }}
          </p>
          <button
            v-if="!hasFilters"
            type="button"
            class="btn btn-accent mt-5 text-sm"
            @click="openCreate"
          >
            New reference
          </button>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-stroke text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th scope="col" class="py-3 pr-4 font-semibold">Reference</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Phone</th>
                  <th scope="col" class="py-3 pr-4 text-right font-semibold">Passports</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Status</th>
                  <th scope="col" class="py-3 font-semibold">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-stroke">
                <tr v-for="r in list.data" :key="r.id" class="align-top" :data-reference="r.id">
                  <th scope="row" class="py-3 pr-4 text-left font-semibold text-ink">
                    {{ r.name }}
                    <span class="block text-xs font-normal text-muted">{{ r.type_label }}</span>
                    <span
                      v-if="r.notes"
                      class="block max-w-sm truncate text-xs font-normal text-muted"
                      :title="r.notes"
                    >
                      {{ r.notes }}
                    </span>
                  </th>
                  <td class="py-3 pr-4 whitespace-nowrap">{{ r.phone ?? '—' }}</td>
                  <td class="py-3 pr-4 text-right tabular-nums">{{ r.passports_count ?? '—' }}</td>
                  <td class="py-3 pr-4">
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
                      :class="
                        r.is_active
                          ? 'bg-green-50 text-green-800 ring-green-300'
                          : 'bg-slate-100 text-slate-700 ring-slate-300'
                      "
                      data-active
                    >
                      {{ r.is_active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="py-3">
                    <div class="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        :class="[actionClass, 'text-primary-700']"
                        data-edit
                        @click="openEdit(r)"
                      >
                        Edit<span class="sr-only"> {{ r.name }}</span>
                      </button>
                      <button
                        type="button"
                        :class="[actionClass, r.is_active ? 'text-amber-800' : 'text-green-800']"
                        :disabled="busyId === r.id"
                        :data-toggle-active="r.is_active ? 'deactivate' : 'activate'"
                        @click="setActive(r, !r.is_active)"
                      >
                        {{ r.is_active ? 'Deactivate' : 'Activate'
                        }}<span class="sr-only"> {{ r.name }}</span>
                      </button>
                      <button
                        type="button"
                        :class="[actionClass, 'text-red-700 hover:bg-red-50']"
                        data-delete
                        @click="askDelete(r)"
                      >
                        Delete<span class="sr-only"> {{ r.name }}</span>
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
            <p class="text-sm text-muted">
              Showing {{ list.meta.from ?? 0 }}–{{ list.meta.to ?? 0 }} of {{ list.meta.total }}
            </p>
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

    <ReferenceFormDialog v-model:open="formOpen" :reference="editing" @saved="onSaved" />

    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="deleteBlocked ? 'This reference cannot be deleted' : 'Delete reference'"
      :confirm-label="deleteBlocked ? 'Deactivate instead' : 'Delete'"
      :danger="!deleteBlocked"
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p v-if="deleteBlocked && deleteTarget" data-delete-blocked>
        <strong>{{ deleteTarget.name }}</strong> has passports, so it can't be deleted. You can
        deactivate it instead: it stays on its passports and in the reports, but can no longer be
        chosen for new passports.
      </p>
      <p v-else-if="deleteTarget">
        Delete the reference <strong>{{ deleteTarget.name }}</strong
        >? This cannot be undone.
      </p>
    </ConfirmDialog>
  </div>
</template>
