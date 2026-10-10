import type { LatestStatus, StatusTone } from '@/types/passport'

/**
 * Wording and colour of a passport's latest status. The two medical "waiting" states are
 * kept apart: no slip date yet ("Passport entered", grey) and slip date entered but no
 * result ("Medical pending", amber). Everything else is the API's text and tone.
 */
export function latestStatusDisplay(
  status: Pick<LatestStatus, 'stage' | 'status' | 'text' | 'tone'>,
): {
  text: string
  tone: StatusTone
} {
  if (status.stage === 'passport' || status.status === 'not_started')
    return { text: 'Passport entered', tone: 'gray' }
  if (status.stage === 'medical' && status.status === 'pending')
    return { text: 'Medical pending', tone: 'amber' }
  return { text: status.text, tone: status.tone }
}
