/**
 * Pure parsing of the OCR text of a passport scan copy (no browser APIs, so it is unit
 * tested). The scan format is one image: the personal data page on top, the photo page
 * with the 2-line MRZ code below it, and the passport-size photo at the bottom.
 *
 * MRZ (ICAO 9303, TD3: two lines of 44 characters):
 *   line 1: P<BGDMIA<<MD<MUSHAROP<<<<<<<<<<<<<<<<<<<<<<   type, country, SURNAME<<GIVEN<NAMES
 *   line 2: A010270462BGD9706109M3201093...               number+check, nationality,
 *           birth YYMMDD+check, sex, expiry YYMMDD+check, personal number…
 * The check digits tell us whether a field was read correctly, and let us repair the
 * usual OCR mix-ups (0/O/D, 1/I/L, …).
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** ICAO 9303 check digit: weights 7, 3, 1; 0–9 as is, A–Z as 10–35, "<" as 0. */
export function mrzCheckDigit(value: string): number {
  const weights = [7, 3, 1]
  let sum = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!
    const n = c >= '0' && c <= '9' ? +c : c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 55 : 0
    sum += n * weights[i % 3]!
  }
  return sum % 10
}

/** Uppercase, drop spaces and anything outside the MRZ alphabet ("«" is a "<"). */
export function cleanMrzLine(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[«‹]/g, '<')
    .replace(/[^A-Z0-9<]/g, '')
}

/** Letters OCR gives in place of digits, for fields that must be digits. */
const AS_DIGIT: Record<string, string> = {
  O: '0',
  D: '0',
  Q: '0',
  U: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  B: '8',
  G: '6',
  T: '7',
  '<': '0',
}
const toDigits = (value: string) => value.replace(/[^0-9]/g, (c) => AS_DIGIT[c] ?? c)

/** The usual OCR mix-ups, tried when a passport number fails its check digit. */
const LOOK_ALIKES: Record<string, string[]> = {
  '0': ['O', 'D', 'Q'],
  O: ['0', 'D', 'Q'],
  D: ['0', 'O'],
  Q: ['0', 'O'],
  '1': ['I', 'L'],
  I: ['1', 'L'],
  L: ['1', 'I'],
  '2': ['Z'],
  Z: ['2'],
  '5': ['S'],
  S: ['5'],
  '8': ['B'],
  B: ['8'],
  '6': ['G'],
  G: ['6'],
}

/**
 * The passport number with its check digit: as read when it checks out in the usual
 * "letters then digits" shape (A01027046), else the version of that shape with the fewest
 * look-alike swaps (at most 2) that checks out, else as read (valid only if it checks out).
 */
export function repairPassportNumber(
  field: string,
  check: string,
): { value: string; valid: boolean } {
  const digit = +toDigits(check)
  const passes = (value: string) => mrzCheckDigit(value) === digit
  const strip = (value: string) => value.replace(/<+$/, '')
  // A repair must also give the usual shape, or a lucky swap could "fix" a wrong read.
  const usual = (value: string) => /^[A-Z]{1,2}[0-9]{6,8}$/.test(strip(value))
  if (passes(field) && usual(field)) return { value: strip(field), valid: true }
  const chars = [...field]
  const positions = chars.map((c, i) => i).filter((i) => LOOK_ALIKES[chars[i]!])
  const found: string[] = []
  for (const i of positions) {
    for (const a of LOOK_ALIKES[chars[i]!]!) {
      const one = [...chars]
      one[i] = a
      if (passes(one.join('')) && usual(one.join(''))) found.push(one.join(''))
    }
  }
  if (found.length === 0) {
    for (const [n, i] of positions.entries()) {
      for (const j of positions.slice(n + 1)) {
        for (const a of LOOK_ALIKES[chars[i]!]!) {
          for (const b of LOOK_ALIKES[chars[j]!]!) {
            const two = [...chars]
            two[i] = a
            two[j] = b
            if (passes(two.join('')) && usual(two.join(''))) found.push(two.join(''))
          }
        }
      }
    }
  }
  const best = found[0]
  // As read when it checks out (an unusual shape), else unrepairable.
  return best ? { value: strip(best), valid: true } : { value: strip(field), valid: passes(field) }
}

/** YYMMDD to YYYY-MM-DD: birth dates are never in the future, expiry dates are 20YY. */
export function mrzDate(yymmdd: string, kind: 'birth' | 'expiry', today: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null
  const yy = +yymmdd.slice(0, 2)
  const mm = +yymmdd.slice(2, 4)
  const dd = +yymmdd.slice(4, 6)
  let year = 2000 + yy
  if (kind === 'birth' && year > +today.slice(0, 4)) year -= 100
  const date = new Date(Date.UTC(year, mm - 1, dd))
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

export interface MrzLine2 {
  passportNumber: string
  numberValid: boolean
  nationality: string
  /** YYYY-MM-DD, null when unreadable or its check digit fails. */
  dateOfBirth: string | null
  expiryDate: string | null
}

/** Whether a cleaned OCR line looks like MRZ line 2 (mostly digits, 28+ characters). */
export function looksLikeMrzLine2(cleaned: string): boolean {
  return cleaned.length >= 28 && (cleaned.match(/[0-9]/g)?.length ?? 0) >= 15
}

/** Whether a cleaned OCR line looks like MRZ line 1 of a passport (P + filler). */
export function looksLikeMrzLine1(cleaned: string): boolean {
  // Filler: "<", or a long run of K/L when every "<" was misread ("PLKBGDTITULLLL…").
  return (
    /^P[A-Z<]/.test(cleaned) &&
    cleaned.length >= 25 &&
    (cleaned.match(/[0-9]/g)?.length ?? 0) < 5 &&
    (cleaned.includes('<') || /[KLC]{6,}/.test(cleaned))
  )
}

/**
 * Reads MRZ line 2. OCR may add or drop a character at the start, so the start is
 * searched where the sex letter and the birth date's check digit line up.
 */
export function parseMrzLine2(raw: string, today: string): MrzLine2 | null {
  const line = cleanMrzLine(raw)
  if (line.length < 28) return null
  let start = 0
  for (let s = 0; s + 28 <= line.length && s <= 2; s++) {
    const birth = toDigits(line.slice(s + 13, s + 19))
    const sexOk = /[MF<X]/.test(line[s + 20] ?? '')
    if (sexOk && mrzCheckDigit(birth) === +toDigits(line[s + 19]!)) {
      start = s
      break
    }
  }
  const l = line.slice(start)
  const number = repairPassportNumber(l.slice(0, 9), l[9]!)
  const dated = (from: number, kind: 'birth' | 'expiry') => {
    const digits = toDigits(l.slice(from, from + 6))
    return mrzCheckDigit(digits) === +toDigits(l[from + 6]!) ? mrzDate(digits, kind, today) : null
  }
  return {
    passportNumber: number.value,
    numberValid: number.valid,
    nationality: l.slice(10, 13).replace(/</g, ''),
    dateOfBirth: dated(13, 'birth'),
    expiryDate: dated(21, 'expiry'),
  }
}

/**
 * The holder's name from MRZ line 1, as written on the passport: given names, then the
 * surname ("MD MUSHAROP MIA"). OCR often reads "<" as K or L, so the trailing filler is
 * any run of <, K and L after the last name, and a lone "<K<" separates the surname when
 * no "<<" was read.
 */
export function parseMrzName(
  raw: string,
  /** The country code from line 2 (e.g. BGD): finds where the names start. */
  country?: string,
): { surname: string; given: string } | null {
  const line = cleanMrzLine(raw)
  if (!looksLikeMrzLine1(line)) return null
  // Names start after "P<" + the country; "P<" may be read as "PLK", so find the country.
  const at = country && country.length === 3 ? line.indexOf(country, 1) : -1
  let names = line.slice(at >= 1 && at <= 3 ? at + 3 : 5)
  // OCR reads the filler "<" as K, L or C ("SHAHEEN<<<LLLLLCLLLL…").
  const filler = names.search(/<[<KLC]*$/)
  if (filler >= 0) names = names.slice(0, filler)
  // No "<" read at all: the filler is the trailing run of K/L. (A name ending in K or L
  // loses that letter here; the personal data page's name puts it back.)
  else names = names.replace(/[KLC]{4,}$/, '')
  if (!names.includes('<<')) names = names.replace(/<[KLC]</, '<<')
  const [surname = '', given = ''] = names.split(/<<+/)
  // A "word" of only K, L and C is misread filler, never a name.
  const words = (value: string) =>
    value
      .split('<')
      .filter((w) => w && !/^[KLC]{2,}$/.test(w))
      .join(' ')
  if (!surname) return null
  return { surname: words(surname), given: words(given) }
}

/** "MD MUSHAROP" + "MIA" → "MD MUSHAROP MIA". */
export function mrzFullName(name: { surname: string; given: string }): string {
  return [name.given, name.surname].filter(Boolean).join(' ')
}

export interface PersonalPage {
  name?: string
  fatherName?: string
  motherName?: string
  permanentAddress?: string
}

/** The text before a wide gap: OCR noise (barcode digits, marks) sits far to the right. */
const beforeGap = (raw: string) => raw.trim().split(/\s{5,}/)[0] ?? ''

/**
 * OCR reads a capital I as a lowercase i or l (or |) inside capital words: "KOFiL" is
 * "KOFIL". Other lowercase is left, so real noise ("Eel", "p——71") is still dropped.
 */
const fixCapitalI = (word: string) =>
  /[A-Z]/.test(word) && /^[A-Zil|0-9.,'/()-]+$/.test(word) ? word.replace(/[il|]/g, 'I') : word

/** Uppercase name words only ("MD.", "O'NEIL"): drops OCR noise like "-", "p——71", "Eel". */
function nameValue(raw: string): string {
  return beforeGap(raw)
    .split(/\s+/)
    .map(fixCapitalI)
    .filter((w) => /^[A-Z][A-Z.'-]*$/.test(w))
    .join(' ')
}

/**
 * The holder's name row read on its own: "Name:  SHAHEEN", or with the label misread
 * ("SAAN   SHAHEEN", "3 Re      SHAHEEN"): then the value is after the wide gap between
 * the label column and the value column.
 */
export function parseNameLine(text: string): string {
  const line = text.split('\n').find((l) => /[A-Z]{2}/.test(l)) ?? ''
  const label = /^.*?\bName\s*[:;.]?/i
  if (label.test(line)) return nameValue(line.replace(label, ''))
  const columns = line.trim().split(/\s{3,}/)
  return nameValue(columns.length > 1 ? columns[1]! : columns[0]!)
}

/** Address words: uppercase letters, digits and , . - / ( ); a lone "-" is kept. */
function addressValue(raw: string): string {
  return beforeGap(raw)
    .split(/\s+/)
    .map(fixCapitalI)
    .filter((w) => /^[A-Z0-9][A-Z0-9.,'/()-]*$/.test(w) || w === '-')
    .join(' ')
    .replace(/^-\s*|\s*-$/g, '')
    .trim()
}

/**
 * The personal data page (OCR text of its cropped area): the first "Name:", "Father's
 * Name:", "Mother's Name:" and "Permanent Address:" (with its continuation lines, up to
 * the next label or a blank line). The emergency contact's Name/Address come later and
 * are ignored.
 */
export function parsePersonalPage(text: string): PersonalPage {
  const lines = text.split('\n').map((l) => l.trim())
  const result: PersonalPage = {}
  const labelled = (pattern: RegExp) => {
    const i = lines.findIndex((l) => pattern.test(l))
    return i < 0
      ? null
      : { index: i, value: lines[i]!.replace(pattern, '').replace(/^[\s:;.]+/, '') }
  }

  // Labels as OCR may misread them: "Father's", "Fathers", "Fatmers"; "Mother's", "Motner's".
  const father = labelled(/^.*?\bFa[a-z]{2,4}['’`]?s?\s*Name\s*[:;.]?/i)
  const mother = labelled(/^.*?\bMo[a-z]{2,4}['’`]?s?\s*Name\s*[:;.]?/i)
  // The holder's name: a "Name:" line before the father's (not the emergency contact's).
  // OCR may put a mark or two before the label ("1 Name:", "|) Name:").
  const holderLabel = /^[^A-Za-z]*(?:[A-Za-z0-9]{1,2}[^A-Za-z0-9]+)?Name\s*[:;]/i
  // It comes before every other label: with the father's label misread, the emergency
  // contact's "Name:" must still never be taken for the holder's.
  const firstOther = lines.findIndex((l) =>
    /\b(?:Fa|Mo)[a-z]{2,4}['’`]?s?\s*Name|Spouse|Guardian|Perma?nent|Emergency|Relation/i.test(l),
  )
  const nameLine = lines.findIndex(
    (l, i) =>
      (firstOther < 0 || i < firstOther) &&
      (father === null || i < father.index) &&
      holderLabel.test(l),
  )
  if (nameLine >= 0) result.name = nameValue(lines[nameLine]!.replace(holderLabel, ''))
  if (father) result.fatherName = nameValue(father.value)
  if (mother) result.motherName = nameValue(mother.value)

  const address = labelled(/^.*?Perma?nent\s*Addr?ess\s*[:;.]?/i)
  if (address) {
    // A long address wraps after a comma ("…LOHAJURY - 2338," / "KISHOREGANJ"); OCR may
    // put a blank line between. Up to 2 more lines, while the address so far ends with ",".
    const parts = [addressValue(address.value)]
    for (const line of lines.slice(address.index + 1)) {
      if (!line) continue
      if (line.includes(':') || /emergency|contact|name|relation/i.test(line)) break
      if (parts.length > 2 || !parts[parts.length - 1]!.endsWith(',')) break
      const more = addressValue(line)
      if (/[A-Z]/.test(more)) parts.push(more)
    }
    // "…CHATOL - 2331," + "KISHOREGANJ": lines ending with a comma join with a space.
    result.permanentAddress = parts
      .filter(Boolean)
      .reduce(
        (all, part) => (!all ? part : all.endsWith(',') ? `${all} ${part}` : `${all}, ${part}`),
        '',
      )
      .replace(/,$/, '')
  }

  for (const key of Object.keys(result) as (keyof PersonalPage)[])
    if (!result[key]) delete result[key]
  return result
}

/** Dates printed on the photo page ("10 JUN 1997"), as YYYY-MM-DD, sorted. */
export function printedDates(text: string): string[] {
  const dates: string[] = []
  const pattern = new RegExp(`\\b(\\d{1,2})\\s*(${MONTHS.join('|')})\\s*((?:19|20)\\d{2})\\b`, 'g')
  for (const match of text.toUpperCase().matchAll(pattern)) {
    const mm = MONTHS.indexOf(match[2]!) + 1
    const date = `${match[3]}-${String(mm).padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime()) && parsed.getUTCDate() === +match[1]!) dates.push(date)
  }
  return dates.sort()
}

/** Name words without dots, for comparing the page's name with the MRZ's. */
export function sameName(a: string, b: string): boolean {
  const words = (value: string) =>
    value.replace(/\./g, '').split(/\s+/).filter(Boolean).sort().join(' ')
  return words(a) === words(b)
}

/**
 * Letters only, for comparing two reads of a name. K and L are dropped too: OCR reads the
 * MRZ's "<" as K or L, so "MDKMUSHAROP" and "MD MUSHAROP" must count as the same.
 */
const nameLetters = (value: string) => value.replace(/[^A-Z]/g, '').replace(/[KLC]/g, '')

/**
 * The passport name is Given Name + Surname. The MRZ knows which words are the surname;
 * the personal data page's "Name:" is cleaner text. When both reads agree, the page's
 * words are used in given + surname order (verified). When they disagree or one is
 * missing, the best single read is returned, not verified.
 */
export function pickPassportName(
  mrz: { surname: string; given: string } | null,
  pageName: string | undefined,
): { name: string; verified: boolean } | null {
  const page = (pageName ?? '').trim()
  if (mrz) {
    const surname = nameLetters(mrz.surname)
    const given = nameLetters(mrz.given)
    const words = page.split(/\s+/).filter(Boolean)
    // Split the page's words into given + surname the way the MRZ does (either order).
    for (let k = 1; k < words.length; k++) {
      const head = words.slice(0, k).join(' ')
      const tail = words.slice(k).join(' ')
      if (nameLetters(head) === given && nameLetters(tail) === surname)
        return { name: `${head} ${tail}`, verified: true }
      if (nameLetters(head) === surname && nameLetters(tail) === given)
        return { name: `${tail} ${head}`, verified: true }
    }
    // Same letters but the MRZ's surname separator was misread: the page's "Name:" is
    // already given name + surname.
    if (page && nameLetters(page) === given + surname) return { name: page, verified: true }
    // A passport with no given name, or a misread separator: the same letters.
    if (page && nameLetters(page) === surname) return { name: page, verified: true }
  }
  // Nearly the same (the page's print misread, e.g. "TITU" as "TIT"): the MRZ wins. Its
  // fixed OCR font reads letters far more reliably. Only with the same number of words,
  // so a misread "<" (words run together, "MDKMUSHAROP") never wins this way.
  if (mrz && page) {
    const mrzName = mrzFullName(mrz)
    const count = (value: string) => value.split(/\s+/).filter(Boolean).length
    const letters = (value: string) => value.replace(/[^A-Z]/g, '')
    if (count(mrzName) === count(page) && editDistance(letters(mrzName), letters(page)) <= 2)
      return { name: mrzName, verified: true }
  }
  // Disagreeing reads: the MRZ's when it has a proper given + surname split, else the page's.
  if (mrz && mrz.given && mrz.surname) return { name: mrzFullName(mrz), verified: false }
  if (page) return { name: page, verified: false }
  if (mrz) return { name: mrzFullName(mrz), verified: false }
  return null
}

/** Levenshtein distance (small strings: names). */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length]!
}
