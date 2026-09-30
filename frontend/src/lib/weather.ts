import { unwrap } from './utils'
import api from './api'

export interface WeatherResponse {
  status: 'CURRENT' | 'STALE' | 'UNAVAILABLE'
  temperature: number | null
  precipitation: number | null
  wind_speed: number | null
  humidity: number | null
  weather_code: number | null
  observed_at: string | null
  retrieved_at: string
  source: string | null
}


export const weather = {
  current: (latitude: number, longitude: number) =>
    api.get('/api/v1/weather', { params: { latitude, longitude } }).then((res) => unwrap<WeatherResponse>(res)),
}

export function weatherIcon(code: number | null): string {
  if (code === null) return '—'
  if (code === 0) return '☀️'
  if (code <= 3) return '🌤️'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67 || code <= 77) return '🌧️'
  if (code <= 86) return '❄️'
  return '⛈️'
}