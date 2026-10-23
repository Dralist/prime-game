// ゲームのルール v2（画面に依存しない純粋な関数だけを置く）
// 盤面は board[col] = [下, …, 上]。攻撃できるのは各列の先頭（下段）だけ。

export const MAX_ROWS = 6; // いちばん高い盤面の段数（画面の高さはこれに合わせる）
export const DROP_LEVEL_STEP = 3; // 1ターンに落ちる最大数 = 1 + ⌈レベル / これ⌉（上限は列数）
export const SCORE_PER_HALVING = 10; // 積み立て: マスごとに log₂(割る前 ÷ 割った後) × これ
export const SCORE_PER_BREAK = 50; // 積み立て: ブレイク（数字が消える）1個あたり
export const MAX_BREAK_MULTIPLIER = 3; // ブレイク倍率の上限
export const NO_LINE_MULTIPLIER = 5; // No line Reset のターンのブレイク倍率
export const ONE_LINE_MULTIPLIER = 3; // One line Reset のターンのブレイク倍率
export const LEVEL_RATE = 0.05; // レベル倍率 = 1 + これ × レベル
export const LEVEL_EVERY = 9; // 何ターンごとにレベルが上がるか
export const MAX_LEVEL = 5; // レベルの上限（敵の素因数の個数・落下の最大数もここで止まる）
export const MAX_FACTORS_CAP = 5; // 1つの数字の素因数の個数の上限
export const BIG_PRIME_RATE = 0.1; // 敵の数字に大きい素数を1個混ぜる確率
export const EXTRA_START_LEVEL = 5; // エクストラの開始レベル
export const EXTRA_MID_LEVEL = 7; // エクストラが EXTRA_RAMP_TURNS ターンで上がりきる途中のレベル（素因数の個数はここで上限）
export const EXTRA_RAMP_TURNS = 100; // エクストラが EXTRA_START_LEVEL から EXTRA_MID_LEVEL まで小数で上がるターン数
export const EXTRA_MAX_LEVEL = 10; // エクストラのレベルの上限（落下の最大数が列数に届く）
export const EXTRA_RAMP2_TURNS = 30; // そのあと EXTRA_MID_LEVEL から EXTRA_MAX_LEVEL まで小数で上がるターン数
export const OVER_TURN = 100; // このターンを超えたら Over turn（全難易度共通。ターン数を赤に、超えたときに1回知らせる）
export const BIG_PRIME_CAP_LEVEL = 7; // 大きい素数の 1ターンあたりの期待個数はこのレベルの値で頭打ち（落下が多いほど確率を下げる）

export const DIFFICULTIES = {
  easy: { label: "やさしい", digits: 2, primes: [2, 3, 5, 7], cols: 4, rows: 5 },
  normal: { label: "ふつう", digits: 3, primes: [2, 3, 5, 7, 11, 13], cols: 5, rows: 5 },
  hard: { label: "むずかしい", digits: 4, primes: [2, 3, 5, 7, 11, 13, 17, 19, 23], cols: 5, rows: 6 },
};
// エクストラ: 盤面・桁数・素数・得点はふつうと同じ。レベルが Lv 5 から上がり、大きい素数を割り取るとポイント
DIFFICULTIES.extra = { ...DIFFICULTIES.normal, label: "エクストラ", extra: true };

export function maxAttack(difficulty) {
  return 10 ** DIFFICULTIES[difficulty].digits - 1;
}

// サポートモードの素数キーボード: いまの値 × p が打てる桁数を超える素数（押せなくする）
export function blockedPrimes(value, difficulty) {
  const limit = maxAttack(difficulty);
  return DIFFICULTIES[difficulty].primes.filter((p) => value * p > limit);
}

// 素因数分解: Map<素数, 指数>
export function factorize(n) {
  const m = new Map();
  if (!Number.isInteger(n) || n < 2) return m;
  let x = n;
  for (let p = 2; p * p <= x; p++) {
    while (x % p === 0) {
      m.set(p, (m.get(p) ?? 0) + 1);
      x /= p;
    }
  }
  if (x > 1) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

export function isPrime(n) {
  const f = factorize(n);
  return f.size === 1 && f.values().next().value === 1;
}

// 素因数が1種類の数字（素数のべき: 2, 4, 8, 9, 25 …）
export function isPrimePower(n) {
  return factorize(n).size === 1;
}

function cloneBoard(board) {
  return board.map((col) => [...col]);
}

// 数字攻撃: 下段を左から右へ。空の列は飛ばす。弾（素因数）がすべてなくなったら終わり。
// 割れない数字でも止まらず、通り抜けた素因数の弾が1ずつ減る。
// hits = 当たった数字の数、defeated = 消えた数字の数、
// allHit = 下段が1つ以上あり、そのすべてに当たったか
// steps = エフェクト用。弾が届いたマスの { col, before, after, divisor, left }（通り抜けただけのマスは divisor 1）
export function numberAttack(board, n) {
  const next = cloneBoard(board);
  const bullets = factorize(n);
  const bottoms = next.filter((col) => col.length > 0).length;
  let hits = 0;
  let defeated = 0;
  let factors = 0;
  const steps = [];
  for (const [i, col] of next.entries()) {
    if (bullets.size === 0) break;
    if (col.length === 0) continue;
    const before = col[0];
    let value = before;
    const own = factorize(value);
    const short = [];
    for (const [p, e] of bullets) {
      const f = own.get(p) ?? 0;
      if (f > 0) value /= p ** Math.min(e, f);
      // f < e（割っただけ）と f = 0（通り抜け）の弾は1減る候補
      if (f < e) short.push([p, e]);
    }
    // この数字を消した（1 にした）ときは通り抜けも含めどの弾も減らない。0 になった弾はなくなる
    if (value !== 1) {
      for (const [p, e] of short) {
        if (e === 1) bullets.delete(p);
        else bullets.set(p, e - 1);
      }
    }
    // left = このマスを抜けたあとに残った攻撃の数（演出用）
    const left = [...bullets].reduce((a, [p, e]) => a * p ** e, 1);
    steps.push({ col: i, before, after: value, divisor: before / value, left });
    if (value === before) continue;
    hits++;
    factors += omega(before / value);
    if (value === 1) {
      col.shift();
      defeated++;
    } else {
      col[0] = value;
    }
  }
  return { board: next, hits, defeated, factors, allHit: bottoms > 0 && hits === bottoms, steps };
}

// Prime 攻撃: 下段の「素因数が1種類の数字」をすべて消す。removed = 消えた列の番号
// allHit = 下段が1つ以上あり、そのすべてが消えたか
export function primeAttack(board) {
  const next = cloneBoard(board);
  const removed = [];
  let bottoms = 0;
  let factors = 0;
  for (const [i, col] of next.entries()) {
    if (col.length === 0) continue;
    bottoms++;
    if (isPrimePower(col[0])) {
      factors += omega(col.shift());
      removed.push(i);
    }
  }
  const defeated = removed.length;
  // Prime は消えたマスだけが HIT（hits = defeated）
  return { board: next, hits: defeated, defeated, factors, allHit: bottoms > 0 && defeated === bottoms, removed };
}

// 素因数の個数（重複込み）: 12 = 2²×3 → 3
export function omega(n) {
  let r = 0;
  for (const e of factorize(n).values()) r += e;
  return r;
}

// 積み立て: 攻撃前 before → 攻撃後 after の盤面の変化だけで決める（変わるのは下段だけ）。
// マスごとに log₂(割る前 ÷ 割った後) × SCORE_PER_HALVING、ブレイクしたら + SCORE_PER_BREAK
export function stockFor(before, after) {
  let stock = 0;
  let breaks = 0;
  before.forEach((col, c) => {
    if (col.length === 0) return;
    const broke = after[c].length < col.length;
    stock += Math.log2(col[0] / (broke ? 1 : after[c][0])) * SCORE_PER_HALVING + (broke ? SCORE_PER_BREAK : 0);
    if (broke) breaks++;
  });
  return { stock, breaks };
}

// One line Reset ではじける残りもブレイクとして積み立てる（No line・2列以上は 0）
export function resetStock(board) {
  if (!isCleared(board)) return { stock: 0, breaks: 0 };
  const rest = board.find((col) => col.length > 0) ?? [];
  return { stock: rest.reduce((sum, n) => sum + Math.log2(n) * SCORE_PER_HALVING + SCORE_PER_BREAK, 0), breaks: rest.length };
}

// ブレイク倍率: min(1 + ブレイク数 ÷ 列数, MAX_BREAK_MULTIPLIER)（小数のまま）。
// board を渡して全消しなら No line は NO_LINE_MULTIPLIER、One line は ONE_LINE_MULTIPLIER に固定
export function breakMultiplier(breaks, cols, board = null) {
  if (board && isCleared(board)) return isEmpty(board) ? NO_LINE_MULTIPLIER : ONE_LINE_MULTIPLIER;
  return Math.min(1 + breaks / cols, MAX_BREAK_MULTIPLIER);
}

// 精算する点: floor(積み立て × ブレイク倍率 × レベル倍率)。レベル倍率 = 1 + LEVEL_RATE × レベル（エクストラは小数）
export function payout(stock, multiplier, level) {
  return Math.floor(stock * multiplier * (1 + LEVEL_RATE * level) + 1e-9);
}

// レベルの上限（エクストラは EXTRA_MAX_LEVEL、それ以外は MAX_LEVEL）
export function maxLevel(difficulty) {
  return DIFFICULTIES[difficulty]?.extra ? EXTRA_MAX_LEVEL : MAX_LEVEL;
}

// ターン数からレベルを出す（1 始まり、MAX_LEVEL で頭打ち）。
// エクストラは小数: EXTRA_START_LEVEL から EXTRA_RAMP_TURNS ターンで EXTRA_MID_LEVEL まで、
// そこから EXTRA_RAMP2_TURNS ターンで EXTRA_MAX_LEVEL まで直線で上がる
export function levelAt(turn, difficulty = "normal") {
  if (DIFFICULTIES[difficulty]?.extra) {
    if (turn <= EXTRA_RAMP_TURNS) return EXTRA_START_LEVEL + ((EXTRA_MID_LEVEL - EXTRA_START_LEVEL) * turn) / EXTRA_RAMP_TURNS;
    const t = turn - EXTRA_RAMP_TURNS;
    return Math.min(EXTRA_MID_LEVEL + ((EXTRA_MAX_LEVEL - EXTRA_MID_LEVEL) * t) / EXTRA_RAMP2_TURNS, EXTRA_MAX_LEVEL);
  }
  return Math.min(Math.floor(turn / LEVEL_EVERY) + 1, MAX_LEVEL);
}

// 小数のレベルを整数にする: 端数の確率で一つ上、残りは下。整数ならそのまま（乱数を使わない）
export function pickLevel(level, rng = Math.random) {
  if (Number.isInteger(level)) return level;
  const low = Math.floor(level);
  return rng() < level - low ? low + 1 : low;
}

// n が大きい素数（その難易度の素数にない素因数）を持つか
export function hasBigPrime(n, difficulty) {
  const { primes } = DIFFICULTIES[difficulty];
  return [...factorize(n).keys()].some((p) => !primes.includes(p));
}

// 大きい素数: その難易度の素数の最大より大きく、打てる数（maxAttack）以下の素数
const bigPrimeCache = {};
export function bigPrimes(difficulty) {
  if (!bigPrimeCache[difficulty]) {
    const { primes } = DIFFICULTIES[difficulty];
    const out = [];
    for (let n = primes.at(-1) + 1; n <= maxAttack(difficulty); n++) if (isPrime(n)) out.push(n);
    bigPrimeCache[difficulty] = out;
  }
  return bigPrimeCache[difficulty];
}

// 難易度の素数だけを掛け合わせて敵の数字を作る。レベルが上がると素因数が増える
// bigPrimeRate の確率で大きい素数を1個だけ混ぜる（残りは小さい素数。値は maxAttack 以下）
export function randomEnemy(level, difficulty, rng = Math.random) {
  level = pickLevel(level, rng);
  const { primes } = DIFFICULTIES[difficulty];
  const limit = maxAttack(difficulty);
  const maxFactors = Math.min(1 + Math.ceil(level / 2), MAX_FACTORS_CAP);
  const count = 1 + Math.floor(rng() * maxFactors);
  let value = 1;
  let start = 0;
  if (rng() < bigPrimeRate(level, difficulty)) {
    const big = bigPrimes(difficulty);
    value = big[Math.floor(rng() * big.length)];
    start = 1;
  }
  for (let i = start; i < count; i++) {
    const p = primes[Math.floor(rng() * primes.length)];
    if (value * p > limit) break;
    value *= p;
  }
  return value === 1 ? primes[0] : value;
}

// 各列の上に1個ずつ足す。満杯の列の分は捨てる
export function spawnRow(board, level, difficulty, rng = Math.random) {
  const { rows } = DIFFICULTIES[difficulty];
  return board.map((col) => {
    const c = [...col];
    const v = randomEnemy(level, difficulty, rng);
    if (c.length < rows) c.push(v);
    return c;
  });
}

// 敵の数字に大きい素数を混ぜる確率（整数のレベル）。BIG_PRIME_RATE × 落下の期待個数の比で、
// 1ターンに落ちる大きい素数の期待個数（落下の期待個数 × 確率）が BIG_PRIME_CAP_LEVEL の値を超えない
export function bigPrimeRate(level, difficulty) {
  const expected = (l) => (1 + maxDrops(l, difficulty)) / 2;
  return BIG_PRIME_RATE * Math.min(1, expected(BIG_PRIME_CAP_LEVEL) / expected(level));
}

// 1ターンに落ちる最大数（レベルで増える。上限は列数）
export function maxDrops(level, difficulty) {
  return Math.min(1 + Math.ceil(level / DROP_LEVEL_STEP), DIFFICULTIES[difficulty].cols);
}

// 次のターンに落ちる数字を抽選する。1〜maxDrops 個、列は重複なし。
// 個数は空きに関係なく決まる。列は空きのある列から先に選び、足りなければ満杯の列も選ぶ
export function planDrops(board, level, difficulty, rng = Math.random) {
  level = pickLevel(level, rng);
  const { rows } = DIFFICULTIES[difficulty];
  const open = [];
  const full = [];
  board.forEach((col, i) => (col.length < rows ? open : full).push(i));
  const count = 1 + Math.floor(rng() * maxDrops(level, difficulty));
  const drops = [];
  for (let k = 0; k < count; k++) {
    const pool = open.length > 0 ? open : full;
    const [col] = pool.splice(Math.floor(rng() * pool.length), 1);
    drops.push({ col, value: randomEnemy(level, difficulty, rng) });
  }
  return drops.sort((a, b) => a.col - b.col);
}

// 予告の数字が実際に落ちる場所。左の予告から順に、満杯の列なら一番近い空きのある列へ移す（同じ距離なら左）。
// どこにも空きがなければ落ちない（col: -1）。→ [{ col, row, value }]
export function landDrops(board, drops, difficulty) {
  const { rows } = DIFFICULTIES[difficulty];
  const heights = board.map((col) => col.length);
  return drops.map(({ col, value }) => {
    for (let d = 0; d < board.length; d++) {
      for (const c of [col - d, col + d]) {
        if (c >= 0 && c < board.length && heights[c] < rows) return { col: c, row: heights[c]++, value };
      }
    }
    return { col: -1, row: -1, value };
  });
}

// 予告の数字を盤面に足す（landDrops の場所へ）
export function applyDrops(board, drops, difficulty) {
  const next = cloneBoard(board);
  for (const { col, value } of landDrops(board, drops, difficulty)) if (col >= 0) next[col].push(value);
  return next;
}

// 開始盤面（2段分）。全消しの補充にも使う
export function initialBoard(difficulty, rng = Math.random, level = 1) {
  let board = Array.from({ length: DIFFICULTIES[difficulty].cols }, () => []);
  board = spawnRow(board, level, difficulty, rng);
  board = spawnRow(board, level, difficulty, rng);
  return board;
}

export function isEmpty(board) {
  return board.every((col) => col.length === 0);
}

// 数字のある列が1列以下。縦一列は1個ずつ全部命中で落下なしに消せるので、全消しとみなす
export function isCleared(board) {
  return board.filter((col) => col.length > 0).length <= 1;
}

export function isFull(board, difficulty) {
  const { cols, rows } = DIFFICULTIES[difficulty];
  return board.length === cols && board.every((col) => col.length >= rows);
}
