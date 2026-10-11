import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import PassportDetailView from '../PassportDetailView.vue'
import { getPassport } from '@/api/passports'
import { fetchPassportScan, uploadPassportScan } from '@/api/passportScan'
import { useAuthStore } from '@/stores/auth'
import { httpError, makePassport, makeUser } from '@/test/helpers'
import { WORKFLOW_CONFIG } from '@/test/workflowFixtures'
import type { Role } from '@/types/auth'
import type { PassportEntry } from '@/types/passport'

vi.mock('@/api/passports', () => ({ getPassport: vi.fn(), listPassports: vi.fn() }))
vi.mock('@/api/medical', () => ({
  listMedicals: vi.fn(async () => []),
  deleteMedical: vi.fn(),
  updateMedicalSlip: vi.fn(),
}))
vi.mock('@/api/steps', () => ({
  listStepRecords: vi.fn(async () => ({})),
  deleteStepRecord: vi.fn(),
  recordStep: vi.fn(),
  updateStepRecord: vi.fn(),
}))
vi.mock('@/api/workflow', () => ({
  fetchWorkflowSummary: vi.fn(async () => null),
  fetchWorkflowConfig: vi.fn(async () => WORKFLOW_CONFIG),
}))
vi.mock('@/api/passportScan', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/passportScan')>()),
  fetchPassportScan: vi.fn(),
  uploadPassportScan: vi.fn(),
}))

const IMAGE_SCAN: Partial<PassportEntry> = {
  has_scan: true,
  scan_original_name: 'passport-20.jpg',
  scan_mime: 'image/jpeg',
  scan_size: 245_760,
  scan_uploaded_at: '2026-10-09T06:00:00Z',
}
const PDF_SCAN: Partial<PassportEntry> = {
  has_scan: true,
  scan_original_name: 'passport-20.pdf',
  scan_mime: 'application/pdf',
  scan_size: 1_572_864,
  scan_uploaded_at: '2026-10-09T06:00:00Z',
}
const NO_SCAN: Partial<PassportEntry> = { has_scan: false }

let wrapper: VueWrapper
const createObjectURL = vi.fn(() => 'blob:scan-1')
const revokeObjectURL = vi.fn()

async function mountDetail(scan: Partial<PassportEntry>, role: Role = 'data_entry') {
  vi.mocked(getPassport).mockResolvedValue(makePassport({ id: 20, ...scan }))
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().user = makeUser({ role })
  const Empty = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/data-entry/passports/:id', name: 'passport-detail', component: PassportDetailView },
      { path: '/data-entry/passports/:id/edit', name: 'passport-edit', component: Empty },
      { path: '/data-entry/passports', name: 'passports', component: Empty },
      { path: '/medical', name: 'medical', component: Empty },
      { path: '/process', name: 'process', component: Empty },
    ],
  })
  await router.push('/data-entry/passports/20')
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

const card = () => wrapper.get('[data-scan-card]')

beforeEach(() => {
  vi.clearAllMocks()
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  vi.mocked(fetchPassportScan).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
})
afterEach(() => wrapper?.unmount())

describe('Passport scan copy on /data-entry/passports/:id', () => {
  it('shows an image scan inline, from an object URL fetched through the API', async () => {
    await mountDetail(IMAGE_SCAN)

    expect(card().get('h2').text()).toBe('Passport scan copy')
    expect(fetchPassportScan).toHaveBeenCalledWith(20)
    const img = card().get<HTMLImageElement>('img[data-scan-image]')
    expect(img.attributes('src')).toBe('blob:scan-1') // never a public URL
    expect(card().get('[data-scan-meta]').text()).toContain('passport-20.jpg · 240 KB')
    expect(card().find('button[data-scan-download]').exists()).toBe(true)
    expect(card().find('button[data-scan-replace]').exists()).toBe(true)
  })

  it('downloads through the API with ?download=1, saving it under its original name', async () => {
    await mountDetail(IMAGE_SCAN)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await card().get('button[data-scan-download]').trigger('click')
    await flushPromises()

    expect(fetchPassportScan).toHaveBeenLastCalledWith(20, true)
    const link = click.mock.contexts[0] as HTMLAnchorElement
    expect(link.download).toBe('passport-20.jpg')
    expect(link.href).toBe('blob:scan-1')
    click.mockRestore()
  })

  it('treats a 404 ("no scan copy yet") as no scan', async () => {
    vi.mocked(fetchPassportScan).mockRejectedValue(
      httpError(404, { message: 'This passport has no scan copy yet.' }),
    )
    await mountDetail(IMAGE_SCAN)

    expect(card().get('[data-scan-empty]').text()).toContain('No scan copy uploaded')
    expect(card().find('[data-scan-error]').exists()).toBe(false)
    expect(card().find('button[data-scan-upload]').exists()).toBe(true)
  })

  it('replaces the scan (multipart "scan") and refreshes the details', async () => {
    vi.mocked(uploadPassportScan).mockResolvedValue(makePassport({ id: 20, ...PDF_SCAN }))
    await mountDetail(IMAGE_SCAN)
    vi.mocked(getPassport).mockResolvedValue(
      makePassport({ id: 20, ...PDF_SCAN, scan_uploaded_at: '2026-10-11T09:00:00Z' }),
    )
    vi.mocked(fetchPassportScan).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    const pdf = new File(['%PDF-1.4'], 'passport-20.pdf', { type: 'application/pdf' })

    const input = card().get<HTMLInputElement>('input[data-scan-input]')
    Object.defineProperty(input.element, 'files', { value: [pdf], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(uploadPassportScan).toHaveBeenCalledWith(20, pdf, expect.any(Function))
    expect(getPassport).toHaveBeenCalledTimes(2) // the details were reloaded
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:scan-1') // the old URL was released
    expect(card().find('[data-scan-pdf]').exists()).toBe(true)
  })

  it('opens an image full size in a lightbox', async () => {
    await mountDetail(IMAGE_SCAN)

    await card().get('button[data-scan-image-button]').trigger('click')
    await flushPromises()

    const full = card().get('img[data-scan-full]')
    expect(full.attributes('src')).toBe('blob:scan-1')
    expect(full.element.closest('dialog')!.hasAttribute('open')).toBe(true)
  })

  it('embeds a PDF scan with an "Open PDF" button', async () => {
    vi.mocked(fetchPassportScan).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    await mountDetail(PDF_SCAN)

    const pdf = card().get('[data-scan-pdf]')
    expect(pdf.get('object').attributes('data')).toBe('blob:scan-1')
    expect(pdf.get('object').attributes('type')).toBe('application/pdf')
    expect(pdf.get('a[data-scan-open-pdf]').attributes('href')).toBe('blob:scan-1')
    expect(card().find('img[data-scan-image]').exists()).toBe(false)
  })

  it('shows "No scan copy uploaded" with Upload when there is no scan (no request)', async () => {
    await mountDetail(NO_SCAN)

    expect(card().get('[data-scan-empty]').text()).toContain('No scan copy uploaded')
    expect(card().find('button[data-scan-upload]').exists()).toBe(true)
    expect(fetchPassportScan).not.toHaveBeenCalled()
  })

  it('uploads a scan and reloads the passport', async () => {
    vi.mocked(uploadPassportScan).mockResolvedValue(makePassport({ id: 20, ...IMAGE_SCAN }))
    await mountDetail(NO_SCAN)
    vi.mocked(getPassport).mockResolvedValue(makePassport({ id: 20, ...IMAGE_SCAN }))

    const input = card().get<HTMLInputElement>('input[data-scan-input]')
    const file = new File(['img'], 'scan.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(uploadPassportScan).toHaveBeenCalledWith(20, file, expect.any(Function))
    expect(card().find('img[data-scan-image]').exists()).toBe(true)
  })

  it('rejects a file type the API does not accept before uploading', async () => {
    await mountDetail(NO_SCAN)

    const input = card().get<HTMLInputElement>('input[data-scan-input]')
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(uploadPassportScan).not.toHaveBeenCalled()
    expect(card().get('[data-scan-upload-error]').text()).toBe(
      'The scan must be a JPG, PNG or PDF file.',
    )
  })

  it('explains a 413 from the web server (body too large) instead of a generic error', async () => {
    vi.mocked(uploadPassportScan).mockRejectedValue(httpError(413))
    await mountDetail(NO_SCAN)

    const input = card().get<HTMLInputElement>('input[data-scan-input]')
    const file = new File([new Uint8Array(2 * 1024 * 1024)], 'scan.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(card().get('[data-scan-upload-error]').text()).toContain(
      'The server refused the file because it is too large.',
    )
  })

  it('hides Replace and Upload from read-only roles (accounts)', async () => {
    await mountDetail(IMAGE_SCAN, 'accounts')
    expect(card().find('button[data-scan-replace]').exists()).toBe(false)
    expect(card().find('input[data-scan-input]').exists()).toBe(false)
    expect(card().find('button[data-scan-download]').exists()).toBe(true)
    wrapper.unmount()

    await mountDetail(NO_SCAN, 'accounts')
    expect(card().find('button[data-scan-upload]').exists()).toBe(false)
  })

  it('shows a permission message on 403 instead of a broken image', async () => {
    vi.mocked(fetchPassportScan).mockRejectedValue(httpError(403))
    await mountDetail(IMAGE_SCAN, 'accounts')

    expect(card().get('[data-scan-forbidden]').text()).toBe(
      "You don't have permission to view the scan",
    )
    expect(card().find('img').exists()).toBe(false)
    expect(card().find('button[data-scan-download]').exists()).toBe(false)
  })

  it('shows a skeleton while loading, then an error with Retry', async () => {
    let reject: (reason: unknown) => void = () => {}
    vi.mocked(fetchPassportScan).mockImplementationOnce(
      () => new Promise((_resolve, rej) => (reject = rej)),
    )
    await mountDetail(IMAGE_SCAN)
    expect(card().find('[data-scan-skeleton]').exists()).toBe(true)

    reject(httpError(500))
    await flushPromises()
    expect(card().get('[data-scan-error]').text()).toContain('Could not load the scan copy.')

    await card().get('button[data-scan-retry]').trigger('click')
    await flushPromises()
    expect(fetchPassportScan).toHaveBeenCalledTimes(2)
    expect(card().find('img[data-scan-image]').exists()).toBe(true)
  })

  it('revokes the object URL on unmount', async () => {
    await mountDetail(IMAGE_SCAN)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    wrapper.unmount()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:scan-1')
  })
})
