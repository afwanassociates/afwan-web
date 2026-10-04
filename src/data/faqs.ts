/** Frequently asked questions shown on the home page. */
export interface Faq {
  id: string
  question: string
  answer: string
}

export const faqs: Faq[] = [
  {
    id: 'workers',
    question: 'What kind of workers can you supply?',
    answer:
      'We supply skilled, semi-skilled and unskilled workers for industries such as construction, manufacturing, hospitality and services, matched to your requirements.',
  },
  {
    id: 'overseas',
    question: 'Do you recruit for jobs overseas?',
    answer:
      'Yes. We place qualified workers with employers abroad and help with visas, work permits, medicals and the other paperwork that is required.',
  },
  {
    id: 'process',
    question: 'How does the recruitment process work?',
    answer:
      'There are four steps: you share your requirement, we select and screen candidates, we handle the documentation, and then the workers are deployed to your workplace.',
  },
  {
    id: 'screening',
    question: 'How are candidates screened?',
    answer:
      'Candidates are checked for skills, experience and documents before they are referred to you, and we can arrange interviews or trade tests.',
  },
  {
    id: 'training',
    question: 'Do you prepare workers before they travel?',
    answer:
      'Yes. Our pre-departure training covers job skills, workplace safety and life in the destination country.',
  },
  {
    id: 'contact',
    question: 'How can I get in touch?',
    answer:
      'Call or email us using the contact details at the bottom of this page and our team will guide you.',
  },
]
