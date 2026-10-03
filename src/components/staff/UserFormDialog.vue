<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import TextField from '@/components/staff/TextField.vue'
import { createUser, updateUser, type UserChanges } from '@/lib/users'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { Role, RoleOption, User } from '@/types/auth'

/** "Add user" when `user` is null, otherwise "Edit <user>" (sends only changed fields). */
const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{
  user: User | null
  /** Roles the current user may assign, from GET /api/roles. */
  roles: RoleOption[]
}>()
const emit = defineEmits<{ saved: [user: User, created: boolean] }>()

const isEdit = computed(() => props.user !== null)

const name = ref('')
const email = ref('')
const password = ref('')
const role = ref<Role | ''>('')
const isActive = ref(true)

const errors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)
const isSaving = ref(false)

const roleId = useId()
const activeId = useId()

// Reset the form each time the dialog opens.
watch(open, (isOpen) => {
  if (!isOpen) return
  errors.value = {}
  formError.value = null
  name.value = props.user?.name ?? ''
  email.value = props.user?.email ?? ''
  password.value = ''
  role.value = props.user?.role ?? props.roles[0]?.value ?? ''
  isActive.value = props.user?.is_active ?? true
})

function changedFields(user: User): UserChanges {
  const changes: UserChanges = {}
  if (name.value.trim() !== user.name) changes.name = name.value.trim()
  if (email.value.trim() !== user.email) changes.email = email.value.trim()
  if (role.value && role.value !== user.role) changes.role = role.value
  if (isActive.value !== user.is_active) changes.is_active = isActive.value
  return changes
}

async function onSubmit() {
  errors.value = {}
  formError.value = null
  isSaving.value = true
  try {
    if (props.user) {
      const changes = changedFields(props.user)
      if (Object.keys(changes).length === 0) {
        open.value = false
        return
      }
      emit('saved', await updateUser(props.user.id, changes), false)
    } else {
      const created = await createUser({
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
        role: role.value as Role,
      })
      emit('saved', created, true)
    }
    open.value = false
  } catch (error) {
    errors.value = fieldErrors(error)
    if (Object.keys(errors.value).length === 0) {
      formError.value =
        errorStatus(error) === 403
          ? errorMessage(error, 'You are not allowed to make this change.')
          : errorMessage(error)
    }
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model:open="open"
    :title="isEdit ? `Edit ${user?.name}` : 'Add user'"
    :busy="isSaving"
  >
    <p
      v-if="formError"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
    >
      {{ formError }}
    </p>

    <form class="space-y-4" novalidate @submit.prevent="onSubmit">
      <TextField v-model="name" label="Name" autocomplete="off" required :error="errors.name" />
      <TextField
        v-model="email"
        label="Email"
        type="email"
        autocomplete="off"
        required
        :error="errors.email"
      />
      <TextField
        v-if="!isEdit"
        v-model="password"
        label="Password"
        type="password"
        autocomplete="new-password"
        required
        hint="At least 8 characters."
        :error="errors.password"
      />

      <div>
        <label :for="roleId" class="block text-sm font-medium text-slate-700">Role</label>
        <select
          :id="roleId"
          v-model="role"
          required
          class="mt-1 block w-full rounded-lg border bg-white/90 px-3 py-2.5 text-slate-900 focus:border-primary-600"
          :class="errors.role ? 'border-red-500' : 'border-slate-300'"
          :aria-invalid="errors.role ? 'true' : undefined"
          :aria-describedby="errors.role ? `${roleId}-error` : undefined"
        >
          <option v-for="option in roles" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <p v-if="errors.role" :id="`${roleId}-error`" class="mt-1 text-sm text-red-700">
          {{ errors.role }}
        </p>
      </div>

      <div v-if="isEdit" class="flex items-center gap-3">
        <input
          :id="activeId"
          v-model="isActive"
          type="checkbox"
          class="h-5 w-5 rounded border-slate-300 accent-primary-700"
          :aria-describedby="errors.is_active ? `${activeId}-error` : `${activeId}-hint`"
        />
        <div>
          <label :for="activeId" class="text-sm font-medium text-slate-700">Active</label>
          <p v-if="errors.is_active" :id="`${activeId}-error`" class="text-sm text-red-700">
            {{ errors.is_active }}
          </p>
          <p v-else :id="`${activeId}-hint`" class="text-xs text-slate-500">
            Inactive users cannot log in and are signed out immediately.
          </p>
        </div>
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
        <button type="submit" class="btn btn-accent" :disabled="isSaving">
          {{ isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add user' }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>
