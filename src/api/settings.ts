import api from '@/lib/api'
import type { AppDefaults } from '@/types/country'

/** Admin only. */
export async function getSettings(): Promise<AppDefaults> {
  const { data } = await api.get<{ data: AppDefaults }>('/api/admin/settings')
  return data.data
}

/** Admin only. 422 when a code is not an active country. */
export async function updateSettings(settings: AppDefaults): Promise<AppDefaults> {
  const { data } = await api.put<{ data: AppDefaults }>('/api/admin/settings', settings)
  return data.data
}
