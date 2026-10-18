const ONES = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

/** Words for 0 < n < 1000. Indonesian says "seratus"/"seribu", never "satu ratus". */
function belowThousand(n: number): string {
  if (n < 12) return ONES[n];
  if (n < 20) return `${ONES[n - 10]} belas`;
  if (n < 100) {
    const rest = n % 10;
    return `${ONES[Math.floor(n / 10)]} puluh${rest ? ` ${ONES[rest]}` : ""}`;
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? "seratus" : `${ONES[hundreds]} ratus`;
  return rest ? `${head} ${belowThousand(rest)}` : head;
}

const SCALES = ["", "ribu", "juta", "miliar", "triliun"];

/**
 * A rupiah amount in words, as an invoice spells it: 12.298.915 →
 * "dua belas juta dua ratus sembilan puluh delapan ribu sembilan ratus lima
 * belas rupiah". Sen are dropped -- the invoice bills whole rupiah.
 */
export function terbilang(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return "nol rupiah";
  const parts: string[] = [];
  let rest = n;
  for (let scale = 0; rest > 0 && scale < SCALES.length; scale++) {
    const group = rest % 1000;
    rest = Math.floor(rest / 1000);
    if (group === 0) continue;
    const words =
      scale === 1 && group === 1
        ? "seribu"
        : `${belowThousand(group)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`;
    parts.unshift(words);
  }
  return `${amount < 0 ? "minus " : ""}${parts.join(" ")} rupiah`;
}
