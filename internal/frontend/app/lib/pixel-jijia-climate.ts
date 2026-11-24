// Campus atmosphere follows Changchun civil time, independently of the visitor.
export type Season = "spring" | "summer" | "autumn" | "winter";
export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";
export type WeatherMode = "actual" | "random";
export type TimeMode = "actual" | "game";
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
  sunX: number; sunY: number; sunHeight: number;
  dateKey: string;
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function changchunClimate(now: Date, mode: TimeMode = "actual"): ChangchunClimate {
  const fields = Object.fromEntries(formatter.formatToParts(now)
    .filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  let { year, month, day, hour, minute } = fields as Record<"year" | "month" | "day" | "hour" | "minute", number>;
  // One game minute per real second, while the real calendar controls seasons.
  if (mode === "game") {
    const minutes = Math.floor(now.getTime() / 1000) % 1440;
    hour = Math.floor(minutes / 60); minute = minutes % 60;
  }
  const season: Season = month >= 3 && month <= 5 ? "spring"
    : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Fixed within each four-hour block; refreshes never reroll the same conditions.
  const daySeed = mode === "game" ? Math.floor(now.getTime() / 1_440_000) : year * 211 + month * 541 + day * 271;
  const seed = Math.imul(daySeed + Math.floor(hour / 4) * 127, 374761393);

  const random = ((Math.imul(seed ^ (seed >>> 13), 1274126177) ^ (seed >>> 17)) >>> 0) / 4294967296;
  const candidate: WeatherKind = season === "winter"
    ? (random < 0.32 ? "snow" : random < 0.40 ? "fog" : random < 0.68 ? "cloudy" : "clear")
    : season === "summer"
      ? (random < 0.10 ? "storm" : random < 0.36 ? "rain" : random < 0.42 ? "fog" : random < 0.66 ? "cloudy" : "clear")
      : random < 0.20 ? "rain" : random < 0.28 ? "fog" : random < 0.56 ? "cloudy" : "clear";
  // Approximate solar direction using latitude, seasonal declination and hour
  // angle. East is +x, north is -y; the artwork uses an overhead projection.
  const dayOfYear = (Date.UTC(year,month-1,day)-Date.UTC(year,0,0))/86400000;
  const rad = Math.PI/180, latitude = 43.85*rad;
  const declination = 23.44*rad*Math.sin(2*Math.PI*(284+dayOfYear)/365);
  const angle = ((hour+minute/60)-12+5.32/15)*15*rad;
  const sunX = -Math.cos(declination)*Math.sin(angle);
  const sunY = Math.sin(latitude)*Math.cos(declination)*Math.cos(angle)-Math.cos(latitude)*Math.sin(declination);
  const sunHeight = Math.sin(latitude)*Math.sin(declination)+Math.cos(latitude)*Math.cos(declination)*Math.cos(angle);
  const night = Math.max(0,Math.min(.42,(.015-sunHeight)*1.8));
  // Simulated temperature follows seasonal conditions and daytime warming.
  const monthly = [-16, -12, -3, 8, 16, 21, 24, 22, 16, 7, -3, -13][month - 1];
  const temperature = Math.round(monthly + Math.cos((Math.floor(hour / 4) * 4 + 2 - 14) * Math.PI / 12) * 5 + (random - .5) * 8 - (candidate === "snow" ? 3 : 0));
  const weather: WeatherKind = (candidate === "rain" || candidate === "storm") && temperature <= 0 ? "snow" : candidate === "snow" && temperature > 0 ? "rain" : candidate;
  return { year, month, day, hour, minute, season, weather, temperature, night, sunX, sunY, sunHeight, dateKey };
}

export type SurfaceWeather = { wet: number; snow: number };
const unit = (value:number) => Math.max(0,Math.min(1,value));

// Visual accumulation lives in the scene, not in per-tile gameplay state.
// Rainwater drains gradually, and snow melts only as the temperature rises.
export function advanceSurface(surface: SurfaceWeather, weather: WeatherKind|null,
  temperature: number|null, dt: number): SurfaceWeather {
  if(!weather || temperature===null || dt<=0)return surface;
  const rain=weather==="rain"||weather==="storm";
  const snowfall=weather==="snow";
  const melt=temperature>0 ? Math.min(surface.snow,dt*(.012+temperature*.003)) : 0;
  return {
    wet:unit(surface.wet+dt*(rain?.11:-.014)+melt*.65),
    snow:unit(surface.snow+dt*(snowfall?.085:0)-melt),
  };
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
