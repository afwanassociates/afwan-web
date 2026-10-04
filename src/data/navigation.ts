/** Home page sections linked from the header and footer (id = section id on the home page). */
export interface SectionLink {
  id: string
  label: string
}

export const sectionLinks: SectionLink[] = [
  { id: 'about', label: 'About Us' },
  { id: 'services', label: 'Services' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
]
