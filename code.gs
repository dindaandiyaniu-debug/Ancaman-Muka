/**
 * FaceThreat Analyzer - Back-End (Google Apps Script)
 * Analisis Ancaman Muka (Face-Threatening Acts) Brown & Levinson (1987)
 * pada ulasan pelanggan daring.
 *
 * CATATAN PENTING:
 * API key TIDAK ditulis di file ini. Simpan di:
 * Project Settings (ikon roda gigi) > Script Properties > nama: OPENROUTER_API_KEY
 */

// ==========================================
// 1. PENGATURAN
// ==========================================
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// Model yang dicoba pertama. "openrouter/free" memilih model gratis yang sedang tersedia.
const MODEL_UTAMA = "openrouter/free";

// Cadangan statis, dipakai hanya bila daftar model gratis tidak bisa diambil otomatis.
const MODEL_CADANGAN = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free"
];

const MAKS_PERCOBAAN_MODEL = 5; // batas jumlah model yang dicoba per analisis
const MAKS_TOKEN = 6000;

// ==========================================
// 2. HALAMAN WEB
// ==========================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("FaceThreat Analyzer")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==========================================
// 3. FUNGSI UTAMA (dipanggil dari index.html)
// ==========================================
function analyzeReview(formData) {
  try {
    const apiKey = ambilApiKey_();
    if (!apiKey) {
      throw new Error(
        "API key belum dipasang. Buka Project Settings > Script Properties, " +
        "lalu tambahkan properti OPENROUTER_API_KEY berisi key dari openrouter.ai/keys."
      );
    }

    if (!formData || !formData.ulasan || !String(formData.ulasan).trim()) {
      throw new Error("Teks ulasan tidak boleh kosong.");
    }

    const platform = String(formData.platform || "Platform e-commerce").trim();
    const kategori = String(formData.kategori || "Produk/jasa umum").trim();
    const ulasan = String(formData.ulasan).trim().substring(0, 4000);

    const prompt = bangunPrompt_(platform, kategori, ulasan);
    const hasil = jalankanDenganCadangan_(apiKey, prompt);
    const data = rapikanHasil_(hasil.data);

    return {
      success: true,
      data: data,
      meta: {
        platform: platform,
        kategori: kategori,
        ulasan: ulasan,
        model: hasil.model,
        waktu: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
      }
    };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

// ==========================================
// 4. API KEY
// ==========================================
function ambilApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty("OPENROUTER_API_KEY");
  return key ? key.trim() : "";
}

// ==========================================
// 5. PROMPT
// ==========================================
function bangunPrompt_(platform, kategori, ulasan) {
  return `Anda adalah ahli pragmatik dan analisis wacana yang menguasai teori kesantunan Brown & Levinson (1987) serta teori tindak tutur Searle. Anda menganalisis ulasan pelanggan daring berbahasa Indonesia, termasuk ragam tidak baku, singkatan, bahasa gaul, dan campur kode.

KERANGKA TEORI
1. FTA terhadap muka positif mitra tutur (penjual/admin), yaitu keinginan dihargai dan diakui kompetensinya:
   - "Kritik & Celah": menilai produk/layanan buruk atau di bawah standar.
   - "Keluhan & Tuduhan": menuduh penjual lalai, lamban, tidak jujur, atau menipu.
   - "Hinaan & Ejekan": kata kasar, sindiran tajam, atau perendahan reputasi toko.
2. FTA terhadap muka negatif mitra tutur, yaitu keinginan bebas dari paksaan dan beban:
   - "Tuntutan & Perintah": menuntut refund, kirim ulang, ganti rugi, atau meminta tindakan.
   - "Peringatan & Ancaman": mengancam melapor, memboikot, atau mengajak orang lain tidak membeli.
3. FTA terhadap muka penutur sendiri:
   - "Pengakuan Kekecewaan/Kerugian": mengakui kerugian, penyesalan, atau menyalahkan diri sendiri.
4. Strategi kesantunan (pilih SATU yang paling dominan):
   - "Bald On-Record": langsung, lugas, tanpa penghalus.
   - "Positive Politeness": menunjukkan keakraban atau menghargai, misalnya memuji dulu, sapaan akrab.
   - "Negative Politeness": penghalus, permintaan maaf, ungkapan tidak memaksa.
   - "Off-Record": sindiran, ironi, sarkasme, atau maksud tersirat.
5. Bobot ancaman muka Wx = D + P + R. Setiap skala bernilai bilangan bulat 1-5 (1 sangat rendah, 5 sangat tinggi):
   - D (jarak sosial): hubungan pembeli dan penjual. Pada e-commerce umumnya tinggi karena anonim.
   - P (kekuasaan relatif): kemampuan pembeli memengaruhi penjual, misalnya lewat rating dan ulasan publik.
   - R (derajat pembebanan): besar kerugian atau beban yang dirasakan/dituntut pembeli.
   Nilailah berdasarkan isi ulasan ini, jangan memberi angka seragam untuk semua ulasan.

ATURAN KETAT
- Setiap "bukti_tuturan" dan "kalimat" harus kutipan PERSIS dari ulasan. Jangan mengarang atau menulis ulang.
- Jika suatu jenis FTA tidak ada, isi "teridentifikasi": false, "subkategori": [], "bukti_tuturan": [], dan jelaskan singkat mengapa tidak ada.
- "subkategori" hanya boleh berisi subkategori yang benar-benar terbukti, bukan semuanya.
- Pecah ulasan menjadi unit tuturan (kalimat atau klausa) di "analisis_unit_tuturan" sampai seluruh ulasan tercakup.
- "tindak_tutur" hanya salah satu dari: Asertif, Direktif, Ekspresif, Komisif, Deklaratif.
- "target_fta" hanya salah satu dari: Muka Positif Penjual, Muka Negatif Penjual, Muka Penutur, Netral.
- Tulis semua penjelasan dalam bahasa Indonesia akademis yang jelas.
- Keluarkan HANYA satu objek JSON valid. Tanpa pengantar, tanpa penutup, tanpa pagar markdown.

DATA ULASAN
Platform: ${platform}
Kategori produk/jasa: ${kategori}
Teks ulasan:
"""
${ulasan}
"""

STRUKTUR JSON (isi dengan hasil analisis Anda; teks dalam <...> adalah petunjuk, bukan isi):
{
  "ringkasan_analisis": "<2-3 kalimat intisari temuan pragmatik>",
  "strategi_kesantunan": {
    "kategori": "<salah satu dari empat strategi>",
    "definisi": "<definisi singkat strategi tersebut>",
    "penjelasan": "<mengapa ulasan ini termasuk strategi tersebut>",
    "indikator_linguistik": ["<kata/frasa persis dari ulasan>"]
  },
  "kategorisasi_fta": {
    "muka_positif_mitratutur": { "teridentifikasi": <true atau false>, "subkategori": ["<...>"], "bukti_tuturan": ["<kutipan>"], "penjelasan": "<analisis>" },
    "muka_negatif_mitratutur": { "teridentifikasi": <true atau false>, "subkategori": ["<...>"], "bukti_tuturan": ["<kutipan>"], "penjelasan": "<analisis>" },
    "muka_penutur_sendiri": { "teridentifikasi": <true atau false>, "subkategori": ["<...>"], "bukti_tuturan": ["<kutipan>"], "penjelasan": "<analisis>" }
  },
  "kalkulasi_bobot_ancaman": {
    "jarak_sosial_D": { "skor": <1-5>, "penjelasan": "<alasan>" },
    "kekuasaan_relatif_P": { "skor": <1-5>, "penjelasan": "<alasan>" },
    "tingkat_imposisi_R": { "skor": <1-5>, "penjelasan": "<alasan>" },
    "total_bobot_Wx": { "interpretasi": "<kesimpulan tingkat keparahan ancaman muka>" }
  },
  "analisis_unit_tuturan": [
    { "kalimat": "<kutipan persis>", "tindak_tutur": "<jenis>", "target_fta": "<target>", "analisis": "<fungsi komunikatif>" }
  ],
  "rekomendasi_respon_pragmatik": "<strategi pemulihan muka untuk penjual saat membalas ulasan ini, sertakan contoh singkat kalimat balasan>"
}`;
}

// ==========================================
// 6. PEMANGGILAN MODEL + CADANGAN OTOMATIS
// ==========================================
function jalankanDenganCadangan_(apiKey, prompt) {
  const daftarModel = susunDaftarModel_(apiKey);
  const catatanGagal = [];

  for (let i = 0; i < daftarModel.length; i++) {
    const model = daftarModel[i];
    try {
      const respons = panggilModel_(apiKey, model, prompt);

      if (respons.kode === 401 || respons.kode === 403) {
        throw new Error(
          "API key ditolak OpenRouter (status " + respons.kode + "). " +
          "Periksa apakah key benar, masih aktif, dan tidak ada spasi tambahan."
        );
      }

      if (respons.kode !== 200) {
        catatanGagal.push(model + ": " + ambilPesanError_(respons.teks, respons.kode));
        continue;
      }

      const json = JSON.parse(respons.teks);
      if (json.error) {
        catatanGagal.push(model + ": " + (json.error.message || "error tidak diketahui"));
        continue;
      }

      const pesan = json.choices && json.choices[0] && json.choices[0].message;
      const isi = pesan && pesan.content ? String(pesan.content) : "";
      if (!isi.trim()) {
        catatanGagal.push(model + ": respons kosong");
        continue;
      }

      return { data: uraikanJson_(isi), model: json.model || model };
    } catch (err) {
      if (/API key ditolak/.test(err.message)) throw err; // tidak ada gunanya coba model lain
      catatanGagal.push(model + ": " + err.message);
    }
  }

  throw new Error(
    "Semua model gagal merespons. Biasanya karena batas pemakaian model gratis tercapai " +
    "atau server sedang sibuk. Coba lagi beberapa menit lagi.\n\nRincian:\n- " +
    catatanGagal.join("\n- ")
  );
}

function panggilModel_(apiKey, model, prompt) {
  // Semua instruksi dijadikan satu pesan "user" agar kompatibel dengan model
  // yang tidak mendukung peran "system".
  const payload = {
    model: model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: MAKS_TOKEN
  };

  const response = UrlFetchApp.fetch(OPENROUTER_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "HTTP-Referer": "https://script.google.com",
      "X-Title": "FaceThreat Analyzer"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  return { kode: response.getResponseCode(), teks: response.getContentText() };
}

/**
 * Menyusun urutan model: model utama, lalu model gratis terbaru dari OpenRouter,
 * lalu cadangan statis. Daftar gratis disimpan di cache 6 jam.
 */
function susunDaftarModel_(apiKey) {
  const gratis = ambilModelGratis_(apiKey);
  const semua = [MODEL_UTAMA].concat(gratis, MODEL_CADANGAN);
  const unik = [];
  semua.forEach(function (m) {
    if (m && unik.indexOf(m) === -1) unik.push(m);
  });
  return unik.slice(0, MAKS_PERCOBAAN_MODEL);
}

function ambilModelGratis_(apiKey) {
  const cache = CacheService.getScriptCache();
  const tersimpan = cache.get("model_gratis");
  if (tersimpan) {
    try { return JSON.parse(tersimpan); } catch (e) {}
  }

  try {
    const response = UrlFetchApp.fetch(OPENROUTER_MODELS_URL, {
      headers: { "Authorization": "Bearer " + apiKey },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) return [];

    const daftar = (JSON.parse(response.getContentText()).data || [])
      .filter(function (m) {
        return m.id && /:free$/.test(m.id) &&
          (!m.architecture || !m.architecture.output_modalities ||
           m.architecture.output_modalities.indexOf("text") !== -1) &&
          !/(vl|vision|image|embed|guard)/i.test(m.id);
      })
      .sort(function (a, b) { return (b.context_length || 0) - (a.context_length || 0); })
      .slice(0, 6)
      .map(function (m) { return m.id; });

    cache.put("model_gratis", JSON.stringify(daftar), 21600);
    return daftar;
  } catch (e) {
    return [];
  }
}

function ambilPesanError_(teks, kode) {
  try {
    const j = JSON.parse(teks);
    if (j.error && j.error.message) return "[" + kode + "] " + j.error.message;
  } catch (e) {}
  return "[" + kode + "] " + String(teks).substring(0, 150);
}

// ==========================================
// 7. PENGOLAHAN HASIL
// ==========================================
function uraikanJson_(teksMentah) {
  let t = String(teksMentah);

  // Buang blok "berpikir" milik model penalaran dan pagar markdown.
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/```(?:json)?/gi, "");

  const awal = t.indexOf("{");
  const akhir = t.lastIndexOf("}");
  if (awal === -1 || akhir <= awal) {
    throw new Error("Respons model tidak mengandung JSON. Awal respons: " + t.substring(0, 150));
  }
  t = t.substring(awal, akhir + 1);

  try {
    return JSON.parse(t);
  } catch (e1) {
    // Perbaikan ringan: koma berlebih sebelum } atau ]
    try {
      return JSON.parse(t.replace(/,\s*([}\]])/g, "$1"));
    } catch (e2) {
      throw new Error("JSON dari model tidak valid (mungkin terpotong). Awal respons: " + t.substring(0, 150));
    }
  }
}

/**
 * Melengkapi bagian yang hilang dan menghitung ulang Wx dengan rumus D + P + R
 * agar angka total selalu konsisten (tidak bergantung pada hitungan model).
 */
function rapikanHasil_(d) {
  d = d || {};
  const fta = d.kategorisasi_fta || {};
  ["muka_positif_mitratutur", "muka_negatif_mitratutur", "muka_penutur_sendiri"].forEach(function (k) {
    const b = fta[k] || {};
    fta[k] = {
      teridentifikasi: b.teridentifikasi === true,
      subkategori: Array.isArray(b.subkategori) ? b.subkategori : [],
      bukti_tuturan: Array.isArray(b.bukti_tuturan) ? b.bukti_tuturan : [],
      penjelasan: b.penjelasan || ""
    };
  });
  d.kategorisasi_fta = fta;

  const bobot = d.kalkulasi_bobot_ancaman || {};
  const skala = function (kunci) {
    const b = bobot[kunci] || {};
    const skor = Math.min(5, Math.max(1, Math.round(Number(b.skor)) || 3));
    return { skor: skor, level: levelSkala_(skor), penjelasan: b.penjelasan || "" };
  };
  const D = skala("jarak_sosial_D");
  const P = skala("kekuasaan_relatif_P");
  const R = skala("tingkat_imposisi_R");
  const total = D.skor + P.skor + R.skor;
  const wx = bobot.total_bobot_Wx || {};
  d.kalkulasi_bobot_ancaman = {
    jarak_sosial_D: D,
    kekuasaan_relatif_P: P,
    tingkat_imposisi_R: R,
    total_bobot_Wx: {
      skor_total: total,
      level: total <= 6 ? "Rendah" : (total <= 10 ? "Sedang" : "Tinggi"),
      interpretasi: wx.interpretasi || ""
    }
  };

  d.strategi_kesantunan = d.strategi_kesantunan || {};
  d.strategi_kesantunan.indikator_linguistik = d.strategi_kesantunan.indikator_linguistik || [];
  d.analisis_unit_tuturan = Array.isArray(d.analisis_unit_tuturan) ? d.analisis_unit_tuturan : [];
  d.ringkasan_analisis = d.ringkasan_analisis || "";
  d.rekomendasi_respon_pragmatik = d.rekomendasi_respon_pragmatik || "";
  return d;
}

function levelSkala_(skor) {
  return skor <= 2 ? "Rendah" : (skor === 3 ? "Sedang" : "Tinggi");
}

// ==========================================
// 8. UJI COBA (jalankan sekali dari editor untuk memberi izin & mengecek)
// ==========================================
function ujiCoba() {
  const hasil = analyzeReview({
    platform: "Shopee",
    kategori: "Fashion",
    ulasan: "Penjual lambat banget, barang datang rusak. Kecewa berat! Pokoknya kembalikan uang saya atau saya laporkan ke Shopee."
  });
  Logger.log(JSON.stringify(hasil, null, 2));
}
