// 演出（弾・光・バッジ・はじけ・揺れ・落下・HIT/Combo の見せ方）。ゲームの状態は持たない
import { factorize } from "./game.js?v=203224e0";
import { MARKS, marksFor } from "./marks.js?v=203224e0";

// 演出の時間。どれも動いている間は攻撃を受け付けない（数字の入力はできる）
export const STEP_MS = 340; // 弾が1列進む時間。空の列も同じ時間で通るので等速に見える
export const PRIME_STEP_MS = 220; // 累乗消しの光が1列進む時間。バッジの「2³」は光が過ぎても落下の描画まで残る
export const EFFECT_MS = 550; // 割り算・はじけるエフェクト（style.css の --fx と合わせる）
export const SETTLE_PAUSE_MS = 300; // 攻撃のエフェクトが終わってから落下を始めるまでの間（何が起きたか見せる）
export const FALL_MS = 420; // 落下の時間。落ちる段数に関係なく一定で、1回の落下で動くマスは同時に止まる
document.documentElement.style.setProperty("--fall-ms", `${FALL_MS}ms`); // style.css の .fall が使う

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const power = (p, e) => p + (e > 1 ? [...String(e)].map((d) => SUP[d]).join("") : "");

// 45 → "45 = 3²×5"
export function formatFactors(n) {
  const f = factorize(n);
  if (f.size === 0) return String(n);
  return `${n} = ${[...f].map(([p, e]) => power(p, e)).join("×")}`;
}

// 素数のべき → "2³"（累乗消しのバッジ）
export const formatPower = (n) => [...factorize(n)].map(([p, e]) => power(p, e)).join("×");

// fx（どれも省略可）:
//   badge: Map<列, 文字> … 下段に「÷n」などのバッジを浮かせる
//   badgeKind: バッジに足すクラス（"prime" なら紫）
//   pop: Set<列> … 下段がはじけて消える
//   popAll: Set<列> … その列の数字が全部はじけて消える（一列の全消し）
//   popAt: Set<"列,段"> … そのマスがはじけて消える（効果）
//   pp: Set<列> … 下段に「+1PP」を浮かせる（エクストラで大きい素数を割り取った。delay に合わせる）
//   ppAt: Set<"列,段"> … そのマスに「+1PP」を浮かせる（One line Reset ではじける大きい素数入り）
//   pass: Set<列> … 下段が揺れる（割れずに弾が通り抜けた）
//   bump: Set<列> … 下段の新しい数字をはずませる
//   fall: (列, 段) → 何段分上から落ちてくるか（0 なら動かない）
//   delay: Map<列, ms> … 下段のエフェクトを遅らせる（弾が届いた時に効かせる）
export function drawBoard(boardEl, board, COLS, ROWS, fx = {}) {
  const cells = [];
  const badges = [];
  const ppFloats = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) {
      const v = board[c][r];
      const div = document.createElement("div");
      div.className = "cell" + (r === 0 ? " bottom" : "") + (v === undefined ? " empty" : "");
      div.style.gridArea = `${ROWS - r} / ${c + 1}`;
      if (v !== undefined) {
        const num = document.createElement("span");
        num.className = "num";
        num.textContent = v;
        const marks = marksFor(v);
        const mk = document.createElement("span");
        mk.className = "marks" + (marks.length > 10 ? " tiny" : marks.length > 5 ? " small" : "");
        mk.textContent = marks.join("");
        mk.setAttribute("aria-hidden", "true");
        div.append(num, mk);
        const fall = fx.fall?.(c, r) ?? 0;
        if (fall > 0) {
          div.classList.add("fall");
          div.style.setProperty("--fall", fall);
        }
        if (fx.popAll?.has(c) || fx.popAt?.has(`${c},${r}`)) div.classList.add("pop");
        const ms = r === 0 ? fx.delay?.get(c) : 0;
        if ((r === 0 && fx.pp?.has(c)) || fx.ppAt?.has(`${c},${r}`)) {
          const pp = Object.assign(document.createElement("span"), { className: "pp-float", textContent: "+1PP" });
          if (ms) pp.style.animationDelay = `${ms}ms`;
          ppFloats.push([div, pp]);
        }
        if (r === 0) {
          if (ms) div.style.animationDelay = `${ms}ms`;
          if (fx.pop?.has(c)) div.classList.add("pop");
          if (fx.pass?.has(c)) div.classList.add("pass");
          if (fx.bump?.has(c)) div.classList.add("bump");
          const text = fx.badge?.get(c);
          if (text) {
            div.classList.add("hit");
            const badge = document.createElement("span");
            badge.className = "badge" + (fx.badgeKind ? ` ${fx.badgeKind}` : "");
            badge.textContent = text;
            if (ms) badge.style.animationDelay = `${ms}ms`;
            badges.push([div, badge]);
          }
        }
      }
      cells.push(div);
    }
  }
  // 点線の枠: 全マスの場所に動かないスロットを敷く（マスの後ろ）。落下・はじけの途中も枠が残る
  const slots = cells.map((div) => {
    const slot = document.createElement("div");
    slot.className = "frame";
    slot.style.gridArea = div.style.gridArea;
    slot.setAttribute("aria-hidden", "true");
    return slot;
  });
  boardEl.replaceChildren(...cells, ...slots);
  // バッジはマスの外に置く。マスがはじけて縮んでも、次の描画（攻撃の終わり）まで残る
  for (const [div, badge] of badges) {
    badge.style.left = `${div.offsetLeft + div.offsetWidth / 2}px`;
    badge.style.top = `${div.offsetTop}px`;
    boardEl.append(badge);
  }
  // 「+1PP」はマスの下側から浮かせる（「÷n」はマスの上に出るので重ならない）
  for (const [div, pp] of ppFloats) {
    pp.style.left = `${div.offsetLeft + div.offsetWidth / 2}px`;
    pp.style.top = `${div.offsetTop + div.offsetHeight}px`;
    boardEl.append(pp);
  }
}

// 数字攻撃の fx: 弾が届いたマスから、割れたら「÷n」（消えたらはじけ、残ればはずむ）、割れなければ揺れる
export const arriveNumber = (c) => (c + 1) * STEP_MS;
export function numberFx(steps, pp = []) {
  const badge = new Map();
  const pop = new Set();
  const pass = new Set();
  const bump = new Set();
  const delay = new Map(steps.map((s) => [s.col, arriveNumber(s.col)]));
  for (const s of steps) {
    if (s.divisor === 1) pass.add(s.col);
    else {
      badge.set(s.col, `÷${s.divisor}`);
      if (s.after === 1) pop.add(s.col);
      else bump.add(s.col);
    }
  }
  return { badge, pop, pass, delay, bump, pp: new Set(pp) };
}

// 累乗消しの fx: 光が届いたマスから、消える数字は「2³」を出してはじけ、残る数字は揺れる
export const arrivePrime = (c) => (c + 1) * PRIME_STEP_MS;
export function primeFx(board, removed, COLS, pp = []) {
  const pop = new Set(removed);
  const pass = new Set();
  const badge = new Map();
  const delay = new Map();
  for (let c = 0; c < COLS; c++) {
    const v = board[c][0];
    if (v === undefined) continue;
    delay.set(c, arrivePrime(c));
    if (pop.has(c)) badge.set(c, formatPower(v));
    else pass.add(c);
  }
  return { badge, badgeKind: "prime", pop, pass, delay, pp: new Set(pp) };
}

// 文字を入れ替えて出現アニメをやり直す（空文字なら消す）
export function setLabel(el, text) {
  el.textContent = text;
  el.classList.remove("show");
  if (text) {
    void el.offsetWidth;
    el.classList.add("show");
  }
}

// ステータス行の保留: 文字が変わったら拡大して戻す（空なら演出なし）
export function setStock(el, text, tone = "base") {
  el.classList.toggle("max", tone === "max");
  el.classList.toggle("noline", tone === "noline");
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("pulse");
  if (text) {
    void el.offsetWidth;
    el.classList.add("pulse");
  }
}

// ステータス行「Lv n Turn n 得点pt +保留」が1行に収まらなければ、先に保留（長い式）を、それでも足りなければ行の文字を小さくする（⚙ は変えない）
export function fitStatus(statusEl, stockEl) {
  const over = () => statusEl.scrollWidth > statusEl.clientWidth;
  statusEl.style.fontSize = stockEl.style.fontSize = "";
  for (let f = 0.7; over() && f > 0.59; f -= 0.05) stockEl.style.fontSize = `${f.toFixed(2)}em`;
  for (let f = 1.05; over() && f > 0.59; f -= 0.05) statusEl.style.fontSize = `${f.toFixed(2)}rem`;
}

// 攻撃のエフェクトが終わったら「3 HIT」「All HIT!」を出す。All HIT が続いたら「2 Combo」…
// 全消しは showReset を出す（倍率では All HIT として数える）。All HIT でない攻撃で Combo は 0 に戻り、表示も消える（combo は攻撃時に数え直してある）
export function showHits(hitEl, comboEl, hits, allHit, combo) {
  hitEl.classList.remove("reset", "noline", "over");
  setLabel(hitEl, allHit ? "All HIT!" : hits > 0 ? `${hits} HIT` : "");
  hitEl.classList.toggle("all", allHit);
  if (combo >= 2) setLabel(comboEl, `${combo} Combo`);
  else if (combo === 0) setLabel(comboEl, "");
}

// 全消し: HIT の場所に「One line Reset +1234pt」など（bonus = そのターンに精算した点）を大きく出し、Combo 表示を消す
export function showReset(hitEl, comboEl, empty, bonus) {
  setLabel(hitEl, `${empty ? "No" : "One"} line Reset +${bonus}pt`);
  hitEl.classList.remove("over");
  hitEl.classList.remove("all");
  hitEl.classList.add("reset");
  hitEl.classList.toggle("noline", empty);
  setLabel(comboEl, "");
}

// ターンが OVER_TURN を超えたとき HIT の場所に「Over turn」を1回出す（次の攻撃の HIT で消える）
export function showOverTurn(hitEl) {
  hitEl.classList.remove("all", "reset", "noline");
  hitEl.classList.add("over");
  setLabel(hitEl, "Over turn");
}

// 下段の位置（盤面の中の座標）。x(c) は列 c の中心で、盤面の外（c < 0, c >= COLS）にも延ばせる
function bottomRow(boardEl, COLS, ROWS) {
  const base = boardEl.getBoundingClientRect();
  const first = boardEl.children[(ROWS - 1) * COLS].getBoundingClientRect();
  const second = boardEl.children[(ROWS - 1) * COLS + 1].getBoundingClientRect();
  const x0 = first.left - base.left + first.width / 2;
  return {
    x: (c) => x0 + c * (second.left - first.left),
    y: first.top - base.top + first.height / 2,
    w: first.width,
    h: first.height,
  };
}
const at = (x, y) => `translate(${x}px, ${y}px) translate(-50%, -50%)`;

// 攻撃の数を弾にして、下段を左から等速で飛ばす（盤面の左外から入る）。
// 列 c には (c+1)*STEP_MS で届き、弾の数字がそこで残りの数（left）に変わる
export function shoot(boardEl, COLS, ROWS, n, steps) {
  if (steps.length === 0) return;
  const row = bottomRow(boardEl, COLS, ROWS);
  const last = steps.at(-1).col;
  const total = (last + 1) * STEP_MS + EFFECT_MS;
  const frames = [];
  for (let c = -1; c <= last; c++) {
    frames.push({ transform: at(row.x(c), row.y), offset: ((c + 1) * STEP_MS) / total });
  }
  frames.push({ ...frames.at(-1), offset: 1 }); // 薄くならずに最後のマスで止まり、次の描画で「÷n」と一緒に消える
  const bullet = document.createElement("div");
  bullet.className = "bullet";
  bullet.textContent = n;
  boardEl.append(bullet);
  bullet.animate(frames, { duration: total, fill: "forwards" });
  for (const s of steps) {
    setTimeout(() => { bullet.textContent = s.left > 1 ? s.left : ""; }, (s.col + 1) * STEP_MS);
  }
}

// 累乗消しの光: 下段を左外から右外まで等速で走る。列 c には (c+1)*PRIME_STEP_MS で届く
export function sweep(boardEl, COLS, ROWS) {
  const row = bottomRow(boardEl, COLS, ROWS);
  const beam = document.createElement("div");
  beam.className = "beam";
  beam.style.width = `${row.w}px`;
  beam.style.height = `${row.h + 12}px`;
  boardEl.append(beam);
  const frames = [];
  for (let c = -1; c <= COLS; c++) frames.push({ transform: at(row.x(c), row.y), opacity: c < COLS ? 1 : 0 });
  beam.animate(frames, { duration: (COLS + 1) * PRIME_STEP_MS, fill: "forwards" }).onfinish = () => beam.remove();
}

// 予告欄: 列ごとのマスに次に落ちてくる数字
export function drawPreview(previewEl, drops, COLS) {
  previewEl.replaceChildren(...Array.from({ length: COLS }, (_, c) => {
    const d = drops.find((x) => x.col === c);
    const div = document.createElement("div");
    div.className = "slot" + (d ? " next" : "");
    div.textContent = d ? d.value : "";
    return div;
  }));
}

// サポートモードの素数ボタン（数字＋マーク）
export function primeKeyButtons(primes) {
  return primes.map((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pkey";
    b.dataset.key = `p${p}`;
    b.setAttribute("aria-label", `${p} を掛ける`);
    const mark = document.createElement("span");
    mark.className = "pmark";
    mark.textContent = MARKS[p];
    b.append(String(p), mark);
    return b;
  });
}
