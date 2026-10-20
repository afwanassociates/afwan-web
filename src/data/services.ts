/** The company's main lines of business, shown in "Our Services" and the footer. */
export type ServiceIcon = 'export' | 'contractor' | 'property' | 'land' | 'supplier' | 'solar'

/** Colour of the round icon badge (theme tokens --color-tone-*), gold to deep maroon. */
export type ServiceTone = 'gold' | 'flame' | 'rust' | 'brick' | 'maroon' | 'sun'

export interface Service {
  id: string
  title: string
  description: string
  icon: ServiceIcon
  tone: ServiceTone
}

export const services: Service[] = [
  {
    id: 'export-import',
    title: 'Export - Import',
    description:
      'Sourcing and importing quality goods from trusted suppliers abroad and delivering them to your business.',
    icon: 'export',
    tone: 'gold',
  },
  {
    id: 'first-class-contractor',
    title: 'First-Class Contractor',
    description:
      'Dependable construction and contracting works, carried out to high standards and delivered on time.',
    icon: 'contractor',
    tone: 'flame',
  },
  {
    id: 'property',
    title: 'Property',
    description:
      'Property solutions to suit residential and commercial needs, handled with care and transparency.',
    icon: 'property',
    tone: 'rust',
  },
  {
    id: 'land-development',
    title: 'Land Development',
    description:
      'Planning and developing land into well-organised sites that are ready for building and growth.',
    icon: 'land',
    tone: 'brick',
  },
  {
    id: 'supplier',
    title: 'Supplier',
    description:
      'Reliable supply of a wide range of goods, except explosive materials and chemicals.',
    icon: 'supplier',
    tone: 'maroon',
  },
  {
    id: 'solar-energy',
    title: 'Solar Energy',
    description: 'Reliable solar energy solutions for homes, buildings and public infrastructure.',
    icon: 'solar',
    tone: 'sun',
  },
]
