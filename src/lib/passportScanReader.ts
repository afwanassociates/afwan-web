import type { Worker as OcrWorker, Line, Word } from 'tesseract.js'
import { todayApiDate } from '@/lib/dates'
import {
  cleanMrzLine,
  looksLikeMrzLine1,
  looksLikeMrzLine2,
  parseMrzLine2,
  parseMrzName,
  parseNameLine,
  parsePersonalPage,
  type PersonalPage,
  pickPassportName,
  printedDates,
} from '@/lib/passportScanParse'

/**
 * Reads a passport scan copy in the browser (Tesseract.js; the file never leaves the
 * computer, only the OCR engine is downloaded once from the CDN and cached).
 *
 * The scan format: ONE image (or the first page of a PDF) with, from top to bottom,
 *   1. the personal data page (name, father's and mother's name, permanent address),
 *   2. the photo page with the 2-line MRZ code,
 *   3. the passport-size photo.
 * A scan in another format gets a formatError and must not be uploaded.
 */

export interface ScanFields {
  passport_name?: string
  passport_number?: string
  /** YYYY-MM-DD */
  date_of_birth?: string
  /** YYYY-MM-DD */
  passport_expiry_date?: string
  father_name?: string
  mother_name?: string
  permanent_address?: string
}

export interface ScanReadResult {
  /** Set when the scan is not in the required format: do not upload it. */
  formatError: string | null
  fields: ScanFields
  /** Fields read but not verified (e.g. a failed check digit): staff must check them. */
  unsure: (keyof ScanFields)[]
}

/** Below this sharpness (see scanSharpness) the OCR starts reading wrong values. */
export const SCAN_SHARPNESS_MIN = 150

export const SCAN_UNCLEAR =
  'This scan is not clear enough to read (blurry, out of focus or too low quality). Please scan the passport again: flat, in good light, at 300 dpi or more.'

export const SCAN_FORMAT_HELP =
  'Upload one image with the personal data page on top, the passport photo page below it, and the passport-size photo at the bottom.'

/** Thrown when the OCR engine cannot be loaded or run (offline, old browser, …). */
export class ScanReaderUnavailable extends Error {}

/* ---------- Image loading ---------- */

/** Scans are scaled to this width range: small ones read badly, big ones slowly. */
const MIN_WIDTH = 1000
const MAX_WIDTH = 2000

async function pdfFirstPage(file: File): Promise<HTMLCanvasElement> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await pdf.getPage(1)
  const base = page.getViewport({ scale: 1 })
  // A scanned PDF is an image: render it at that image's own resolution (upscaling
  // blurs the text and the OCR reads worse). A PDF without images: 1600 px wide.
  const ops = await page.getOperatorList()
  let imageWidth = 0
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i] as unknown[]
    if (fn === pdfjs.OPS.paintImageXObject && typeof args?.[1] === 'number')
      imageWidth = Math.max(imageWidth, args[1])
  })
  // Straight to the OCR width range in one step: resampling twice blurs the text.
  const target = Math.min(Math.max(imageWidth > 0 ? imageWidth : 1600, MIN_WIDTH), MAX_WIDTH)
  const viewport = page.getViewport({ scale: target / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
  await pdf.destroy()
  return canvas
}

async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  let source: HTMLCanvasElement | ImageBitmap
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
    source = await pdfFirstPage(file)
  else source = await createImageBitmap(file)
  const scale =
    source.width < MIN_WIDTH
      ? MIN_WIDTH / source.width
      : source.width > MAX_WIDTH
        ? MAX_WIDTH / source.width
        : 1
  if (scale === 1 && source instanceof HTMLCanvasElement) return source
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source) source.close()
  return canvas
}

/* ---------- OCR worker (one, reused) ---------- */

let workerPromise: Promise<OcrWorker> | null = null

function ocrWorker(): Promise<OcrWorker> {
  workerPromise ??= import('tesseract.js')
    .then(({ createWorker }) => createWorker('eng'))
    .catch((error: unknown) => {
      workerPromise = null
      throw new ScanReaderUnavailable(String(error))
    })
  return workerPromise
}

type Rect = { left: number; top: number; width: number; height: number }

async function readArea(
  worker: OcrWorker,
  canvas: HTMLCanvasElement,
  rectangle: Rect,
  whitelist: string,
  /** Tesseract page segmentation: 6 = one block, 4 = one column of lines, 7 = one line. */
  layout: '6' | '4' | '7' = '6',
  /** Enlarge the area first: small print (~12 px) reads much better at 2×. */
  zoom = 1,
): Promise<string> {
  await worker.setParameters({
    tessedit_char_whitelist: whitelist,
    tessedit_pageseg_mode: layout as never,
    preserve_interword_spaces: '1',
  })
  if (zoom === 1) return (await worker.recognize(canvas, { rectangle })).data.text
  const area = document.createElement('canvas')
  area.width = Math.round(rectangle.width * zoom)
  area.height = Math.round(rectangle.height * zoom)
  const ctx = area.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    canvas,
    rectangle.left,
    rectangle.top,
    rectangle.width,
    rectangle.height,
    0,
    0,
    area.width,
    area.height,
  )
  return (await worker.recognize(area)).data.text
}

/* ---------- Clear enough to read? ---------- */

/**
 * Sharpness: the variance of the Laplacian (edge strength) of the scan in grey, on a
 * copy 800 px wide so every scan is measured at the same size. Blurry, out-of-focus or
 * heavily compressed scans have weak edges and score low.
 */
export function scanSharpness(source: HTMLCanvasElement): number {
  const width = 800
  const height = Math.max(1, Math.round((source.height * width) / source.width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  const grey = new Float32Array(width * height)
  for (let i = 0; i < grey.length; i++)
    grey[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap = grey[i - 1]! + grey[i + 1]! + grey[i - width]! + grey[i + width]! - 4 * grey[i]!
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  const mean = sum / n
  return sumSq / n - mean * mean
}

/* ---------- The photo below the photo page ---------- */

/**
 * Whether the area under the photo page holds a photo: tall enough (8%+ of the image)
 * and with enough dark pixels (hair, clothes), not blank paper.
 */
function hasPhotoBelow(canvas: HTMLCanvasElement, fromY: number): boolean {
  const top = Math.round(fromY)
  const height = canvas.height - top
  if (height < canvas.height * 0.08) return false
  const { data } = canvas.getContext('2d')!.getImageData(0, top, canvas.width, height)
  let dark = 0
  let total = 0
  // Every 4th pixel is plenty.
  for (let i = 0; i < data.length; i += 16) {
    const luma = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
    if (luma < 100) dark++
    total++
  }
  return total > 0 && dark / total > 0.015
}

/* ---------- Reading ---------- */

const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'
const PAGE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,-:;'/+() "

function linesOf(page: { blocks: { paragraphs: { lines: Line[] }[] }[] | null }): Line[] {
  return (page.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
}

const formatError = (reason: string) =>
  `This scan is not in the right format: ${reason} ${SCAN_FORMAT_HELP}`

/**
 * Reads the scan: checks the format and returns the fields it could read. Throws
 * ScanReaderUnavailable when the OCR engine cannot run (the caller decides what then).
 */
export async function readPassportScan(file: File): Promise<ScanReadResult> {
  const canvas = await toCanvas(file)
  // Unclear scans are refused before any reading: OCR on them gives wrong values.
  if (scanSharpness(canvas) < SCAN_SHARPNESS_MIN)
    return { formatError: SCAN_UNCLEAR, fields: {}, unsure: [] }
  const worker = await ocrWorker()
  const today = todayApiDate()
  const W = canvas.width

  // Pass 1: the whole image, to find where things are.
  await worker.setParameters({
    tessedit_char_whitelist: '',
    tessedit_pageseg_mode: '3' as never, // automatic layout
    preserve_interword_spaces: '0',
  })
  const { data: page } = await worker.recognize(canvas, {}, { blocks: true, text: true })
  const lines = linesOf(page)

  // The MRZ: the lowest line that looks like line 2, with line 1 just above it.
  let line2Index = -1
  lines.forEach((l, i) => {
    if (looksLikeMrzLine2(cleanMrzLine(l.text))) line2Index = i
  })
  const line2 = lines[line2Index]
  if (!line2) {
    return {
      formatError: formatError(
        'the 2-line code at the bottom of the passport photo page was not found.',
      ),
      fields: {},
      unsure: [],
    }
  }
  const line1 = lines
    .slice(0, line2Index)
    .reverse()
    .find((l) => looksLikeMrzLine1(cleanMrzLine(l.text)))
  const mrzTop = line1?.bbox.y0 ?? line2.bbox.y0 - (line2.bbox.y1 - line2.bbox.y0) * 1.5
  const mrzBottom = line2.bbox.y1
  // The smaller box: a stray mark (a "|") can stretch one line's box.
  const lineHeight = Math.max(
    Math.min(line2.bbox.y1 - line2.bbox.y0, line1 ? line1.bbox.y1 - line1.bbox.y0 : Infinity),
    10,
  )

  // The personal data page: its labels must be above the photo page.
  const words: Word[] = lines.flatMap((l) => l.words)
  const above = (w: Word) => w.bbox.y1 < mrzTop - lineHeight * 4
  // A label ("Father's", "Mother's"), never an all-caps value such as the emergency
  // contact's relationship "FATHER"; the topmost one.
  const label = (pattern: RegExp) =>
    words
      .filter((w) => above(w) && pattern.test(w.text) && !/^[A-Z]+$/.test(w.text))
      .sort((a, b) => a.bbox.y0 - b.bbox.y0)[0]
  const father = label(/^fath?er/i)
  const mother = label(/^moth?er/i)
  const labelled = lines.some(
    (l) =>
      l.bbox.y1 < mrzTop && /personal\s*data|perma?nent\s*addr|emergency\s*contact/i.test(l.text),
  )
  if (!father && !mother && !labelled) {
    return {
      formatError: formatError(
        "the personal data page (father's and mother's name, address) was not found above the photo page.",
      ),
      fields: {},
      unsure: [],
    }
  }

  // The passport-size photo: below the photo page (past its bottom edge).
  if (!hasPhotoBelow(canvas, mrzBottom + lineHeight * 2.5)) {
    return {
      formatError: formatError(
        'the passport-size photo was not found below the passport photo page.',
      ),
      fields: {},
      unsure: [],
    }
  }

  // Pass 2: the MRZ band alone, cropped tight (page edges and the watermark below
  // confuse the OCR), with only MRZ characters allowed.
  const mrzLeft = Math.min(line2.bbox.x0, line1?.bbox.x0 ?? Infinity)
  const mrzRight = Math.max(line2.bbox.x1, line1?.bbox.x1 ?? 0)
  const bandLeft = Math.max(0, mrzLeft - lineHeight)
  const bandTop = Math.max(0, mrzTop - lineHeight * 0.8)
  const mrzText = await readArea(
    worker,
    canvas,
    {
      left: Math.round(bandLeft),
      top: Math.round(bandTop),
      width: Math.round(Math.min(W, mrzRight + lineHeight) - bandLeft),
      height: Math.round(Math.min(canvas.height, mrzBottom + lineHeight * 0.6) - bandTop),
    },
    MRZ_CHARS,
  )
  const mrzLines = mrzText.split('\n').map(cleanMrzLine).filter(Boolean)
  const mrz2 =
    parseMrzLine2(mrzLines.find(looksLikeMrzLine2) ?? '', today) ?? parseMrzLine2(line2.text, today)
  // The machine code must read with its check digits: if 2 of the 3 (number, birth,
  // expiry) fail, the print is not clear enough to trust any field.
  const mrzFailures = mrz2
    ? [!mrz2.numberValid, !mrz2.dateOfBirth, !mrz2.expiryDate].filter(Boolean).length
    : 3
  if (mrzFailures >= 2) return { formatError: SCAN_UNCLEAR, fields: {}, unsure: [] }
  const country = mrz2?.nationality
  const mrzName =
    parseMrzName(mrzLines.find(looksLikeMrzLine1) ?? '', country) ??
    (line1 ? parseMrzName(line1.text, country) : null)

  // Pass 3: the personal data page's text area (left of its barcode), any text allowed.
  const mrzWidth = mrzRight - mrzLeft
  const anchor = father ?? mother
  // One row: Father's to Mother's (when both were found where expected).
  const gap = father && mother ? mother.bbox.y0 - father.bbox.y0 : 0
  const rowHeight = gap > lineHeight * 0.5 && gap < lineHeight * 4 ? gap : lineHeight * 1.4
  // "Name:" is 1 row above "Father's" and 2 rows above "Mother's".
  const rowsAbove = anchor === father ? 2.6 : 3.6
  const personalTop = anchor ? Math.max(0, anchor.bbox.y0 - rowHeight * rowsAbove) : 0
  const personalLeft = anchor ? Math.max(0, anchor.bbox.x0 - rowHeight) : mrzLeft
  // The text column ends before the barcode (~84% across); far-right noise is cut by a gap.
  const personalRight = Math.min(W, mrzLeft + mrzWidth * 0.8)
  const personalBottom = anchor
    ? Math.min(anchor.bbox.y0 + (mrzTop - anchor.bbox.y0) * 0.45, mrzTop)
    : mrzTop * 0.5
  const personalArea: Rect = {
    left: Math.round(personalLeft),
    top: Math.round(personalTop),
    width: Math.max(1, Math.round(personalRight - personalLeft)),
    height: Math.max(1, Math.round(personalBottom - personalTop)),
  }
  // Tesseract is sensitive to scale and layout: one setting reads a line another loses.
  // Try a few reads until every field is found and the name agrees with the MRZ; each
  // field comes from the first read that found it, the name from one that agrees.
  const READS: ['6' | '4', number][] = [
    ['6', 1],
    ['6', 2],
    ['4', 2],
    ['4', 1],
  ]
  const personal: PersonalPage = {}
  const nameAgrees = (name?: string) => Boolean(name && pickPassportName(mrzName, name)?.verified)
  for (const [layout, zoom] of READS) {
    const read = parsePersonalPage(
      await readArea(worker, canvas, personalArea, PAGE_CHARS, layout, zoom),
    )
    if (nameAgrees(read.name) && !nameAgrees(personal.name)) personal.name = read.name
    for (const key of Object.keys(read) as (keyof PersonalPage)[]) personal[key] ??= read[key]
    const done = personal.fatherName && personal.motherName && personal.permanentAddress
    if (done && (nameAgrees(personal.name) || (!mrzName && personal.name))) break
  }

  // The top "Name:" line is the one block reads drop most: read its row alone (one row
  // above "Father's", two above "Mother's"), with or without its label.
  if (mrzName && anchor && !nameAgrees(personal.name)) {
    const rowTop = anchor.bbox.y0 - rowHeight * (anchor === father ? 1 : 2)
    for (const zoom of [2, 1]) {
      const line = await readArea(
        worker,
        canvas,
        {
          left: Math.round(personalLeft),
          top: Math.max(0, Math.round(rowTop - rowHeight * 0.45)),
          width: Math.max(1, Math.round(personalRight - personalLeft)),
          height: Math.max(1, Math.round(rowHeight * 0.95)),
        },
        PAGE_CHARS,
        '7',
        zoom,
      )
      const single = parseNameLine(line)
      if (nameAgrees(single)) {
        personal.name = single
        break
      }
    }
  }

  // Put the fields together; anything not verified is marked unsure.
  const fields: ScanFields = {}
  const unsure: (keyof ScanFields)[] = []
  // Given Name + Surname, checked between the MRZ and the personal data page.
  const name = pickPassportName(mrzName, personal.name)
  if (name) {
    fields.passport_name = name.name
    if (!name.verified) unsure.push('passport_name')
  }

  if (mrz2) {
    if (mrz2.passportNumber) fields.passport_number = mrz2.passportNumber
    if (!mrz2.numberValid) unsure.push('passport_number')
  }
  // Dates: the MRZ's when its check digit passes, else the printed ones (unsure).
  const printed = printedDates(
    lines
      .filter((l) => l.bbox.y0 > personalBottom && l.bbox.y1 <= mrzTop)
      .map((l) => l.text)
      .join('\n'),
  )
  if (mrz2?.dateOfBirth) fields.date_of_birth = mrz2.dateOfBirth
  else if (printed[0] && printed[0] < today) {
    fields.date_of_birth = printed[0]
    unsure.push('date_of_birth')
  }
  const latest = printed[printed.length - 1]
  if (mrz2?.expiryDate) fields.passport_expiry_date = mrz2.expiryDate
  else if (printed.length > 1 && latest && latest > today) {
    fields.passport_expiry_date = latest
    unsure.push('passport_expiry_date')
  }

  if (personal.fatherName) fields.father_name = personal.fatherName
  if (personal.motherName) fields.mother_name = personal.motherName
  if (personal.permanentAddress) fields.permanent_address = personal.permanentAddress

  return { formatError: null, fields, unsure }
}
