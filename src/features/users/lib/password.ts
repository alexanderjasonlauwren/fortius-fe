/**
 * A temporary password an administrator reads out or sends to someone: a
 * driver types it on a phone, so characters that look alike (0/O, 1/l/I) are
 * left out, and one of each kind is guaranteed so a policy requiring them
 * accepts it. The server's policy stays the judge; this only makes passing it
 * the easy path.
 */
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "#%+=";
const ALL = UPPER + LOWER + DIGITS;

function pick(alphabet: string, random: Uint32Array, index: number): string {
  return alphabet[random[index] % alphabet.length];
}

export function generatePassword(length = 16): string {
  const random = new Uint32Array(length * 2);
  crypto.getRandomValues(random);
  const chars = [
    pick(UPPER, random, 0),
    pick(LOWER, random, 1),
    pick(DIGITS, random, 2),
    pick(SYMBOLS, random, 3),
  ];
  for (let i = chars.length; i < length; i++) chars.push(pick(ALL, random, i));
  // Fisher-Yates with the second half of the random block, so the guaranteed
  // characters are not always the first four.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random[length + i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
