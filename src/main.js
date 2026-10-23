// 画面とゲームのルール（game.js）をつなぐ。ターン制（時間では進まない）
import {
  DIFFICULTIES, maxLevel, maxAttack, numberAttack, primeAttack,
  OVER_TURN, levelAt, initialBoard, planDrops, isFull, isCleared, isEmpty, blockedPrimes,
} from "./game.js?v=203224e0";
import { marksFor, setMarkDifficulty } from "./marks.js?v=203224e0";
import {
  SETTLE_PAUSE_MS, EFFECT_MS, FALL_MS, wait, formatFactors, drawBoard, drawPreview, primeKeyButtons, numberFx, primeFx,
  arriveNumber, arrivePrime, setLabel, setStock, fitStatus, showHits, showReset, showOverTurn, shoot, sweep,
} from "./effects.js?v=203224e0";
import { EXTRA_SKILLS, pointCols, resetCells, resetPoints, renderSkills, castSkill, nextTurn, renderActive, scoreFactor } from "./extra.js?v=203224e0";
import { Tally } from "./score.js?v=203224e0";

const STORAGE_KEY = "prime-game-difficulty";
const SUPPORT_KEY = "prime-game-support"; // サポートモード（素因数マーク）の ON/OFF

let difficulty = "normal";
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved in DIFFICULTIES) difficulty = saved;
} catch { /* 保存できなくても「ふつう」で動く */ }

const $ = (id) => document.getElementById(id);
const boardEl = $("board");
const previewEl = $("preview");
const inputEl = $("input");
const messageEl = $("message");
const hitTextEl = $("hit-text");
const comboTextEl = $("combo-text");
const levelEl = $("level");
const turnEl = $("turn");
const scoreEl = $("score"), stockEl = $("stock"), statusEl = document.querySelector(".status");
const pointsEl = $("points"), pointsBtn = $("points-btn"), activeEl = $("active");
const overlay = $("overlay");
const overlayText = $("overlay-text");
const startBtn = $("start");
const diffButtons = [...document.querySelectorAll("#difficulty button")];
// 開始画面と設定メニューのニューゲームの難易度ボタン（どちらもいまの難易度を強調）
const allDiffButtons = [...document.querySelectorAll("#difficulty button, #newgame button[data-diff]")];

function showDifficulty() {
  for (const b of allDiffButtons) b.setAttribute("aria-pressed", String(b.dataset.diff === difficulty));
}
function setDifficulty(d) {
  if (!(d in DIFFICULTIES)) return;
  difficulty = d;
  try { localStorage.setItem(STORAGE_KEY, difficulty); } catch { /* 無視 */ }
  showDifficulty();
  buildPrimeKeys();
}
for (const b of diffButtons) b.addEventListener("click", () => setDifficulty(b.dataset.diff));
showDifficulty();

// サポートモード: マークは常に描画しておき、盤面の .support で見せる（演出中に切り替えても描き直さない）
let support = false;
try { support = localStorage.getItem(SUPPORT_KEY) === "1"; } catch { /* 保存できなくても OFF で動く */ }
const supportBtn = $("support");
const keypadEl = $("keypad");
let primeKeys = []; // サポートモードの素数ボタン（その難易度で出てくる素数）
let picked = []; // サポートモードで入力値に掛けた数（⌫ で最後の1つを戻す）
let typed = ""; // サポートモードの数字キーボードで打ち中の数（× で picked に掛ける）
let numPad = false; // サポートモード中に数字キーボードへ切り替えているか
const marksEl = $("marks-preview");
const switchBtn = $("kbswitch");

// 素数ボタンを ⌫ の前に並べる（テンキーは .support-mode で隠す）
function buildPrimeKeys() {
  for (const b of primeKeys) b.remove();
  primeKeys = primeKeyButtons(DIFFICULTIES[difficulty].primes);
  $("back").before(...primeKeys);
}

function showSupport() {
  boardEl.classList.toggle("support", support);
  keypadEl.classList.toggle("support-mode", support);
  keypadEl.classList.toggle("num-mode", support && numPad);
  switchBtn.textContent = numPad ? "素数" : "数字";
  switchBtn.classList.toggle("off", !support); // OFF でも場所は残して見えなくする
  supportBtn.textContent = `サポート: ${support ? "ON" : "OFF"}`;
}
// 切り替えたら素因数の記録は捨てる。ON にするときは入力も空にする（掛け算でしか作れない値にそろえる）
function toggleSupport() {
  support = !support;
  try { localStorage.setItem(SUPPORT_KEY, support ? "1" : "0"); } catch { /* 無視 */ }
  picked = [];
  typed = "";
  numPad = false;
  if (support) input = "";
  showSupport();
  showInput();
}

// 盤面の大きさは難易度ごと（やさしい 4×5 など）
const size = () => DIFFICULTIES[difficulty];
const emptyBoard = () => Array.from({ length: size().cols }, () => []);
let board = emptyBoard();
let drops = []; // 次のターンに落ちてくる数字 [{ col, value }]
let input = "";
let factors = ""; // 攻撃中に入力欄へ出す素因数分解（入力が空のときだけ見せる）
let tally = new Tally(5); // 得点・精算までの積み立てとブレイク数（score.js）
let points = 0; // エクストラのポイント（大きい素数を割り取ると +1。効果に使う）
let active = {}; // 数ターン続く効果の残り { id: ターン数 }（extra.js の nextTurn で減る）
let turn = 0;
let combo = 0; // All HIT が続いた回数（表示だけ。All HIT でない攻撃で 0 に戻る）
let playing = false;
let busy = false; // 演出中
let game = 0; // 開始するたびに増やす。古い演出の続きを止める
// 演出中の攻撃の残り（タイトルへ戻るとき finishNow で演出なしに最後まで進める）
// step: 0 = 盤面は攻撃前 / 1 = 攻撃後の盤面にした / 2 = 予告も落とした / 3 = 全消しの点を足した / 4 = 補充した
let pending = null;

// サポートモードで2つ以上掛けたら素因数分解（12 = 2²×3）で出す。超える素数ボタンは押せなくする
function showInput() {
  const showFactors = !input && factors !== "";
  const pending = support && typed !== "" && picked.length > 0; // 数字キーボードで打ち中: 「3×4」
  const product = support && !pending && picked.length > 1;
  const base = picked.reduce((a, b) => a * b, 1);
  inputEl.textContent = (pending ? `${base}×${typed}` : product ? formatFactors(Number(input)) : input) || factors || " ";
  marksEl.textContent = support && input ? marksFor(Number(input)).join("") : "";
  inputEl.classList.toggle("factors", showFactors);
  inputEl.classList.toggle("product", product);
  const blocked = blockedPrimes(Number(input) || 1, difficulty);
  for (const b of primeKeys) b.disabled = blocked.includes(Number(b.dataset.key.slice(1)));
}

function render(fx = {}) {
  const { cols: COLS, rows: ROWS } = size();
  document.documentElement.style.setProperty("--cols", COLS);
  document.documentElement.style.setProperty("--rows", ROWS);
  drawBoard(boardEl, board, COLS, ROWS, fx);
  drawPreview(previewEl, drops, COLS);

  showInput();
  scoreEl.textContent = tally.score;
  setStock(stockEl, tally.display(), tally.tone()); // 攻撃〜落下開始は式、落下からは計算後。色は倍率の段階
  turnEl.textContent = turn;
  turnEl.classList.toggle("over", turn > OVER_TURN); // Over turn は赤（つづきからでも）
  const level = levelAt(turn, difficulty); // エクストラは小数なので整数部分を出す
  levelEl.textContent = level >= maxLevel(difficulty) ? `${Math.floor(level)} MAX` : Math.floor(level);
  pointsBtn.hidden = !size().extra;
  pointsEl.textContent = points;
  renderActive(activeEl, active);
  fitStatus(statusEl, stockEl);
}

function start() {
  game++;
  combo = 0;
  setLabel(hitTextEl, "");
  setLabel(comboTextEl, "");
  setMarkDifficulty(difficulty);
  board = initialBoard(difficulty);
  drops = planDrops(board, levelAt(0, difficulty), difficulty);
  input = "";
  picked = [];
  typed = "";
  factors = "";
  tally = new Tally(size().cols);
  points = 0;
  active = {};
  turn = 0;
  playing = true;
  busy = false;
  pending = null;
  overlay.hidden = true;
  messageEl.textContent = "下段を左から割っていこう";
  render({ fall: (c, r) => size().rows - r });
}

function gameOver() {
  playing = false;
  pending = null;
  showTitle();
  overlayText.textContent = `盤面が埋まった！ 得点 ${tally.score}・${turn} ターン到達`;
  startBtn.textContent = "もう一度";
  overlay.hidden = false;
}

// 攻撃のあとの盤面に進める。SETTLE_PAUSE_MS の間をおいてから順番に見せる:
//   1. 下段が消えた列は上の数字が1段落ちる（shift は消えた列か、マスごとの落ちる段数 (列, 段) → n）
//   2. ターンが進むなら、予告の数字が落ちてきて次の予告が出る（満杯なら負け）
//   3. 落下のあと（次の入力を待つ直前）に数字のある列が1列以下なら全消し
async function settle(next, shift, bump, advance, text, id) {
  await wait(SETTLE_PAUSE_MS);
  if (id !== game) return;
  const level = levelAt(turn, difficulty); // 精算のレベル倍率は進む前のターンのレベル
  const fall = typeof shift === "function" ? shift : (c) => (shift.includes(c) ? 1 : 0);
  board = next;
  pending.step = 1;
  tally.expr = false; // 落下が始まったら保留は計算後に。落下後が全消しなら倍率は ×5 / ×3
  const after = advance ? nextTurn(board, drops, active, turn + 1, difficulty, () => 0).board : board;
  tally.cleared = isCleared(after) ? after : null;
  messageEl.textContent = text;
  render({ bump, fall });
  if (typeof shift === "function" || shift.length > 0) await wait(FALL_MS);
  if (id !== game) return;

  if (advance) {
    turn++;
    // 満杯の列への予告は近くの空き列へ移って落ちる（落下止めの間は落ちない）
    const t = nextTurn(board, drops, active, turn, difficulty);
    const landed = new Set(t.landed.map(({ col, row }) => `${col},${row}`));
    ({ board, drops, active } = t);
    pending.step = 2;
    render({ fall: (c, r) => (landed.has(`${c},${r}`) ? size().rows - r : 0) });
    if (isFull(board, difficulty)) {
      tally.cashIn(level);
      gameOver();
      return;
    }
    await wait(FALL_MS);
    if (id !== game) return;
  }
  if (isCleared(board)) await resetBoard(id, level);
  else if (advance) { tally.cashIn(level); render(); }
  if (advance && turn === OVER_TURN + 1 && id === game) showOverTurn(hitTextEl); // 100 → 101 の1回だけ（Reset のあと）
}

// 全消し: 残りもブレイクとして積み立て、倍率を固定して精算（Reset 表示は精算した点）、Combo は 0 に。
// 残りをはじけさせて2段補充（予告はそのまま）
function resetScore(level) {
  const gained = tally.reset(board, level);
  if (size().extra) points += resetPoints(board, difficulty);
  combo = 0;
  messageEl.textContent = "2段補充・Combo は 0 から";
  showReset(hitTextEl, comboTextEl, isEmpty(board), gained);
}
async function resetBoard(id, level) {
  resetScore(level);
  pending.step = 3;
  const rest = board.findIndex((col) => col.length > 0);
  if (rest >= 0) {
    render({ popAll: new Set([rest]), ppAt: new Set(size().extra ? resetCells(board, difficulty) : []) });
    await wait(EFFECT_MS);
    if (id !== game) return;
  }
  board = initialBoard(difficulty, Math.random, levelAt(turn, difficulty));
  pending.step = 4;
  render({ fall: (c, r) => size().rows - r });
  await wait(FALL_MS);
}

// 入力欄の上の2行目: 次に関わることを短く（積み立ての値は出さない。保留はステータス行）
function resultText(r, none) {
  if (r.allHit) return "ターンはそのまま・点を積み立て中";
  return r.defeated ? `${r.defeated}個消した` : none;
}

async function fire() {
  if (!input) return;
  const n = Number(input);
  input = "";
  picked = [];
  typed = "";
  const r = numberAttack(board, n);
  combo = r.allHit ? combo + 1 : 0; // 全消しは settle の判定で 0 に戻す
  tally.attack(board, r.board, scoreFactor(active)); // 得点へは精算で足す
  const pp = size().extra ? pointCols(board, r, difficulty) : []; // 大きい素数を割り取ったマス（+1PP ずつ）
  points += pp.length;
  const { bump, ...fx } = numberFx(r.steps, pp); // bump は落下の描画で使う
  const text = r.hits === 0 ? `${n} では割れない` : resultText(r, `${r.hits}個を割った`);

  const id = game;
  busy = true;
  pending = { next: r.board, advance: !r.allHit, text, hits: r.hits, allHit: r.allHit, step: 0 };
  setLabel(hitTextEl, ""); // 前の攻撃の HIT は消す（Combo は結果が出るまで残す）
  factors = formatFactors(n);
  render(fx);
  shoot(boardEl, size().cols, size().rows, n, r.steps);
  const last = r.steps.at(-1);
  await wait((last ? arriveNumber(last.col) : 0) + EFFECT_MS);
  if (id !== game) return;
  factors = "";
  showHits(hitTextEl, comboTextEl, r.hits, r.allHit, combo); // 全消しなら settle で Reset に置き換える
  await settle(r.board, [...fx.pop], bump, !r.allHit, text, id);
  if (id === game) [busy, pending] = [false, null];
}

// 累乗消し: 下段の「素因数が1種類の数字」を消す。全部消えたらボーナスでターン消費なし
async function firePrime() {
  input = "";
  picked = [];
  typed = "";
  const r = primeAttack(board);
  combo = r.allHit ? combo + 1 : 0; // 全消しは settle の判定で 0 に戻す
  tally.attack(board, r.board, scoreFactor(active)); // 得点へは精算で足す
  const text = resultText(r, "下段に素因数が1種類の数字がない");
  const pp = size().extra ? pointCols(board, r, difficulty) : [];
  points += pp.length;
  const fx = primeFx(board, r.removed, size().cols, pp);
  const id = game;
  busy = true;
  pending = { next: r.board, advance: !r.allHit, text, hits: r.hits, allHit: r.allHit, step: 0 };
  setLabel(hitTextEl, ""); // 前の攻撃の HIT は消す（Combo は結果が出るまで残す）
  render(fx);
  sweep(boardEl, size().cols, size().rows);
  await wait(arrivePrime(size().cols - 1) + EFFECT_MS);
  if (id !== game) return;
  showHits(hitTextEl, comboTextEl, r.hits, r.allHit, combo); // 全消しなら settle で Reset に置き換える
  await settle(r.board, r.removed, new Set(), !r.allHit, text, id);
  if (id === game) [busy, pending] = [false, null];
}

// エクストラの効果: ポイントを引いて盤面・予告を変える（extra.js の castSkill）。ターンは進まず得点なし。全消しの判定はいつもどおり
async function useSkill(skill) {
  const r = !busy && playing && castSkill(skill, { board, drops, points, turn, difficulty, active });
  if (!r) return;
  ({ points, drops, active } = r);
  tally.factor = scoreFactor(active); // 得点2倍は使ったときの保留にも掛かる
  const id = game;
  busy = true;
  pending = { next: r.board, advance: false, text: `${skill.name}を使った −${skill.cost}PP`, hits: 0, allHit: false, step: 0 };
  setLabel(hitTextEl, "");
  render({ popAt: r.pop });
  if (r.pop.size > 0) await wait(EFFECT_MS);
  if (id !== game) return;
  await settle(r.board, r.fall ?? [], new Set(), false, pending.text, id);
  if (id === game) [busy, pending] = [false, null];
}

// 設定メニュー（⚙）: 開いているあいだは入力・攻撃を受け付けない。演出の続きは game の id で止める
const menuEl = $("menu");
const menuList = $("menu-list");
const rulesEl = $("rules");
const rulePages = [...rulesEl.querySelectorAll(".rule-page")];
let rulePage = 0;
// ルールはページ送り。最初のページで「前へ」、最後で「次へ」は押せない
function showRule(i) {
  rulePage = Math.max(0, Math.min(i, rulePages.length - 1));
  rulePages.forEach((page, j) => (page.hidden = j !== rulePage));
  $("rules-page").textContent = `${rulePage + 1}/${rulePages.length}`;
  rulesEl.querySelector('[data-menu="rules-prev"]').disabled = rulePage === 0;
  rulesEl.querySelector('[data-menu="rules-next"]').disabled = rulePage === rulePages.length - 1;
}
const supportConfirm = $("support-confirm");
const newgameEl = $("newgame");
const skillsEl = $("skills");
const introText = overlayText.innerHTML;
const menuOpen = () => !menuEl.hidden;
let menuFromTitle = false; // タイトルから開いた難易度選択・ルール（戻るでタイトルへ）
// panel: "list"（メニュー）/ "rules"（ルール）/ "newgame"（難易度選択）/ "support"（サポート切り替えの確認）
function showMenu(open, panel = "list") {
  if (!open || panel === "list") menuFromTitle = false;
  menuEl.hidden = !open;
  menuList.hidden = panel !== "list";
  rulesEl.hidden = panel !== "rules";
  newgameEl.hidden = panel !== "newgame";
  supportConfirm.hidden = panel !== "support";
  skillsEl.hidden = panel !== "skills";
  if (panel === "skills") renderSkills($("skills-list"), { board, points, difficulty, active }, busy);
  if (panel === "rules") showRule(0); // 開くたびに 1 ページ目から
  if (panel === "support") $("support-question").textContent = `サポートを ${support ? "OFF" : "ON"} にしますか？`;
}
// 演出中の攻撃を演出なしで最後まで進める（settle・resetBoard と同じ順。step より先だけ）
function finishNow() {
  const p = pending;
  tally.expr = false;
  pending = null;
  busy = false;
  factors = "";
  if (!p || p.step >= 4) return render();
  const level = levelAt(p.step >= 2 ? turn - 1 : turn, difficulty); // settle と同じ「進む前」のレベル
  if (p.step < 1) {
    board = p.next;
    messageEl.textContent = p.text;
    showHits(hitTextEl, comboTextEl, p.hits, p.allHit, combo);
  }
  if (p.step < 2 && p.advance) {
    turn++;
    ({ board, drops, active } = nextTurn(board, drops, active, turn, difficulty));
    if (isFull(board, difficulty)) {
      tally.cashIn(level);
      render();
      return gameOver();
    }
  }
  if (p.step < 3) {
    if (!isCleared(board)) { if (p.advance) tally.cashIn(level); return render(); }
    resetScore(level);
  }
  board = initialBoard(difficulty, Math.random, levelAt(turn, difficulty));
  render();
}

// タイトル画面: 続きがあれば「つづきから」「ニューゲーム」、なければ難易度＋スタート
const continueEl = $("continue");
const difficultyEl = $("difficulty");
function showTitle() {
  continueEl.hidden = !playing;
  difficultyEl.hidden = playing;
  startBtn.hidden = playing;
  overlay.hidden = false;
}
// タイトルへ: ゲームは捨てずに残す（演出中なら止めて結果の盤面にする）
function toTitle() {
  game++; // 演出の続きを止める
  finishNow();
  if (!playing) return; // 結果で負けたら gameOver がタイトルを出している
  overlayText.innerHTML = introText;
  showTitle();
}
const resume = () => { overlay.hidden = true; };
$("menu-btn").addEventListener("click", () => showMenu(true));
menuEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-menu]");
  const action = btn?.dataset.menu;
  if (!action) return;
  if (action === "rules" || action === "newgame" || action === "support") return showMenu(true, action);
  if (action === "back") return showMenu(!menuFromTitle);
  if (action === "rules-prev" || action === "rules-next") return showRule(rulePage + (action === "rules-next" ? 1 : -1));
  showMenu(false);
  if (action === "support-apply") toggleSupport();
  else if (action === "restart") {
    setDifficulty(btn.dataset.diff);
    start();
  }
  else if (action === "title") toTitle();
  else if (action === "skill") useSkill(EXTRA_SKILLS.find((s) => s.id === btn.dataset.skill));
});
pointsBtn.addEventListener("click", () => showMenu(true, "skills"));
$("resume").addEventListener("click", resume);
// タイトルのニューゲームは設定メニューと同じ難易度選択の画面を使う
$("title-newgame").addEventListener("click", () => {
  showMenu(true, "newgame");
  menuFromTitle = true;
});
$("title-rules").addEventListener("click", () => {
  showMenu(true, "rules");
  menuFromTitle = true;
});

function press(key) {
  if (menuOpen() || !overlay.hidden) return;
  if (!playing) return;
  if (key === "attack") return busy || fire();
  if (key === "prime") return busy || firePrime();
  if (support) {
    const base = picked.reduce((a, b) => a * b, 1);
    if (key === "switch") {
      // 切り替え前の値を引き継ぐ: 数字 → 素数では打ち中の数を掛けてから素数を掛けていく
      if (numPad && typed) picked.push(Number(typed));
      typed = "";
      numPad = !numPad;
      showSupport();
    } else if (numPad) {
      // 数字キーボード: 打った数を × でいまの値に掛ける。⌫ は打ち中の1文字、なければ最後に掛けた数を戻す
      if (key === "back") typed ? (typed = typed.slice(0, -1)) : picked.pop();
      else if (key === "times") {
        if (typed && (typed !== "1" || !picked.length)) picked.push(Number(typed));
        typed = "";
      } else if (/^[0-9]$/.test(key)) {
        if ((typed === "" && key === "0") || base * Number(typed + key) > maxAttack(difficulty)) return;
        typed += key;
      } else return;
    } else {
      // 素数キーボード: 押した素数を入力値に掛ける。⌫ は最後に掛けた数を1つ戻す
      if (key === "back") picked.pop();
      else if (key.startsWith("p")) {
        const p = Number(key.slice(1));
        if (blockedPrimes(base, difficulty).includes(p) || !DIFFICULTIES[difficulty].primes.includes(p)) return;
        picked.push(p);
      } else return;
    }
    const value = picked.reduce((a, b) => a * b, 1) * (Number(typed) || 1);
    input = picked.length || typed ? String(value) : "";
  } else if (key === "switch" || key === "times") return;
  else if (key === "back") input = input.slice(0, -1);
  else if (key.startsWith("p")) return;
  else if (Number(input + key) <= maxAttack(difficulty) && !(input === "" && key === "0")) input += key;
  showInput();
}

// click ではなく pointerdown で反応させ、連打の取りこぼしを減らす
function onKey(e) {
  const btn = e.target.closest("button[data-key]");
  if (!btn) return;
  e.preventDefault();
  press(btn.dataset.key);
}
$("keypad").addEventListener("pointerdown", onKey);
switchBtn.addEventListener("pointerdown", onKey);

// PC で試すとき用のキーボード操作
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") overlay.hidden && showMenu(!menuOpen());
  else if (menuOpen()) return;
  else if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === "Backspace") press("back");
  else if (e.key === "*" || e.key === "x") press("times");
  else if (e.key === "Enter") overlay.hidden ? press("attack") : playing ? resume() : start();
});

startBtn.addEventListener("click", start);
buildPrimeKeys();
showSupport();
render();
