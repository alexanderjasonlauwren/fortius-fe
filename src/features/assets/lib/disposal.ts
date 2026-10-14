/**
 * What a disposal will book, before it is posted: book value is cost less
 * accumulated depreciation, and the proceeds over (or under) it is the
 * gain (or loss). The backend computes the same from depreciation posted
 * through the disposal date; this preview uses what is posted as of now.
 */
export function disposalPreview(cost: number, accumulated: number, proceeds: number) {
  const bookValue = Math.round((cost - accumulated) * 100) / 100;
  const result = Math.round((proceeds - bookValue) * 100) / 100;
  return { bookValue, gain: result > 0 ? result : 0, loss: result < 0 ? -result : 0 };
}
