import { ref } from 'vue'

export interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

/** App-wide toast messages (shared module state, so a message survives a route change). */
const toasts = ref<Toast[]>([])
let nextId = 1

export function useToast() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function show(message: string, type: Toast['type'] = 'success', duration = 5000) {
    const id = nextId++
    toasts.value = [...toasts.value, { id, type, message }]
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }

  return {
    toasts,
    dismiss,
    success: (message: string) => show(message, 'success'),
    error: (message: string) => show(message, 'error', 8000),
  }
}
