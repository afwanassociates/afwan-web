/** The hero banners of the home page, in order. Each one is a component in src/components/banners. */
export type BannerKind = 'growth' | 'solar' | 'property'

export interface Slide {
  id: string
  /** Which banner to show. */
  kind: BannerKind
  /** Short name for screen readers and the slide buttons. */
  label: string
}

export const slides: Slide[] = [
  { id: 'growth', kind: 'growth', label: 'Building Trust. Delivering Growth.' },
  { id: 'solar', kind: 'solar', label: 'Energy for a Brighter Bangladesh.' },
  { id: 'property', kind: 'property', label: 'Property You Can Trust.' },
]
