'use strict';

// Погода по координатам и датам поездки — Open-Meteo (бесплатно, без ключа).
// Прошлое берём из архива (реальные данные), будущее — из прогноза (доступен
// примерно на 16 дней вперёд). Поездка, которая идёт прямо сейчас (начало в
// прошлом, конец в будущем/сегодня) тянет ОБА диапазона и объединяет дни —
// раньше такая поездка целиком уходила в прогноз с start_date в прошлом,
// который forecast-эндпоинт Open-Meteo не отдаёт, и погода для активных
// поездок (когда она нужнее всего) молча никогда не показывалась.
const WeatherService = (() => {
  const ARCHIVE_URL  = 'https://archive-api.open-meteo.com/v1/archive';
  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum,surface_pressure_mean,wind_speed_10m_max,sunrise,sunset';

  function _avg(arr) {
    const vals = arr.filter(v => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  async function _fetchDaily(url, lat, lon, startDate, endDate) {
    const params = new URLSearchParams({
      latitude: lat, longitude: lon,
      start_date: startDate, end_date: endDate,
      daily: DAILY, timezone: 'auto'
    });
    const res = await fetch(url + '?' + params.toString());
    if (!res.ok) throw new Error('weather http ' + res.status);
    const data = await res.json();
    return data.daily || null;
  }

  function _summarize(d, source) {
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
      source,
      fetchedAt: Date.now()
    };
  }

  function _mergeDaily(a, b) {
    if (!a) return b;
    if (!b) return a;
    const merged = {};
    Object.keys(a).forEach(key => { merged[key] = a[key].concat(b[key] || []); });
    return merged;
  }

  // Извлекает "HH:MM" из ISO-таймстампа Open-Meteo (2026-06-15T04:56 — уже
  // в местном времени точки, т.к. запрос идёт с timezone:'auto').
  function _hm(iso) {
    return iso ? iso.slice(11, 16) : null;
  }

  function _toDailyArray(d) {
    if (!d || !d.time) return [];
    return d.time.map((date, i) => ({
      date,
      tMax:    d.temperature_2m_max[i],
      tMin:    d.temperature_2m_min[i],
      precip:  d.precipitation_sum[i],
      pressure: d.surface_pressure_mean ? d.surface_pressure_mean[i] : null,
      wind:    d.wind_speed_10m_max[i],
      sunrise: d.sunrise ? _hm(d.sunrise[i]) : null,
      sunset:  d.sunset  ? _hm(d.sunset[i])  : null
    }));
  }

  // Погода по каждому отдельному дню поездки (для Гида — маршрут по дням) —
  // та же архив/прогноз/mixed-логика, что и в fetchForTrip, но без свёртки
  // в одну сводную цифру на всю поездку.
  async function fetchDailyForTrip(lat, lon, startDate, endDate) {
    if (lat == null || lon == null) return null;
    const today = new Date().toISOString().slice(0, 10);
    const maxForecastStr = _addDays(today, 16);

    if (endDate < today) {
      return _toDailyArray(await _fetchDaily(ARCHIVE_URL, lat, lon, startDate, endDate));
    }
    if (startDate > maxForecastStr) return null;
    if (startDate >= today) {
      return _toDailyArray(await _fetchDaily(FORECAST_URL, lat, lon, startDate, endDate));
    }
    const [past, future] = await Promise.all([
      _fetchDaily(ARCHIVE_URL, lat, lon, startDate, _addDays(today, -1)),
      _fetchDaily(FORECAST_URL, lat, lon, today, endDate)
    ]);
    return _toDailyArray(_mergeDaily(past, future));
  }

  // Возвращает {tMin,tMax,precip,pressure,wind,source,fetchedAt} или null,
  // если координат нет или дата слишком далеко в будущем для прогноза.
  // source — 'archive' | 'forecast' | 'mixed' (поездка идёт прямо сейчас).
  async function fetchForTrip(lat, lon, startDate, endDate) {
    if (lat == null || lon == null) return null;

    const today = new Date().toISOString().slice(0, 10);
    const maxForecastStr = _addDays(today, 16);

    if (endDate < today) {
      return _summarize(await _fetchDaily(ARCHIVE_URL, lat, lon, startDate, endDate), 'archive');
    }
    if (startDate > maxForecastStr) return null; // слишком далеко в будущем

    if (startDate >= today) {
      return _summarize(await _fetchDaily(FORECAST_URL, lat, lon, startDate, endDate), 'forecast');
    }

    // Активная поездка — часть дат уже прошла, часть ещё впереди.
    const [past, future] = await Promise.all([
      _fetchDaily(ARCHIVE_URL, lat, lon, startDate, _addDays(today, -1)),
      _fetchDaily(FORECAST_URL, lat, lon, today, endDate)
    ]);
    return _summarize(_mergeDaily(past, future), 'mixed');
  }

  return { fetchForTrip, fetchDailyForTrip };
})();
