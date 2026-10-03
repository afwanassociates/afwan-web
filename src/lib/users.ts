import api from '@/lib/api'
import type { Paginated, Role, RoleOption, User } from '@/types/auth'

/** User management API (super_admin and admin only). */

export interface UserListParams {
  role?: Role
  is_active?: 0 | 1
  page?: number
  per_page?: number
}

export interface NewUser {
  name: string
  email: string
  password: string
  role: Role
}

export type UserChanges = Partial<Pick<User, 'name' | 'email' | 'role' | 'is_active'>>

export async function listUsers(params: UserListParams): Promise<Paginated<User>> {
  const { data } = await api.get<Paginated<User>>('/api/admin/users', { params })
  return data
}

/** The roles the current user may assign (and therefore manage). */
export async function fetchAssignableRoles(): Promise<RoleOption[]> {
  const { data } = await api.get<{ data: RoleOption[] }>('/api/roles')
  return data.data
}

export async function createUser(payload: NewUser): Promise<User> {
  const { data } = await api.post<{ data: User }>('/api/admin/users', payload)
  return data.data
}

export async function updateUser(id: number, changes: UserChanges): Promise<User> {
  const { data } = await api.patch<{ data: User }>(`/api/admin/users/${id}`, changes)
  return data.data
}

export async function resetUserPassword(id: number, password: string): Promise<void> {
  await api.post(`/api/admin/users/${id}/reset-password`, { password })
}
