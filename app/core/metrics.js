// Gezählte Werte: Wortvielfalt (MTLD), Wortniveau, Satzkomplexität.
import { tokenize, splitSentences } from "./text.js";

const RARE_BELOW = 4.5;
export const SUBORDINATORS = new Set(("because although though which who whom whose when while if unless since " +
  "whereas until that whether wherever whenever").split(" "));

function mtldPass(tokens, threshold) {
  let factors = 0;
  let types = new Set();
  let count = 0;
  let ttr = 1;
  for (const t of tokens) {
    count++;
    types.add(t);
    ttr = types.size / count;
    if (ttr <= threshold) {
      factors++;
      types = new Set();
      count = 0;
      ttr = 1;
    }
  }
  if (count > 0) factors += (1 - ttr) / (1 - threshold);
  return factors > 0 ? tokens.length / factors : tokens.length;
}

// Measure of Textual Lexical Diversity (McCarthy & Jarvis 2010), Mittel aus vorwärts und rückwärts.
export function mtld(tokens, threshold = 0.72) {
  if (!tokens.length) return 0;
  return (mtldPass(tokens, threshold) + mtldPass([...tokens].reverse(), threshold)) / 2;
}

export function levelShare(tokens, freqMap) {
  let counted = 0;
  let rare = 0;
  for (const t of tokens) {
    const z = freqMap.get(t);
    if (z === undefined) continue;
    counted++;
    if (z < RARE_BELOW) rare++;
  }
  return { share: counted ? rare / counted : 0, counted };
}

export function complexity(text) {
  const sentences = splitSentences(text).filter((s) => tokenize(s).length > 0);
  if (!sentences.length) return { avgLen: 0, subPerSentence: 0, sentences: 0 };
  let words = 0;
  let subs = 0;
  for (const s of sentences) {
    const toks = tokenize(s);
    words += toks.length;
    subs += toks.filter((t) => SUBORDINATORS.has(t)).length;
  }
  return { avgLen: words / sentences.length, subPerSentence: subs / sentences.length, sentences: sentences.length };
}

export function computeMetrics(text, freqMap) {
  const tokens = tokenize(text);
  const lvl = levelShare(tokens, freqMap);
  const c = complexity(text);
  return {
    words: tokens.length,
    sentences: c.sentences,
    mtld: mtld(tokens),
    levelShare: lvl.share,
    levelCounted: lvl.counted,
    avgLen: c.avgLen,
    subPerSentence: c.subPerSentence,
  };
}
