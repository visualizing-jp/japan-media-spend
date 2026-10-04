import "../shared/theme.css";
import "./scale.css";
import series from "../data/kakei/series.json";
import { formatYen, mountChart, type Series } from "../shared/chart";
import { hosts, siteHref } from "../shared/hosts";
import { mountMarks } from "../shared/mark";
import { mountViews, parseOff, readQuery, readYear, showView, spanYears, writeOff, writeQuery, writeYear } from "../shared/query";

type Row = {
  year: number;
  value: number;
  segment: string;
  universe: string;
  source: string;
};

type Item = {
  id: string;
  name: string;
  code: string;
  color: string;
  points: Row[];
  note?: string;
};

const data = series as {
  yearStart: number;
  yearEnd: number;
  breaks: number[];
  items: Item[];
  overlap2000: {
    nonfarm: Record<string, number>;
    twoplus: Record<string, number>;
  };
};

const shorts: Record<string, string> = {
  newspaper: "新聞",
  magazine: "雑誌",
  books: "書籍",
  broadcast: "放送受信料",
  nhk: "NHK",
  "other-incl": "他（ケーブル含む）",
  cable: "ケーブル",
  other: "他の受信料",
};

const charts: Series[] = data.items.map((item) => ({
  id: item.id,
  name: item.name,
  short: shorts[item.id] ?? item.name,
  color: item.color,
  points: item.points,
}));

document.querySelectorAll<HTMLAnchorElement>("[data-home]").forEach((home) => {
  home.href = siteHref("index");
});
document.querySelectorAll("[data-domain]").forEach((domain) => {
  domain.textContent = hosts.spend;
});
mountMarks();

function pointAt(id: string, year: number) {
  return data.items.find((item) => item.id === id)?.points.find((point) => point.year === year);
}

function peak(id: string) {
  const points = data.items.find((item) => item.id === id)?.points ?? [];
  return points.reduce((best, point) => (point.value > best.value ? point : best));
}

const newsPeak = peak("newspaper");
const lede = document.querySelector("#lede");
if (lede) {
  lede.textContent = `新聞が最も高かったのは${newsPeak.year}年の${formatYen(newsPeak.value)}。2025年は${formatYen(pointAt("newspaper", 2025)?.value ?? 0)}。金額は名目で、1世帯あたりの年間。`;
}

const universeLabel: Record<string, string> = {
  nonfarm: "二人以上の非農林漁家世帯",
  twoplus: "二人以上の世帯",
};

function renderReadout(year: number) {
  const box = document.querySelector("#readout");
  if (!box) return;
  const present = data.items
    .map((item) => ({ item, point: pointAt(item.id, year) }))
    .filter((row): row is { item: Item; point: Row } => Boolean(row.point));
  const total = present.reduce((sum, row) => sum + row.point.value, 0);
  const universe = present[0]?.point.universe ?? "";
  box.replaceChildren();
  const yearEl = document.createElement("span");
  yearEl.className = "year";
  yearEl.textContent = `${year}年`;
  const who = document.createElement("span");
  who.textContent = universeLabel[universe] ?? "";
  const sum = document.createElement("span");
  sum.innerHTML = `<b>合計 ${formatYen(total)}</b>`;
  box.append(yearEl, who, sum);
  for (const row of present) {
    const bit = document.createElement("span");
    bit.textContent = `${shorts[row.item.id] ?? row.item.name} ${formatYen(row.point.value)}`;
    box.append(bit);
  }
}

function requiredIds(year: number): string[] {
  if (year < 2000) return ["newspaper", "magazine", "books", "broadcast"];
  if (year <= 2001) return ["newspaper", "magazine", "books", "nhk", "other-incl"];
  return ["newspaper", "magazine", "books", "nhk", "cable", "other"];
}

function shareRows(year: number): { item: Item; point: Row; share: number }[] | null {
  const ids = requiredIds(year);
  const rows = ids.map((id) => {
    const item = data.items.find((entry) => entry.id === id);
    const point = item ? pointAt(id, year) : undefined;
    return item && point ? { item, point } : null;
  });
  if (rows.some((row) => row === null)) return null;
  const present = rows.filter((row): row is { item: Item; point: Row } => row !== null);
  const total = present.reduce((sum, row) => sum + row.point.value, 0);
  if (!(total > 0)) return null;
  return present.map((row) => ({ ...row, share: (row.point.value / total) * 100 }));
}

function formatShare(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}%`;
}

function renderShareReadout(year: number) {
  const box = document.querySelector("#readout");
  if (!box) return;
  box.replaceChildren();
  const yearEl = document.createElement("span");
  yearEl.className = "year";
  yearEl.textContent = `${year}年`;
  box.append(yearEl);
  const rows = shareRows(year);
  if (!rows) return;
  const who = document.createElement("span");
  who.textContent = universeLabel[rows[0].point.universe] ?? "";
  const sum = document.createElement("span");
  sum.innerHTML = "<b>合計 100%</b>";
  box.append(who, sum);
  for (const row of rows) {
    const bit = document.createElement("span");
    bit.textContent = `${shorts[row.item.id] ?? row.item.name} ${formatShare(row.share)}`;
    box.append(bit);
  }
}

const shareCharts: Series[] = charts.map((series) => ({
  ...series,
  points: series.points.flatMap((point) => {
    const rows = shareRows(point.year);
    const row = rows?.find((entry) => entry.item.id === series.id);
    if (!row) return [];
    return [{ ...point, value: row.share }];
  }),
}));

const spendYears = spanYears(data.yearStart, data.yearEnd);
const seriesIds = charts.map((series) => series.id);
const views = mountViews(document.querySelector("#views")!, [
  { id: "amount", label: "金額", hint: "1963–2025" },
  { id: "item", label: "品目", hint: "1963–2025" },
]);
const modeFallback = "share";
let mode = readQuery("mode", modeFallback, (value) => value === "share" || value === "amount");
writeQuery("mode", mode, modeFallback);

const amountNote = "積み上げは、その年に公表されている品目だけを足している。2000年で帯を切る。";
const shareNote = "その年の全系列の合計を 100% にする。凡例を消しても、残った系列だけでは 100% にしない。必要な系列が欠ける年は空欄。2000年で帯を切る。";

function paintReadout(year: number) {
  if (mode === "share") renderShareReadout(year);
  else renderReadout(year);
}

function applyMode(next: string) {
  mode = next === "amount" ? "amount" : "share";
  writeQuery("mode", mode, modeFallback);
  const scale = document.querySelector<HTMLElement>("#scale");
  if (scale) scale.dataset.mode = mode;
  scale?.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.setAttribute("aria-checked", button.dataset.mode === mode ? "true" : "false");
  });
  const note = document.querySelector("#amount-note");
  if (note) note.textContent = mode === "share" ? shareNote : amountNote;
  const stackHost = document.querySelector<HTMLElement>("#stack");
  const shareHost = document.querySelector<HTMLElement>("#share");
  if (stackHost) stackHost.hidden = mode !== "amount";
  if (shareHost) shareHost.hidden = mode !== "share";
}

applyMode(mode);
const peers: { stack?: ReturnType<typeof mountChart>; share?: ReturnType<typeof mountChart> } = {};
document.querySelectorAll<HTMLButtonElement>("#scale [data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.mode === mode || !button.dataset.mode) return;
    applyMode(button.dataset.mode);
    const year = (mode === "share" ? peers.share : peers.stack)?.getYear();
    if (year !== undefined) paintReadout(year);
  });
});
showView(views.id);
const initialOff = parseOff(seriesIds);
if (initialOff === null) writeOff([]);
const hidden = initialOff ?? [];
const initialYear = readYear(spendYears);

peers.stack = mountChart(document.querySelector("#stack")!, {
  series: charts,
  yearStart: data.yearStart,
  yearEnd: data.yearEnd,
  breaks: data.breaks,
  mode: "stack",
  year: initialYear,
  hidden,
  annotations: [
    { year: 2000, label: "世帯の範囲" },
    { year: 2018, label: "調査方法" },
  ],
  onYear(year) {
    if (views.id === "amount") writeYear(year, spendYears);
    if (mode === "amount") paintReadout(year);
    if (peers.share && peers.share.getYear() !== year) peers.share.setYear(year);
  },
  onHidden(ids) {
    if (views.id !== "amount") return;
    writeOff(ids);
    peers.share?.setHidden(ids);
  },
});

peers.share = mountChart(document.querySelector("#share")!, {
  series: shareCharts,
  yearStart: data.yearStart,
  yearEnd: data.yearEnd,
  breaks: data.breaks,
  mode: "stack",
  unit: "point",
  year: initialYear,
  hidden,
  annotations: [
    { year: 2000, label: "世帯の範囲" },
    { year: 2018, label: "調査方法" },
  ],
  onYear(year) {
    if (views.id === "amount") writeYear(year, spendYears);
    if (mode === "share") paintReadout(year);
    if (peers.stack && peers.stack.getYear() !== year) peers.stack.setYear(year);
  },
  onHidden(ids) {
    if (views.id !== "amount") return;
    writeOff(ids);
    peers.stack?.setHidden(ids);
  },
});

const lines = mountChart(document.querySelector("#lines")!, {
  series: charts,
  yearStart: data.yearStart,
  yearEnd: data.yearEnd,
  breaks: data.breaks,
  mode: "line",
  year: initialYear,
  hidden,
  onYear(year) {
    if (views.id === "item") writeYear(year, spendYears);
  },
  onHidden(ids) {
    if (views.id === "item") writeOff(ids);
  },
});

views.onChange(() => {
  showView(views.id);
  const year = readYear(spendYears);
  const off = parseOff(seriesIds);
  const next = off ?? [];
  if (off === null) writeOff([]);
  peers.stack?.setYear(year);
  peers.share?.setYear(year);
  lines.setYear(year);
  peers.stack?.setHidden(next);
  peers.share?.setHidden(next);
  lines.setHidden(next);
});

const overlap = data.overlap2000;
const notes = [
  "金額は名目。物価では割っていない。家計調査が公表する、1世帯あたり年間の支出金額（円）である。",
  `1963–1999年は二人以上の非農林漁家世帯（長期統計系列20-3-a）。2000年以降は二人以上の世帯で、農林漁家を含む。2000年の新聞は、非農林漁家世帯が${formatYen(overlap.nonfarm.newspaper)}、二人以上の世帯が${formatYen(overlap.twoplus.newspaper)}。帯と線はここで切ってある。`,
  "雑誌の1963–1972年は「雑誌」と「週刊誌」の合計。1973–1994年は、その合計が「雑誌・週刊誌」と円単位で一致する。1995年以降は合計の品目だけが残る。2015年改定の名称は「雑誌（週刊誌を含む）」、2020年改定以降は「雑誌」。符号は851のまま。",
  "放送受信料は1999年まで内訳がない。2000年からNHK（88A）と他の受信料（880）。2000年と2001年の他の受信料はケーブルを含む。NHKと他の受信料の和は、公表の放送受信料と一致する。2002年からケーブル（88B）が分かれ、他の受信料は残る部分だけになる。後の名称は「ケーブルテレビ放送受信料」「他の放送受信料」。",
  "2011–2014年は年報第4-1表、全国・二人以上の世帯の年間支出金額。2011年（平成23年）平均は、調査員の不正事務に伴い2012年8月10日に更新されたe-Statの現行ファイル。",
  "2015–2019年、2020–2024年、2025年はe-Statの品目分類（全品目）の年次ファイル。改定の境でも金額は前年とつながるので、線は切らない。",
  "2018年1月から調査方法が変わった。変動調整値は品目の新聞そのものではないので、公表された支出金額のまま置いた。",
  "2025年1月の収支項目分類改定でも、新聞は符号850の一項目のままである。全国紙と地方紙には分けない。2025年の分類では、電子新聞・デジタル新聞は新聞に含まない。",
  "正誤情報の一覧に、この品目の全国・二人以上・年間支出を直した記載は見当たらなかった。2011年は更新後の現行ファイルを使った。",
];
const list = document.querySelector("#notes");
if (list) {
  for (const text of notes) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
}

const source = document.querySelector("#source");
if (source) {
  source.innerHTML = `
    <div>出典　総務省統計局「家計調査」</div>
    <ul>
      <li><a href="https://www.stat.go.jp/data/kakei/longtime/zuhyou/20-03-a.xls">長期統計系列 20-3-a（1963–1999年、二人以上の非農林漁家世帯）</a></li>
      <li><a href="https://www.stat.go.jp/data/kakei/longtime/zuhyou/20-03-b.xls">長期統計系列 20-3-b（2000–2010年、二人以上の世帯）</a></li>
      <li><a href="https://www.stat.go.jp/data/kakei/npsf.html">家計調査年報（2011–2014年は第4-1表、全国・二人以上の世帯）</a></li>
      <li><a href="https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00200561&tstat=000000330001&cycle=0&tclass1=000001228280&tclass2val=0">e-Stat 長期時系列・品目分類（2015年以降の全品目、年）</a></li>
      <li><a href="https://www.stat.go.jp/data/kakei/2025np/pdf/fr8.pdf">2025年収支項目分類</a>　<a href="https://www.stat.go.jp/data/kakei/change2025.html">2025年改定の案内</a></li>
      <li><a href="https://www.stat.go.jp/info/today/140.html">2018年の調査方法変更と変動調整値</a>　<a href="https://www.stat.go.jp/data/seigo/kakei/index.htm">正誤情報</a></li>
    </ul>
  `;
}

const columns = [
  ["newspaper", "新聞"],
  ["magazine", "雑誌"],
  ["books", "書籍"],
  ["broadcast", "放送受信料"],
  ["nhk", "NHK"],
  ["other-incl", "他（ケーブル含む）"],
  ["cable", "ケーブル"],
  ["other", "他の受信料"],
] as const;

const table = document.querySelector("#table");
if (table) {
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  hr.append(Object.assign(document.createElement("th"), { textContent: "年" }));
  for (const [, label] of columns) {
    hr.append(Object.assign(document.createElement("th"), { textContent: label }));
  }
  head.append(hr);
  const body = document.createElement("tbody");
  for (let year = data.yearStart; year <= data.yearEnd; year++) {
    const tr = document.createElement("tr");
    tr.append(Object.assign(document.createElement("td"), { textContent: String(year) }));
    for (const [id] of columns) {
      const td = document.createElement("td");
      const point = pointAt(id, year);
      if (!point) {
        td.textContent = "";
        td.className = "gap";
      } else {
        td.textContent = point.value.toLocaleString("ja-JP");
      }
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(head, body);
}

void peers;
void lines;
