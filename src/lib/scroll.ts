export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Smooth-scrolls to an element by id and moves keyboard focus to it.
 * The sticky header offset is handled by `scroll-margin-top` on the target.
 * Returns false when the element is not on the current page.
 */
export function scrollToSection(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false

  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
  return true
}
