<script setup lang="ts">
import type { User } from '@/types/auth'

defineProps<{ user: User }>()
defineEmits<{ edit: []; reset: []; toggle: [] }>()

const linkClass =
  'rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-primary-50 focus-visible:bg-primary-50'
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <button type="button" :class="[linkClass, 'text-primary-700']" @click="$emit('edit')">
      Edit<span class="sr-only"> {{ user.name }}</span>
    </button>
    <button type="button" :class="[linkClass, 'text-primary-700']" @click="$emit('reset')">
      Reset password<span class="sr-only"> for {{ user.name }}</span>
    </button>
    <button
      type="button"
      :class="[linkClass, user.is_active ? 'text-red-700 hover:bg-red-50' : 'text-green-700']"
      @click="$emit('toggle')"
    >
      {{ user.is_active ? 'Deactivate' : 'Activate' }}<span class="sr-only"> {{ user.name }}</span>
    </button>
  </div>
</template>
