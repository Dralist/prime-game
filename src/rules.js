// ルールのページ送り（設定メニューとタイトルの「ルール」で同じ画面）。最初のページで「前へ」、最後で「次へ」は押せない
let page = 0;
export function showRule(i) {
  const el = document.getElementById("rules");
  const pages = [...el.querySelectorAll(".rule-page")];
  page = Math.max(0, Math.min(i, pages.length - 1));
  pages.forEach((p, j) => (p.hidden = j !== page));
  document.getElementById("rules-page").textContent = `${page + 1}/${pages.length}`;
  el.querySelector('[data-menu="rules-prev"]').disabled = page === 0;
  el.querySelector('[data-menu="rules-next"]').disabled = page === pages.length - 1;
}
export const turnRule = (d) => showRule(page + d); // d = 1（次へ）/ -1（前へ）
