'use strict';

// Погода по координатам и датам поездки — Open-Meteo (бесплатно, без ключа).
// Прошлое/текущее берём из архива (реальные данные), будущее — из прогноза
// (доступен примерно на 16 дней вперёд). Всё это обёрнуто в один вызов,
// вызывающий код не должен думать, какой из двух API использовать.
const WeatherService = (() => {
  const ARCHIVE_URL  = 'https://archive-api.open-meteo.com/v1/archive';
  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum,surface_pressure_mean,wind_speed_10m_max';

  function _avg(arr) {
    const vals = arr.filter(v => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }

  // Возвращает {tMin,tMax,precip,pressure,wind,source,fetchedAt} или null,
  // если координат нет или дата слишком далеко в будущем для прогноза.
  async function fetchForTrip(lat, lon, startDate, endDate) {
    if (lat == null || lon == null) return null;

    const today = new Date().toISOString().slice(0, 10);
    const isPast = endDate < today;

    if (!isPast) {
      const maxForecast = new Date();
      maxForecast.setDate(maxForecast.getDate() + 16);
      if (startDate > maxForecast.toISOString().slice(0, 10)) return null;
    }

    const url = isPast ? ARCHIVE_URL : FORECAST_URL;
    const params = new URLSearchParams({
      latitude: lat, longitude: lon,
      start_date: startDate, end_date: endDate,
      daily: DAILY, timezone: 'auto'
    });

    const res = await fetch(url + '?' + params.toString());
    if (!res.ok) throw new Error('weather http ' + res.status);
    const data = await res.json();
    const d = data.daily;
    if (!d || !d.time || !d.time.length) return null;

    const tMaxVals = d.temperature_2m_max.filter(v => v != null);
    const tMinVals = d.temperature_2m_min.filter(v => v != null);
    const windVals = d.wind_speed_10m_max.filter(v => v != null);
    if (!tMaxVals.length || !tMinVals.length) return null;

    return {
      tMax:     Math.round(Math.max(...tMaxVals)),
      tMin:     Math.round(Math.min(...tMinVals)),
      precip:   Math.round((_avg(d.precipitation_sum) || 0) * 10) / 10,
      pressure: Math.round(_avg(d.surface_pressure_mean) || 0),
      wind:     windVals.length ? Math.round(Math.max(...windVals)) : null,
      source:   isPast ? 'archive' : 'forecast',
      fetchedAt: Date.now()
    };
  }

  return { fetchForTrip };
})();
