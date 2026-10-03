export interface Slide {
  id: string
  heading: string
  text: string
  cta: {
    label: string
    /** id of the section on the home page to scroll to */
    target: string
  }
  /** CSS background-image value used when no image is set (e.g. a gradient). */
  background: string
  /**
   * Optional photo. To use one, put the file in /public (e.g. /public/slides/slide-1.jpg)
   * and set image: '/slides/slide-1.jpg'. A dark overlay is added so the text stays readable.
   */
  image?: string
}

export const slides: Slide[] = [
  {
    id: 'trusted',
    heading: 'Trusted manpower solutions',
    text: 'We connect employers with reliable, carefully screened workers — handled with transparency from first enquiry to final placement.',
    cta: { label: 'About us', target: 'about' },
    background:
      'radial-gradient(circle at 85% 20%, rgb(240 124 61 / 0.45), transparent 45%), linear-gradient(135deg, #0c1a35 0%, #1f3a68 55%, #345d9b 100%)',
  },
  {
    id: 'skilled',
    heading: 'Skilled workers for every industry',
    text: 'From construction and manufacturing to hospitality and services, we supply skilled and unskilled workforce to match your requirements.',
    cta: { label: 'Our services', target: 'services' },
    background:
      'radial-gradient(circle at 90% 85%, rgb(232 161 58 / 0.4), transparent 45%), radial-gradient(circle at 10% 10%, rgb(155 28 20 / 0.35), transparent 40%), linear-gradient(135deg, #152a50 0%, #2b4b7e 60%, #1f3a68 100%)',
  },
  {
    id: 'overseas',
    heading: 'Overseas placement made simple',
    text: 'Visa processing, documentation and pre-departure training — we guide candidates and employers through every step of the journey.',
    cta: { label: 'How it works', target: 'how-it-works' },
    background:
      'radial-gradient(circle at 75% 40%, rgb(194 73 31 / 0.45), transparent 50%), linear-gradient(160deg, #1f3a68 0%, #0c1a35 60%, #152a50 100%)',
  },
]
