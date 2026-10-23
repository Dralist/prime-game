// 得点: 攻撃ごとに積み立て、ターンが進む・全消し・負けのときに精算して得点へ足す
import { stockFor, resetStock, breakMultiplier, payout, isEmpty, MAX_BREAK_MULTIPLIER } from "./game.js?v=203224e0";

export class Tally {
  constructor(cols) {
    this.cols = cols; // ブレイク倍率の分母
    this.score = 0;
    this.stock = 0; // 精算までの積み立て（小数のまま）
    this.breaks = 0; // 精算までのブレイク数
    this.factor = 1; // 精算に掛ける効果の倍率（積み立てたときの効果で決める。extra.js の scoreFactor）
    this.prev = { stock: 0, breaks: 0 }; // 直前の攻撃の前の積み立てとブレイク数（formula 用）
    this.expr = false; // true の間は保留を式で見せる（攻撃〜落下開始。main.js が戻す）
    this.cleared = null; // 落下のあと全消しになる盤面（main.js が落下開始で入れる）。あれば保留の倍率は ×5 / ×3
  }

  add({ stock, breaks }) {
    this.stock += stock;
    this.breaks += breaks;
    return Math.floor(stock);
  }

  // 攻撃前 before → 攻撃後 after の盤面の変化を積み立てる。factor はこのターンの効果の倍率。返り値は今回の積み立て（表示用に切り捨て）
  attack(before, after, factor = 1) {
    this.factor = factor;
    this.prev = { stock: this.stock, breaks: this.breaks };
    this.expr = true;
    return this.add(stockFor(before, after));
  }

  // 精算: floor(積み立て × ブレイク倍率 × レベル倍率 × 効果の倍率) を得点へ。cleared（全消しの盤面）なら倍率は 5 / 3 に固定
  cashIn(level, cleared = null) {
    const gained = payout(this.stock * this.factor, breakMultiplier(this.breaks, this.cols, cleared), level);
    this.score += gained;
    this.stock = 0;
    this.breaks = 0;
    this.expr = false;
    this.cleared = null;
    return gained;
  }

  // 全消し: One line ではじける残りもブレイクとして積み立て、倍率を固定して精算。返り値は精算した点
  reset(board, level) {
    this.add(resetStock(board));
    return this.cashIn(level, board);
  }

  // 精算前の保留: 「+260 ×1.8」、効果の倍率があれば「+260 ×1.8 ×2」（なければ空）。全消しになるなら「+300 ×5」
  label() {
    if (!this.stock) return "";
    return `+${Math.floor(this.stock)} ×${+breakMultiplier(this.breaks, this.cols, this.cleared).toFixed(2)}${this.factor !== 1 ? ` ×${this.factor}` : ""}`;
  }

  // 直前の攻撃の式「+(a+b)×(c+0.2×d)」。a=攻撃前の積み立て b=今回 c=攻撃前のブレイク倍率 d=今回のブレイク数（0.2 = 1÷列数）。
  // a+b は label と同じ値（b = 切り捨てた合計 − 切り捨てた a）。a=0 なら「+b×…」、d=0 なら「×c」、効果の倍率があれば末尾に「 ×2」
  formula() {
    if (!this.stock) return "";
    const a = Math.floor(this.prev.stock);
    const b = Math.floor(this.stock) - a;
    const c = +breakMultiplier(this.prev.breaks, this.cols).toFixed(2);
    const d = this.breaks - this.prev.breaks;
    const mul = d ? `(${c}+${+(1 / this.cols).toFixed(2)}×${d})` : `${c}`;
    return `+${a ? `(${a}+${b})` : b}×${mul}${this.factor !== 1 ? ` ×${this.factor}` : ""}`;
  }

  // 保留の色の段階（計算後の倍率で決める。式の間も同じ）: No line Reset になる → "noline"、倍率 ≥ 3（One line を含む）→ "max"、他 → "base"
  tone() {
    if (this.cleared && isEmpty(this.cleared)) return "noline";
    return breakMultiplier(this.breaks, this.cols, this.cleared) >= MAX_BREAK_MULTIPLIER ? "max" : "base";
  }

  // ステータス行の保留: 攻撃〜落下開始は式、それ以外は計算後
  display() {
    return this.expr ? this.formula() : this.label();
  }
}
