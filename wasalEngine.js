/**
 * Advanced Quranic Phonetic & Wasal Matching Engine
 * Designed for PWA Voice Recognition Engine
 */

class QuranWasalEngine {
  /**
   * 1. NORMALIZATION LAYER
   * Membuang harakat, tanda waqaf, dan menyelaraskan huruf Arab
   * kepada bentuk fonetik asas (Normalized Text).
   */
  static normalize(text) {
    if (!text) return "";
    return text
      // Buang Harakat, Tanwin, Sukun, Shaddah & Tanda Waqaf Quran (U+064B - U+0652, U+0670, U+06D6 - U+06ED)
      .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, "")
      // Standardkan variasi Hamzah (أ, إ, آ, ء, ٱ) -> ا
      .replace(/[أإآءٱ]/g, "ا")
      // Standardkan Alif Maqsurah (ى) -> ي
      .replace(/ى/g, "ي")
      // Buang Tatweel (ـ)
      .replace(/\u0640/g, "")
      // Standardkan ruang kosong (extra spaces)
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 2. PHONETIC TRANSMUTATION ENGINE
   * Menjana variasi sebutan sepertimana ia sepatutnya DIDENGAR
   * apabila dua perkataan dibaca secara Wasal (bersambung).
   */
  static generateWasalPhonetic(word1, word2) {
    let w1 = this.normalize(word1);
    let w2 = this.normalize(word2);

    if (!w1 || !w2) return `${w1} ${w2}`;

    let w1Chars = w1.split("");
    let w2Chars = w2.split("");
    let lastCharW1 = w1Chars[w1Chars.length - 1];
    let firstCharW2 = w2Chars[0];

    // --- HUKUM 1: NUN MATI / TANWIN (ن) ---
    if (lastCharW1 === "ن") {
      let baseW1 = w1.slice(0, -1);

      // A. Idgham Bilaghunnah (Nun + ر / ل) -> Contoh: من ربهم -> مرربهم
      if (['ر', 'ل'].includes(firstCharW2)) {
        return `${baseW1}${firstCharW2} ${w2}`;
      }

      // B. Idgham Bighunnah (Nun + ي / ن / م / و) -> Contoh: من يعمل -> مييعمل
      if (['ي', 'ن', 'م', 'و'].includes(firstCharW2)) {
        return `${baseW1}${firstCharW2} ${w2}`;
      }

      // C. Iqlab (Nun + ب) -> Contoh: من بعد -> ممبعد
      if (firstCharW2 === 'ب') {
        return `${baseW1}م ${w2}`;
      }

      // D. Ikhfa' Haqiqi (Nun + 15 huruf ikhfa') -> dengung nasal
      // Contoh: من قبل -> "mingqabli" (pelayar sering tangkap sebagai 'ng'/'م')
      if (QuranWasalEngine.IKHFA_CHARS.includes(firstCharW2)) {
        return `${baseW1}ng ${w2}`;
      }

      // E. Izhar Halqi (Nun + huruf halq) -> Nun dibaca JELAS, tiada gabungan
      if (QuranWasalEngine.IZHAR_CHARS.includes(firstCharW2)) {
        return `${w1} ${w2}`;
      }
    }


    // --- HUKUM 2: ALIF LAM SHAMSIYAH (ال + Huruf Shamsiyah) ---
    // Apabila perkataan kedua bermula dengan Alif Lam Shamsiyah (contoh: من السماء -> منسماء)
    if (w2.startsWith("ال") && w2.length > 2) {
      const shamsiyah = ['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن'];
      let targetChar = w2.charAt(2);
      
      if (shamsiyah.includes(targetChar)) {
        // Buang 'ال' dan gantikan dengan huruf Shamsiyah bersabdu/berganda
        let modifiedW2 = targetChar + w2.slice(2);
        return `${w1} ${modifiedW2}`;
      }
    }

    // --- HUKUM 3: WAQAF/ELISION HAMZAH WASAL (ٱ) ---
    // Jika perkataan kedua bermula dengan Alif (ا), sebutan Wasal melompati Alif tersebut
    if (w2.startsWith("ا") && !w2.startsWith("ال")) {
      let modifiedW2 = w2.slice(1);
      return `${w1}${modifiedW2}`;
    }

    return `${w1} ${w2}`;
  }

  /**
   * 3. LEVENSHTEIN DISTANCE ALGORITHM
   * Mengira peratusan kemiripan (Similarity Ratio) 0.0 - 1.0
   * untuk menampung ralat sebutan kecerdasan buatan / STT pelayar.
   */
  /**
   * 3a. VOCAL EXPANSION NORMALIZER (Madd Engine)
   * STT menggandakan huruf mad apabila pengguna memanjangkan nafas
   * (contoh: جاء -> "جااااء", "Jaaa a"). Mampatkan huruf berganda.
   */
  static compressVowels(text) {
    if (!text) return "";
    return text
      .replace(/([اويهnمg])\1+/gi, "$1")   // huruf mad/nasal berganda -> satu
      .replace(/(.)\1{2,}/g, "$1$1")      // mana-mana huruf >2 kali -> 2
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 3b. STT PHONETIC MAPPING (Jadual Huruf Keliru)
   * Pelayar kerap silap: ض->د/ظ, ص->س, ع->ا, ط->ت.
   */
  static mapConfusableArabic(text) {
    if (!text) return "";
    return text
      .replace(/[صث]/g, "س")
      .replace(/[ضظذ]/g, "د")
      .replace(/ط/g, "ت")
      .replace(/ع/g, "ا")
      .replace(/[هح]/g, "ه")
      .replace(/[قك]/g, "ك")
      .replace(/[غخ]/g, "غ");
  }

  /** Kunci fonetik penuh: normalize -> confusable map -> compress mad */
  static fuzzyKey(text) {
    return this.compressVowels(this.mapConfusableArabic(this.normalize(text)));
  }

  static getSimilarityScore(s1, s2) {
    const raw = this.rawSimilarity(this.normalize(s1), this.normalize(s2));
    const phonetic = this.rawSimilarity(this.fuzzyKey(s1), this.fuzzyKey(s2));
    return Math.max(raw, phonetic);
  }

  static rawSimilarity(a, b) {

    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    let matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // Penukaran
            matrix[i][j - 1] + 1,     // Sisipan
            matrix[i - 1][j] + 1      // Pemotongan
          );
        }
      }
    }

    let maxLength = Math.max(a.length, b.length);
    return (maxLength - matrix[b.length][a.length]) / parseFloat(maxLength);
  }

  /**
   * 4. EVALUATION & MATCHING ENGINE (Triple-Check Strategy)
   * Menyemak sebutan pengguna berasaskan strategi 3 Peringkat.
   */
  static verifyReading(userSpokenText, currentIndex, wordList) {
    const currentWord = wordList[currentIndex];
    const nextWord = wordList[currentIndex + 1] || "";

    if (!currentWord) return { isCorrect: false, advanceBy: 0 };

    const spokenClean = this.normalize(userSpokenText);
    const singleNormalized = this.normalize(currentWord);
    
    // Jana bentuk Wasal jika ada perkataan seterusnya
    const wasalPhonetic = nextWord 
      ? this.normalize(this.generateWasalPhonetic(currentWord, nextWord))
      : singleNormalized;

    // --- STRATEGI A: Padanan Satu Perkataan (Waqaf / Dibaca Satu-Satu) ---
    if (spokenClean.includes(singleNormalized)) {
      return { isCorrect: true, advanceBy: 1, mode: "SINGLE_WORD" };
    }

    // --- STRATEGI B: Padanan Wasal (Dibaca Bersambung) ---
    // Menguji sebutan bersambung 2 perkataan serentak
    const wasalCleanCombined = wasalPhonetic.replace(/\s+/g, "");
    const spokenNoSpace = spokenClean.replace(/\s+/g, "");

    if (spokenNoSpace.includes(wasalCleanCombined) || spokenClean.includes(wasalPhonetic)) {
      return { isCorrect: true, advanceBy: 2, mode: "WASAL_MATCH" }; // Melompat 2 perkataan!
    }

    // --- STRATEGI C: Fuzzy Match Toleransi (Threshold >= 70%) ---
    const scoreSingle = this.getSimilarityScore(spokenClean, singleNormalized);
    const scoreWasal = this.getSimilarityScore(spokenClean, wasalPhonetic);

    if (scoreWasal >= 0.70) {
      return { isCorrect: true, advanceBy: 2, mode: "FUZZY_WASAL", score: scoreWasal };
    }

    if (scoreSingle >= 0.70) {
      return { isCorrect: true, advanceBy: 1, mode: "FUZZY_SINGLE", score: scoreSingle };
    }

    // Gagal padanan
    return { isCorrect: false, advanceBy: 0 };
  }

  /**
   * 5. DYNAMIC SLIDING WINDOW (Mengecam Kelajuan Bacaan)
   * STT sering memulangkan 3-5 perkataan dalam satu transcript apabila
   * pembaca menggunakan Tadweer/Hadr. Kita cuba padankan tetingkap
   * 4 -> 3 -> 2 perkataan (rantaian Wasal), sebelum jatuh semula
   * kepada semakan 1/2 perkataan biasa.
   */
  static buildWasalChain(chunk) {
    return chunk.reduce((prev, curr) => this.generateWasalPhonetic(prev, curr));
  }

  static verifyDynamicWindow(userSpokenText, currentIndex, wordList, options = {}) {
    const maxWindow = options.maxWindow || 4;
    const minWindow = options.minWindow || 2;
    const threshold = options.threshold || 0.7;

    const spokenClean = this.normalize(userSpokenText);
    const spokenNoSpace = spokenClean.replace(/\s+/g, "");
    if (!spokenClean) return { isCorrect: false, advanceBy: 0 };

    for (let windowSize = maxWindow; windowSize >= minWindow; windowSize--) {
      const chunk = wordList.slice(currentIndex, currentIndex + windowSize);
      if (chunk.length < windowSize) continue;

      const chainedWasal = this.normalize(this.buildWasalChain(chunk));
      const chainNoSpace = chainedWasal.replace(/\s+/g, "");
      const plain = chunk.map((w) => this.normalize(w)).join(" ");
      const plainNoSpace = plain.replace(/\s+/g, "");

      const hit =
        spokenClean.includes(chainedWasal) ||
        spokenNoSpace.includes(chainNoSpace) ||
        spokenNoSpace.includes(plainNoSpace);

      const score = Math.max(
        this.getSimilarityScore(spokenClean, chainedWasal),
        this.getSimilarityScore(spokenClean, plain)
      );

      if (hit || score >= threshold) {
        return {
          isCorrect: true,
          advanceBy: windowSize,
          mode: `WASAL_${windowSize}_WORDS`,
          score: hit ? 1.0 : score,
        };
      }
    }

    // Jika gagal 4 & 3, turun kepada semakan asas (1 atau 2 perkataan)
    return this.verifyReading(userSpokenText, currentIndex, wordList);
  }
}

/**
 * 6. SMARTER CURSOR — Waqaf & Ibtida'
 * Pengguna boleh berhenti untuk ambil nafas dan mula semula dari perkataan
 * sebelumnya. Kita semak: indeks semasa -> 1 perkataan ke belakang (ibtida')
 * -> 2 perkataan ke hadapan (lompatan waqaf), tanpa mengeluarkan ralat.
 */
QuranWasalEngine.verifySmartCursor = function (spokenText, currentIndex, wordList, options = {}) {
  const back = options.lookBack === undefined ? 1 : options.lookBack;
  const ahead = options.lookAhead === undefined ? 2 : options.lookAhead;

  const offsets = [0];
  for (let b = 1; b <= back; b++) offsets.push(-b);
  for (let f = 1; f <= ahead; f++) offsets.push(f);

  for (const offset of offsets) {
    const idx = currentIndex + offset;
    if (idx < 0 || idx >= wordList.length) continue;

    const res = QuranWasalEngine.verifyDynamicWindow(spokenText, idx, wordList, options);
    if (res.isCorrect) {
      return {
        ...res,
        matchedIndex: idx,
        newIndex: idx + res.advanceBy,
        offset,
        cursorMode: offset < 0 ? "IBTIDA_REPEAT" : offset > 0 ? "WAQAF_SKIP" : "IN_SEQUENCE",
        isWarning: false,
      };
    }
  }

  return {
    isCorrect: false,
    advanceBy: 0,
    matchedIndex: currentIndex,
    newIndex: currentIndex,
    offset: 0,
    cursorMode: "NO_MATCH",
  };
};

/* ===== SENARAI HURUF HUKUM NUN SAKINAH & TANWIN ===== */
QuranWasalEngine.IKHFA_CHARS = ['ت','ث','ج','د','ذ','ز','س','ش','ص','ض','ط','ظ','ف','ق','ك'];
QuranWasalEngine.IZHAR_CHARS = ['ا','ه','ع','ح','غ','خ'];

/* Variasi sebutan Ikhfa' yang biasa ditangkap STT: ng / n / m / nasal digugurkan */
QuranWasalEngine.ikhfaVariants = function (w1, w2) {
  const n1 = QuranWasalEngine.normalize(w1);
  const n2 = QuranWasalEngine.normalize(w2);
  if (!n1.endsWith("ن") || !QuranWasalEngine.IKHFA_CHARS.includes(n2.charAt(0))) return [];
  const base = n1.slice(0, -1);
  return ["ng", "ن", "م", ""].flatMap((nasal) => [
    `${base}${nasal} ${n2}`,
    `${base}${nasal}${n2}`,
  ]);
};

// Export untuk kegunaan ES6 Module atau Global Window
if (typeof module !== "undefined" && module.exports) {
  module.exports = QuranWasalEngine;
} else {
  window.QuranWasalEngine = QuranWasalEngine;
}
/* ===== ALIAS API RINGKAS (dipanggil oleh index.html) ===== */
QuranWasalEngine.removeTashkeel = function (text) {
  return QuranWasalEngine.normalize(text);
};
QuranWasalEngine.calculateSimilarity = function (s1, s2) {
  return QuranWasalEngine.getSimilarityScore(s1, s2);
};
/* Semua varian sebutan wasal bagi 2 perkataan (dengan & tanpa ruang) */
QuranWasalEngine.wasalVariants = function (w1, w2) {
  const p = QuranWasalEngine.generateWasalPhonetic(w1, w2);
  const n1 = QuranWasalEngine.normalize(w1), n2 = QuranWasalEngine.normalize(w2);
  return Array.from(
    new Set(
      [p, p.replace(/\s+/g, ""), n1 + n2, n1 + " " + n2]
        .concat(QuranWasalEngine.ikhfaVariants(w1, w2))
        .filter(Boolean)
    )
  );
};
if (typeof window !== "undefined") window.QuranWasalEngine = QuranWasalEngine;

/* Alias ringkas untuk pemanggilan dari index.html */
QuranWasalEngine.verifyDynamic = function (text, idx, words, opts) {
  return QuranWasalEngine.verifyDynamicWindow(text, idx, words, opts);
};
