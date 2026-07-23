// ─────────────────────────────────────────────────────────────────────────────
// parsersOutbound.js — parsowanie plików wsadowych Outbound (Forecast 3M / Solventum)
// ─────────────────────────────────────────────────────────────────────────────

export const FORECAST_REQUIRED_COLS = [
  'EXPECTED_SHIP_DATE',
  'LINE_STATUS',
  'OBD',
  'NAME_COUNTRY',
  'VAS',
];

/**
 * Parsuje plik Forecast (CSV) — struktura wspólna dla 3M i Solventum.
 * Format delimitera i kodowania jest auto-wykrywany (pliki mogą różnić się
 * eksportem: przecinek/średnik/tabulator, UTF-8/UTF-16).
 */
export function parseForecastCsv(buffer, filename) {
  const text = decodeCsvBuffer(buffer);
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error(`Pusty plik: ${filename}`);
  }

  const delimiter = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delimiter).map(h => h.trim().toUpperCase());

  const colIndex = {};
  for (const col of FORECAST_REQUIRED_COLS) {
    const idx = header.indexOf(col);
    if (idx === -1) {
      throw new Error(`Brak wymaganej kolumny "${col}" w pliku ${filename}`);
    }
    colIndex[col] = idx;
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const rawShipDate = cells[colIndex.EXPECTED_SHIP_DATE];
    rows.push({
      expectedShipDate:    parseForecastDate(rawShipDate),
      rawExpectedShipDate: rawShipDate,   // zachowane do diagnostyki
      lineStatus:          (cells[colIndex.LINE_STATUS] || '').trim(),
      obd:                 (cells[colIndex.OBD] || '').trim(),
      nameCountry:         (cells[colIndex.NAME_COUNTRY] || '').trim(),
      vas:                 (cells[colIndex.VAS] || '').trim(),
    });
  }
  return rows;
}

// ── Wykrywanie kodowania / delimitera ─────────────────────────────────────────

function decodeCsvBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.slice(3));
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function detectDelimiter(headerLine) {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

function splitCsvLine(line, delimiter) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── Parsowanie daty ───────────────────────────────────────────────────────────

function parseForecastDate(raw) {
  if (!raw) return null;
  const str = String(raw).trim();

  // ISO: YYYY-MM-DD (opcjonalnie z częścią czasową)
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // YYYYMMDD bez separatorów (np. 20260717)
  m = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // DD.MM.YYYY lub DD/MM/YYYY (opcjonalnie z częścią czasową)
  m = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  // Fallback — natywny parser Date
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
