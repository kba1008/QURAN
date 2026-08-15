/* =====================================================================
   QuranWasalEngine v3 — "Continuous Phoneme Stream Alignment"
   ---------------------------------------------------------------------
   Pendekatan baharu (tidak bergantung kepada pemisahan perkataan STT):

   1) Seluruh ayat ditukar menjadi SATU aliran fonem bersambung mengikut
      hukum wasal/tajwid (nun sakinah, iqlab, idgham, alif-lam shamsiyah,
      hamzah wasal, idgham mutamathilain, mad).
   2) Bacaan pengguna juga ditukar menjadi aliran fonem — ruang dibuang
      sepenuhnya, jadi kesilapan pelayar memecah/menggabung perkataan
      tidak lagi menjejaskan semakan.
   3) Kedua-dua aliran dijajarkan dengan Smith–Waterman (local alignment)
      + affine gap + matriks kekeliruan akustik berpemberat. Ini seperti
      penjajaran DNA: bacaan bersambung, mad panjang, sisipan/gugur huruf
      semuanya dimaafkan secara berkadar, bukan lulus/gagal.
   4) Setiap fonem sasaran tahu ia milik perkataan mana (peta owner),
      jadi hasil penjajaran ditukar semula kepada skor setiap perkataan
      dan kedudukan kursor baharu.
   ===================================================================== */

class QuranWasalEngine {
  /* ---------- 1. Kekeliruan akustik (STT pelayar) ---------- */
  static acousticMap = {
    'ص': 'س', 'ث': 'س', 'ض': 'د', 'ظ': 'د', 'ذ': 'د',
    'ط': 'ت', 'ع': 'ا', 'ح': 'ه', 'خ': 'ه', 'ق': 'ك', 'غ': 'ر'
  };

  /* Kelas bunyi: huruf dalam kelas sama = hampir betul (STT kerap tertukar) */
  static classes = [
    ['س','ص','ث','ز'], ['د','ض','ذ','ظ','ط','ت'], ['ك','ق'],
    ['ه','ح','خ'], ['ا','ع','ء','ي','و'], ['ر','غ'], ['ن','م'],
    ['ب','م'], ['ج','ش'], ['ل','ر'], ['ف','و']
  ];
  static _classIndex = null;
  static classOf(ch) {
    if (!this._classIndex) {
      this._classIndex = {};
      this.classes.forEach((grp, gi) => grp.forEach(c => {
        (this._classIndex[c] = this._classIndex[c] || []).push(gi);
      }));
    }
    return this._classIndex[ch] || [];
  }
  static nearSound(a, b) {
    if (a === b) return true;
    const A = this.classOf(a), B = this.classOf(b);
    return A.some(g => B.includes(g));
  }

  static hukum = {
    idghamBighunnah: ['ي', 'ن', 'م', 'و'],
    idghamBilaghunnah: ['ر', 'ل'],
    iqlab: ['ب'],
    ikhfa: ['ت','ث','ج','د','ذ','ز','س','ش','ص','ض','ط','ظ','ف','ق','ك'],
    shamsiyah: ['ت','ث','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ل','ن']
  };

  /* ---------- 2. Normalisasi ---------- */
  static normalize(text) {
    if (!text) return "";
    let clean = String(text)
      .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED\u06DF-\u06E8\u06EA-\u06ED]/g, "")
      .replace(/[أإآءٱٲٳ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\u0640/g, "")
      .replace(/[^\u0621-\u064A\s]/g, " ");
    return clean.replace(/(ا|و|ي)\1+/g, "$1").replace(/\s+/g, " ").trim();
  }

  static mapAcoustics(text) {
    let mapped = text;
    for (const [k, v] of Object.entries(this.acousticMap)) mapped = mapped.split(k).join(v);
    return mapped;
  }

  /* ---------- 3. Aliran fonem sasaran (dengan peta pemilik perkataan) ---------- */
  /* Menghasilkan { seq: "…", owner: [idxPerkataan, …] } */
  static buildStream(wordList, from, to) {
    const seq = [];
    const owner = [];
    const push = (chars, wIdx) => {
      for (const ch of chars) { seq.push(ch); owner.push(wIdx); }
    };

    for (let w = from; w < to; w++) {
      let cur = this.normalize(wordList[w]).replace(/\s+/g, "");
      if (!cur) continue;
      const nextRaw = (w + 1 < to) ? this.normalize(wordList[w + 1]).replace(/\s+/g, "") : "";

      /* Alif-lam shamsiyah pada perkataan SEMASA: ال + huruf syamsiah -> huruf digandakan */
      if (cur.startsWith("ال") && cur.length > 2 && this.hukum.shamsiyah.includes(cur.charAt(2))) {
        cur = (w === from ? "ا" : "") + cur.slice(2);
      }
      /* Hamzah wasal di tengah bacaan: gugur bila bersambung */
      if (w > from && cur.startsWith("ا") && !cur.startsWith("ال") && cur.length > 1) {
        cur = cur.slice(1);
      }

      if (nextRaw) {
        const nx = nextRaw.charAt(0);
        /* Nun sakinah / tanwin */
        if (cur.endsWith("ن") && cur.length > 1) {
          if (this.hukum.idghamBilaghunnah.includes(nx) || this.hukum.idghamBighunnah.includes(nx)) {
            cur = cur.slice(0, -1);              // idgham: nun larut ke huruf seterusnya
          } else if (this.hukum.iqlab.includes(nx)) {
            cur = cur.slice(0, -1) + "م";        // iqlab
          } else if (this.hukum.ikhfa.includes(nx)) {
            cur = cur.slice(0, -1) + "ن";        // ikhfa: dengung ringan
          }
        }
      }

      /* Idgham mutamathilain: huruf akhir sama dengan huruf awal berikut */
      if (seq.length && seq[seq.length - 1] === cur.charAt(0)) cur = cur.slice(1);

      if (!cur) { push(this.normalize(wordList[w]).charAt(0) || "ا", w); continue; }
      push(cur, w);
    }
    return { seq: seq.join(""), owner };
  }

  /* ---------- 4. Matriks skor + MEMORI ADAPTIF (otak AI di peranti) ----------
     App belajar kekeliruan STT khusus untuk suara & peranti pengguna.
     Setiap kali penjajaran berjaya, pasangan huruf yang kerap bertukar
     diberi pemberat lebih baik, jadi semakan menjadi makin pintar. */
  static MEM_KEY = "tasmi-ai-acoustic-v1";
  static _mem = null;
  static mem() {
    if (this._mem) return this._mem;
    this._mem = {};
    try {
      const raw = (typeof localStorage !== "undefined") && localStorage.getItem(this.MEM_KEY);
      if (raw) this._mem = JSON.parse(raw) || {};
    } catch (_) { this._mem = {}; }
    return this._mem;
  }
  static _memDirty = false;
  static learnPair(a, b) {
    if (!a || !b || a === b) return;
    const k = a < b ? a + b : b + a;
    const m = this.mem();
    m[k] = Math.min(20, (m[k] || 0) + 1);
    this._memDirty = true;
  }
  static saveMemory() {
    if (!this._memDirty) return;
    try { localStorage.setItem(this.MEM_KEY, JSON.stringify(this.mem())); } catch (_) {}
    this._memDirty = false;
  }
  static memBonus(a, b) {
    const k = a < b ? a + b : b + a;
    const n = this.mem()[k] || 0;
    if (!n) return 0;
    return Math.min(1.6, 0.35 * Math.log2(1 + n));   // makin kerap, makin dimaafkan
  }

  static sub(a, b) {
    if (a === b) return 2.2;
    if (this.mapAcoustics(a) === this.mapAcoustics(b)) return 1.7;
    if (this.nearSound(a, b)) return 1.0 + this.memBonus(a, b) * 0.5;
    const bonus = this.memBonus(a, b);
    return bonus ? Math.min(1.2, -1.6 + bonus * 1.9) : -1.6;
  }
  static GAP_OPEN = -2.0;
  static GAP_EXT = -0.45;              // mad / sisipan panjang murah

  /* ---------- 5. Smith–Waterman (affine gap) ---------- */
  static align(spoken, target) {
    const n = spoken.length, m = target.length;
    if (!n || !m) return null;
    const NEG = -1e9;
    // M = padanan, X = gap dalam target (sisipan pengguna), Y = gap dalam spoken (gugur)
    let Mp = new Float64Array(m + 1), Xp = new Float64Array(m + 1), Yp = new Float64Array(m + 1);
    Xp.fill(NEG); Yp.fill(NEG);
    const ptr = new Uint8Array((n + 1) * (m + 1));   // 0 stop,1 diag,2 up(X),3 left(Y)
    let best = 0, bi = 0, bj = 0;

    for (let i = 1; i <= n; i++) {
      const Mc = new Float64Array(m + 1), Xc = new Float64Array(m + 1), Yc = new Float64Array(m + 1);
      Xc.fill(NEG); Yc.fill(NEG); Mc[0] = 0;
      const sa = spoken.charAt(i - 1);
      for (let j = 1; j <= m; j++) {
        const s = this.sub(sa, target.charAt(j - 1));
        const diag = Math.max(Mp[j - 1], Xp[j - 1], Yp[j - 1], 0) + s;
        Mc[j] = Math.max(0, diag);
        Xc[j] = Math.max(Mp[j] + this.GAP_OPEN, Xp[j] + this.GAP_EXT);      // makan huruf spoken
        Yc[j] = Math.max(Mc[j - 1] + this.GAP_OPEN, Yc[j - 1] + this.GAP_EXT); // makan huruf target
        let bestVal = Mc[j], code = 1;
        if (Xc[j] > bestVal) { bestVal = Xc[j]; code = 2; }
        if (Yc[j] > bestVal) { bestVal = Yc[j]; code = 3; }
        if (bestVal <= 0) code = 0;
        ptr[i * (m + 1) + j] = code;
        if (Mc[j] > best) { best = Mc[j]; bi = i; bj = j; }
      }
      Mp = Mc; Xp = Xc; Yp = Yc;
    }
    if (!best) return null;

    // Traceback ringkas untuk kutip padanan setiap posisi target
    const matched = new Float64Array(m);
    const confusions = [];
    let i = bi, j = bj, startJ = bj;
    let guard = (n + m) * 2;
    while (i > 0 && j > 0 && guard-- > 0) {
      const code = ptr[i * (m + 1) + j];
      if (code === 0) break;
      if (code === 1) {
        const sa = spoken.charAt(i - 1), tb = target.charAt(j - 1);
        const s = this.sub(sa, tb);
        if (s > 0) { matched[j - 1] = s / 2.2; if (sa !== tb) confusions.push([sa, tb]); }
        startJ = j; i--; j--;
      } else if (code === 2) { i--; }
      else { startJ = j; j--; }
    }
    return { score: best, endJ: bj, startJ: Math.max(1, startJ), matched, confusions };
  }

  /* ---------- 6. API utama: penjajaran bacaan bersambung ---------- */
  /*  spokenText : teks mentah daripada STT (boleh banyak perkataan)
      wordList   : array perkataan ayat (tanpa baris pun boleh)
      cursor     : kedudukan semasa
      opts.floor : had undur paling awal (cth. selepas Bismillah)          */
  static alignWindow(spokenText, wordList, cursor, opts = {}) {
    const floor = Math.max(0, opts.floor || 0);
    const spoken = this.normalize(spokenText).replace(/\s+/g, "");
    if (spoken.length < 2 || !wordList || !wordList.length) return null;

    const from = Math.max(floor, cursor - (opts.back == null ? 8 : opts.back));
    const to = Math.min(wordList.length, cursor + (opts.ahead == null ? 24 : opts.ahead));
    if (to <= from) return null;

    const T = this.buildStream(wordList, from, to);
    if (!T.seq) return null;

    const al = this.align(spoken, T.seq);
    if (!al) return null;

    /* Skor setiap perkataan = purata padanan fonemnya */
    const tot = {}, hit = {};
    for (let k = 0; k < T.owner.length; k++) {
      const w = T.owner[k];
      tot[w] = (tot[w] || 0) + 1;
      hit[w] = (hit[w] || 0) + (al.matched[k] || 0);
    }
    const startWord = T.owner[al.startJ - 1];
    const endWord = T.owner[al.endJ - 1];

    const wordScores = {};
    for (let w = startWord; w <= endWord; w++) {
      if (!tot[w]) continue;
      wordScores[w] = hit[w] / tot[w];
    }

    /* Perkataan terakhir mungkin separuh dituturkan — jangan sahkan penuh */
    const lastFull = wordScores[endWord] >= 0.75;
    const advanceTo = lastFull ? endWord + 1 : endWord;

    const covered = al.endJ - al.startJ + 1;
    const confidence = Math.min(1, (al.score / (spoken.length * 2.2)) * 0.6 + (covered / Math.max(covered, spoken.length)) * 0.4);

    return {
      startWord, endWord, advanceTo, wordScores, confidence,
      coveredChars: covered, spokenChars: spoken.length, score: al.score,
      confusions: al.confusions || [],
      norm: al.score / Math.max(1, spoken.length * 2.2),
      windowFrom: from, windowTo: to
    };
  }

  /* ---------- 6b. PENGESAN SAMBUNGAN & ULANG-BACA (bacaan wasal) ----------
     Pembaca kerap mengulang beberapa perkataan SEBELUM perkataan yang salah,
     kemudian menyambung (wasal) melepasi perkataan itu. Kami mencuba beberapa
     jendela penjajaran (dari kursor, undur sederhana, dan undur penuh sehingga
     awal ayat) lalu memilih penjajaran terbaik. Ini membolehkan app faham
     bahawa bacaan itu SATU aliran bersambung, bukan perkataan terasing. */
  static alignReading(spokenText, wordList, cursor, opts = {}) {
    const floor = Math.max(0, opts.floor || 0);
    const fullBack = Math.max(0, cursor - floor);
    const backs = [...new Set([
      opts.back == null ? 8 : opts.back,
      Math.min(4, fullBack),
      Math.min(12, fullBack),
      fullBack
    ])].filter(b => b >= 0).sort((a, b) => a - b);

    let best = null;
    for (const back of backs) {
      const r = this.alignWindow(spokenText, wordList, cursor, { ...opts, back });
      if (!r) continue;
      /* Pilih penjajaran yang paling menyeluruh (liputan fonem) dan paling tepat */
      const spokenLen = r.spokenChars || 1;
      const cover = r.coveredChars / spokenLen;
      const quality = r.norm * 0.65 + Math.min(1, cover) * 0.35;
      r._q = quality;
      if (!best || quality > best._q + 0.02 ||
          (Math.abs(quality - best._q) <= 0.02 && r.advanceTo > best.advanceTo)) best = r;
    }
    if (!best) return null;

    best.isBacktrack = best.startWord < cursor;
    /* Perkataan pertama yang BELUM selesai dalam liputan bacaan ini */
    const pending = opts.isDone;
    let resumeWord = -1;
    if (typeof pending === "function") {
      for (let w = best.startWord; w <= best.endWord; w++) {
        if (!pending(w)) { resumeWord = w; break; }
      }
    }
    best.resumeWord = resumeWord;
    /* Belajar daripada penjajaran yang yakin: kemas kini memori akustik */
    if (best.confidence >= 0.62 && best.confusions) {
      for (const [a, b] of best.confusions) this.learnPair(a, b);
    }
    if (best.confidence >= 0.55) this.saveMemory();
    return best;
  }

  /* ---------- 7. Keserasian API lama (index.html) ---------- */
  static removeTashkeel(text) { return this.normalize(text); }

  static getSimilarityScore(s1, s2) {
    const a = this.mapAcoustics(this.normalize(s1)).replace(/\s+/g, "");
    const b = this.mapAcoustics(this.normalize(s2)).replace(/\s+/g, "");
    if (a === b) return a ? 1 : 0;
    if (!a.length || !b.length) return 0;
    let prev = new Array(a.length + 1);
    for (let j = 0; j <= a.length; j++) prev[j] = j;
    for (let i = 1; i <= b.length; i++) {
      const cur = [i];
      for (let j = 1; j <= a.length; j++) {
        const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : (this.nearSound(b.charAt(i - 1), a.charAt(j - 1)) ? 0.4 : 1);
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return Math.max(0, (Math.max(a.length, b.length) - prev[a.length]) / Math.max(a.length, b.length));
  }
  static calculateSimilarity(a, b) { return this.getSimilarityScore(a, b); }

  static generateWasalPhonetic(word1, word2, isWaqaf = false) {
    if (isWaqaf || !word2) {
      const w = this.normalize(word1);
      return w;
    }
    const st = this.buildStream([word1, word2], 0, 2);
    return st.seq;
  }

  static wasalVariants(word1, word2) {
    return this.wasalChainVariants([word1, word2]);
  }

  /* Variasi bacaan bersambung untuk rantaian 2 perkataan atau lebih.
     - bentuk berpisah (waqaf pada setiap perkataan)
     - bentuk cantum tanpa hukum (STT kerap menulis begini)
     - bentuk fonem wasal penuh mengikut hukum tajwid (buildStream)
     - bentuk wasal separa: hukum antara pasangan berjiran sahaja */
  static wasalChainVariants(list) {
    const src = (list || []).filter(Boolean);
    if (src.length < 2) return [];
    const clean = src.map(w => this.normalize(w).replace(/\s+/g, "")).filter(Boolean);
    if (clean.length < 2) return [];
    const out = [clean.join(" "), clean.join("")];
    out.push(this.buildStream(src, 0, src.length).seq);
    let partial = "";
    for (let i = 0; i < src.length - 1; i++) {
      const pair = this.buildStream([src[i], src[i + 1]], 0, 2).seq;
      partial = partial ? (partial + pair.slice(clean[i].length)) : pair;
    }
    out.push(partial);
    return [...new Set(out.map(v => (v || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
  }


  /* Kekal untuk keserasian: pengesahan pendek berasaskan penjajaran */
  static verifyReading(userSpokenText, currentIndex, wordList) {
    const r = this.alignReading(userSpokenText, wordList, currentIndex, { back: 2, ahead: 6 });
    if (!r || r.confidence < 0.5) return { isCorrect: false, advanceBy: 0, mode: "FAILED" };
    const adv = r.advanceTo - currentIndex;
    if (adv <= 0) {
      return r.startWord < currentIndex
        ? { isCorrect: true, advanceBy: r.startWord - currentIndex, mode: "IBTIDA_BACKTRACK" }
        : { isCorrect: false, advanceBy: 0, mode: "FAILED" };
    }
    return { isCorrect: true, advanceBy: adv, mode: `WASAL_${adv}_WORDS` };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = QuranWasalEngine;
} else if (typeof window !== "undefined") {
  window.QuranWasalEngine = QuranWasalEngine;
}
