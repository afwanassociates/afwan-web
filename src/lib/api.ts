import axios from 'axios'

/**
 * Shared HTTP client for the backend API.
 * Not used yet — import it once real endpoints (e.g. login) are available.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

export default api
