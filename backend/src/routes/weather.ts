import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { AppRequest } from '../middleware/index';
import { getCurrentWeather } from '../services/WeatherService';

const router = Router();

router.get('/', requireRole('DISASTER_COORDINATOR', 'ADMINISTRATOR'), async (req: AppRequest, res, next) => {
  try {
    const latitude = parseFloat(req.query.latitude as string);
    const longitude = parseFloat(req.query.longitude as string);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'latitude and longitude query parameters are required' },
        request_id: req.requestId,
      });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Coordinates out of range' },
        request_id: req.requestId,
      });
    }

    const result = await getCurrentWeather(latitude, longitude);

    res.json({
      success: true,
      data: {
        status: result.status,
        temperature: result.data?.temperature ?? null,
        precipitation: result.data?.precipitation ?? null,
        wind_speed: result.data?.windSpeed ?? null,
        humidity: result.data?.humidity ?? null,
        weather_code: result.data?.weatherCode ?? null,
        observed_at: result.data?.observedAt?.toISOString() ?? null,
        retrieved_at: result.retrievedAt.toISOString(),
        source: result.data?.source ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
