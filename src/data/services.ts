export type ServiceIcon = 'local' | 'overseas' | 'workforce' | 'visa' | 'training'

export interface Service {
  id: string
  title: string
  description: string
  icon: ServiceIcon
}

export const services: Service[] = [
  {
    id: 'local-recruitment',
    title: 'Local Recruitment',
    description: 'Sourcing and screening candidates for employers within the country.',
    icon: 'local',
  },
  {
    id: 'overseas-placement',
    title: 'Overseas Placement',
    description: 'Placing qualified workers with employers abroad through a managed process.',
    icon: 'overseas',
  },
  {
    id: 'workforce-supply',
    title: 'Skilled and Unskilled Workforce Supply',
    description: 'Flexible supply of skilled, semi-skilled and general workers to suit your needs.',
    icon: 'workforce',
  },
  {
    id: 'visa-documentation',
    title: 'Visa and Documentation Support',
    description: 'Help with visas, work permits, medicals and all required paperwork.',
    icon: 'visa',
  },
  {
    id: 'pre-departure-training',
    title: 'Pre-departure Training',
    description: 'Orientation on job skills, workplace safety and life in the destination country.',
    icon: 'training',
  },
]
