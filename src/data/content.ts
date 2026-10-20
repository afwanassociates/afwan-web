/** Outline icon on a 24×24 grid: a list of SVG path "d" values. */
export type IconPaths = string[]

export interface Step {
  title: string
  description: string
  icon: IconPaths
}

/** How a job runs, for any of the services. */
export const steps: Step[] = [
  {
    title: 'Enquiry',
    description: 'You tell us what you need: goods, a construction job, a property or a site.',
    // A speech bubble
    icon: ['M4 5h16v11H9l-5 4z', 'M8 9.5h8M8 12.5h5'],
  },
  {
    title: 'Proposal',
    description: 'We study the requirement and share a clear proposal, price and timeline.',
    // A document with lines
    icon: ['M6 3h8l5 5v13H6z', 'M14 3v5h5', 'M9 13h6M9 17h6'],
  },
  {
    title: 'Agreement',
    description: 'Once you are happy, we agree the scope, terms and schedule in writing.',
    // A pen signing
    icon: ['M4 20h6', 'M14.5 5.5l4 4L9 19H5v-4z', 'M12.5 7.5l4 4'],
  },
  {
    title: 'Delivery',
    description: 'We deliver the goods or complete the work, and keep you updated throughout.',
    // A check in a circle
    icon: ['M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0', 'M8 12.5l2.8 2.8L16.5 9.5'],
  },
]

export interface Reason {
  title: string
  description: string
  icon: IconPaths
}

export const reasons: Reason[] = [
  {
    title: 'One partner, many services',
    description:
      'Trade, contracting, property, land development, supply and solar energy from a single team.',
    // Stacked layers
    icon: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17l9 5 9-5'],
  },
  {
    title: 'Quality and on time',
    description: 'Work carried out to high standards and delivered when we say it will be.',
    // A clock
    icon: ['M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0', 'M12 7v5l3 2'],
  },
  {
    title: 'Transparent dealings',
    description: 'Clear prices, written agreements and regular updates at every stage.',
    // An eye
    icon: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0'],
  },
  {
    title: 'Responsible supply',
    description: 'We supply a wide range of goods, but never explosive materials or chemicals.',
    // A shield with a check
    icon: ['M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z', 'M8.5 12l2.5 2.5 4.5-5'],
  },
]
