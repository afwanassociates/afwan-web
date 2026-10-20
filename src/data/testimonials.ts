/**
 * Client testimonials.
 * These are placeholders — replace them with real quotes you have permission to publish.
 */
export interface Testimonial {
  id: string
  quote: string
  name: string
  role: string
}

export const testimonials: Testimonial[] = [
  {
    id: 'client-1',
    quote: '[Placeholder: a short quote from a client about a construction or contracting job.]',
    name: '[Client name]',
    role: '[Position, Company]',
  },
  {
    id: 'client-2',
    quote: '[Placeholder: a short quote from a client you have imported or supplied goods for.]',
    name: '[Client name]',
    role: '[Position, Company]',
  },
  {
    id: 'client-3',
    quote: '[Placeholder: a short quote from a property or land development client.]',
    name: '[Client name]',
    role: '[Position, Company]',
  },
]
