export type DailySignalMood = "状态不错" | "稳定运行" | "有点疲惫" | "高负载中" | "正在调试";

type ReplyPools = {
  warm: readonly string[];
  humor: readonly string[];
};

type ReplyCatalog = {
  version: string;
  effectiveFrom: string;
  neutral: ReplyPools;
  moods: Record<DailySignalMood, ReplyPools>;
};

const NEUTRAL_FALLBACK = "信号已收到。谢谢你愿意把这一程留在这里。";

const CATALOGS: readonly ReplyCatalog[] = [
  {
    version: "v1",
    effectiveFrom: "0001-01-01",
    neutral: {
      warm: [
        "谢谢你把一小段时光，寄到这里。",
        "信号收到。按自己的节奏走，也很好。",
        "收到啦。愿这条记录替你轻轻收好这一程。",
      ],
      humor: ["基地收到啦，值班台不催进度，只负责认真收信。"],
    },
    moods: {
      "状态不错": {
        warm: ["收到这份好状态啦。愿它陪你走一段。", "这份明亮的状态，基地认真收到了。"],
        humor: ["信号已到站，机器人这次不用返工。"],
      },
      "稳定运行": {
        warm: ["稳定运行，基地已为此刻留档。谢谢你来。", "收到啦。平稳前行，也是一种了不起。"],
        humor: ["基地收到啦，值班台不催进度，只负责认真收信。"],
      },
      "有点疲惫": {
        warm: ["收到啦。可以给自己留一点余地。", "基地收到啦，慢一点也完全可以。"],
        humor: [],
      },
      "高负载中": {
        warm: ["信号收到。任务队列很长，也请给自己留一点缓冲。", "收到啦。先照顾好自己，队列可以慢慢来。"],
        humor: ["基地收到啦，值班台不催进度，只负责认真收信。"],
      },
      "正在调试": {
        warm: ["调试中的每一步，也值得被记下来。愿下一次编译顺利。", "收到啦。每次排查，都在让事情变得更清楚。"],
        humor: ["信号已收；这一帧无需返工。"],
      },
    },
  },
];

const VALID_MOODS = new Set<DailySignalMood>([
  "状态不错",
  "稳定运行",
  "有点疲惫",
  "高负载中",
  "正在调试",
]);

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function isBeijingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function catalogForDate(date: string) {
  let catalog = CATALOGS[0];
  for (const candidate of CATALOGS) {
    if (candidate.effectiveFrom <= date && candidate.effectiveFrom >= catalog.effectiveFrom) {
      catalog = candidate;
    }
  }
  return catalog;
}

function selectReply(
  account: string,
  date: string,
  mood: DailySignalMood | null,
  catalog: ReplyCatalog,
) {
  const pools = mood ? catalog.moods[mood] : catalog.neutral;
  const seed = `${catalog.version}:${account}:${date}:${mood ?? "neutral"}`;
  const useHumor = pools.humor.length > 0 && hash(`${seed}:tone`) % 10 === 0;
  const options = useHumor ? pools.humor : pools.warm;
  if (options.length === 0) return NEUTRAL_FALLBACK;

  const day = Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
  const rotation = hash(`${catalog.version}:${account}:${mood ?? "neutral"}:rotation`);
  return options[(rotation + day) % options.length] ?? NEUTRAL_FALLBACK;
}

function accountKey(accountId: number | string | null | undefined) {
  if (typeof accountId !== "number" && typeof accountId !== "string") return null;
  const value = String(accountId).trim();
  return value.length > 0 ? value : null;
}

/**
 * Derives one private reply from the signed-in account, the server's Beijing
 * date and its currently saved mood. Replies are deliberately not persisted.
 */
export function getDailySignalReply(
  accountId: number | string | null | undefined,
  beijingDate: string,
  mood: DailySignalMood | string | null | undefined,
) {
  const account = accountKey(accountId);
  if (!account || !isBeijingDate(beijingDate)) return NEUTRAL_FALLBACK;

  const safeMood = typeof mood === "string" && VALID_MOODS.has(mood as DailySignalMood)
    ? mood as DailySignalMood
    : null;
  const catalog = catalogForDate(beijingDate);
  const selected = selectReply(account, beijingDate, safeMood, catalog);

  // For an unchanged mood, rotate warm copy by calendar day and avoid repeating
  // yesterday's occasional joke. This keeps adjacent days feeling distinct
  // without storing a reply or receipt.
  if (beijingDate > "0001-01-01") {
    const previousDate = new Date(Date.parse(`${beijingDate}T00:00:00.000Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const previousCatalog = catalogForDate(previousDate);
    if (previousCatalog.version === catalog.version) {
      const previous = selectReply(account, previousDate, safeMood, previousCatalog);
      if (selected === previous) {
        const pools = safeMood ? catalog.moods[safeMood] : catalog.neutral;
        const alternative = pools.warm.find((copy) => copy !== previous);
        if (alternative) return alternative;
      }
    }
  }

  return selected;
}
