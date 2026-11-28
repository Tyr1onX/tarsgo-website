import { useEffect, useRef, useState } from "react";
import { WEATHER_LABEL, WEATHER_URL, WEATHER_REFRESH_MS, changchunClimate, parseCurrentWeather,
  type ChangchunClimate, type CurrentWeather, type WeatherMode, type TimeMode } from "./pixel-jijia-climate";

// Own the clock, forecast requests and stored mode preferences. The canvas
// reads the same committed climate through a ref without restarting its RAF.
export function usePixelClimate() {
  const [timeMode, setTimeMode] = useState<TimeMode>("actual");
  const [clock, setClock] = useState<ChangchunClimate | null>(null);
  const [weatherMode, setWeatherMode] = useState<WeatherMode | null>(null);
  const [actualWeather, setActualWeather] = useState<CurrentWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const liveWeather = actualWeather && Math.abs(Date.now() - actualWeather.time) <= WEATHER_REFRESH_MS * 3 ? actualWeather : null;
  const climate = clock && {
    ...clock,
    weather: weatherMode === "random" ? clock.weather : liveWeather?.weather ?? null,
    temperature: weatherMode === "random" ? clock.temperature : liveWeather?.temperature ?? null,
  };
  const climateRef = useRef(climate);
  useEffect(() => { climateRef.current = climate; }, [climate]);
  useEffect(() => {
    const refresh = () => setClock(changchunClimate(new Date(), timeMode));
    refresh();
    const interval = window.setInterval(refresh, timeMode === "game" ? 1000 : 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [timeMode]);

  useEffect(() => {
    setTimeMode(localStorage.getItem("pixel-jijia-time-mode") === "game" ? "game" : "actual");
    setWeatherMode(localStorage.getItem("pixel-jijia-weather-mode") === "random" ? "random" : "actual");
  }, []);

  useEffect(() => {
    if (weatherMode !== "actual") return;
    let active = true;
    let request: AbortController | null = null;
    const refresh = async () => {
      if (request) return;
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 10_000);
      setWeatherLoading(true);
      try {
        const response = await fetch(WEATHER_URL, { signal: request.signal });
        const value = response.ok ? parseCurrentWeather(await response.json()) : null;
        if (active) setActualWeather(value);
      } catch {
        if (active) setActualWeather(null);
      } finally {
        window.clearTimeout(timeout);
        request = null;
        if (active) setWeatherLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, WEATHER_REFRESH_MS);
    return () => {
      active = false;
      request?.abort();
      window.clearInterval(interval);
    };
  }, [weatherMode]);

  const changeWeatherMode = (mode: WeatherMode) => {
    if (mode === weatherMode) return;
    setActualWeather(null);
    setWeatherLoading(mode === "actual");
    setWeatherMode(mode);
    localStorage.setItem("pixel-jijia-weather-mode", mode);
  };

  const changeTimeMode = (mode: TimeMode) => {
    setTimeMode(mode);
    localStorage.setItem("pixel-jijia-time-mode", mode);
  };
  const weatherLabel = weatherMode === "random" && clock ? WEATHER_LABEL[clock.weather]
    : liveWeather?.label ?? (weatherLoading ? "更新中" : "天气不可用");
  return {climate,climateRef,timeMode,weatherMode,changeTimeMode,changeWeatherMode,
    weatherLabel,hasLiveWeather:weatherMode === "actual" && liveWeather !== null};
}
