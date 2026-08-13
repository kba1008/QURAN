class QuranWasalEngine {
  // 1. Kamus Ralat Akustik Browser (STT Confusable Mapping)
  static acousticMap = {
    'ص': 'س', 'ث': 'س', 'ض': 'د', 'ظ': 'د', 'ذ': 'د',
    'ط': 'ت', 'ع': 'ا', 'ح': 'ه', 'خ': 'ه', 'ق': 'ك', 'غ': 'ر'
  };

  // 2. Definisi Huruf Tajwid
  static hukum = {
    idghamBighunnah: ['ي', 'ن', 'م', 'و'],
    idghamBilaghunnah: ['ر', 'ل'],
    iqlab: ['ب'],
    ikhfa: ['ت', 'ث', 'ج', 'د', 'ذ', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ف', 'ق', 'ك'],
    shamsiyah: ['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن']
  };

  // 3. Normalization (Membuang baris & memampatkan harakat panjang)
  static normalize(text) {
    if (!text) return "";
    let clean = text
      .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED]/g, "")
      .replace(/[أإآءٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه") // Ta Marbutah sering didengar sebagai Ha waktu waqaf
      .replace(/\u0640/g, "");
    // Mampatkan vokal panjang (Madd) cth: جااااء -> جاء
    return clean.replace(/(ا|و|ي)\1+/g, "$1").trim();
  }

  // 4. Enjin Transmutasi Tajwid (G2P)
  static generateWasalPhonetic(word1, word2, isWaqaf = false) {
    let w1 = this.normalize(word1);
    let w2 = this.normalize(word2);
    if (!w1) return w2;
    if (!w2) return w1;

    let w1Chars = w1.split("");
    let lastCharW1 = w1Chars[w1Chars.length - 1];
    let firstCharW2 = w2.charAt(0);

    // HUKUM WAQAF
    if (isWaqaf && (word1.endsWith('ة') || word1.endsWith('ﺔ'))) {
      return w1.slice(0, -1) + 'ه';
    }

    // HUKUM NUN MATI & TANWIN (ن)
    if (lastCharW1 === "ن") {
      let baseW1 = w1.slice(0, -1);
      if (this.hukum.idghamBilaghunnah.includes(firstCharW2)) return `${baseW1}${firstCharW2} ${w2}`;
      if (this.hukum.idghamBighunnah.includes(firstCharW2)) return `${baseW1}${firstCharW2} ${w2}`;
      if (this.hukum.iqlab.includes(firstCharW2)) return `${baseW1}م ${w2}`;
      if (this.hukum.ikhfa.includes(firstCharW2)) return `${baseW1}نغ ${w2}`; // Sengau/Nasal
    }

    // ALIF LAM SHAMSIYAH
    if (w2.startsWith("ال") && w2.length > 2) {
      let thirdChar = w2.charAt(2);
      if (this.hukum.shamsiyah.includes(thirdChar)) return `${w1} ${thirdChar}${w2.slice(2)}`;
    }

    // HAMZAH WASAL
    if (w2.startsWith("ا") && !w2.startsWith("ال")) return `${w1}${w2.slice(1)}`;

    return `${w1} ${w2}`;
  }

  // 5. Acoustic Mapping (Memaafkan ralat pelayar)
  static mapAcoustics(text) {
    let mapped = text;
    for (const [key, value] of Object.entries(this.acousticMap)) {
      const regex = new RegExp(key, 'g');
      mapped = mapped.replace(regex, value);
    }
    return mapped;
  }

  // 6. Fuzzy Match dengan Acoustic Forgiveness
  static getSimilarityScore(s1, s2) {
    let a = this.mapAcoustics(s1);
    let b = this.mapAcoustics(s2);

    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    let matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        let cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    let maxLength = Math.max(a.length, b.length);
    return (maxLength - matrix[b.length][a.length]) / maxLength;
  }

  // 7. Omni-Matcher (Otak Utama - Dynamic Chunking & Backtracking)
  static verifyReading(userSpokenText, currentIndex, wordList) {
    const spoken = userSpokenText.replace(/\s+/g, " ").trim();

    // BACKTRACKING: Jika pengguna ulang ayat sebelumnya (Ibtida')
    if (currentIndex > 0) {
      let prevWord = this.normalize(wordList[currentIndex - 1]);
      if (this.getSimilarityScore(spoken, prevWord) >= 0.75) {
        return { isCorrect: true, advanceBy: -1, mode: "IBTIDA_BACKTRACK" };
      }
    }

    // DYNAMIC FORWARD CHUNKING: Uji 3, 2, dan 1 perkataan serentak
    const maxWindow = Math.min(3, wordList.length - currentIndex);

    for (let window = maxWindow; window >= 1; window--) {
      let chunk = wordList.slice(currentIndex, currentIndex + window);

      let tajweedChain = chunk[0];
      for (let i = 1; i < chunk.length; i++) {
        tajweedChain = this.generateWasalPhonetic(tajweedChain, chunk[i]);
      }

      let targetPhonetic = tajweedChain.replace(/\s+/g, "");
      let spokenNoSpace = spoken.replace(/\s+/g, "");
      let score = this.getSimilarityScore(spokenNoSpace, targetPhonetic);

      if (score >= 0.72) {
        let isWaqaf = (window === 1 && this.generateWasalPhonetic(chunk[0], "", true) === spokenNoSpace);
        return {
          isCorrect: true,
          advanceBy: window,
          mode: isWaqaf ? "WAQAF_MATCH" : `WASAL_${window}_WORDS`
        };
      }
    }

    return { isCorrect: false, advanceBy: 0, mode: "FAILED" };
  }
}

// Export support untuk ES6 / Browser
if (typeof module !== "undefined" && module.exports) {
  module.exports = QuranWasalEngine;
} else {
  window.QuranWasalEngine = QuranWasalEngine;
}
