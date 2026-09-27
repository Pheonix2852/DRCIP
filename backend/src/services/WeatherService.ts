import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

export interface WeatherData {
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  humidity: number | null;
  weatherCode: number | null;
  observedAt: Date;
  source: string;
}

export interface WeatherResponse {
  data: WeatherData | null;
  status: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
  retrievedAt: Date;
}

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function getCurrentWeather(latitude: number, longitude: number): Promise<WeatherResponse> {
  const retrievedAt = new Date();

  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
      timezone: 'auto',
    });

    const response = await fetch(`${OPEN_METEO_BASE}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);

    const json = await response.json() as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        precipitation?: number;
        wind_speed_10m?: number;
        weather_code?: number;
        time?: string;
      };
    };

    const current = json.current;
    if (!current) throw new Error('No current weather data');

    const data: WeatherData = {
      temperature: current.temperature_2m ?? null,
      precipitation: current.precipitation ?? null,
      windSpeed: current.wind_speed_10m ?? null,
      humidity: current.relative_humidity_2m ?? null,
      weatherCode: current.weather_code ?? null,
      observedAt: current.time ? new Date(current.time) : retrievedAt,
      source: 'open-meteo',
    };

    // Persist the observation (best-effort; geography trigger may fail)
    await prisma.weatherObservation.create({
      data: {
        latitude,
        longitude,
        observedAt: data.observedAt,
        source: data.source,
        temperature: data.temperature,
        precipitation: data.precipitation,
        windSpeed: data.windSpeed,
        humidity: data.humidity,
        rawPayload: json as unknown as Prisma.InputJsonValue,
        retrievedAt,
      },
    }).catch(() => {});

    return { data, status: 'CURRENT', retrievedAt };
  } catch {
    // Fallback to most recent stored observation
    const latest = await prisma.weatherObservation.findFirst({
      where: { latitude, longitude },
      orderBy: { retrievedAt: 'desc' },
    });

    if (latest) {
      const age = retrievedAt.getTime() - latest.retrievedAt.getTime();
      const status = age <= STALE_THRESHOLD_MS ? 'STALE' : 'UNAVAILABLE';
      const data: WeatherData = {
        temperature: latest.temperature?.toNumber() ?? null,
        precipitation: latest.precipitation?.toNumber() ?? null,
        windSpeed: latest.windSpeed?.toNumber() ?? null,
        humidity: latest.humidity?.toNumber() ?? null,
        weatherCode: null,
        observedAt: latest.observedAt,
        source: latest.source,
      };
      return { data: status === 'UNAVAILABLE' ? null : data, status, retrievedAt };
    }

    return { data: null, status: 'UNAVAILABLE', retrievedAt };
  }
}
