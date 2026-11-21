import { describe, expect, it } from 'vitest'
import {
  cleanMrzLine,
  mrzCheckDigit,
  mrzDate,
  mrzFullName,
  parseMrzLine2,
  parseMrzName,
  parseNameLine,
  parsePersonalPage,
  editDistance,
  pickPassportName,
  printedDates,
  repairPassportNumber,
  sameName,
} from '@/lib/passportScanParse'

// Real Tesseract output of a Bangladeshi passport scan (personal data page on top).
const MRZ_1 = 'P<BGDMIA<K<MD<MUSHAROP<<<LLLLLLLLLLLLLKLLLLKLKLKL'
const MRZ_2 = 'AD10270462BGD9706109M32010932854653181<<<<30'
const PERSONAL = `Name:                         MD MUSHAROP MIA                       -

Father's Name:           MD. YOUSUF ALI

Mother's Name:          MST. SHAMSUNNAHAR p——71

Spouse's Name:

Permanent Address: PASCHIM CHATOL, KATIADI, CHATOL - 2331,
KISHOREGANJ

Emergency Contact:

Name:                      MD. YOUSUF ALI

Relationship:              FATHER

Address:                  PASCHIM CHATOL, KATIADI, CHATOL - 2331,
KISHOREGANJ`

const TODAY = '2026-11-21'

describe('MRZ check digits', () => {
  it('computes the ICAO check digit', () => {
    expect(mrzCheckDigit('A01027046')).toBe(2)
    expect(mrzCheckDigit('970610')).toBe(9)
    expect(mrzCheckDigit('320109')).toBe(3)
    expect(mrzCheckDigit('L898902C<')).toBe(3) // ICAO 9303 specimen
  })

  it('cleans OCR noise', () => {
    expect(cleanMrzLine('p<bgd mia« |')).toBe('P<BGDMIA<')
  })
})

describe('MRZ line 2', () => {
  it('reads and repairs the sample (D read for 0)', () => {
    expect(parseMrzLine2(MRZ_2, TODAY)).toEqual({
      passportNumber: 'A01027046',
      numberValid: true,
      nationality: 'BGD',
      dateOfBirth: '1997-06-10',
      expiryDate: '2032-01-09',
    })
  })

  it('finds the fields when OCR adds a character at the start', () => {
    expect(parseMrzLine2(`1${MRZ_2}`, TODAY)?.dateOfBirth).toBe('1997-06-10')
  })

  it('rejects dates whose check digit fails', () => {
    const bad = MRZ_2.replace('9706109', '9706108')
    expect(parseMrzLine2(bad, TODAY)?.dateOfBirth).toBeNull()
  })

  it('flags a number it cannot repair', () => {
    expect(repairPassportNumber('A01027046', '7')).toEqual({ value: 'A01027046', valid: false })
    expect(repairPassportNumber('AO1O27046', '2')).toEqual({ value: 'A01027046', valid: true })
  })

  it('puts 2-digit birth years in the past', () => {
    expect(mrzDate('051231', 'birth', TODAY)).toBe('2005-12-31')
    expect(mrzDate('300101', 'birth', TODAY)).toBe('1930-01-01')
    expect(mrzDate('300101', 'expiry', TODAY)).toBe('2030-01-01')
    expect(mrzDate('970231', 'birth', TODAY)).toBeNull()
  })
})

describe('MRZ line 1', () => {
  it('reads the name when every "<" came out as K or L (TITU sample)', () => {
    expect(parseMrzName('PLKBGDTITULLLLLLLLLLLLLLLLLLLLLLLLLLLLLLKKKK', 'BGD')).toEqual({
      surname: 'TITU',
      given: '',
    })
  })

  it('reads the name when "<" came out as K and L', () => {
    const name = parseMrzName(MRZ_1)
    expect(name).toEqual({ surname: 'MIA', given: 'MD MUSHAROP' })
    expect(mrzFullName(name!)).toBe('MD MUSHAROP MIA')
  })

  it('keeps names that end in K or L', () => {
    expect(parseMrzName('P<BGDMALIK<<ABDUL<KAMAL<<<<LLLKL<<<<<<<<<<<<<<<')).toEqual({
      surname: 'MALIK',
      given: 'ABDUL KAMAL',
    })
  })
})

describe('personal data page', () => {
  it('reads name, parents and the permanent address (not the emergency contact)', () => {
    expect(parsePersonalPage(PERSONAL)).toEqual({
      name: 'MD MUSHAROP MIA',
      fatherName: 'MD. YOUSUF ALI',
      motherName: 'MST. SHAMSUNNAHAR',
      permanentAddress: 'PASCHIM CHATOL, KATIADI, CHATOL - 2331, KISHOREGANJ',
    })
  })

  it('reads a capital I misread as lowercase i (KOFiL)', () => {
    expect(parsePersonalPage("Father's Name:          KOFiL UDDIN").fatherName).toBe('KOFIL UDDIN')
  })

  it('drops barcode digits far to the right of a value', () => {
    const text =
      'Permanent Address: PASCHIM CHATOL, KATIADI, CHATOL - 2331,          :\nKISHOREGANJ                1\nEmergency Contact:'
    expect(parsePersonalPage(text).permanentAddress).toBe(
      'PASCHIM CHATOL, KATIADI, CHATOL - 2331, KISHOREGANJ',
    )
  })

  it('returns nothing for text that is not a personal data page', () => {
    expect(parsePersonalPage("PEOPLE'S REPUBLIC OF BANGLADESH\nPASSPORT")).toEqual({})
  })
})

describe('helpers', () => {
  it('reads printed dates', () => {
    expect(printedDates('10 JUN 1997 Rg\n09 JAN 2032 FTE\n10 JAN 2022')).toEqual([
      '1997-06-10',
      '2022-01-10',
      '2032-01-09',
    ])
  })

  it('counts letter edits', () => {
    expect(editDistance('TITU', 'TIT')).toBe(1)
    expect(editDistance('TITU', 'TITY')).toBe(1)
    expect(editDistance('KAMAL', 'KAMAL')).toBe(0)
  })

  it('compares names ignoring dots and order', () => {
    expect(sameName('MD. MUSHAROP MIA', 'MD MUSHAROP MIA')).toBe(true)
    expect(sameName('MD MUSHAROP', 'MD MUSHAROP MIA')).toBe(false)
  })
})

describe('passport name (given name + surname)', () => {
  const MRZ = { surname: 'MIA', given: 'MD MUSHAROP' }

  it('is verified when the MRZ and the personal data page agree', () => {
    expect(pickPassportName(MRZ, 'MD MUSHAROP MIA')).toEqual({
      name: 'MD MUSHAROP MIA',
      verified: true,
    })
  })

  it('puts the surname last when the page has it first', () => {
    expect(pickPassportName(MRZ, 'MIA MD MUSHAROP')).toEqual({
      name: 'MD MUSHAROP MIA',
      verified: true,
    })
  })

  it('tolerates the MRZ reading "<" as K or L, and dots on the page', () => {
    expect(pickPassportName({ surname: 'MIA', given: 'MDKMUSHAROP' }, 'MD. MUSHAROP MIA')).toEqual({
      name: 'MD. MUSHAROP MIA',
      verified: true,
    })
    expect(
      pickPassportName({ surname: 'HOSSAIN', given: 'MD ALAMGIR' }, 'MD ALAMGIR HOSSAIN'),
    ).toEqual({ name: 'MD ALAMGIR HOSSAIN', verified: true })
  })

  it('uses the MRZ split, not verified, when the page has extra or different words', () => {
    expect(pickPassportName(MRZ, 'RE MD MUSHAROP MIA')).toEqual({
      name: 'MD MUSHAROP MIA',
      verified: false,
    })
  })

  it('falls back to the page when the MRZ had no surname split', () => {
    expect(pickPassportName({ surname: 'MIAKMDKMUSHAROP', given: '' }, 'MD MUSHAROP MIA')).toEqual({
      name: 'MD MUSHAROP MIA',
      verified: false,
    })
    expect(pickPassportName(null, 'MD MUSHAROP MIA')).toEqual({
      name: 'MD MUSHAROP MIA',
      verified: false,
    })
  })

  it('accepts the page name when the MRZ separator was misread but the letters match', () => {
    expect(pickPassportName({ surname: 'MDKMUSHAROPKMIA', given: '' }, 'MD MUSHAROP MIA')).toEqual({
      name: 'MD MUSHAROP MIA',
      verified: true,
    })
  })

  it('takes the MRZ name when the page print was slightly misread (TITU read as TIT)', () => {
    expect(pickPassportName({ surname: 'TITU', given: '' }, 'TIT')).toEqual({
      name: 'TITU',
      verified: true,
    })
    expect(pickPassportName(MRZ, 'MD MUSHAR0P MlA')).toEqual({
      name: 'MD MUSHAROP MIA',
      verified: true,
    })
  })

  it('still flags names that differ by more than 2 letters', () => {
    expect(pickPassportName({ surname: 'TITU', given: '' }, 'RAHIM')).toEqual({
      name: 'RAHIM',
      verified: false,
    })
  })

  it('accepts a passport with a surname only', () => {
    expect(pickPassportName({ surname: 'RAHIM', given: '' }, 'RAHIM')).toEqual({
      name: 'RAHIM',
      verified: true,
    })
  })
})

/* Real OCR output of three passport scans (regression: each once gave a wrong field). */
describe('real scans', () => {
  it('SHAHEEN: filler read as L/C, "1 Name:", a misread H, a blank line in the address', () => {
    const mrz = parseMrzName('P<BGDSHAHEEN<<<LLLLLCLLLLLLLLLLLLLLLLLLKLKLKLK', 'BGD')
    expect(mrz).toEqual({ surname: 'SHAHEEN', given: '' })
    const page = parsePersonalPage(
      "1 Name:   SHAMEEN\n\nFather's Name:    MD ABDUL KARIM\n\n1 Mother's Name:   FATEMA BEGUM\n\n Legal Guardian's Name:\n Permanent Address: SOUTH LOHAJURY, KATIADI, LOHAJURY - 2338,\n\nKISHOREGANJ\n\n. Emergency Contact:                        -\n\n1) Name:   MD ABDUL KARIM         W\n",
    )
    expect(page).toEqual({
      name: 'SHAMEEN',
      fatherName: 'MD ABDUL KARIM',
      motherName: 'FATEMA BEGUM',
      permanentAddress: 'SOUTH LOHAJURY, KATIADI, LOHAJURY - 2338, KISHOREGANJ',
    })
    expect(pickPassportName(mrz, page.name)).toEqual({ name: 'SHAHEEN', verified: true })
    expect(parseMrzLine2('A1 61090267B6D0601 016M34091658278866218<<<<00', TODAY)).toMatchObject({
      passportNumber: 'A16109026',
      dateOfBirth: '2006-01-01',
      expiryDate: '2034-09-16',
    })
  })

  it('TITU: every "<" read as L/K', () => {
    const mrz = parseMrzName('PLKBGDTITULLLLLLLLLLLLLLLLLLLLLLLLLLLLLLKKKK', 'BGD')
    expect(pickPassportName(mrz, 'TIT')).toEqual({ name: 'TITU', verified: true })
  })

  it('MUSHAROP: a "<K<" separator', () => {
    const mrz = parseMrzName(MRZ_1, 'BGD')
    expect(pickPassportName(mrz, 'MD MUSHAROP MIA')).toEqual({
      name: 'MD MUSHAROP MIA',
      verified: true,
    })
  })

  it('never takes a word of only K, L, C as a name', () => {
    expect(parseMrzName('P<BGDSHAHEEN<<LLKLLC<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'BGD')).toEqual({
      surname: 'SHAHEEN',
      given: '',
    })
  })

  it('SHAHEEN (PDF): a misread "Fatmers Name:" label', () => {
    expect(
      parsePersonalPage(" Fatmers Name: MD ABDUL KARIM\n1 Mother's Name:   FATEMA BEGUM\n"),
    ).toEqual({ fatherName: 'MD ABDUL KARIM', motherName: 'FATEMA BEGUM' })
  })

  it('reads the name row alone, with or without its label', () => {
    expect(parseNameLine('Name:          SHAHEEN        -\n')).toBe('SHAHEEN')
    expect(parseNameLine('SHAHEEN\n')).toBe('SHAHEEN')
    expect(parseNameLine('1 Name:  MD MUSHAROP MIA')).toBe('MD MUSHAROP MIA')
    // The label misread (real OCR of the SHAHEEN PDF).
    expect(parseNameLine('SAAN   SHAHEEN\n')).toBe('SHAHEEN')
    expect(parseNameLine('3 Re                 SHAHEEN\n')).toBe('SHAHEEN')
  })

  it("never takes the emergency contact's name for the holder's", () => {
    // The holder's name line and the father's label both lost (a blurred scan).
    expect(
      parsePersonalPage(
        "Mo ther's Name: FATEMA BEGUM\nPermanent Address: X\nEmergency Contact:\nName:  MD ABDUL KARM",
      ).name,
    ).toBeUndefined()
  })

  it('keeps a one-line address one line (stops at the next label)', () => {
    expect(
      parsePersonalPage(
        'Permanent Address: MACHIMPUR, PAKUNDIA, KOLADIA - 2330, KISHOREGANJ\n\nEmergency Contact:\nName:  KOFIL UDDIN',
      ).permanentAddress,
    ).toBe('MACHIMPUR, PAKUNDIA, KOLADIA - 2330, KISHOREGANJ')
  })
})
