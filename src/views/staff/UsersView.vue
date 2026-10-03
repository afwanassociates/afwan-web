<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { RouterLink, useRoute, useRouter, type LocationQuery } from 'vue-router'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import UserFormDialog from '@/components/staff/UserFormDialog.vue'
import ResetPasswordDialog from '@/components/staff/ResetPasswordDialog.vue'
import UserRowActions from '@/components/staff/UserRowActions.vue'
import { ROLES, ROLE_LIST } from '@/lib/roles'
import { fetchAssignableRoles, listUsers, updateUser } from '@/lib/users'
import { errorMessage, errorStatus } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import type { Paginated, Role, RoleOption, User } from '@/types/auth'

type Status = '' | 'active' | 'inactive'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const roleFilterId = useId()
const statusFilterId = useId()

/* ---------- Filters and page, kept in the URL query ---------- */

interface Filters {
  role: Role | ''
  status: Status
  page: number
}

const filters = computed<Filters>(() => {
  const { role, status, page } = route.query
  const pageNumber = Number(page)
  return {
    role: ROLE_LIST.includes(role as Role) ? (role as Role) : '',
    status: status === 'active' || status === 'inactive' ? status : '',
    page: Number.isInteger(pageNumber) && pageNumber > 1 ? pageNumber : 1,
  }
})

function queryWith(changes: { role?: string; status?: string; page?: number }): LocationQuery {
  const next = { ...filters.value, ...changes }
  const query: LocationQuery = {}
  if (next.role) query.role = next.role
  if (next.status) query.status = next.status
  if (next.page > 1) query.page = String(next.page)
  return query
}

const roleFilter = computed({
  get: () => filters.value.role,
  set: (role) => router.push({ query: queryWith({ role, page: 1 }) }),
})
const statusFilter = computed({
  get: () => filters.value.status,
  set: (status) => router.push({ query: queryWith({ status, page: 1 }) }),
})

/* ---------- List ---------- */

const list = ref<Paginated<User> | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let requestId = 0

async function load() {
  const id = ++requestId
  const { role, status, page } = filters.value
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listUsers({
      role: role || undefined,
      is_active: status === '' ? undefined : status === 'active' ? 1 : 0,
      page,
    })
    if (id !== requestId) return
    const { current_page, last_page } = result.meta
    // The page no longer exists (e.g. after deactivating its last user): go to the last one.
    if (result.data.length === 0 && current_page > last_page && last_page >= 1) {
      router.replace({ query: queryWith({ page: last_page }) })
      return
    }
    list.value = result
  } catch (error) {
    if (id !== requestId) return
    loadError.value =
      errorStatus(error) === 403
        ? 'You do not have permission to view users.'
        : errorMessage(error, 'Could not load users. Please try again.')
  } finally {
    if (id === requestId) isLoading.value = false
  }
}

watch(
  () => route.query,
  () => {
    if (route.name === 'staff-users') load()
  },
  { immediate: true },
)

const hasFilters = computed(() => filters.value.role !== '' || filters.value.status !== '')

/* ---------- Assignable roles (also = the roles the current user can manage) ---------- */

const assignableRoles = ref<RoleOption[]>([])

onMounted(async () => {
  try {
    assignableRoles.value = await fetchAssignableRoles()
  } catch {
    // Without the list no actions are offered; the table still works.
  }
})

function canManage(user: User) {
  return user.id !== auth.user?.id && assignableRoles.value.some((r) => r.value === user.role)
}

/* ---------- Actions ---------- */

/** Announced via an aria-live region after each successful change. */
const flash = ref<string | null>(null)

function afterChange(message: string) {
  flash.value = message
  load()
}

const formOpen = ref(false)
const editing = ref<User | null>(null)

function openAdd() {
  flash.value = null
  editing.value = null
  formOpen.value = true
}

function openEdit(user: User) {
  flash.value = null
  editing.value = user
  formOpen.value = true
}

function onSaved(user: User, created: boolean) {
  afterChange(created ? `${user.name} has been added.` : `Changes to ${user.name} have been saved.`)
}

const resetOpen = ref(false)
const resetTarget = ref<User | null>(null)

function openReset(user: User) {
  flash.value = null
  resetTarget.value = user
  resetOpen.value = true
}

const statusOpen = ref(false)
const statusTarget = ref<User | null>(null)
const statusBusy = ref(false)
const statusError = ref<string | null>(null)

function openToggle(user: User) {
  flash.value = null
  statusTarget.value = user
  statusError.value = null
  statusOpen.value = true
}

async function confirmToggle() {
  const user = statusTarget.value
  if (!user) return
  statusBusy.value = true
  statusError.value = null
  try {
    const updated = await updateUser(user.id, { is_active: !user.is_active })
    statusOpen.value = false
    afterChange(`${updated.name} has been ${updated.is_active ? 'activated' : 'deactivated'}.`)
  } catch (error) {
    statusError.value =
      errorStatus(error) === 403
        ? errorMessage(error, 'You are not allowed to change this user.')
        : errorMessage(error)
  } finally {
    statusBusy.value = false
  }
}

/* ---------- Formatting ---------- */

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })
function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}

const selectClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white/90 px-3 py-2.5 text-slate-900 focus:border-primary-600'
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-primary-900 sm:text-3xl">Users</h1>
        <p class="mt-1 text-sm text-slate-600">Manage staff accounts and their access.</p>
      </div>
      <button
        v-if="assignableRoles.length > 0"
        type="button"
        class="btn btn-accent"
        @click="openAdd"
      >
        Add user
      </button>
    </div>

    <div role="status" aria-live="polite">
      <p
        v-if="flash"
        class="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800"
      >
        {{ flash }}
      </p>
    </div>

    <section class="glass-card mt-6 p-4 sm:p-6" aria-labelledby="users-heading">
      <h2 id="users-heading" class="sr-only">User list</h2>

      <!-- Filters -->
      <div class="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
        <div>
          <label :for="roleFilterId" class="block text-sm font-medium text-slate-700">Role</label>
          <select :id="roleFilterId" v-model="roleFilter" :class="selectClass">
            <option value="">All roles</option>
            <option v-for="role in ROLE_LIST" :key="role" :value="role">
              {{ ROLES[role].label }}
            </option>
          </select>
        </div>
        <div>
          <label :for="statusFilterId" class="block text-sm font-medium text-slate-700">
            Status
          </label>
          <select :id="statusFilterId" v-model="statusFilter" :class="selectClass">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div class="mt-6" :aria-busy="isLoading">
        <!-- Error -->
        <div v-if="loadError" role="alert" class="space-y-4 py-6 text-center">
          <p class="text-red-700">{{ loadError }}</p>
          <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
        </div>

        <!-- First load -->
        <p v-else-if="!list" class="py-10 text-center text-slate-600">Loading users…</p>

        <!-- Empty -->
        <div v-else-if="list.data.length === 0" class="py-10 text-center">
          <p class="font-medium text-slate-700">No users found.</p>
          <RouterLink
            v-if="hasFilters"
            :to="{ query: {} }"
            class="mt-2 inline-block text-sm font-semibold text-primary-700 underline"
          >
            Clear filters
          </RouterLink>
        </div>

        <div v-else :class="{ 'opacity-60 transition-opacity': isLoading }">
          <!-- Phones: cards -->
          <ul class="divide-y divide-slate-200 md:hidden">
            <li v-for="user in list.data" :key="user.id" class="py-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate font-semibold text-primary-900">
                    {{ user.name }}
                    <span
                      v-if="user.id === auth.user?.id"
                      class="text-xs font-normal text-slate-500"
                    >
                      (you)
                    </span>
                  </p>
                  <p class="truncate text-sm text-slate-600">{{ user.email }}</p>
                </div>
                <span
                  class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  :class="
                    user.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'
                  "
                >
                  {{ user.is_active ? 'Active' : 'Inactive' }}
                </span>
              </div>
              <p class="mt-1 text-sm text-slate-600">
                {{ user.role_label }} · Created {{ formatDate(user.created_at) }}
              </p>
              <UserRowActions
                v-if="canManage(user)"
                class="mt-2 -ml-2"
                :user="user"
                @edit="openEdit(user)"
                @reset="openReset(user)"
                @toggle="openToggle(user)"
              />
            </li>
          </ul>

          <!-- Tablets and up: table -->
          <div class="hidden overflow-x-auto md:block">
            <table class="w-full text-left text-sm">
              <thead
                class="border-b border-slate-200 text-xs tracking-wider text-slate-500 uppercase"
              >
                <tr>
                  <th scope="col" class="py-3 pr-4 font-semibold">Name</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Email</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Role</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Status</th>
                  <th scope="col" class="py-3 pr-4 font-semibold">Created</th>
                  <th scope="col" class="py-3 font-semibold">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="user in list.data" :key="user.id" class="align-middle">
                  <td class="py-3 pr-4 font-semibold text-primary-900">
                    {{ user.name }}
                    <span
                      v-if="user.id === auth.user?.id"
                      class="text-xs font-normal text-slate-500"
                    >
                      (you)
                    </span>
                  </td>
                  <td class="py-3 pr-4 break-all text-slate-700">{{ user.email }}</td>
                  <td class="py-3 pr-4 whitespace-nowrap text-slate-700">{{ user.role_label }}</td>
                  <td class="py-3 pr-4">
                    <span
                      class="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      :class="
                        user.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-200 text-slate-700'
                      "
                    >
                      {{ user.is_active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="py-3 pr-4 whitespace-nowrap text-slate-700">
                    {{ formatDate(user.created_at) }}
                  </td>
                  <td class="py-3">
                    <UserRowActions
                      v-if="canManage(user)"
                      class="justify-end"
                      :user="user"
                      @edit="openEdit(user)"
                      @reset="openReset(user)"
                      @toggle="openToggle(user)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <nav
            aria-label="Pagination"
            class="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row"
          >
            <p class="text-sm text-slate-600">
              Showing {{ list.meta.from ?? 0 }}–{{ list.meta.to ?? 0 }} of {{ list.meta.total }}
            </p>
            <div class="flex items-center gap-2">
              <RouterLink
                v-if="list.meta.current_page > 1"
                :to="{ query: queryWith({ page: list.meta.current_page - 1 }) }"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Previous
              </RouterLink>
              <span class="px-2 text-sm text-slate-600" aria-current="page">
                Page {{ list.meta.current_page }} of {{ list.meta.last_page }}
              </span>
              <RouterLink
                v-if="list.meta.current_page < list.meta.last_page"
                :to="{ query: queryWith({ page: list.meta.current_page + 1 }) }"
                class="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50"
              >
                Next
              </RouterLink>
            </div>
          </nav>
        </div>
      </div>
    </section>

    <UserFormDialog
      v-model:open="formOpen"
      :user="editing"
      :roles="assignableRoles"
      @saved="onSaved"
    />

    <ResetPasswordDialog
      v-model:open="resetOpen"
      :user="resetTarget"
      @reset="afterChange(`The password for ${resetTarget?.name} has been reset.`)"
    />

    <BaseDialog
      v-model:open="statusOpen"
      :title="statusTarget?.is_active ? 'Deactivate user' : 'Activate user'"
      :busy="statusBusy"
    >
      <p
        v-if="statusError"
        role="alert"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
      >
        {{ statusError }}
      </p>
      <p v-if="statusTarget?.is_active" class="text-slate-700">
        Deactivate <strong>{{ statusTarget.name }}</strong
        >? They will be signed out immediately and cannot log in until they are activated again.
      </p>
      <p v-else class="text-slate-700">
        Activate <strong>{{ statusTarget?.name }}</strong
        >? They will be able to log in again.
      </p>
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="rounded-full px-5 py-2.5 font-semibold text-primary-800 hover:bg-primary-50"
          :disabled="statusBusy"
          @click="statusOpen = false"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn"
          :class="statusTarget?.is_active ? 'btn-accent' : 'btn-primary'"
          :disabled="statusBusy"
          @click="confirmToggle"
        >
          {{ statusBusy ? 'Saving…' : statusTarget?.is_active ? 'Deactivate' : 'Activate' }}
        </button>
      </div>
    </BaseDialog>
  </div>
</template>
