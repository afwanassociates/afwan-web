export interface Step {
  title: string
  description: string
}

export const steps: Step[] = [
  {
    title: 'Requirement',
    description: 'You share the roles, number of workers, skills and timeline you need.',
  },
  {
    title: 'Selection',
    description:
      'We source, screen and shortlist candidates, then arrange interviews or trade tests.',
  },
  {
    title: 'Documentation',
    description: 'We handle contracts, medicals, visas, permits and other required paperwork.',
  },
  {
    title: 'Deployment',
    description: 'Selected workers are briefed, trained and deployed to your workplace.',
  },
]

export interface Reason {
  title: string
  description: string
}

export const reasons: Reason[] = [
  {
    title: 'Careful screening',
    description: 'Candidates are checked for skills, experience and documents before referral.',
  },
  {
    title: 'Transparent process',
    description: 'Clear communication and updates at every stage, for employers and candidates.',
  },
  {
    title: 'End-to-end support',
    description: 'One team from requirement to deployment, including visas and training.',
  },
  {
    title: 'Ethical recruitment',
    description: 'We work to follow applicable recruitment laws and treat every worker fairly.',
  },
]
