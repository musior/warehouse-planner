// ─────────────────────────────────────────────────────────────────────────────
// utils.js — pomocnicze funkcje: daty, formatowanie, stringi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Konwertuje serial Excela (np. 46121) lub string "DD.MM.RRRR" na obiekt Date.
 * Zwraca null jeśli nie uda się sparsować.
 */
export function parseExcelDate(value) {
  if (!value && value !== 0) return null;

  const str = String(value).trim();

  // Format DD.MM.RRRR
  const dmyMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  // Serial liczbowy Excela (np. 46121)
  const serial = Number(str);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    // Baza Excela: 1 = 1900-01-01, ale Excel błędnie liczy rok 1900 jako przestępny
    const excelBase = new Date(1899, 11, 30);
    const date = new Date(excelBase.getTime() + serial * 86400000);
    return date;
  }

  return null;
}

/**
 * Formatuje Date do polskiego formatu DD.MM.RRRR
 */
export function formatDate(date) {
  if (!date) return '—';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

/**
 * Formatuje Date do HH:MM
 */
export function formatTime(date) {
  if (!date) return '—';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Konwertuje ułamek doby Excela (np. 0.375) na czas HH:MM
 */
export function excelTimeToHHMM(fraction) {
  if (fraction === null || fraction === undefined || fraction === '') return '—';
  const f = parseFloat(String(fraction).replace(',', '.'));
  if (isNaN(f)) return '—';
  const totalMinutes = Math.round(f * 24 * 60);
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Usuwa wiodący apostrof dodawany przez MixMove (np. "'6145744938" -> "6145744938")
 */
export function stripLeadingApostrophe(value) {
  if (!value) return '';
  return String(value).trim().replace(/^'/, '');
}

/**
 * Zwraca true jeśli dwie daty są tym samym dniem
 */
export function isSameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Zwraca dzisiejszą datę (bez czasu)
 */
export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Zwraca jutrzejszą datę (bez czasu)
 */
export function tomorrow() {
  const d = today();
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Bezpieczna konwersja stringa na liczbę (obsługuje przecinek jako separator dziesiętny)
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  // Usuń non-breaking space (\xa0) i inne niewidoczne znaki przed konwersją
  const str = String(value).replace(/\u00A0/g, '').trim().replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

/**
 * Zaokrągla liczbę do podanej liczby miejsc dziesiętnych
 */
export function round(value, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
