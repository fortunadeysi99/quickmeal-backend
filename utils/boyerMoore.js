/**
 * Boyer-Moore String Matching Algorithm
 * @param {string} text 
 * @param {string} pattern 
 * @returns {object} hasil pencarian + steps + ringkasan pergeseran
 */
function buildBadCharacterTable(pattern) {
  const table = {};
  for (let i = 0; i < pattern.length; i += 1) {
    table[pattern[i]] = i;
  }
  return table;
}

function boyerMooreSearchWithSteps(text, pattern) {
  const normalizedText = String(text || "").toLowerCase();
  const normalizedPattern = String(pattern || "").toLowerCase();

  if (!normalizedPattern) {
    return {
      found: false,
      position: -1,
      steps: ["1. Pola kosong, pencarian tidak dapat dilakukan."],
      shiftSummary: []
    };
  }

  if (normalizedPattern.length > normalizedText.length) {
    return {
      found: false,
      position: -1,
      steps: ["1. Pola lebih panjang dari teks, pencarian tidak dapat dilakukan."],
      shiftSummary: []
    };
  }

  const badChar = buildBadCharacterTable(normalizedPattern);
  const steps = [
    `1. Teks awal: "${normalizedText}"`,
    `2. Pola awal: "${normalizedPattern}"`,
    `3. Tabel bad character: ${Object.entries(badChar)
      .map(([char, index]) => `${char} -> ${index}`).join(", ")}`,
  ];

  const shiftSummary = []; // ← Ringkasan Pergeseran Baru

  const n = normalizedText.length;
  const m = normalizedPattern.length;
  let shift = 0;
  let attempt = 1;

  while (shift <= n - m) {
    steps.push(`4. Memeriksa pergeseran ${shift} (Percobaan ${attempt}).`);
    
    let j = m - 1;  // m = panjang pola
    let isMatch = true;

    while (j >= 0 && normalizedPattern[j] === normalizedText[shift + j]) {
      steps.push(`   - Cocok: karakter pola[${j}] = '${normalizedPattern[j]}'`);
      j--;
    }

    if (j < 0) {
      steps.push(`5. Pencocokan BERHASIL pada posisi ${shift}.`);
      
      shiftSummary.push({
        attempt,
        startPosition: shift,
        mismatchChar: "-",
        shiftValue: "-",
        category: "Cocok"
      });

      return {
        found: true,
        position: shift,
        steps,
        shiftSummary
      };
    }

    const mismatchChar = normalizedText[shift + j];
    const lastIndex = badChar[mismatchChar] ?? -1;
    const nextShift = Math.max(1, j - lastIndex);

    // Kategori seperti di DOCX kamu
    let category = nextShift <= 2 ? "Pendek" : nextShift <= 4 ? "Sedang" : "Panjang";

    steps.push(`5. Mismatch pada karakter "${mismatchChar}" (j=${j})`);
    steps.push(`   - BC('${mismatchChar}') = ${lastIndex}`);
    steps.push(`   - Shift = max(1, ${j} - ${lastIndex}) = ${nextShift} (${category})`);

    // Tambahkan ke ringkasan
    shiftSummary.push({
      attempt,
      startPosition: shift,
      mismatchChar: mismatchChar || "(spasi)",
      shiftValue: nextShift,
      category
    });

    shift += nextShift;
    attempt++;
  }

  steps.push("6. Semua pergeseran selesai, pola tidak ditemukan.");
  
  shiftSummary.push({
    attempt,
    startPosition: shift,
    mismatchChar: "-",
    shiftValue: "-",
    category: "Tidak Ditemukan"
  });

  return {
    found: false,
    position: -1,
    steps,
    shiftSummary
  };
}

function boyerMoore(text, pattern) {
  return boyerMooreSearchWithSteps(text, pattern).found;
}

module.exports = boyerMoore;
module.exports.boyerMooreSearchWithSteps = boyerMooreSearchWithSteps;