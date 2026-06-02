/**
 * Boyer-Moore String Matching Algorithm
 * Fungsi untuk mencari pattern dalam text dengan algoritma Boyer-Moore
 * @param {string} text - Text yang akan dicari
 * @param {string} pattern - Pattern yang dicari
 * @returns {boolean} - True jika pattern ditemukan dalam text
 */
function boyerMoore(text, pattern) {
  if (!text || !pattern || pattern.length > text.length) {
    return false;
  }

  const n = text.length;
  const m = pattern.length;

  // Build the bad character table
  const badChar = {};

  for (let i = 0; i < m; i++) {
    badChar[pattern[i]] = i;
  }

  let s = 0; // s is shift of the pattern with respect to text

  while (s <= n - m) {
    let j = m - 1;

    // Keep reducing j while characters of pattern and text are matching at this shift s
    while (j >= 0 && pattern[j] === text[s + j]) {
      j--;
    }

    // If the pattern is found at shift s, then return the shift for first occurrence
    if (j < 0) {
      return true;
    }

    // Shift the pattern so that the next character in text aligns with
    // the last occurrence of it in pattern.
    // The condition s+m < n is necessary to make sure that we compare
    // when the characters is within the limits of the pattern
    s += Math.max(1, j - (badChar[text[s + j]] ?? -1));
  }

  return false;
}

module.exports = boyerMoore;