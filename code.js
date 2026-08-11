/**
 * code.js — Google Apps Script (backend PERCUMA)
 *
 * Cara guna:
 * 1. Buka https://script.google.com > New Project > tampal kod ini.
 * 2. Deploy > New deployment > Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 3. Salin URL /exec dan letak dalam BACKEND_URL di index.html.
 *
 * Endpoint:
 *   GET ?                      -> semua surah
 *   GET ?surah=112             -> satu surah sahaja
 *   GET ?surah=112&ayah=1      -> satu ayat sahaja
 *   GET ?callback=fn           -> JSONP (jika perlu)
 */

function getQuranData() {
  return [
    {
      surah: 1,
      name: "Al-Fatihah",
      ayat: [
        "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
        "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
        "الرَّحْمَٰنِ الرَّحِيمِ",
        "مَالِكِ يَوْمِ الدِّينِ",
        "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
        "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ",
        "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ"
      ]
    },
    {
      surah: 108,
      name: "Al-Kauthar",
      ayat: [
        "إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ",
        "فَصَلِّ لِرَبِّكَ وَانْحَرْ",
        "إِنَّ شَانِئَكَ هُوَ الْأَبْتَرُ"
      ]
    },
    {
      surah: 112,
      name: "Al-Ikhlas",
      ayat: [
        "قُلْ هُوَ اللَّهُ أَحَدٌ",
        "اللَّهُ الصَّمَدُ",
        "لَمْ يَلِدْ وَلَمْ يُولَدْ",
        "وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ"
      ]
    },
    {
      surah: 113,
      name: "Al-Falaq",
      ayat: [
        "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ",
        "مِن شَرِّ مَا خَلَقَ",
        "وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ",
        "وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ",
        "وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ"
      ]
    },
    {
      surah: 114,
      name: "An-Nas",
      ayat: [
        "قُلْ أَعُوذُ بِرَبِّ النَّاسِ",
        "مَلِكِ النَّاسِ",
        "إِلَٰهِ النَّاسِ",
        "مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ",
        "الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ",
        "مِنَ الْجِنَّةِ وَالنَّاسِ"
      ]
    }
  ];
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  var data = getQuranData();
  var payload;

  try {
    if (params.surah) {
      var s = data.filter(function (x) { return String(x.surah) === String(params.surah); })[0];
      if (!s) throw new Error("Surah tidak dijumpai: " + params.surah);

      if (params.ayah) {
        var i = parseInt(params.ayah, 10) - 1;
        if (isNaN(i) || i < 0 || i >= s.ayat.length) throw new Error("Ayat tidak sah: " + params.ayah);
        payload = { ok: true, surah: s.surah, name: s.name, ayah: i + 1, text: s.ayat[i] };
      } else {
        payload = { ok: true, data: [s] };
      }
    } else {
      payload = { ok: true, count: data.length, data: data };
    }
  } catch (err) {
    payload = { ok: false, error: String(err.message || err) };
  }

  var json = JSON.stringify(payload);

  if (params.callback) {
    return ContentService
      .createTextOutput(params.callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
