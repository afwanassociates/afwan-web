/**
 * Client and worker testimonials.
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
    id: 'employer-1',
    quote: '[Placeholder: a short quote from an employer you have supplied workers to.]',
    name: '[Client name]',
    role: '[Position, Company]',
  },
  {
    id: 'worker-1',
    quote: '[Placeholder: a short quote from a worker you have placed in a job.]',
    name: '[Worker name]',
    role: '[Job title, Country]',
  },
  {
    id: 'employer-2',
    quote: '[Placeholder: a short quote from another employer or partner.]',
    name: '[Client name]',
    role: '[Position, Company]',
  },
]
