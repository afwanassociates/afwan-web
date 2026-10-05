import { getCurrentScope, onScopeDispose } from 'vue'

/**
 * Returns a debounced version of `callback`: it runs `delay` ms after the last call.
 * Pending calls are cancelled automatically when the component (or effect scope) is disposed.
 */
export function useDebounce<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay = 300,
) {
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancel() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  function run(...args: Args) {
    cancel()
    timer = setTimeout(() => {
      timer = undefined
      callback(...args)
    }, delay)
  }

  if (getCurrentScope()) onScopeDispose(cancel)

  return { run, cancel }
}
