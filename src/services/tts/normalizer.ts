/**
 * Malay text normalizer for TTS — ported from revo_norm (num2word_ms.py).
 *
 * Converts digits, percentages, currency, and abbreviations to spoken Malay
 * words so espeak-ng phonemizes them correctly.
 *
 * Example:
 *   "Saya ada RM50 dan 3 ekor kucing" →
 *   "Saya ada lima puluh ringgit dan tiga ekor kucing"
 */

// ── Number to Malay words ────────────────────────────────────────────────

const BASE: Record<number, string[]> = {
  0: [],
  1: ["satu"],
  2: ["dua"],
  3: ["tiga"],
  4: ["empat"],
  5: ["lima"],
  6: ["enam"],
  7: ["tujuh"],
  8: ["lapan"],
  9: ["sembilan"],
};

const TENS_TO: Record<number, string> = {
  3: "ribu",
  6: "juta",
  9: "bilion",
  12: "trilion",
};

function ratus(digit: string): string[] {
  if (digit === "1") return ["seratus"];
  if (digit === "0") return [];
  return [...BASE[parseInt(digit)], "ratus"];
}

function puluh(two: string): string[] {
  const t = two[0];
  const o = two[1];
  if (t === "1") {
    if (o === "0") return ["sepuluh"];
    if (o === "1") return ["sebelas"];
    return [...BASE[parseInt(o)], "belas"];
  }
  if (t === "0") return [...BASE[parseInt(o)]];
  return [...BASE[parseInt(t)], "puluh", ...BASE[parseInt(o)]];
}

function spellBlock(num: string): string[] {
  if (num.length === 1) return num === "0" ? ["kosong"] : [...BASE[parseInt(num)]];
  if (num.length === 2) return puluh(num);
  return [...ratus(num[0]), ...puluh(num.slice(1, 3))];
}

function splitBy3(s: string): string[] {
  const len = s.length;
  if (len < 3) return [s];
  const firstLen = len % 3;
  const blocks: string[] = [];
  if (firstLen > 0) blocks.push(s.slice(0, firstLen));
  for (let i = firstLen; i < len; i += 3) blocks.push(s.slice(i, i + 3));
  return blocks;
}

function numberToMalay(n: number): string {
  if (n === 0) return "kosong";
  if (!isFinite(n)) return String(n);

  const neg = n < 0;
  const abs = Math.abs(n);
  const parts = String(abs).split(".");
  const intStr = parts[0];
  const floatStr = parts[1];

  const blocks = splitBy3(intStr);
  const spellings = blocks.map(spellBlock);

  const words: string[] = [];
  const lastIdx = spellings.length - 1;

  // "seribu" shortcut for exactly 1000
  if (lastIdx === 1 && blocks[0] === "1") {
    words.push("seribu");
    // Add the hundreds block
    if (spellings[1].length) words.push(...spellings[1]);
  } else {
    for (let i = 0; i <= lastIdx; i++) {
      if (!spellings[i].length) continue;
      words.push(...spellings[i]);
      if (i < lastIdx) {
        const tensPos = (lastIdx - i) * 3;
        if (TENS_TO[tensPos]) words.push(TENS_TO[tensPos]);
      }
    }
  }

  // Decimal part
  if (floatStr) {
    words.push("perpuluhan");
    for (const d of floatStr) {
      words.push(d === "0" ? "kosong" : (BASE[parseInt(d)]?.[0] ?? d));
    }
  }

  let result = words.join(" ");
  if (neg) result = "negatif " + result;
  return result;
}

// ── Text normalization patterns ──────────────────────────────────────────

/** Malaysian currency: RM50, RM 12.50, rm100 */
const RM_RE = /\bRM\s*(\d+(?:\.\d+)?)/gi;

/** Percentage: 50%, 99.9% */
const PCT_RE = /(\d+(?:\.\d+)?)\s*%/g;

/** Plain standalone integers/decimals */
const NUM_RE = /\b(\d+(?:\.\d+)?)\b/g;

/** Ordinal-like: 1st, 2nd, 3rd (rare in Malay but handle gracefully) */
const ORD_RE = /(\d+)(st|nd|rd|th)\b/gi;

/** SDN BHD → sendirian berhad */
const SDN_RE = /\bsdn\.?\s*bhd\b\.?/gi;

/** a/l → anak lelaki, a/p → anak perempuan */
const AL_RE = /\ba\/l\b/gi;
const AP_RE = /\ba\/p\b/gi;

/** Special characters → Malay words */
const SPECIAL_CHARS: [RegExp, string][] = [
  [/&/g, "dan"],
  [/\+/g, "tambah"],
  [/=/g, "sama dengan"],
  [/@/g, "di"],
  [/#/g, "nombor"],
  [/\*/g, "bintang"],
  [/°/g, "darjah"],
];

/** Digit-by-digit for contexts: exit, gate, lot, platform, blok */
const DIGIT_CTX_RE = /\b(exit|gate|lot|platform|blok|bay|block)\s+(\d+)\b/gi;

function digitByDigit(digits: string): string {
  const MS: Record<string, string> = {
    "0": "kosong", "1": "satu", "2": "dua", "3": "tiga",
    "4": "empat", "5": "lima", "6": "enam", "7": "tujuh",
    "8": "lapan", "9": "sembilan",
  };
  return digits.split("").map((d) => MS[d] ?? d).join(" ");
}

/**
 * Normalize Malay text for TTS — converts all numbers, symbols, and
 * abbreviations to their spoken Malay word equivalents.
 */
export function normalizeMalay(text: string): string {
  let result = text;

  // SDN BHD before anything else
  result = result.replace(SDN_RE, "sendirian berhad");

  // a/l, a/p
  result = result.replace(AL_RE, "anak lelaki");
  result = result.replace(AP_RE, "anak perempuan");

  // Digit-by-digit contexts (exit, gate, lot, etc.)
  result = result.replace(
    DIGIT_CTX_RE,
    (_m, prefix: string, digits: string) => `${prefix} ${digitByDigit(digits)}`
  );

  // Currency: RM50 → "lima puluh ringgit"
  result = result.replace(RM_RE, (_m, amount: string) => {
    return `${numberToMalay(parseFloat(amount))} ringgit`;
  });

  // Percentage: 50% → "lima puluh peratus"
  result = result.replace(PCT_RE, (_m, val: string) => {
    return `${numberToMalay(parseFloat(val))} peratus`;
  });

  // Ordinal suffixes: 1st → "pertama", 2nd → "kedua", else ke-X
  result = result.replace(ORD_RE, (_m, num: string) => {
    const n = parseInt(num);
    if (n === 1) return "pertama";
    if (n === 2) return "kedua";
    return `ke${numberToMalay(n)}`;
  });

  // All remaining numbers
  result = result.replace(NUM_RE, (_m, num: string) => numberToMalay(parseFloat(num)));

  // Special characters
  for (const [re, word] of SPECIAL_CHARS) {
    result = result.replace(re, ` ${word} `);
  }

  // Collapse whitespace
  result = result.replace(/\s{2,}/g, " ").trim();

  return result;
}
