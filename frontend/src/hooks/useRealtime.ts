import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export type WsEventType =
  | 'incident.created'
  | 'incident.updated'
  | 'incident.resolved'
  | 'resource.updated'
  | 'team.updated'
  | 'assignment.created'
  | 'assignment.updated'
  | 'notification.created'
  | 'unknown'

export interface WsEvent {
  event: WsEventType
  version: number
  timestamp: string
  data: Record<string, unknown>
}

const WS_MESSAGE_EVENT = 'drcip:ws-message'
const WS_RECONNECTED_EVENT = 'drcip:ws-reconnected'

// Listens for raw socket frames bridged onto the window by AuthContext. Using a
// window bus instead of a ws.addEventListener attached from a React effect closes
// the listener-registration race: the effect is registered on first mount, so it
// is already listening whenever a socket can produce frames (which only happens
// after login/connect). Reconnects additionally invalidate the notification
// queries so an event missed during the connection gap is reconciled from REST.
export function useRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const handleMessage = (ev: Event) => {
      try {
        const parsed: WsEvent = JSON.parse((ev as CustomEvent).detail)
        window.dispatchEvent(new CustomEvent('drcip:ws-event', { detail: parsed }))
        switch (parsed.event) {
          case 'incident.created':
          case 'incident.updated':
            queryClient.invalidateQueries({ queryKey: ['incidents'] })
            if (parsed.data?.public_id) {
              queryClient.invalidateQueries({ queryKey: ['incident', parsed.data.public_id] })
            }
            break
          case 'resource.updated':
            queryClient.invalidateQueries({ queryKey: ['capacity'] })
            queryClient.invalidateQueries({ queryKey: ['resources'] })
            break
          case 'team.updated':
            queryClient.invalidateQueries({ queryKey: ['capacity'] })
            queryClient.invalidateQueries({ queryKey: ['teams'] })
            break
          case 'assignment.created':
          case 'assignment.updated':
            queryClient.invalidateQueries({ queryKey: ['assignments'] })
            if (parsed.data?.incident_id) {
              queryClient.invalidateQueries({ queryKey: ['incident', parsed.data.incident_id] })
            }
            break
          case 'notification.created':
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            break
          default:
            break
        }
      } catch {
        // ignore non-JSON WS frames
      }
    }

    const handleReconnected = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }

    window.addEventListener(WS_MESSAGE_EVENT, handleMessage)
    window.addEventListener(WS_RECONNECTED_EVENT, handleReconnected)
    return () => {
      window.removeEventListener(WS_MESSAGE_EVENT, handleMessage)
      window.removeEventListener(WS_RECONNECTED_EVENT, handleReconnected)
    }
  }, [queryClient])
}