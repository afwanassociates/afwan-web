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
   * and set image: '/slides/slide-1.jpg'. A deep-red overlay is added so the white text stays readable.
   */
  image?: string
}

export const slides: Slide[] = [
  {
    id: 'trusted',
    heading: 'Trusted manpower solutions',
    text: 'We connect employers with reliable, carefully screened workers — handled with transparency from first enquiry to final placement.',
    cta: { label: 'About Us', target: 'about' },
    // Logo colours: orange-red into deep red, with gold and orange glows in the corners
    background:
      'radial-gradient(circle at 6% 6%, rgb(232 161 58 / 0.55), transparent 30%), radial-gradient(circle at 94% 94%, rgb(220 100 48 / 0.5), transparent 35%), linear-gradient(135deg, #c2491f 0%, #a1371b 55%, #9b1c14 100%)',
  },
  {
    id: 'skilled',
    heading: 'Skilled workers for every industry',
    text: 'From construction and manufacturing to hospitality and services, we supply skilled and unskilled workforce to match your requirements.',
    cta: { label: 'Our Services', target: 'services' },
    // Logo colours: orange-red into deep red, with gold and orange glows in the corners
    background:
      'radial-gradient(circle at 94% 6%, rgb(232 161 58 / 0.5), transparent 30%), radial-gradient(circle at 6% 94%, rgb(220 100 48 / 0.5), transparent 35%), linear-gradient(160deg, #a1371b 0%, #9b1c14 100%)',
  },
  {
    id: 'overseas',
    heading: 'Overseas placement made simple',
    text: 'Visa processing, documentation and pre-departure training — we guide candidates and employers through every step of the journey.',
    cta: { label: 'How It Works', target: 'how-it-works' },
    // Logo colours: orange-red into deep red, with gold and orange glows in the corners
    background:
      'radial-gradient(circle at 94% 94%, rgb(232 161 58 / 0.45), transparent 30%), radial-gradient(circle at 6% 6%, rgb(220 100 48 / 0.5), transparent 35%), linear-gradient(135deg, #b8431c 0%, #a1371b 50%, #9b1c14 100%)',
  },
]
