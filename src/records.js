// 自分の記録: 難易度ごとに得点の高い順で上位 RECORD_LIMIT 件。負け・クリアのときだけ足す
// 並べ替え・切り詰め（純粋）と localStorage の出し入れ・記録の画面を分ける
export const RECORD_KEY = "prime-game-records";
export const RECORD_LIMIT = 10;
export const CLEARED_KEY = "prime-game-cleared"; // クリアした難易度（記録は10件で切れるので別に覚える）
const NAMES = { easy: "やさしい", normal: "ふつう", hard: "むずかしい", extra: "エクストラ" };

// 1件 = { score, turn, date: "YYYY/MM/DD", support, clear }（clear: 100 ターンでクリア。古い記録にはなく false）。同点は先に出した方が上（後から来た方を下に）
// 返り値: 足したあとの一覧と順位（1 始まり。10位以内に入らなければ 0）
export function insertRecord(list, entry, limit = RECORD_LIMIT) {
  let i = list.findIndex((r) => r.score < entry.score);
  if (i < 0) i = list.length;
  const next = [...list.slice(0, i), entry, ...list.slice(i)].slice(0, limit);
  return { list: next, rank: i < limit ? i + 1 : 0 };
}

// 保存した JSON を { 難易度: [記録…] } に。壊れている・形が違うものは空として扱う
export function parseRecords(text) {
  let data;
  try { data = JSON.parse(text); } catch { return {}; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out = {};
  for (const [diff, list] of Object.entries(data)) {
    if (!Array.isArray(list)) continue;
    out[diff] = list.filter((r) => r && Number.isFinite(r.score) && Number.isFinite(r.turn) && typeof r.date === "string")
      .map((r) => ({ score: r.score, turn: r.turn, date: r.date, support: r.support === true, clear: r.clear === true }))
      .sort((a, b) => b.score - a.score) // 安定ソートなので同点の順は保つ
      .slice(0, RECORD_LIMIT);
  }
  return out;
}

// 保存した JSON をクリアした難易度の配列に（エクストラ・知らない名前・重複は捨てる）。壊れていたら空
export function parseCleared(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  return Array.isArray(data) ? [...new Set(data.filter((d) => d in NAMES && d !== "extra"))] : [];
}
// クリアした難易度を足した配列（エクストラ・すでにあるものは変えない）
export const addCleared = (list, diff) => (diff in NAMES && diff !== "extra" && !list.includes(diff) ? [...list, diff] : list);

function loadCleared() {
  try { return parseCleared(localStorage.getItem(CLEARED_KEY)); } catch { return []; }
}
// 難易度ボタン（タイトル・ニューゲーム）の名前の横に、クリアした難易度だけ「★」
export function showStars(cleared = loadCleared()) {
  for (const b of document.querySelectorAll("#difficulty button, #newgame button[data-diff]")) {
    b.querySelector(".clear-star")?.remove();
    if (!cleared.includes(b.dataset.diff)) continue;
    const s = document.createElement("span");
    s.className = "clear-star";
    s.textContent = "★";
    b.append(s);
  }
}

export const formatDate = (d) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

// 「ふつうの 3位！」（1位は「New Record!」）。入らなければ空
export const rankText = (diff, rank) => (rank === 1 ? "New Record!" : rank ? `${NAMES[diff]}の ${rank}位！` : "");

function load() {
  try { return parseRecords(localStorage.getItem(RECORD_KEY)); } catch { return {}; }
}

// 記録の表のターン欄（クリアは「Clear」）
export const turnText = (r) => (r.clear ? "Clear" : r.turn);

// 負け・クリアのときに呼ぶ（クリアは★も）。保存できなくても例外を出さない。返り値は順位（0 = 圏外）
export function addRecord(diff, { score, turn, support, clear }) {
  const all = load();
  const { list, rank } = insertRecord(all[diff] ?? [], { score, turn, date: formatDate(new Date()), support: !!support, clear: !!clear });
  all[diff] = list;
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(all)); } catch { /* 無視 */ }
  if (clear) { // クリアした難易度を覚え、すぐ★を出す
    const cleared = addCleared(loadCleared(), diff);
    try { localStorage.setItem(CLEARED_KEY, JSON.stringify(cleared)); } catch { /* 無視 */ }
    showStars(cleared);
  }
  return rank;
}

// 記録の画面（タイトルの「記録」で重ねる）。難易度タブ・表・戻る
export function initRecords(getDifficulty) {
  showStars();
  const el = document.getElementById("records");
  const tabs = [...el.querySelectorAll("[data-rec]")];
  const body = document.getElementById("records-body");
  function show(diff) {
    for (const t of tabs) t.setAttribute("aria-pressed", String(t.dataset.rec === diff));
    const list = load()[diff] ?? [];
    body.replaceChildren();
    // 件数によらず常に RECORD_LIMIT 行（記録のない順位は「—」）。タブを切り替えても高さが変わらない
    const table = document.createElement("table");
    table.className = "rec-table";
    table.innerHTML = "<tr><th>順位</th><th>得点</th><th>ターン</th><th>日付</th></tr>";
    for (let i = 0; i < RECORD_LIMIT; i++) {
      const r = list[i];
      const tr = table.insertRow();
      for (const v of r ? [i + 1, r.score, turnText(r), r.date] : [i + 1, "—", "—", "—"]) tr.insertCell().textContent = v;
      if (r?.support) {
        const s = document.createElement("small");
        s.className = "rec-support";
        s.title = "サポート ON";
        s.textContent = "S";
        tr.cells[1].append(s);
      }
    }
    body.append(table);
  }
  for (const t of tabs) t.addEventListener("click", () => show(t.dataset.rec));
  document.getElementById("title-records").addEventListener("click", () => {
    show(getDifficulty());
    el.hidden = false;
  });
  document.getElementById("records-back").addEventListener("click", () => { el.hidden = true; });
}
