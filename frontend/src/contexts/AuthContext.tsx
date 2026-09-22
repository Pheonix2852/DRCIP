import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Role, LoginRequest, LoginResponse } from '@drcip/contracts';
import api from '../lib/api';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  isInitialized: boolean
  hasRole: (roles: Role[]) => boolean
  ws: WebSocket | null
  wsStatus: WsStatus
  connectWebSocket: () => void
  disconnectWebSocket: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

const MAX_RECONNECT_DELAY = 30000
const INITIAL_RECONNECT_DELAY = 1000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [wsStatus, setWsStatus] = useState<WsStatus>('closed')
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(INITIAL_RECONNECT_DELAY)
  const mountedRef = useRef(true)
  const navigate = useNavigate()

  useEffect(() => {
    const stored = localStorage.getItem('drcip-auth')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (!parsed?.token || !parsed?.user) throw new Error('malformed session')
        setToken(parsed.token)
        setUser(parsed.user)
      } catch {
        localStorage.removeItem('drcip-auth')
      }
    }
    setIsInitialized(true)
    return () => { mountedRef.current = false }
  }, [])

  const disconnectWebSocket = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (ws) {
      ws.close()
      setWs(null)
    }
    setWsStatus('closed')
  }, [ws])

  const connectWebSocket = useCallback((isReconnect = false) => {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return

    const storedToken = token || (() => {
      try {
        const s = localStorage.getItem('drcip-auth')
        return s ? JSON.parse(s)?.token : null
      } catch { return null }
    })()
    if (!storedToken) return

    setWsStatus(isReconnect ? 'reconnecting' : 'connecting')
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws'
    const socket = new WebSocket(`${wsUrl}?token=${storedToken}`)

    socket.onopen = () => {
      if (!mountedRef.current) return
      setWs(socket)
      setWsStatus('open')
      reconnectDelay.current = INITIAL_RECONNECT_DELAY
      window.dispatchEvent(new Event('drcip:ws-reconnected'))
    }

    socket.onclose = () => {
      if (!mountedRef.current) return
      setWs(null)
      setWsStatus('closed')
      if (isReconnect || isInitialized) {
        const delay = reconnectDelay.current
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY)
        reconnectTimer.current = setTimeout(() => connectWebSocket(true), delay)
      }
    }

    socket.onerror = () => {
      if (!mountedRef.current) return
      socket.close()
    }
  }, [ws, token, isInitialized])

  useEffect(() => {
    if (token) {
      connectWebSocket()
    } else {
      disconnectWebSocket()
    }
    return () => disconnectWebSocket()
  }, [token])

  const login = async (credentials: LoginRequest) => {
    const response = await api.post<{ success: boolean; data: LoginResponse }>('/api/v1/auth/login', credentials)
    if (!response.data.success) throw new Error('Login failed')
    const { access_token, user: userData } = response.data.data
    const fullUser: User = {
      id: userData.id,
      name: userData.name,
      email: '',
      role: userData.role,
      is_active: true,
      created_at: new Date().toISOString(),
    }
    setToken(access_token)
    setUser(fullUser)
    localStorage.setItem('drcip-auth', JSON.stringify({ token: access_token, user: fullUser }))
  }

  const logout = () => {
    disconnectWebSocket()
    setToken(null)
    setUser(null)
    localStorage.removeItem('drcip-auth')
    navigate('/login')
  }

  useEffect(() => {
    const handleAuthLogout = () => { logout() }
    window.addEventListener('auth:logout', handleAuthLogout)
    return () => window.removeEventListener('auth:logout', handleAuthLogout)
  }, [navigate])

  const hasRole = (roles: Role[]) => {
    return user ? roles.includes(user.role as Role) : false
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, isInitialized, hasRole, ws, wsStatus, connectWebSocket, disconnectWebSocket }}>
      {children}
    </AuthContext.Provider>
  )
}
