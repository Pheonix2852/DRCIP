import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'

export type WsEventType = 'incident.created' | 'incident.updated' | 'unknown'

export interface WsEvent {
  event: WsEventType
  version: number
  timestamp: string
  data: Record<string, unknown>
}

export function useRealtime() {
  const { ws } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!ws) return

    const handleMessage = (ev: MessageEvent) => {
      try {
        const parsed: WsEvent = JSON.parse(ev.data)
        window.dispatchEvent(new CustomEvent('drcip:ws-event', { detail: parsed }))
        switch (parsed.event) {
          case 'incident.created':
          case 'incident.updated':
            queryClient.invalidateQueries({ queryKey: ['incidents'] })
            if (parsed.data?.public_id) {
              queryClient.invalidateQueries({ queryKey: ['incident', parsed.data.public_id] })
            }
            break
          default:
            break
        }
      } catch {
        // ignore non-JSON WS frames
      }
    }

    ws.addEventListener('message', handleMessage)
    return () => ws.removeEventListener('message', handleMessage)
  }, [ws, queryClient])
}
