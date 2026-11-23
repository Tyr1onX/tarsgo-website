// Game atmosphere follows Changchun civil time; weather is simulated, not observed.
export type Season = "spring" | "summer" | "autumn" | "winter";
export type WeatherKind = "clear" | "cloudy" | "rain" | "snow";
export type ChangchunClimate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  season: Season;
  weather: WeatherKind;
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
  const weather: WeatherKind = season === "winter"
    ? (random < 0.38 ? "snow" : random < 0.68 ? "cloudy" : "clear")
    : season === "summer"
      ? (random < 0.36 ? "rain" : random < 0.61 ? "cloudy" : "clear")
      : random < 0.2 ? "rain" : random < 0.53 ? "cloudy" : "clear";
  // Keep evenings readable and respect Changchun's varying seasonal daylight.
  const sunrise = season === "summer" ? 5 : season === "winter" ? 7 : 6;
  const sunset = season === "summer" ? 19 : season === "winter" ? 17 : 18;
  const night = hour < sunrise ? Math.min(0.42, (sunrise - hour) * 0.12)
    : hour >= sunset ? Math.min(0.42, (hour - sunset + 1) * 0.12) : 0;
  return { year, month, day, hour, minute, season, weather, night, dateKey };
}

export const SEASON_LABEL: Record<Season, string> = {
  spring: "春", summer: "夏", autumn: "秋", winter: "冬",
};
export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "晴朗", cloudy: "多云", rain: "小雨", snow: "飘雪",
};
