// Latin -> Ge'ez transliteration (SERA-style), done on the phone as the user types.
//
// A Ge'ez syllable = consonant + vowel. Every consonant has 7 main forms ("orders"),
// stored next to each other in Unicode, so we only need the first form of each:
//
//   vowel typed:   e    u    i    a    ie/E   (none)   o
//   order:         1st  2nd  3rd  4th  5th    6th      7th
//   example (s):   ሰ    ሱ    ሲ    ሳ    ሴ      ስ        ሶ
//
//   selam  -> se ሰ + la ላ + m ም         = ሰላም
//   bunna  -> bu ቡ + nna ና (a doubled consonant is written once) = ቡና
//   gwadeNa -> gwa ጓ + de ደ + Na ኛ     = ጓደኛ   ("wa" after a consonant = labialised form)
//
// Upper case picks a different consonant: T ጠ, C ጨ, P ጰ, S ጸ, N ኘ, Z ዠ, K ኸ, H ሐ.

// Latin consonant -> first-order Ge'ez letter. Two-letter keys are tried first.
const CONSONANTS: Record<string, string> = {
  h: 'ሀ', l: 'ለ', H: 'ሐ', m: 'መ', r: 'ረ', s: 'ሰ', sh: 'ሸ', q: 'ቀ', b: 'በ', v: 'ቨ',
  t: 'ተ', c: 'ቸ', ch: 'ቸ', n: 'ነ', N: 'ኘ', ny: 'ኘ', k: 'ከ', K: 'ኸ', kh: 'ኸ', w: 'ወ',
  z: 'ዘ', Z: 'ዠ', zh: 'ዠ', y: 'የ', d: 'ደ', j: 'ጀ', g: 'ገ', T: 'ጠ', C: 'ጨ', P: 'ጰ',
  S: 'ጸ', ts: 'ጸ', f: 'ፈ', p: 'ፐ',
};

// Vowel after a consonant -> how many letters to move forward from the first form.
const VOWEL_ORDER: Record<string, number> = { e: 0, u: 1, i: 2, a: 3, ie: 4, E: 4, o: 6 };
const SIXTH_ORDER = 5; // consonant with no vowel: ስ, ም, ት ...

// A vowel on its own (start of a word, or after another vowel) uses the አ series.
const STANDALONE_VOWELS: Record<string, string> = { a: 'አ', e: 'እ', u: 'ኡ', i: 'ኢ', ie: 'ኤ', E: 'ኤ', o: 'ኦ' };

// "wa" forms (ሏ ሟ ቧ ...) sit 7 places after the first form, except these four.
const WA_EXCEPTIONS: Record<string, string> = { 'ሀ': 'ኋ', 'ቀ': 'ቋ', 'ከ': 'ኳ', 'ገ': 'ጓ' };
const NO_WA = new Set(['ወ', 'የ']);

// Punctuation helper (only while Ge'ez typing is on).
export const PUNCTUATION: Record<string, string> = { '.': '።', ',': '፣', ';': '፤', '?': '፧' };

function shift(letter: string, places: number) {
  return String.fromCharCode(letter.charCodeAt(0) + places);
}

function readConsonant(s: string, i: number) {
  for (const len of [2, 1]) {
    const key = s.slice(i, i + len);
    if (key.length === len && CONSONANTS[key]) return key;
  }
  return null;
}

function readVowel(s: string, i: number) {
  if (s.startsWith('ie', i)) return 'ie';
  return VOWEL_ORDER[s[i]] !== undefined ? s[i] : null;
}

/** Convert a run of Latin letters to Ge'ez. Unknown characters are kept as they are. */
export function toGeez(latin: string): string {
  let out = '';
  let i = 0;
  while (i < latin.length) {
    const cons = readConsonant(latin, i);
    if (cons) {
      i += cons.length;
      // Doubled consonant ("nn" in bunna): Amharic writes it once, so skip this copy.
      if (readConsonant(latin, i) === cons) continue;
      const first = CONSONANTS[cons];
      if (latin.startsWith('wa', i) && !NO_WA.has(first)) {
        out += WA_EXCEPTIONS[first] ?? shift(first, 7);
        i += 2;
        continue;
      }
      const vowel = readVowel(latin, i);
      if (vowel) i += vowel.length;
      out += shift(first, vowel ? VOWEL_ORDER[vowel] : SIXTH_ORDER);
      continue;
    }
    const vowel = readVowel(latin, i);
    if (vowel) {
      out += STANDALONE_VOWELS[vowel];
      i += vowel.length;
      continue;
    }
    out += latin[i];
    i += 1;
  }
  return out;
}

const isLatin = (ch: string) => /^[a-zA-Z]$/.test(ch);

/**
 * Apply one edit of the text box while Ge'ez typing is on.
 * `buffer` holds the Latin letters of the word being typed, so "s" -> ስ and then
 * "se" -> ሰ can rewrite the end of the text. Any other kind of edit (typing in
 * the middle, pasting, Ge'ez keyboard input) is kept exactly as it is.
 */
export function typeInto(prev: string, next: string, buffer: string): { text: string; buffer: string } {
  // Characters added at the end.
  if (next.length > prev.length && next.startsWith(prev)) {
    let text = prev;
    for (const ch of next.slice(prev.length)) {
      if (isLatin(ch)) {
        const old = toGeez(buffer);
        buffer += ch;
        text = text.slice(0, text.length - old.length) + toGeez(buffer);
      } else {
        text += PUNCTUATION[ch] ?? ch;
        buffer = '';
      }
    }
    return { text, buffer };
  }
  // Backspace at the end of a word that is still being typed.
  if (buffer && next.length === prev.length - 1 && prev.startsWith(next)) {
    const base = prev.slice(0, prev.length - toGeez(buffer).length);
    buffer = buffer.slice(0, -1);
    return { text: base + toGeez(buffer), buffer };
  }
  return { text: next, buffer: '' };
}
