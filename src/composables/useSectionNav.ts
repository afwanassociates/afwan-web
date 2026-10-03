import { useRoute, useRouter } from 'vue-router'
import { scrollToSection } from '@/lib/scroll'

/**
 * Returns a function that navigates to a section on the home page.
 * On the home page it scrolls in place; elsewhere it routes to /#id first.
 */
export function useSectionNav() {
  const route = useRoute()
  const router = useRouter()

  return (id: string) => {
    if (route.name === 'home' && scrollToSection(id)) return
    router.push({ name: 'home', hash: `#${id}` })
  }
}
