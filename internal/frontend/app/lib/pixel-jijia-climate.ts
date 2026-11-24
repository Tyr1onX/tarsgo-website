// Campus atmosphere follows Changchun civil time, independently of the visitor.
export type Season = "spring" | "summer" | "autumn" | "winter";
export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";
export type WeatherMode = "actual" | "random";
export type CurrentWeather = { weather: WeatherKind; label: string; temperature: number; time: number };
export const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=43.85&longitude=125.32&current=temperature_2m,weather_code&timeformat=unixtime";
export const WEATHER_REFRESH_MS = 15 * 60_000;
export type ChangchunClimate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  season: Season;
  weather: WeatherKind;
  temperature: number;
  night: number;
  dateKey: string;
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function changchunClimate(now: Date): ChangchunClimate {
  const fields = Object.fromEntries(formatter.formatToParts(now)
    .filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const { year, month, day, hour, minute } = fields as Record<"year" | "month" | "day" | "hour" | "minute", number>;
  const season: Season = month >= 3 && month <= 5 ? "spring"
    : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Fixed within each four-hour block; refreshes never reroll the same conditions.
  const seed = year * 211 + month * 541 + day * 271 + Math.floor(hour / 4) * 127;
  const random = ((Math.imul(seed ^ (seed >>> 7), 1664525) + 1013904223) >>> 0) / 4294967296;
  const candidate: WeatherKind = season === "winter"
    ? (random < 0.38 ? "snow" : random < 0.68 ? "cloudy" : "clear")
    : season === "summer"
      ? (random < 0.36 ? "rain" : random < 0.61 ? "cloudy" : "clear")
      : random < 0.2 ? "rain" : random < 0.53 ? "cloudy" : "clear";
  // Keep evenings readable and respect Changchun's varying seasonal daylight.
  const sunrise = season === "summer" ? 5 : season === "winter" ? 7 : 6;
  const sunset = season === "summer" ? 19 : season === "winter" ? 17 : 18;
  const night = hour < sunrise ? Math.min(0.42, (sunrise - hour) * 0.12)
    : hour >= sunset ? Math.min(0.42, (hour - sunset + 1) * 0.12) : 0;
  // Simulated temperature follows seasonal conditions and daytime warming.
  const monthly = [-16, -12, -3, 8, 16, 21, 24, 22, 16, 7, -3, -13][month - 1];
  const temperature = Math.round(monthly + Math.cos((Math.floor(hour / 4) * 4 + 2 - 14) * Math.PI / 12) * 5 + (random - .5) * 8 - (candidate === "snow" ? 3 : 0));
  const weather: WeatherKind = candidate === "rain" && temperature <= 0 ? "snow" : candidate === "snow" && temperature > 0 ? "rain" : candidate;
  return { year, month, day, hour, minute, season, weather, temperature, night, dateKey };
}

export const SEASON_LABEL: Record<Season, string> = {
  spring: "春", summer: "夏", autumn: "秋", winter: "冬",
};
export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "晴朗", cloudy: "多云", fog: "雾", rain: "降雨", snow: "降雪", storm: "雷雨",
};

// WMO weather interpretation codes from Open-Meteo current model conditions.
// Unknown or stale data is never silently replaced with simulated conditions.
export function parseCurrentWeather(value: unknown, now = Date.now()): CurrentWeather | null {
  const current = (value as { current?: { time?: unknown; temperature_2m?: unknown; weather_code?: unknown } } | null)?.current;
  if (!current || typeof current.time !== "number" || !Number.isFinite(current.time) ||
      Math.abs(now - current.time * 1000) > WEATHER_REFRESH_MS * 3 ||
      typeof current.temperature_2m !== "number" || !Number.isFinite(current.temperature_2m) ||
      typeof current.weather_code !== "number") return null;
  const code = current.weather_code;
  let weather: WeatherKind, label: string;
  if (code === 0 || code === 1) { weather = "clear"; label = code === 0 ? "晴朗" : "大致晴朗"; }
  else if (code === 2 || code === 3) { weather = "cloudy"; label = code === 2 ? "多云" : "阴天"; }
  else if (code === 45 || code === 48) { weather = "fog"; label = "雾"; }
  else if ([51, 53, 55, 56, 57].includes(code)) { weather = "rain"; label = "毛毛雨"; }
  else if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) { weather = "rain"; label = "降雨"; }
  else if ([71, 73, 75, 77, 85, 86].includes(code)) { weather = "snow"; label = "降雪"; }
  else if ([95, 96, 99].includes(code)) { weather = "storm"; label = "雷雨"; }
  else return null;
  return { weather, label, temperature: current.temperature_2m, time: current.time * 1000 };
}
