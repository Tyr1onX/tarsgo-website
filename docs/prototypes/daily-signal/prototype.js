const MOCK_TODAY = "2026-10-15";
const root = document.documentElement;
const panel = document.querySelector(".terminal-panel");
const sceneSelect = document.querySelector("#sceneSelect");
const yearSelect = document.querySelector("#yearSelect");
const heatmapGrid = document.querySelector("#heatmapGrid");
const monthLabels = document.querySelector("#monthLabels");
const dateDetail = document.querySelector("#dateDetail");
const terminalState = document.querySelector("#terminalState");
const terminalMessage = document.querySelector("#terminalMessage");
const sendButton = document.querySelector("#sendSignal");
const themeToggle = document.querySelector("#themeToggle");
const heatmapViewport = document.querySelector("#heatmapViewport");

const scenarios = {
  first: { signed: false, mood: null, empty: false, failed: false },
  repeat: { signed: true, mood: null, empty: false, failed: false },
  "signed-mood": { signed: true, mood: "高负载中", empty: false, failed: false },
  failure: { signed: false, mood: null, empty: false, failed: true },
  empty: { signed: false, mood: null, empty: true, failed: false },
};

let scene = "first";
let selectedMood = null;
let signedToday = false;
let recordSet = new Set();
let selectedDate = MOCK_TODAY;
let focusedDate = MOCK_TODAY;
let transientTimer = 0;
let failureCanRecover = false;

function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toKey(date) {
  return date.toISOString().slice(0, 10);
}

function dateLabel(key, withWeekday = true) {
  const date = parseDate(key);
  const options = withWeekday ? { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" } : { month: "long", day: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

function formattedMonth(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", timeZone: "UTC" }).format(date).replace("月", "");
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeFictionalRecords(year) {
  const output = new Set();
  const today = parseDate(MOCK_TODAY);
  const cursor = new Date(Date.UTC(year, 0, 1));
  while (cursor.getUTCFullYear() === year) {
    const key = toKey(cursor);
    const isFuture = key > MOCK_TODAY;
    const score = stableHash(`${key}-jijia-signal`) % 100;
    const inSmallCluster = ["2026-02-18", "2026-02-19", "2026-02-22", "2026-05-03", "2026-05-04", "2026-08-27", "2026-08-29", "2026-09-11", "2026-09-12"].includes(key);
    if (!isFuture && (inSmallCluster || score < 28)) output.add(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (year === 2026 && today <= parseDate(MOCK_TODAY)) output.delete(MOCK_TODAY);
  return output;
}

function getYearDays(year) {
  const first = new Date(Date.UTC(year, 0, 1));
  const sundayBefore = new Date(first);
  sundayBefore.setUTCDate(first.getUTCDate() - first.getUTCDay());
  const last = new Date(Date.UTC(year, 11, 31));
  const weeks = [];
  const date = new Date(sundayBefore);
  while (date <= last || date.getUTCDay() !== 0) {
    const week = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      week.push(new Date(date));
      date.setUTCDate(date.getUTCDate() + 1);
    }
    weeks.push(week);
    if (date > last && date.getUTCDay() === 0) break;
  }
  return weeks;
}

function getCurrentRecords(year) {
  if (scene === "empty") return new Set();
  if (year !== 2026) return makeFictionalRecords(year);
  const result = makeFictionalRecords(year);
  recordSet.forEach((key) => result.add(key));
  if (signedToday) result.add(MOCK_TODAY);
  return result;
}

function buildMonthLabels(weeks, year) {
  monthLabels.replaceChildren();
  monthLabels.style.gridTemplateColumns = `repeat(${weeks.length}, 14px)`;
  let previousMonth = -1;
  weeks.forEach((week, index) => {
    const inYear = week.find((date) => date.getUTCFullYear() === year);
    if (!inYear) return;
    const month = inYear.getUTCMonth();
    if (month === previousMonth) return;
    const label = document.createElement("span");
    label.textContent = formattedMonth(inYear);
    label.style.gridColumn = String(index + 1);
    monthLabels.append(label);
    previousMonth = month;
  });
}

function cellStatus(key, year, records) {
  if (key < `${year}-01-01` || key > `${year}-12-31`) return "outside";
  if (key > MOCK_TODAY) return "future";
  if (records.has(key)) return "sent";
  if (key === MOCK_TODAY) return "today";
  return "quiet";
}

function cellAccessibleName(key, status) {
  const label = dateLabel(key);
  if (status === "sent") return `${label}，已发送信号`;
  if (status === "today") return `${label}，今天，尚未发送信号`;
  if (status === "future") return `${label}，未来日期`;
  return `${label}，这一天没有留下基地信号`;
}

function renderHeatmap({ preserveScroll = true } = {}) {
  const year = Number(yearSelect.value);
  const previousScroll = preserveScroll ? heatmapViewport.scrollLeft : 0;
  const weeks = getYearDays(year);
  const records = getCurrentRecords(year);
  const activeKey = focusedDate.startsWith(`${year}-`) ? focusedDate : `${year}-01-01`;
  buildMonthLabels(weeks, year);
  heatmapGrid.replaceChildren();
  heatmapGrid.style.gridTemplateColumns = `repeat(${weeks.length}, 12px)`;
  heatmapGrid.setAttribute("aria-label", `${year} 年每日通信记录`);

  weeks.forEach((week) => {
    week.forEach((date) => {
      const key = toKey(date);
      const status = cellStatus(key, year, records);
      if (status === "outside") {
        const blank = document.createElement("span");
        blank.className = "heatmap-outside";
        blank.setAttribute("aria-hidden", "true");
        heatmapGrid.append(blank);
        return;
      }

      const cell = document.createElement("button");
      cell.className = "heatmap-cell";
      cell.type = "button";
      cell.dataset.date = key;
      cell.dataset.status = status;
      cell.tabIndex = key === activeKey ? 0 : -1;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", cellAccessibleName(key, status));
      cell.title = cellAccessibleName(key, status);
      cell.setAttribute("aria-pressed", String(key === selectedDate));
      if (status === "future") {
        cell.disabled = true;
        cell.setAttribute("aria-disabled", "true");
      }
      cell.addEventListener("click", () => chooseDate(key));
      cell.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse") updateDateDetail(key);
      });
      cell.addEventListener("pointerleave", (event) => {
        if (event.pointerType === "mouse") updateDateDetail(selectedDate);
      });
      cell.addEventListener("focus", () => {
        focusedDate = key;
        chooseDate(key);
      });
      cell.addEventListener("keydown", moveGridFocus);
      if (key === selectedDate) cell.classList.add("is-selected");
      heatmapGrid.append(cell);
    });
  });

  if (preserveScroll) heatmapViewport.scrollLeft = previousScroll;
  updateDateDetail(selectedDate);
}

function chooseDate(key) {
  selectedDate = key;
  heatmapGrid.querySelectorAll(".heatmap-cell[aria-pressed='true']").forEach((cell) => cell.setAttribute("aria-pressed", "false"));
  const selectedCell = heatmapGrid.querySelector(`.heatmap-cell[data-date="${key}"]`);
  if (selectedCell) selectedCell.setAttribute("aria-pressed", "true");
  updateDateDetail(key);
}

function updateDateDetail(key) {
  const year = Number(yearSelect.value);
  const records = getCurrentRecords(year);
  const detailYear = Number(key.slice(0, 4));
  const detail = document.createElement("div");
  detail.className = "date-detail";

  const date = document.createElement("span");
  date.className = "date-detail__date";
  date.textContent = dateLabel(key, false);
  const divider = document.createElement("span");
  divider.className = "date-detail__divider";
  divider.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  copy.className = "date-detail__copy";
  const tag = document.createElement("span");
  tag.className = "date-detail__tag";

  let status = "empty";
  if (key > MOCK_TODAY) {
    status = "future";
    copy.textContent = "这一天还没有到来。";
    tag.textContent = "未来";
  } else if (records.has(key)) {
    status = "sent";
    copy.textContent = key === MOCK_TODAY
      ? `今日信号已收到${selectedMood ? ` · ${selectedMood}` : ""}。`
      : "这一天的信号，已经好好收到了。";
    tag.textContent = key === MOCK_TODAY ? "今日已收到" : "信号已收到";
  } else if (key === MOCK_TODAY) {
    status = "today";
    copy.textContent = "今天，等待一条由你决定的信号。";
    tag.textContent = "今天";
  } else if (scene === "empty" && detailYear === year) {
    copy.textContent = "档案刚刚打开。普通的一天，也值得被温柔记住。";
    tag.textContent = "档案启程";
  } else {
    copy.textContent = "这一天没有留下基地信号，但生活仍在继续。";
    tag.textContent = "留白";
  }

  detail.classList.add(`is-${status}`);
  detail.append(date, divider, copy, tag);
  dateDetail.replaceChildren(detail);
}

function moveGridFocus(event) {
  const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  let nextDate;
  if (event.key in deltas) {
    nextDate = parseDate(event.currentTarget.dataset.date);
    nextDate.setUTCDate(nextDate.getUTCDate() + deltas[event.key]);
  } else if (event.key === "Home" || event.key === "End") {
    nextDate = parseDate(event.currentTarget.dataset.date);
    const offset = nextDate.getUTCDay();
    nextDate.setUTCDate(nextDate.getUTCDate() + (event.key === "Home" ? -offset : 6 - offset));
  } else {
    return;
  }

  event.preventDefault();
  const year = Number(yearSelect.value);
  const key = toKey(nextDate);
  if (nextDate.getUTCFullYear() !== year || key > MOCK_TODAY) return;
  const target = heatmapGrid.querySelector(`.heatmap-cell[data-date="${key}"]`);
  if (!target) return;
  event.currentTarget.tabIndex = -1;
  target.tabIndex = 0;
  focusedDate = key;
  target.focus();
}

function setMood(mood) {
  selectedMood = selectedMood === mood ? null : mood;
  document.querySelectorAll(".mood-option").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mood === selectedMood));
  });
}

function setMessage(text, kind = "") {
  terminalMessage.textContent = text;
  terminalMessage.className = `terminal-message${kind ? ` is-${kind}` : ""}`;
  terminalMessage.hidden = !text;
}

function applyScenario(name) {
  window.clearTimeout(transientTimer);
  scene = name in scenarios ? name : "first";
  const config = scenarios[scene];
  signedToday = config.signed;
  selectedMood = config.mood;
  recordSet = new Set();
  failureCanRecover = config.failed;
  selectedDate = MOCK_TODAY;
  focusedDate = MOCK_TODAY;
  panel.classList.remove("is-transmitting");
  panel.dataset.mode = signedToday ? "signed" : config.failed ? "error" : "ready";
  sendButton.disabled = false;
  sendButton.querySelector(".send-button__label").textContent = config.failed ? "重新发送信号" : "发送今日信号";
  terminalState.textContent = signedToday ? "信号已收到" : config.failed ? "发送未完成" : "等待发送";
  document.querySelectorAll(".mood-option").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mood === selectedMood));
  });

  if (scene === "repeat") setMessage("今天已经见过你啦。谢谢你把这一天，也留在基地。", "success");
  else if (scene === "signed-mood") setMessage("「高负载中」已收到。辛苦了，今天可以慢一点。", "success");
  else if (scene === "failure") setMessage("信号暂时没有送达。休息一下，再试一次也可以。", "error");
  else if (scene === "empty") setMessage("档案刚刚启程。什么时候想来，什么时候再发送。", "");
  else setMessage("");

  renderHeatmap({ preserveScroll: false });
}

function startSending() {
  if (signedToday || sendButton.disabled) return;
  if (scene === "failure" && failureCanRecover) {
    failureCanRecover = false;
    scene = "first";
  } else if (scene === "failure") {
    setMessage("信号暂时没有送达。休息一下，再试一次也可以。", "error");
    return;
  }

  panel.dataset.mode = "sending";
  panel.classList.add("is-transmitting");
  sendButton.disabled = true;
  sendButton.querySelector(".send-button__label").textContent = "正在发送…";
  terminalState.textContent = "信号传输中";
  setMessage("SIGNAL TRANSMITTING", "");

  const reduceMotion = root.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  transientTimer = window.setTimeout(() => {
    panel.classList.remove("is-transmitting");
    panel.dataset.mode = "signed";
    sendButton.disabled = false;
    scene = "first";
    sceneSelect.value = "first";
    signedToday = true;
    recordSet.add(MOCK_TODAY);
    terminalState.textContent = "信号已收到";
    setMessage(selectedMood
      ? `今天的信号收到了。谢谢你分享「${selectedMood}」。`
      : "今天的信号收到了。谢谢你又来到这里。", "success");
    renderHeatmap();
  }, reduceMotion ? 80 : 680);
}

function toggleTheme() {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", next === "dark" ? "#0d1010" : "#f7f6f2");
  themeToggle.setAttribute("aria-label", `切换到${next === "dark" ? "日间白金" : "夜间黑金"}主题`);
}

document.querySelectorAll(".mood-option").forEach((button) => button.addEventListener("click", () => setMood(button.dataset.mood)));
sendButton.addEventListener("click", startSending);
sceneSelect.addEventListener("change", (event) => applyScenario(event.currentTarget.value));
yearSelect.addEventListener("change", () => {
  document.querySelector("#archiveYearLabel").textContent = yearSelect.value;
  focusedDate = `${yearSelect.value}-01-01`;
  selectedDate = focusedDate;
  renderHeatmap({ preserveScroll: false });
});
themeToggle.addEventListener("click", toggleTheme);

if (new URLSearchParams(window.location.search).get("motion") === "reduce") {
  root.dataset.motion = "reduce";
}
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  root.dataset.motion = "reduce";
}

applyScenario("first");
themeToggle.setAttribute("aria-label", "切换到日间白金主题");
