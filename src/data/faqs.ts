/** Frequently asked questions shown on the home page. */
export interface Faq {
  id: string
  question: string
  answer: string
}

export const faqs: Faq[] = [
  {
    id: 'services',
    question: 'What services do you offer?',
    answer:
      'We work in six areas: export and import, construction and contracting as a first-class contractor, property, land development, the supply of a wide range of goods, and solar energy.',
  },
  {
    id: 'contracting',
    question: 'What kind of construction work do you take on?',
    answer:
      'We carry out construction and contracting works to high standards and on schedule. Share your project details and we will tell you how we can help.',
  },
  {
    id: 'import',
    question: 'Can you import goods for my business?',
    answer:
      'Yes. We source quality goods from trusted suppliers abroad, handle the import and deliver them to your business.',
  },
  {
    id: 'supply',
    question: 'Is there anything you do not supply?',
    answer: 'We supply a wide range of goods, except explosive materials and chemicals.',
  },
  {
    id: 'property',
    question: 'Do you help with property and land?',
    answer:
      'Yes. We offer property solutions for residential and commercial needs, and develop land into well-organised sites ready for building.',
  },
  {
    id: 'solar',
    question: 'Do you offer solar energy solutions?',
    answer:
      'Yes. We provide solar energy solutions for homes, buildings and public infrastructure. Tell us about your site and our team will advise you.',
  },
  {
    id: 'contact',
    question: 'How can I get in touch?',
    answer:
      'Call or email us using the contact details at the bottom of this page and our team will guide you.',
  },
]
