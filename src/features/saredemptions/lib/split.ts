/**
 * Each delivery's share of what the bank debited, split by tabung to the
 * rupiah -- the same rule the backend applies (saredemption.splitByQuantity),
 * shown before saving so the user sees the amounts that will be booked.
 * Leftover rupiah go one each to the lines with the largest fractions,
 * earlier lines first on a tie, so the shares add back exactly.
 */
export function splitByQuantity(total: number, quantities: number[]): number[] {
  const totalQty = quantities.reduce((s, q) => s + q, 0);
  if (totalQty <= 0 || total <= 0) return quantities.map(() => 0);
  // Work in sen so a total with cents survives float arithmetic.
  const totalSen = Math.round(total * 100);
  const exactSen = quantities.map((q) => (totalSen * q) / totalQty);
  const wholeRupiah = exactSen.map((e) => Math.floor(e / 100) * 100);
  let left = totalSen - wholeRupiah.reduce((s, w) => s + w, 0);
  const order = exactSen
    .map((e, i) => ({ i, frac: e - wholeRupiah[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const shares = [...wholeRupiah];
  for (let k = 0; left >= 100; k = (k + 1) % order.length) {
    shares[order[k].i] += 100;
    left -= 100;
  }
  if (left > 0) shares[order[0].i] += left;
  return shares.map((s) => s / 100);
}
