<script setup lang="ts">
import { computed, ref, shallowRef, useId } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  deleteBackup,
  downloadBackup,
  fetchDataReset,
  resetData,
  type DataBackup,
  type DataGroupKey,
  type DataResetOverview,
} from '@/api/dataReset'
import { useToast } from '@/composables/useToast'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'

/**
 * Settings → Danger zone (super admin only): delete all data in one step. The super admin ticks
 * the groups, types the confirmation words and their password; the API saves a backup first,
 * then deletes. Users, roles, settings, countries and medical centres are always kept.
 */
const toast = useToast()
const ids = { confirm: useId(), password: useId() }

const overview = shallowRef<DataResetOverview | null>(null)
const loadError = ref<string | null>(null)

async function load() {
  loadError.value = null
  try {
    overview.value = await fetchDataReset()
  } catch (error) {
    if (errorStatus(error) !== 401)
      loadError.value = errorMessage(error, 'Could not load the data overview. Please try again.')
  }
}
load()

/* ---------- The form ---------- */

const selected = ref<DataGroupKey[]>(['passports', 'companies', 'accounts'])
const confirmation = ref('')
const password = ref('')
const errors = ref<Record<string, string>>({})
const isDeleting = ref(false)
const result = ref<{ backup: string; rows: number; files: number } | null>(null)

const phrase = computed(() => overview.value?.confirmation ?? 'DELETE ALL DATA')
const phraseOk = computed(() => confirmation.value.trim() === phrase.value)
const canSubmit = computed(
  () => selected.value.length > 0 && phraseOk.value && password.value !== '' && !isDeleting.value,
)

/** Passports belong to companies: deleting companies needs passports too. */
function toggle(key: DataGroupKey, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(key)
  else next.delete(key)
  if (key === 'companies' && on) next.add('passports')
  if (key === 'passports' && !on) next.delete('companies')
  selected.value = [...next]
}

const selectedRows = computed(
  () =>
    overview.value?.groups
      .filter((g) => selected.value.includes(g.key))
      .reduce((sum, g) => sum + g.rows + (g.files ?? 0), 0) ?? 0,
)

async function submit() {
  if (!canSubmit.value) return
  errors.value = {}
  isDeleting.value = true
  try {
    const done = await resetData({
      groups: selected.value,
      confirmation: confirmation.value.trim(),
      password: password.value,
    })
    const rows = Object.values(done.deleted).reduce((a, b) => a + b, 0)
    result.value = { backup: done.backup, rows, files: done.files }
    overview.value = { ...overview.value!, groups: done.groups, backups: done.backups }
    confirmation.value = ''
    password.value = ''
    toast.success(`Deleted ${rows} record(s) and ${done.files} file(s). A backup was saved.`)
  } catch (error) {
    if (errorStatus(error) === 422) errors.value = fieldErrors(error)
    else if (errorStatus(error) === 429)
      errors.value = { password: 'Too many tries. Wait a minute and try again.' }
    else if (errorStatus(error) !== 401)
      errors.value = {
        form: errorMessage(error, 'Could not delete the data. Nothing was changed.'),
      }
  } finally {
    isDeleting.value = false
  }
}

/* ---------- Backups ---------- */

const busyBackup = ref<string | null>(null)

async function download(backup: DataBackup) {
  busyBackup.value = backup.name
  try {
    await downloadBackup(backup.name)
  } catch (error) {
    toast.error(errorMessage(error, 'Could not download the backup.'))
  } finally {
    busyBackup.value = null
  }
}

const removeTarget = ref<DataBackup | null>(null)
const removeOpen = ref(false)
const removeBusy = ref(false)
const removeError = ref<string | null>(null)

function askRemove(backup: DataBackup) {
  removeTarget.value = backup
  removeError.value = null
  removeOpen.value = true
}

async function confirmRemove() {
  const backup = removeTarget.value
  if (!backup) return
  removeBusy.value = true
  try {
    await deleteBackup(backup.name)
    removeOpen.value = false
    toast.success('Backup deleted.')
    await load()
  } catch (error) {
    removeError.value = errorMessage(error, 'Could not delete the backup.')
  } finally {
    removeBusy.value = false
  }
}

const GROUP_LABELS: Record<DataGroupKey, string> = {
  passports: 'Passports',
  companies: 'Companies',
  accounts: 'Accounts',
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function when(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'
}

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'
</script>

<template>
  <div class="space-y-6">
    <div v-if="loadError" role="alert" class="glass-card space-y-4 p-8 text-center">
      <p class="text-red-700">{{ loadError }}</p>
      <button type="button" class="btn btn-primary text-sm" @click="load">Try again</button>
    </div>

    <div v-else-if="!overview" class="glass-card animate-pulse space-y-3 p-6" data-skeleton>
      <div v-for="n in 4" :key="n" class="h-4 rounded bg-slate-200" />
      <span class="sr-only">Loading…</span>
    </div>

    <template v-else>
      <section
        class="rounded-2xl border-2 border-red-300 bg-white p-5 sm:p-6"
        aria-labelledby="reset-heading"
      >
        <h2 id="reset-heading" class="text-lg font-semibold text-red-800">Delete all data</h2>
        <p class="mt-1 text-sm text-slate-700">
          Permanently deletes the groups you tick. A backup is saved first and listed below.
          <strong>Users, roles, settings, countries and medical centres are always kept</strong>, so
          everyone can still log in.
        </p>

        <p
          v-if="result"
          role="status"
          class="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
          data-result
        >
          Done: {{ result.rows }} record(s) and {{ result.files }} file(s) deleted. Backup saved as
          <strong class="font-mono">{{ result.backup }}</strong
          >.
        </p>

        <form class="mt-5 space-y-5" novalidate @submit.prevent="submit">
          <fieldset>
            <legend class="text-sm font-semibold text-slate-800">What to delete</legend>
            <ul class="mt-2 space-y-2">
              <li v-for="group in overview.groups" :key="group.key">
                <label
                  class="flex cursor-pointer gap-3 rounded-xl p-4 ring-1 transition-colors"
                  :class="
                    selected.includes(group.key)
                      ? 'bg-red-50 ring-red-300'
                      : 'bg-white ring-slate-200 hover:bg-slate-50'
                  "
                  :data-group="group.key"
                >
                  <input
                    type="checkbox"
                    class="mt-1 h-4 w-4 accent-red-700"
                    :checked="selected.includes(group.key)"
                    @change="toggle(group.key, ($event.target as HTMLInputElement).checked)"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span class="font-semibold text-slate-900">{{ group.label }}</span>
                      <span class="text-sm text-slate-600 tabular-nums" data-count>
                        {{ group.rows }} record(s)<template v-if="group.files !== null">
                          · {{ group.files }} file(s)</template
                        >
                      </span>
                    </span>
                    <span class="mt-0.5 block text-sm text-slate-600">{{ group.description }}</span>
                  </span>
                </label>
              </li>
            </ul>
            <p v-if="errors.groups" class="mt-2 text-sm text-red-700">{{ errors.groups }}</p>
          </fieldset>

          <div class="grid gap-4 sm:grid-cols-2">
            <div data-field="confirmation">
              <label :for="ids.confirm" class="block text-sm font-medium text-slate-700">
                Type <strong class="font-mono text-red-800">{{ phrase }}</strong> to confirm
              </label>
              <input
                :id="ids.confirm"
                v-model="confirmation"
                type="text"
                autocomplete="off"
                spellcheck="false"
                :class="[inputClass, errors.confirmation ? 'border-red-500' : 'border-slate-300']"
                :aria-invalid="errors.confirmation ? 'true' : undefined"
              />
              <p v-if="errors.confirmation" class="mt-1 text-sm text-red-700">
                {{ errors.confirmation }}
              </p>
            </div>
            <div data-field="password">
              <label :for="ids.password" class="block text-sm font-medium text-slate-700">
                Your password
              </label>
              <input
                :id="ids.password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                :class="[inputClass, errors.password ? 'border-red-500' : 'border-slate-300']"
                :aria-invalid="errors.password ? 'true' : undefined"
              />
              <p v-if="errors.password" class="mt-1 text-sm text-red-700">{{ errors.password }}</p>
            </div>
          </div>

          <p v-if="errors.form" role="alert" class="text-sm font-medium text-red-700">
            {{ errors.form }}
          </p>

          <button
            type="submit"
            class="btn w-full justify-center border-red-700 bg-red-700 text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            :disabled="!canSubmit"
            data-action="reset"
          >
            {{
              isDeleting ? 'Backing up and deleting…' : `Delete ${selectedRows} item(s) permanently`
            }}
          </button>
        </form>
      </section>

      <section class="glass-card p-5 sm:p-6" aria-labelledby="backups-heading">
        <h2 id="backups-heading" class="text-lg font-semibold text-ink">Backups</h2>
        <p class="mt-1 text-sm text-muted">
          Saved before every delete, privately on the server. A developer can put one back with
          <code class="rounded bg-slate-100 px-1 font-mono text-xs"
            >php artisan app:restore-data-backup &lt;file&gt;</code
          >.
        </p>
        <p v-if="overview.backups.length === 0" class="mt-4 text-sm text-muted" data-no-backups>
          No backups yet.
        </p>
        <ul v-else class="mt-4 divide-y divide-stroke">
          <li
            v-for="backup in overview.backups"
            :key="backup.name"
            class="flex flex-wrap items-center justify-between gap-3 py-3"
            :data-backup="backup.name"
          >
            <div class="min-w-0">
              <p class="truncate font-mono text-sm text-slate-900">{{ backup.name }}</p>
              <p class="text-xs text-muted">
                {{ when(backup.created_at) }} · by {{ backup.created_by ?? '—' }} ·
                {{ backup.groups.map((g) => GROUP_LABELS[g]).join(', ') }} ·
                {{ backup.rows ?? 0 }} record(s), {{ backup.files ?? 0 }} file(s) ·
                {{ size(backup.size) }}
              </p>
            </div>
            <div class="flex gap-1">
              <button
                type="button"
                class="rounded-md px-2 py-1.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                :disabled="busyBackup === backup.name"
                data-download
                @click="download(backup)"
              >
                Download
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                data-delete-backup
                @click="askRemove(backup)"
              >
                Delete
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <ConfirmDialog
      v-model:open="removeOpen"
      title="Delete backup"
      confirm-label="Delete"
      danger
      :busy="removeBusy"
      :error="removeError"
      @confirm="confirmRemove"
    >
      <p v-if="removeTarget">
        Delete the backup <strong class="font-mono">{{ removeTarget.name }}</strong
        >? The data in it can then no longer be restored.
      </p>
    </ConfirmDialog>
  </div>
</template>
