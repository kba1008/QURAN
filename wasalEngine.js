/**
 * Advanced Quranic Phonetic & Wasal Matching Engine  —  v2.0
 * Untuk PWA Tasmi' (pengecaman suara pelayar / Google Speech API)
 *
 * Ciri utama:
 *  1. Dynamic Sliding Window (2, 3, 4 perkataan serentak)
 *  2. Ikhfa' Haqiqi & fonetik nasal ('ng', 'n', 'm', gugur)
 *  3. Smart Backtracking (Waqaf / Ibtida' — ulang nafas tanpa ralat)
 *  4. Confusable Characters Mapping (ص->س, ض->د, ط->ت, ...)
 *  5. Vowel Compression (mampatan Madd)
 *
 * API kekal serasi dengan index.html:
 *   removeTashkeel, calculateSimilarity, wasalVariants,
 *   verifyReading, verifyDynamicWindow / verifyDynamic, verifySmartCursor
 */

class QuranWasalEngine {
  /* ============================================================
   * 1. NORMALIZATION LAYER
   * ============================================================ */
  static normalize(text) {
    if (!text) return "";
    return String(text)
      // Harakat, tanwin, sukun, shaddah, tanda waqaf
      .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, "")
      // Variasi hamzah -> ا
      .replace(/[أإآءٱئؤ]/g, "ا")
      // Alif maqsurah -> ي
      .replace(/ى/g, "ي")
      // Ta marbutah -> ه (STT kerap dengar 'h')
      .replace(/ة/g, "ه")
      // Tatweel
      .replace(/\u0640/g, "")
      // Buang aksara bukan Arab/latin asas (tanda baca STT)
      .replace(/[^\u0621-\u064Aa-zA-Z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ============================================================
   * 2. VOWEL COMPRESSION (Madd Engine)
   *    STT menggandakan huruf bila pengguna memanjangkan bacaan.
   * ============================================================ */
  static compressVowels(text) {
    if (!text) return "";
    return String(text)
      .replace(/([اويهنمaeiouyn])\1+/gi, "$1") // mad / nasal berganda -> satu
      .replace(/(.)\1{1,}/g, "$1")             // mana-mana huruf berganda -> satu
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ============================================================
   * 3. CONFUSABLE CHARACTERS MAPPING
   *    Google Speech kerap keliru antara huruf sejenis makhraj.
   * ============================================================ */
  static get CONFUSABLE_MAP() {
    return {
      "ص": "س", "ث": "س", "س": "س",
      "ض": "د", "ظ": "د", "ذ": "د", "ز": "د", "د": "د",
      "ط": "ت", "ت": "ت",
      "ع": "ا", "ا": "ا",
      "ح": "ه", "ه": "ه",
      "ق": "ك", "ك": "ك",
      "غ": "خ", "خ": "خ",
      "ج": "ج", "ش": "ش",
    };
  }

  static mapConfusableArabic(text) {
    if (!text) return "";
    const map = QuranWasalEngine.CONFUSABLE_MAP;
    let out = "";
    for (const ch of String(text)) out += map[ch] !== undefined ? map[ch] : ch;
    return out;
  }

  /** Kunci fonetik penuh: normalize -> confusable -> compress madd */
  static fuzzyKey(text) {
    return this.compressVowels(this.mapConfusableArabic(this.normalize(text)));
  }

  /** Kunci fonetik tanpa ruang (untuk bacaan bersambung) */
  static tightKey(text) {
    return this.fuzzyKey(text).replace(/\s+/g, "");
  }

  /* ============================================================
   * 4. PHONETIC TRANSMUTATION (WASAL)
   * ============================================================ */
  static generateWasalPhonetic(word1, word2) {
    let w1 = this.normalize(word1);
    let w2 = this.normalize(word2);
    if (!w1 || !w2) return `${w1} ${w2}`.trim();

    const lastCharW1 = w1.charAt(w1.length - 1);
    const firstCharW2 = w2.charAt(0);

    // --- HUKUM 1: NUN MATI / TANWIN ---
    if (lastCharW1 === "ن") {
      const baseW1 = w1.slice(0, -1);

      // Idgham (bilaghunnah ر/ل + bighunnah ي/ن/م/و)
      if (["ر", "ل", "ي", "ن", "م", "و"].includes(firstCharW2)) {
        return `${baseW1}${firstCharW2} ${w2}`;
      }
      // Iqlab (ن + ب) -> م
      if (firstCharW2 === "ب") return `${baseW1}م ${w2}`;
      // Ikhfa' Haqiqi -> bunyi nasal 'ng'
      if (QuranWasalEngine.IKHFA_CHARS.includes(firstCharW2)) {
        return `${baseW1}ng ${w2}`;
      }
      // Izhar Halqi -> jelas
      if (QuranWasalEngine.IZHAR_CHARS.includes(firstCharW2)) return `${w1} ${w2}`;
    }

    // --- HUKUM 2: ALIF LAM SHAMSIYAH ---
    if (w2.startsWith("ال") && w2.length > 2) {
      const targetChar = w2.charAt(2);
      if (QuranWasalEngine.SHAMSIYAH_CHARS.includes(targetChar)) {
        return `${w1} ${targetChar + w2.slice(2)}`;
      }
    }

    // --- HUKUM 3: HAMZAH WASAL DIGUGURKAN ---
    if (w2.startsWith("ا") && !w2.startsWith("ال")) {
      return `${w1}${w2.slice(1)}`;
    }

    return `${w1} ${w2}`;
  }

  /** Rantaian wasal untuk N perkataan (2,3,4 ...) */
  static buildWasalChain(chunk) {
    if (!chunk || !chunk.length) return "";
    if (chunk.length === 1) return this.normalize(chunk[0]);
    let acc = this.normalize(chunk[0]);
    for (let i = 1; i < chunk.length; i++) {
      const merged = this.generateWasalPhonetic(acc.split(" ").pop(), chunk[i]);
      const head = acc.split(" ").slice(0, -1).join(" ");
      acc = (head ? head + " " : "") + merged;
    }
    return acc.replace(/\s+/g, " ").trim();
  }

  /* ============================================================
   * 5. SIMILARITY (Levenshtein + fonetik)
   * ============================================================ */
  static rawSimilarity(a, b) {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        m[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
    const max = Math.max(a.length, b.length);
    return (max - m[b.length][a.length]) / max;
  }

  static getSimilarityScore(s1, s2) {
    const raw = this.rawSimilarity(this.normalize(s1), this.normalize(s2));
    const phon = this.rawSimilarity(this.fuzzyKey(s1), this.fuzzyKey(s2));
    const tight = this.rawSimilarity(this.tightKey(s1), this.tightKey(s2));
    return Math.max(raw, phon, tight);
  }

  /** Padanan "terkandung di dalam" secara fonetik */
  static containsPhonetic(spoken, target) {
    const s = this.tightKey(spoken), t = this.tightKey(target);
    if (!s || !t) return false;
    if (s.includes(t)) return true;
    // Target lebih panjang daripada sebutan: hanya diterima jika hampir sama
    if (t.includes(s) && s.length / t.length >= 0.9) return true;
    const sp = this.fuzzyKey(spoken), tp = this.fuzzyKey(target);
    return sp.includes(tp);
  }

  /* ============================================================
   * 6. SEMAKAN 1 / 2 PERKATAAN (asas)
   * ============================================================ */
  static verifyReading(userSpokenText, currentIndex, wordList, options = {}) {
    const threshold = options.threshold || 0.7;
    const currentWord = wordList[currentIndex];
    const nextWord = wordList[currentIndex + 1] || "";
    if (!currentWord) return { isCorrect: false, advanceBy: 0 };

    const single = this.normalize(currentWord);

    // Wasal 2 perkataan (semua varian termasuk ikhfa')
    if (nextWord) {
      for (const v of this.wasalVariants(currentWord, nextWord)) {
        if (this.containsPhonetic(userSpokenText, v)) {
          return { isCorrect: true, advanceBy: 2, mode: "WASAL_MATCH", score: 1 };
        }
      }
    }

    if (this.containsPhonetic(userSpokenText, single)) {
      return { isCorrect: true, advanceBy: 1, mode: "SINGLE_WORD", score: 1 };
    }

    const wasalPhonetic = nextWord
      ? this.normalize(this.generateWasalPhonetic(currentWord, nextWord))
      : single;
    const scoreWasal = nextWord ? this.getSimilarityScore(userSpokenText, wasalPhonetic) : 0;
    const scoreSingle = this.getSimilarityScore(userSpokenText, single);

    if (scoreWasal >= threshold && scoreWasal >= scoreSingle) {
      return { isCorrect: true, advanceBy: 2, mode: "FUZZY_WASAL", score: scoreWasal };
    }
    if (scoreSingle >= threshold) {
      return { isCorrect: true, advanceBy: 1, mode: "FUZZY_SINGLE", score: scoreSingle };
    }
    return { isCorrect: false, advanceBy: 0, score: Math.max(scoreSingle, scoreWasal) };
  }

  /* ============================================================
   * 7. DYNAMIC SLIDING WINDOW (4 -> 3 -> 2 -> 1)
   * ============================================================ */
  static verifyDynamicWindow(userSpokenText, currentIndex, wordList, options = {}) {
    const maxWindow = options.maxWindow || 4;
    const minWindow = options.minWindow || 2;
    const threshold = options.threshold || 0.7;

    const spokenClean = this.normalize(userSpokenText);
    if (!spokenClean) return { isCorrect: false, advanceBy: 0 };

    // Tetingkap besar diberi keutamaan (pembaca laju / hadr)
    let best = null;
    for (let windowSize = maxWindow; windowSize >= minWindow; windowSize--) {
      const chunk = wordList.slice(currentIndex, currentIndex + windowSize);
      if (chunk.length < windowSize) continue;

      const chained = this.buildWasalChain(chunk);
      const plain = chunk.map((w) => this.normalize(w)).join(" ");

      const hit =
        this.containsPhonetic(spokenClean, chained) ||
        this.containsPhonetic(spokenClean, plain);

      const score = Math.max(
        this.getSimilarityScore(spokenClean, chained),
        this.getSimilarityScore(spokenClean, plain)
      );

      // Tetingkap panjang perlu sedikit toleransi tambahan
      const need = Math.max(0.6, threshold - 0.03 * (windowSize - 2));

      if (hit || score >= need) {
        const cand = {
          isCorrect: true,
          advanceBy: windowSize,
          mode: `WASAL_${windowSize}_WORDS`,
          score: hit ? 1.0 : score,
        };
        if (!best || cand.score >= best.score) best = cand;
        if (hit) return cand;
      }
    }
    if (best) return best;

    return this.verifyReading(userSpokenText, currentIndex, wordList, options);
  }

  /* ============================================================
   * 8. SMART BACKTRACKING — Waqaf & Ibtida'
   *    Pengguna ulang perkataan sebelumnya kerana nafas habis:
   *    kursor dilaras semula TANPA dikira sebagai kesalahan.
   * ============================================================ */
  static verifySmartCursor(spokenText, currentIndex, wordList, options = {}) {
    const back = options.lookBack === undefined ? 2 : options.lookBack;
    const ahead = options.lookAhead === undefined ? 2 : options.lookAhead;

    const offsets = [0];
    for (let b = 1; b <= back; b++) offsets.push(-b);
    for (let f = 1; f <= ahead; f++) offsets.push(f);

    let fallback = null;
    for (const offset of offsets) {
      const idx = currentIndex + offset;
      if (idx < 0 || idx >= wordList.length) continue;

      // Ulangan ke belakang perlu keyakinan lebih tinggi supaya kursor stabil
      const opts = offset < 0
        ? { ...options, threshold: Math.max(options.threshold || 0.7, 0.82) }
        : options;

      const res = this.verifyDynamicWindow(spokenText, idx, wordList, opts);
      if (res.isCorrect) {
        const out = {
          ...res,
          matchedIndex: idx,
          newIndex: Math.min(wordList.length, idx + res.advanceBy),
          offset,
          cursorMode:
            offset < 0 ? "IBTIDA_REPEAT" : offset > 0 ? "WAQAF_SKIP" : "IN_SEQUENCE",
          isWarning: false,
          isError: false,
        };
        if (offset === 0) return out;
        if (!fallback || (out.score || 0) > (fallback.score || 0)) fallback = out;
      }
    }
    if (fallback) return fallback;

    return {
      isCorrect: false,
      advanceBy: 0,
      matchedIndex: currentIndex,
      newIndex: currentIndex,
      offset: 0,
      cursorMode: "NO_MATCH",
    };
  }
}

/* ===== SENARAI HURUF ===== */
QuranWasalEngine.IKHFA_CHARS = ["ت","ث","ج","د","ذ","ز","س","ش","ص","ض","ط","ظ","ف","ق","ك"];
QuranWasalEngine.IZHAR_CHARS = ["ا","ه","ع","ح","غ","خ"];
QuranWasalEngine.SHAMSIYAH_CHARS = ["ت","ث","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ل","ن"];

/* ===== VARIASI IKHFA' / NASAL YANG DITANGKAP STT ===== */
QuranWasalEngine.ikhfaVariants = function (w1, w2) {
  const n1 = QuranWasalEngine.normalize(w1);
  const n2 = QuranWasalEngine.normalize(w2);
  if (!n1 || !n2) return [];
  const last = n1.charAt(n1.length - 1);
  const first = n2.charAt(0);
  if (last !== "ن" || !QuranWasalEngine.IKHFA_CHARS.includes(first)) return [];
  const base = n1.slice(0, -1);
  const nasals = ["ng", "ن", "م", "نغ", ""];
  const out = [];
  for (const nasal of nasals) {
    out.push(`${base}${nasal} ${n2}`, `${base}${nasal}${n2}`);
  }
  return out;
};

/* Semua varian sebutan wasal bagi 2 perkataan */
QuranWasalEngine.wasalVariants = function (w1, w2) {
  const p = QuranWasalEngine.generateWasalPhonetic(w1, w2);
  const n1 = QuranWasalEngine.normalize(w1), n2 = QuranWasalEngine.normalize(w2);
  return Array.from(new Set(
    [p, p.replace(/\s+/g, ""), n1 + n2, n1 + " " + n2]
      .concat(QuranWasalEngine.ikhfaVariants(w1, w2))
      .filter(Boolean)
  ));
};

/* ===== ALIAS API RINGKAS (dipanggil oleh index.html) ===== */
QuranWasalEngine.removeTashkeel = function (text) {
  return QuranWasalEngine.normalize(text);
};
QuranWasalEngine.calculateSimilarity = function (s1, s2) {
  return QuranWasalEngine.getSimilarityScore(s1, s2);
};
QuranWasalEngine.verifyDynamic = function (text, idx, words, opts) {
  return QuranWasalEngine.verifyDynamicWindow(text, idx, words, opts);
};
QuranWasalEngine.phoneticKey = function (text) {
  return QuranWasalEngine.fuzzyKey(text);
};

/* ===== EXPORT ===== */
if (typeof module !== "undefined" && module.exports) {
  module.exports = QuranWasalEngine;
}
if (typeof window !== "undefined") {
  window.QuranWasalEngine = QuranWasalEngine;
}
