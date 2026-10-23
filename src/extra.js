// エクストラモード: ポイント（大きい素数を割り取ると +1）と、ポイントで使う効果の表
import { applyDrops, bigPrimes, factorize, hasBigPrime, isCleared, isEmpty, landDrops, levelAt, planDrops } from "./game.js?v=203224e0";

// 攻撃で大きい素数を割り取った（消えた場合も）下段の列 = ポイントになるマス（1マス 1PP）
// r は numberAttack（steps）か primeAttack（removed）の結果。board は攻撃前の盤面
export function pointCols(board, r, difficulty) {
  const pairs = r.steps ?? r.removed.map((c) => ({ col: c, before: board[c][0], after: 1 }));
  return pairs.filter(({ before, after }) => hasBigPrime(before, difficulty) && !hasBigPrime(after, difficulty)).map((s) => s.col);
}
export const attackPoints = (board, r, difficulty) => pointCols(board, r, difficulty).length;

// One line Reset（1列だけ残り）で、残りの数字のうち大きい素数を含むマス "列,段"（下から1個ずつその数で攻撃して消した扱い）。それ以外は []
export function resetCells(board, difficulty) {
  if (isEmpty(board) || !isCleared(board)) return [];
  const c = board.findIndex((col) => col.length > 0);
  return board[c].flatMap((n, r) => (hasBigPrime(n, difficulty) ? [`${c},${r}`] : []));
}
export const resetPoints = (board, difficulty) => resetCells(board, difficulty).length;

// 効果の表（cost が高いほど強い想定）。apply(board, s, rng) は s = 使う前の状態 { board, drops, points, turn, difficulty, active } を受け、
// 変えるものだけ返す: board（変えた盤面）・removed（下段が消えた列）・gone（消えたマス [列, 段]。省略時は removed の下段）・drops（予告）。
// 返さないものは変えない。usable(s) があれば、それが偽のとき押せない。
// turns があれば数ターン続く効果: 使うと s.active[id] = turns（ターンが進むたびに nextTurn で1減る）。残りがある間は押せず、「mark 残り」を表示
export const EXTRA_SKILLS = [
  {
    id: "sweep",
    name: "下段一掃",
    cost: 3,
    desc: "下段の数字をすべて消す",
    apply(board) {
      const removed = [];
      const next = board.map((col, i) => {
        if (col.length === 0) return [];
        removed.push(i);
        return col.slice(1);
      });
      return { board: next, removed };
    },
  },
  {
    id: "reroll",
    name: "予告の引き直し",
    cost: 1,
    desc: "予告の列と数字を引き直す",
    apply(board, s, rng) {
      return { drops: planDrops(board, levelAt(s.turn, s.difficulty), s.difficulty, rng) };
    },
  },
  {
    id: "breakBig",
    name: "大きい素数崩し",
    cost: 1,
    desc: "盤面の大きい素数をすべて割り取る（PP なし）",
    usable: (s) => s.board.some((col) => col.some((n) => hasBigPrime(n, s.difficulty))),
    apply(board, s) {
      const big = bigPrimes(s.difficulty);
      const strip = (n) => [...factorize(n)].reduce((x, [p, e]) => (big.includes(p) ? x / p ** e : x), n);
      const gone = [];
      const next = board.map((col, c) => col.map(strip).filter((n, r) => n !== 1 || !gone.push([c, r])));
      return { board: next, gone };
    },
  },
  {
    id: "dropStop",
    name: "落下止め",
    cost: 2,
    turns: 2,
    mark: "止",
    desc: "2ターンの間、数字が落ちてこない",
    apply: () => ({}),
  },
  {
    id: "double",
    name: "得点2倍",
    cost: 2,
    turns: 3,
    mark: "×2",
    factor: 2,
    desc: "3ターンの間、入る点が2倍（いまの保留も）",
    apply: () => ({}),
  },
];

const left = (s, id) => s.active?.[id] ?? 0; // 数ターン続く効果の残りターン数
const canUse = (skill, s) => s.points >= skill.cost && left(s, skill.id) === 0 && (!skill.usable || skill.usable(s));

// ターンが1つ進んだときの盤面・予告・効果の残り（turn は進んだあと）。落下止めが残っていれば落とさず予告もそのまま。
// landed: 落ちたマス [{ col, row, value }]。効果の残りはすべて1減り、0 になったものは消える
export function nextTurn(board, drops, active, turn, difficulty, rng = Math.random) {
  const rest = Object.fromEntries(Object.entries(active).map(([id, n]) => [id, n - 1]).filter(([, n]) => n > 0));
  if (left({ active }, "dropStop") > 0) return { board, drops, active: rest, landed: [] };
  const landed = landDrops(board, drops, difficulty);
  const next = applyDrops(board, drops, difficulty);
  return { board: next, drops: planDrops(next, levelAt(turn, difficulty), difficulty, rng), active: rest, landed };
}

// 精算に掛ける倍率（残りのある効果の factor の積。得点2倍なら 2）
export const scoreFactor = (active) =>
  EXTRA_SKILLS.reduce((f, k) => (k.factor && left({ active }, k.id) > 0 ? f * k.factor : f), 1);

// ポイントのボタン「PP n」の右に出す、残りのある効果。効果ごとに [マーク, 「残n」]（例 [["止", "残2"], ["×2", "残3"]]）
export const activeLabel = (active) =>
  EXTRA_SKILLS.filter((k) => k.turns && left({ active }, k.id) > 0).map((k) => [k.mark, `残${active[k.id]}`]);

// activeLabel を効果ごとの小さな枠（チップ）にして el に入れる: [止 残2] [×2 残3]
export function renderActive(el, active) {
  const span = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text });
  el.replaceChildren(...activeLabel(active).map(([mark, rest]) => {
    const chip = span("span", "chip", "");
    chip.append(span("b", "chip-mark", mark), span("small", "chip-left", rest));
    return chip;
  }));
}

// 効果を使ったあとの状態（ポイントを引き、apply が返したものだけ置き換える）。使えないなら null。ターン・得点は変えない
// pop: はじけるマス "列,段"（使う前の段）。fall(列, 段): 使ったあとのマスが何段落ちるか（消えたマスがなければ null）
export function castSkill(skill, s, rng = Math.random) {
  if (!skill || !canUse(skill, s)) return null;
  const r = skill.apply(s.board, s, rng);
  const removed = r.removed ?? [];
  const gone = r.gone ?? removed.map((c) => [c, 0]);
  const pop = new Set(gone.map(([c, row]) => `${c},${row}`));
  // 残ったマスごとに、その下で消えたマスの数だけ落ちる
  const falls = s.board.map((col, c) => {
    let k = 0;
    return col.flatMap((_, row) => (pop.has(`${c},${row}`) ? (k++, []) : [k]));
  });
  const fall = gone.length > 0 ? (c, row) => falls[c][row] ?? 0 : null;
  const active = skill.turns ? { ...s.active, [skill.id]: skill.turns } : { ...s.active };
  return { ...s, points: s.points - skill.cost, board: r.board ?? s.board, drops: r.drops ?? s.drops, active, removed, pop, fall };
}

// 効果の一覧（設定メニューと同じ重ね方の #skills）。使えない効果（ポイント不足・残りあり など）と演出中は押せない。s = { board, points, difficulty, active }
export function renderSkills(listEl, s, busy) {
  listEl.replaceChildren(...EXTRA_SKILLS.map((k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.menu = "skill";
    b.dataset.skill = k.id;
    b.disabled = busy || !canUse(k, s);
    // 1行目: 名前と右に cost、2行目: 説明（小さめ・薄め）
    const part = (cls, text) => Object.assign(document.createElement("span"), { className: cls, textContent: text });
    b.append(part("skill-name", k.name), part("skill-cost", `${k.cost}PP`), part("skill-desc", k.desc));
    return b;
  }));
}
