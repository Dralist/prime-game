// サポートモードで素因数を表すマーク。色ではなく形で区別する（018・019 でも使う）
// 末尾の ︎ は iPhone で絵文字にならず文字として出すため
import { factorize, DIFFICULTIES } from "./game.js?v=203224e0";

export const MARKS = {
  2: "●",
  3: "▲",
  5: "■",
  7: "◆",
  11: "★",
  13: "✚",
  17: "♥︎",
  19: "♠︎",
  23: "♣︎",
};

// 大きい素数（その難易度の素数より大きい素数）はどれも同じマーク
export const BIG_MARK = "◎";

// いまの難易度（大きい素数の判定に使う）。main.js がゲーム開始時に設定する
let currentPrimes = DIFFICULTIES.hard.primes;
export function setMarkDifficulty(difficulty) {
  currentPrimes = DIFFICULTIES[difficulty].primes;
}

// n の素因数を小さい順に、指数の数だけマークにして並べる（例: 12 → ["●", "●", "▲"]）
export function marksFor(n, primes = currentPrimes) {
  const out = [];
  for (const [p, e] of factorize(n)) {
    const mark = primes.includes(p) ? MARKS[p] : BIG_MARK;
    for (let i = 0; i < e; i++) out.push(mark);
  }
  return out;
}
