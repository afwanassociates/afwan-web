import { ref } from 'vue'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  type: 'success' | 'error' | 'warning'
  message: string
  /** An optional button, e.g. "Undo"; it closes the toast when clicked. */
  action?: ToastAction
}

export interface ToastOptions {
  action?: ToastAction
  /** Milliseconds before it disappears (0 keeps it). */
  duration?: number
}

/** App-wide toast messages (shared module state, so a message survives a route change). */
const toasts = ref<Toast[]>([])
let nextId = 1

export function useToast() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function show(
    message: string,
    type: Toast['type'] = 'success',
    duration = 5000,
    action?: ToastAction,
  ) {
    const id = nextId++
    toasts.value = [...toasts.value, { id, type, message, ...(action ? { action } : {}) }]
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }

  return {
    toasts,
    dismiss,
    success: (message: string, options: ToastOptions = {}) =>
      show(message, 'success', options.duration ?? 5000, options.action),
    error: (message: string) => show(message, 'error', 8000),
    warning: (message: string) => show(message, 'warning', 10000),
  }
}
