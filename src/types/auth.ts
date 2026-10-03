/** Types matching the afwan-api contract. */

export type Role = 'super_admin' | 'admin' | 'data_entry' | 'accounts'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  role_label: string
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

/** An entry from GET /api/roles: a role the current user may assign. */
export interface RoleOption {
  value: Role
  label: string
}

/** Laravel's standard paginated resource response. */
export interface Paginated<T> {
  data: T[]
  links: {
    first: string | null
    last: string | null
    prev: string | null
    next: string | null
  }
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
    from: number | null
    to: number | null
  }
}

/** The `errors` object of a 422 (or 429) response: field → messages. */
export type ValidationErrors = Record<string, string[]>

/** Body of an API error response. */
export interface ApiErrorBody {
  message?: string
  errors?: ValidationErrors
}
