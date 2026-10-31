// 1ゲームの集計（純粋）と、負け・クリアのあとの結果（タイトルの #overlay-text）の描画
import { rankText } from "./records.js?v=11338ed3";

// 攻撃で割り取った log₂(前÷後) のマスごとの合計（倍率なし。消えたマスは後 = 1。得点の積み立てと同じ見方）
export function attackLog2(before, after) {
  return before.reduce((sum, col, c) => {
    if (col.length === 0) return sum;
    return sum + Math.log2(col[0] / (after[c].length < col.length ? 1 : after[c][0]));
  }, 0);
}

// パフォーマンス: 2^(log₂ の合計 ÷ ターン数)（1ターンで割り取った数の幾何平均）。0ターンは null
export function performance(log2, turns) {
  return turns > 0 ? 2 ** (log2 / turns) : null;
}

export class Stats {
  constructor() {
    this.allHits = 0; // All HIT になった攻撃の数
    this.log2 = 0; // 攻撃で割り取った log₂ の合計（効果・全消しではじけた分は入れない）
    this.broken = 0; // 消えた数字（攻撃・全消しではじけた残り・効果ではじけたもの）
    this.factors = 0; // 攻撃で割り取った素因数の数（重複込み）
    this.oneLine = 0;
    this.noLine = 0;
    this.skills = {}; // 効果の名前 → 使った回数
  }
  // numberAttack / primeAttack の結果（before = 攻撃前の盤面）
  attack(r, before) {
    if (r.allHit) this.allHits++;
    this.log2 += attackLog2(before, r.board);
    this.broken += r.defeated;
    this.factors += r.factors;
  }
  // 全消し（補充の前の盤面）: 空なら No line、残りがあれば One line（残りははじける）
  reset(board) {
    const rest = board.reduce((n, col) => n + col.length, 0);
    this.broken += rest;
    if (rest === 0) this.noLine++;
    else this.oneLine++;
  }
  // 効果を使った（popped = はじけたマスの数）
  skill(name, popped = 0) {
    this.skills[name] = (this.skills[name] ?? 0) + 1;
    this.broken += popped;
  }
  // 表の行 [見出し, 値]。turns = 結果に出すターン（クリアは 100）
  rows(turns) {
    const p = performance(this.log2, turns);
    return [
      ["All HIT", this.allHits],
      ["パフォーマンス", p === null ? "—" : Math.round(p)],
      ["破壊ブロック", this.broken],
      ["消した素因数", this.factors],
      ["One line Reset", this.oneLine],
      ["No line Reset", this.noLine],
    ];
  }
  // 「使った効果」の中身（使っていなければ「なし」）
  skillLines() {
    const list = Object.entries(this.skills);
    return list.length ? list.map(([name, n]) => `${name} ×${n}`) : ["なし"];
  }
}

const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

// 「盤面が埋まった！」（クリアは「クリア！」）→ 大きく得点・ターン → 順位 → 記録ボタン → 表 → （エクストラだけ）使った効果。
// 結果の間は overlay に .result（h1・ルールを隠す。CSS）。records = タイトルの「記録」ボタン（endResult で元の行へ戻す）
export function showResult(el, { score, turn, rank, difficulty, stats, extra, clear, records }) {
  el.closest(".overlay").classList.add("result");
  const big = node("div", "result-score");
  big.append(node("span", "", `${score}`), node("small", "", "pt"), node("span", "", `${turn}`), node("small", "", "ターン"));
  el.replaceChildren(node("div", clear ? "result-head result-clear" : "result-head", clear ? "クリア！" : "盤面が埋まった！"), big);
  const text = rankText(difficulty, rank);
  if (text) el.append(node("div", rank === 1 ? "result-rank new-record" : "result-rank", text));
  el.append(records);
  const table = node("table", "result-table");
  for (const [label, value] of stats.rows(turn)) {
    const tr = table.insertRow();
    tr.insertCell().textContent = label;
    tr.insertCell().textContent = value;
  }
  el.append(table);
  if (!extra) return;
  const details = node("details", "result-skills");
  details.append(node("summary", "", "使った効果"));
  const ul = node("ul");
  for (const line of stats.skillLines()) ul.append(node("li", "", line));
  details.append(ul);
  el.append(details);
}

// ふつうのタイトルへ戻す: .result を外し、記録ボタンを元の行（ルールの右）へ
export function endResult(overlay) {
  overlay.classList.remove("result");
  overlay.querySelector(".title-row").append(overlay.querySelector("#title-records"));
}
