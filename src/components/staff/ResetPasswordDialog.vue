<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '@/components/staff/BaseDialog.vue'
import TextField from '@/components/staff/TextField.vue'
import { resetUserPassword } from '@/lib/users'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'
import type { User } from '@/types/auth'

const MIN_LENGTH = 8

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ reset: [] }>()

const password = ref('')
const error = ref<string | undefined>()
const formError = ref<string | null>(null)
const isSaving = ref(false)
const isDone = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  password.value = ''
  error.value = undefined
  formError.value = null
  isDone.value = false
})

async function onSubmit() {
  if (!props.user) return
  error.value = undefined
  formError.value = null
  if (password.value.length < MIN_LENGTH) {
    error.value = `The password must be at least ${MIN_LENGTH} characters.`
    return
  }
  isSaving.value = true
  try {
    await resetUserPassword(props.user.id, password.value)
    password.value = ''
    isDone.value = true
    emit('reset')
  } catch (e) {
    error.value = fieldErrors(e).password
    if (!error.value) {
      formError.value =
        errorStatus(e) === 403
          ? errorMessage(e, 'You are not allowed to reset this password.')
          : errorMessage(e)
    }
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="`Reset password for ${user?.name}`" :busy="isSaving">
    <div v-if="isDone" class="space-y-4">
      <p
        role="status"
        class="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800"
      >
        The password has been reset. {{ user?.name }} has been signed out and must log in with the
        new password.
      </p>
      <div class="flex justify-end">
        <button type="button" class="btn btn-primary" @click="open = false">Done</button>
      </div>
    </div>

    <template v-else>
      <p
        v-if="formError"
        role="alert"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
      >
        {{ formError }}
      </p>
      <form class="space-y-4" novalidate @submit.prevent="onSubmit">
        <TextField
          v-model="password"
          label="New password"
          type="password"
          autocomplete="new-password"
          required
          :hint="`At least ${MIN_LENGTH} characters. The user will be signed out.`"
          :error="error"
        />
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
            {{ isSaving ? 'Resetting…' : 'Reset password' }}
          </button>
        </div>
      </form>
    </template>
  </BaseDialog>
</template>
