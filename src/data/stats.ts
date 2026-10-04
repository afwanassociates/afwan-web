/**
 * Figures shown in the About section.
 * Values in [square brackets] are placeholders — replace them with your real, verifiable figures.
 */
export interface Stat {
  value: string
  label: string
}

export const stats: Stat[] = [
  { value: '[000+]', label: 'Workers placed' },
  { value: '[00+]', label: 'Partner employers' },
  { value: '[00]', label: 'Countries served' },
  { value: '[00]', label: 'Years of experience' },
]
