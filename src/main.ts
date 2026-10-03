import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { setAuthHandlers } from './lib/api'
import { DEACTIVATED_MESSAGE, useAuthStore } from './stores/auth'

const app = createApp(App)

app.use(createPinia())
app.use(router)

const auth = useAuthStore()
setAuthHandlers({
  onUnauthenticated() {
    auth.clear()
    const current = router.currentRoute.value
    if (current.meta.requiresAuth) {
      router.push({ name: 'login', query: { redirect: current.fullPath } })
    }
  },
  onDeactivated() {
    auth.clear()
    auth.notice = DEACTIVATED_MESSAGE
    // Before the first navigation the router guard does the redirect itself.
    if (
      router.currentRoute.value.name !== undefined &&
      router.currentRoute.value.name !== 'login'
    ) {
      router.push({ name: 'login' })
    }
  },
})

app.mount('#app')
