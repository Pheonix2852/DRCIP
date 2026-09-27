import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '../pages/ui/card'
import { weather, weatherIcon } from '../lib/weather'

interface WeatherPanelProps {
  latitude: number | null
  longitude: number | null
}

export function WeatherPanel({ latitude, longitude }: WeatherPanelProps) {
  const enabled = latitude != null && longitude != null

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['weather', latitude, longitude],
    queryFn: () => weather.current(latitude as number, longitude as number),
    enabled,
  })

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weather Context</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Weather is unavailable — no operational coordinates available.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Weather Context</CardTitle>
        <button className="text-xs text-primary hover:underline" onClick={() => refetch()} disabled={isLoading}>Refresh</button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-6 text-muted-foreground" role="status">Loading weather...</div>
        ) : error ? (
          <div className="text-sm text-destructive" role="alert">Weather is currently unavailable.</div>
        ) : !data || data.status === 'UNAVAILABLE' ? (
          <div className="text-sm px-3 py-2 rounded bg-red-50 text-red-800" role="status">
            Weather is unavailable.
          </div>
        ) : data.status === 'STALE' ? (
          <>
            <div className="text-sm px-3 py-2 rounded bg-amber-50 text-amber-800 mb-2" role="status">
              Weather data is stale. Last updated {data.observed_at ? new Date(data.observed_at).toLocaleString() : 'unknown'}.
            </div>
            <WeatherDetails data={data} />
          </>
        ) : (
          <WeatherDetails data={data} />
        )}
      </CardContent>
    </Card>
  )
}

function WeatherDetails({ data }: { data: { temperature: number | null; precipitation: number | null; wind_speed: number | null; humidity: number | null; weather_code: number | null; observed_at: string | null } }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-3xl" aria-hidden>{weatherIcon(data.weather_code)}</span>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm flex-1">
        <dt className="text-muted-foreground">Temperature</dt>
        <dd className="font-medium">{data.temperature != null ? `${data.temperature}°C` : '—'}</dd>
        <dt className="text-muted-foreground">Precipitation</dt>
        <dd className="font-medium">{data.precipitation != null ? `${data.precipitation} mm` : '—'}</dd>
        <dt className="text-muted-foreground">Wind</dt>
        <dd className="font-medium">{data.wind_speed != null ? `${data.wind_speed} km/h` : '—'}</dd>
        <dt className="text-muted-foreground">Humidity</dt>
        <dd className="font-medium">{data.humidity != null ? `${data.humidity}%` : '—'}</dd>
        <dt className="text-muted-foreground">Observed</dt>
        <dd className="font-medium">{data.observed_at ? new Date(data.observed_at).toLocaleTimeString() : '—'}</dd>
      </dl>
    </div>
  )
}