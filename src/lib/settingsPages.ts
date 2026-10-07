import type { RouteComponent } from 'vue-router'
import { SETTINGS_ROLES } from '@/lib/roles'
import type { Role } from '@/types/auth'

/**
 * Every page of the admin Settings section, in menu order.
 *
 * To add a setting:
 *   1. Create its page, e.g. src/views/admin/CompanyProfileSettingsView.vue
 *      (sections with <h2>; the Settings layout already provides the <h1> and tabs).
 *   2. Add one entry below.
 * The route (/admin/settings/<path>), its tab, its Overview card, its access check and the
 * sidebar "Settings" item all come from this list.
 */
export interface SettingsPage {
  /** Route name, e.g. 'settings-countries'. */
  name: string
  /** URL segment after /admin/settings/ */
  path: string
  /** Tab and card title */
  label: string
  /** One sentence for the Overview card */
  description: string
  /** Who may open it (defaults to admin and super_admin). */
  roles: readonly Role[]
  component: () => Promise<RouteComponent>
}

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  {
    name: 'settings-countries',
    path: 'countries',
    label: 'Countries & defaults',
    description:
      'Turn countries on or off, pin the most used ones and choose the default countries for new companies and passports.',
    roles: SETTINGS_ROLES,
    component: () => import('@/views/admin/CountriesSettingsView.vue'),
  },
]

/** The settings pages a role may open. */
export function settingsPagesFor(role: Role): SettingsPage[] {
  return SETTINGS_PAGES.filter((page) => page.roles.includes(role))
}

/** Roles that can open at least one settings page (and so see "Settings" in the sidebar). */
export const SETTINGS_SECTION_ROLES: readonly Role[] = [
  ...new Set(SETTINGS_PAGES.flatMap((page) => page.roles)),
]
