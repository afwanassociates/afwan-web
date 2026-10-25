import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import DataResetSettingsView from '../DataResetSettingsView.vue'
import { fetchDataReset, resetData, type DataResetOverview } from '@/api/dataReset'
import { SETTINGS_PAGES, settingsPagesFor } from '@/lib/settingsPages'
import { httpError } from '@/test/helpers'

vi.mock('@/api/dataReset', () => ({
  fetchDataReset: vi.fn(),
  resetData: vi.fn(),
  downloadBackup: vi.fn(),
  deleteBackup: vi.fn(),
}))

const overview = (rows = 3): DataResetOverview => ({
  confirmation: 'DELETE ALL DATA',
  groups: [
    {
      key: 'passports',
      label: 'Passports & workflow',
      description: 'Passports.',
      tables: [],
      rows,
      files: 2,
    },
    {
      key: 'companies',
      label: 'Companies & references',
      description: 'Companies.',
      tables: [],
      rows: 4,
      files: null,
    },
    {
      key: 'accounts',
      label: 'Accounts',
      description: 'Accounts.',
      tables: [],
      rows: 5,
      files: null,
    },
  ],
  backups: [],
})

let wrapper: VueWrapper

async function mountView() {
  wrapper = mount(DataResetSettingsView, { attachTo: document.body })
  await flushPromises()
}

const button = () => wrapper.find('[data-action="reset"]')
const checkbox = (key: string) => wrapper.find(`[data-group="${key}"] input`)

beforeEach(() => {
  vi.mocked(fetchDataReset).mockResolvedValue(overview())
})

afterEach(() => {
  wrapper.unmount()
  vi.clearAllMocks()
})

describe('DataResetSettingsView', () => {
  it('lists the groups, all ticked, with their counts', async () => {
    await mountView()

    expect(wrapper.findAll('[data-group]').map((g) => g.attributes('data-group'))).toEqual([
      'passports',
      'companies',
      'accounts',
    ])
    expect(wrapper.find('[data-group="passports"] [data-count]').text()).toContain('2 file(s)')
    expect((checkbox('accounts').element as HTMLInputElement).checked).toBe(true)
    expect(button().text()).toBe('Delete 14 item(s) permanently')
    expect(wrapper.find('[data-no-backups]').exists()).toBe(true)
  })

  it('stays locked until the exact words and a password are entered', async () => {
    await mountView()

    expect(button().attributes('disabled')).toBeDefined()
    await wrapper.find('[data-field="confirmation"] input').setValue('delete all data')
    await wrapper.find('[data-field="password"] input').setValue('secret')
    expect(button().attributes('disabled')).toBeDefined()

    await wrapper.find('[data-field="confirmation"] input').setValue('DELETE ALL DATA')
    expect(button().attributes('disabled')).toBeUndefined()
  })

  it('keeps passports when companies are deleted, and drops companies without passports', async () => {
    await mountView()

    await checkbox('passports').setValue(false)
    expect((checkbox('companies').element as HTMLInputElement).checked).toBe(false)

    await checkbox('companies').setValue(true)
    expect((checkbox('passports').element as HTMLInputElement).checked).toBe(true)
  })

  it('sends the chosen groups, the words and the password, then shows the result', async () => {
    vi.mocked(resetData).mockResolvedValue({
      deleted: { passport_entries: 3, parties: 5 },
      files: 2,
      backup: 'data-backup-2026-10-25-143005.tar.gz',
      groups: overview(0).groups,
      backups: [
        {
          name: 'data-backup-2026-10-25-143005.tar.gz',
          size: 2048,
          created_at: '2026-10-25T14:30:05+06:00',
          created_by: 'Chief',
          groups: ['passports', 'accounts'],
          rows: 8,
          files: 2,
        },
      ],
    })
    await mountView()

    await checkbox('companies').setValue(false)
    await wrapper.find('[data-field="confirmation"] input').setValue('DELETE ALL DATA')
    await wrapper.find('[data-field="password"] input').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(resetData).toHaveBeenCalledWith({
      groups: ['passports', 'accounts'],
      confirmation: 'DELETE ALL DATA',
      password: 'secret',
    })
    expect(wrapper.find('[data-result]').text()).toContain('8 record(s) and 2 file(s)')
    expect(wrapper.find('[data-backup]').text()).toContain('by Chief')
    expect((wrapper.find('[data-field="password"] input').element as HTMLInputElement).value).toBe(
      '',
    )
  })

  it('shows a wrong password next to the field', async () => {
    vi.mocked(resetData).mockRejectedValue(
      httpError(422, { message: 'x', errors: { password: ['The password is not correct.'] } }),
    )
    await mountView()

    await wrapper.find('[data-field="confirmation"] input').setValue('DELETE ALL DATA')
    await wrapper.find('[data-field="password"] input').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-field="password"]').text()).toContain('The password is not correct.')
    expect(wrapper.find('[data-result]').exists()).toBe(false)
  })
})

describe('Danger zone settings page', () => {
  it('is only for the super admin', () => {
    expect(SETTINGS_PAGES.map((p) => p.name)).toContain('settings-danger-zone')
    expect(settingsPagesFor('super_admin').map((p) => p.name)).toContain('settings-danger-zone')
    for (const role of ['admin', 'accounts_head', 'accounts', 'data_entry'] as const) {
      expect(settingsPagesFor(role).map((p) => p.name)).not.toContain('settings-danger-zone')
    }
  })
})
