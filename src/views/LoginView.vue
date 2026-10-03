<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { postLoginTarget } from '@/router/guard'
import { errorMessage, errorStatus, fieldErrors } from '@/lib/errors'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const isSubmitting = ref(false)
const errors = ref<Record<string, string>>({})
/** Form-level error: throttling (429), network problems, etc. */
const formError = ref<string | null>(null)

// Show a pending notice (e.g. account deactivated) once.
const notice = ref(auth.notice)
auth.notice = null

const emailInput = useTemplateRef<HTMLInputElement>('emailInput')
const passwordInput = useTemplateRef<HTMLInputElement>('passwordInput')

const inputClass =
  'mt-1 block w-full rounded-lg border bg-white/90 px-3 py-2.5 text-slate-900 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus:border-primary-600'

async function onSubmit() {
  errors.value = {}
  formError.value = null
  notice.value = null
  isSubmitting.value = true
  try {
    await auth.login(email.value.trim(), password.value)
    const user = auth.user
    if (user) await router.replace(postLoginTarget(router, user.role, route.query.redirect))
  } catch (error) {
    const status = errorStatus(error)
    if (status === 422) {
      errors.value = fieldErrors(error)
      if (Object.keys(errors.value).length === 0) formError.value = errorMessage(error)
    } else if (status === 429) {
      formError.value = errorMessage(error, 'Too many login attempts. Please wait and try again.')
    } else {
      formError.value = errorMessage(error, 'Login failed. Please try again.')
    }
    password.value = ''
    await nextTick()
    if (errors.value.email) emailInput.value?.focus()
    else passwordInput.value?.focus()
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    class="relative flex items-center justify-center overflow-hidden bg-linear-to-br from-primary-50 via-white to-accent-50 px-4 py-16 sm:py-24"
  >
    <div
      class="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-accent-300/30 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-primary-300/30 blur-3xl"
      aria-hidden="true"
    />
    <div class="glass-card relative w-full max-w-md p-6 sm:p-8">
      <h1 class="text-2xl font-bold text-primary-900">Login</h1>
      <p class="mt-1 text-sm text-slate-600">Sign in to your account.</p>

      <p
        v-if="notice"
        role="status"
        class="mt-5 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2.5 text-sm text-accent-800"
      >
        {{ notice }}
      </p>
      <p
        v-if="formError"
        role="alert"
        class="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
      >
        {{ formError }}
      </p>

      <form class="mt-6 space-y-5" novalidate @submit.prevent="onSubmit">
        <div>
          <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
          <input
            id="email"
            ref="emailInput"
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            required
            :class="[inputClass, errors.email ? 'border-red-500' : 'border-slate-300']"
            :aria-invalid="errors.email ? 'true' : undefined"
            :aria-describedby="errors.email ? 'email-error' : undefined"
          />
          <p v-if="errors.email" id="email-error" class="mt-1 text-sm text-red-700">
            {{ errors.email }}
          </p>
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-slate-700">Password</label>
          <input
            id="password"
            ref="passwordInput"
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            required
            :class="[inputClass, errors.password ? 'border-red-500' : 'border-slate-300']"
            :aria-invalid="errors.password ? 'true' : undefined"
            :aria-describedby="errors.password ? 'password-error' : undefined"
          />
          <p v-if="errors.password" id="password-error" class="mt-1 text-sm text-red-700">
            {{ errors.password }}
          </p>
        </div>

        <button type="submit" class="btn btn-accent w-full" :disabled="isSubmitting">
          {{ isSubmitting ? 'Signing in…' : 'Login' }}
        </button>
      </form>
    </div>
  </div>
</template>
