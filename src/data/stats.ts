/**
 * Figures shown in the About section.
 * Values in [square brackets] are placeholders — replace them with your real, verifiable figures.
 */
export interface Stat {
  value: string
  label: string
}

export const stats: Stat[] = [
  { value: '6', label: 'Business areas' },
  { value: '[00+]', label: 'Projects completed' },
  { value: '[00+]', label: 'Clients served' },
  { value: '[00]', label: 'Years of experience' },
]
