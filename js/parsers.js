// ─────────────────────────────────────────────────────────────────────────────
// parsers.js — parsowanie plików SSCC (CSV UTF-16LE) oraz Awizacje (XLSX)
// ─────────────────────────────────────────────────────────────────────────────

import { stripLeadingApostrophe, parseExcelDate, excelTimeToHHMM, toNumber } from './utils.js';

// ── Stałe ────────────────────────────────────────────────────────────────────

const SSCC_SEPARATOR = ';';

// ── Parser SSCC CSV ───────────────────────────────────────────────────────────

/**
 * Parsuje plik SSCC CSV z MixMove Match (UTF-16LE bez BOM, separator ";").
 *
 * Struktura pliku:
 *   - Nagłówek: 57 kolumn (linia 0)
 *   - Dane: 58 kolumn (linia 1+) — jedna pusta kolumna na końcu, ignorowana
 *   - Kolumny 0–56 w danych odpowiadają dokładnie nagłówkowi
 *
 * Kluczowe kolumny:
 *   SSCC                → numer SSCC opakowania (z apostrofem: '040018956...)
 *   PackageTypeCode     → typ: BX (karton) | PE (paleta) | inne
 *   ParentSSCC          → SSCC palety-rodzica (gdy BX należy do palety)
 *   ParentPackageTypeCode → typ rodzica
 *   LicensePlate        → rejestracja auta (np. KLIWT97)  ← nie "Truck"!
 *   Truck               → barcode etykiety transportowej  ← nie rejestracja!
 *   TruckIdentification → numer SIS (klucz łączący z awizacjami)
 *   BusinessShipper     → źródło np. "DE Juechen EDC"     ← nie "CU_LU"!
 *   CU_LU               → liczba (ratio), nie używamy
 *
 * @param {ArrayBuffer} buffer
 * @returns {SSCCRow[]}
 */
export function parseSSCCCsv(buffer) {
  return _parseSSCCBase(buffer);
}

/**
 * Parsuje plik SSCC Outbound CSV.
 *
 * Struktura: jak Inbound (59 nagłówków, 60 kolumn danych, ostatnia pusta),
 * ale z innymi kolumnami. Nowe kolumny vs Inbound:
 *   WaveId, GINC, AWB, Lane, Location, ProdSufix, ParcelCarrierTracking,
 *   PreSortScanDateTime, ReconstructedScanDateTime, FinishedScanDateTime
 *
 * Kluczowe dla procesów:
 *   Lane              → kod ścieżki sortowania (np. "20KP", "PLP", "CDCZ")
 *                       Lane Typ "DG" w DAX = Customer_Ship_To = "PL Dabrowa Hub"
 *   TaskCloseDate     → wypełniony gdy pozycja zamknięta (zakończona)
 *   TruckIdentification → SIS — klucz łączący z awizacjami (jak w Inbound)
 *   EffectiveArrival  → data przybycia (w Outbound jest WYPEŁNIONY — auto już na miejscu)
 */
export function parseSSCCOutboundCsv(buffer) {
  return _parseSSCCBase(buffer, { isOutbound: true });
}

/**
 * Wspólna logika parsowania dla Inbound i Outbound.
 * Nagłówki są wczytywane dynamicznie — kolumny specyficzne dla Outbound
 * (Lane, TaskCloseDate) są automatycznie odczytywane gdy istnieją.
 */
function _parseSSCCBase(buffer, options = {}) {
  const decoder = new TextDecoder('unicode');
  const text    = decoder.decode(buffer);
  const lines   = text.split('\r\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(SSCC_SEPARATOR);
  const idxMap  = new Map();
  headers.forEach((h, i) => idxMap.set(h.trim(), i));

  const get = (cols, name) => {
    const idx = idxMap.get(name);
    return (idx !== undefined && idx < cols.length) ? (cols[idx] || '').trim() : '';
  };

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(SSCC_SEPARATOR);
    if (cols.length < 50) continue;

    const row = {
      // Nadawca
      shipper:              get(cols, 'Shipper'),

      // SSCC i hierarchia
      ssccNumber:           stripLeadingApostrophe(get(cols, 'SSCC')),
      packageTypeCode:      get(cols, 'PackageTypeCode'),
      parentSscc:           stripLeadingApostrophe(get(cols, 'ParentSSCC')),
      parentPackageTypeCode: get(cols, 'ParentPackageTypeCode'),
      additionalTradeItemIdentification: stripLeadingApostrophe(get(cols, 'AdditionalTradeItemIdentification')),

      // Odbiorca i kierunek
      customerIdentification: get(cols, 'Customer_Identification'),
      customerShipTo:         get(cols, 'Customer_Ship_To'),
      destinationCountryCode: get(cols, 'DestinationCountryCode'),
      destinationCountryName: get(cols, 'DestinationCountryName').trim(),
      zipCode:                get(cols, 'ZipCode'),
      city:                   get(cols, 'City'),

      // Transport
      truckBarcode:         get(cols, 'Truck'),
      licensePlate:         get(cols, 'LicensePlate'),
      carrier:              get(cols, 'Carrier'),
      truckIdentification:  stripLeadingApostrophe(get(cols, 'TruckIdentification')),
      effectiveArrival:     stripLeadingApostrophe(get(cols, 'EffectiveArrival')),

      // Źródło
      businessShipper:      get(cols, 'BusinessShipper'),

      // Daty
      agreedArrival:        get(cols, 'AgreedArrival'),
      departureDate:        get(cols, 'DepartureDate'),
      taskCloseDate:        get(cols, 'TaskCloseDate'),

      // Wymiary
      volume:               toNumber(get(cols, 'Volume')),
      weight:               toNumber(get(cols, 'Weight')),
      depth:                toNumber(get(cols, 'Depth')),
      height:               toNumber(get(cols, 'Height')),
      width:                toNumber(get(cols, 'Width')),

      // Produkt
      gtin:                 stripLeadingApostrophe(get(cols, 'GTIN')),
      tradeItemDescription: get(cols, 'TradeItemDescription'),
      tradeItemQuantity:    toNumber(get(cols, 'TradeItemQuantity')),
      shipmentNr:           get(cols, 'Shipment_Nr'),
      handlingInstruction:  get(cols, 'HandlingInstruction'),

      // Outbound-specific
      lane:                 get(cols, 'Lane'),             // kod ścieżki sortowania
      waveId:               stripLeadingApostrophe(get(cols, 'WaveId')),
      location:             stripLeadingApostrophe(get(cols, 'Location')),
      preSortScanDateTime:  get(cols, 'PreSortScanDateTime'),
      recoScanDateTime:     get(cols, 'ReconstructedScanDateTime'),
      finishedScanDateTime: get(cols, 'FinishedScanDateTime'),
    };

    // SIS klucz — identyczny mechanizm jak Inbound
    row.sisKey = row.truckIdentification || row.effectiveArrival;

    // Flaga DG: odpowiednik "Lane Typ = DG" z Power BI
    // (w naszym pliku: Customer_Ship_To = "PL Dabrowa Hub")
    row.isDG = row.customerShipTo === 'PL Dabrowa Hub' ||
               row.customerShipTo === 'SOLVENTUM FIEGE DABROWA PL 3PL DC';

    rows.push(row);
  }

  return rows;
}


// ── Parser Awizacje XLSX ──────────────────────────────────────────────────────

/**
 * Parsuje plik Awizacje XLSX przy użyciu biblioteki SheetJS (window.XLSX).
 * Zwraca tablicę obiektów awizacji.
 *
 * @param {ArrayBuffer} buffer
 * @returns {AwizacjaRow[]}
 */
export function parseAwizacjeXlsx(buffer) {
  if (!window.XLSX) {
    throw new Error('Biblioteka SheetJS (XLSX) nie jest załadowana.');
  }

  const workbook = window.XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Pobierz surowe dane jako tablica tablic (nie parsuj dat automatycznie)
  const rawRows = window.XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });

  if (rawRows.length < 2) return [];

  // Pierwsza nieprawa linia to nagłówek
  // Szukamy linii z "SIS" żeby znaleźć prawdziwy nagłówek
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    if (rawRows[i].some(cell => String(cell).trim() === 'SIS')) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rawRows[headerRowIdx].map(h => String(h).trim());

  const getIdx = (name) => headers.indexOf(name);
  const idxData    = getIdx('Data');
  const idxSOS     = getIdx('SOS');
  const idxNrRej   = getIdx('Nr. rejestracyjny');
  const idxSIS     = getIdx('SIS');
  const idxGodz    = getIdx('Godz');
  const idxLinie   = getIdx('Linie');
  const idxAC      = getIdx('AC');
  const idxST      = getIdx('ST');
  const idxCross   = getIdx('Cross');
  const idxAC2     = getIdx('AC2');
  const idxST2     = getIdx('ST2');
  const idxHC      = getIdx('Healthcare');
  const idxCelne   = getIdx('Celne shipmenty');

  const rows = [];

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || r.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    const rawSIS  = String(r[idxSIS] !== null && r[idxSIS] !== undefined ? r[idxSIS] : '').trim();
    const rawData = r[idxData];
    const rawSOS  = String(r[idxSOS] || '').trim();

    // Pomiń wiersze bez SOS (puste separatory)
    if (!rawSOS) continue;

    // Wyczyść SIS: zostaw tylko sam numer, usuń " Celne" i inne sufiksy.
    //
    // UWAGA: Excel zapisuje spację przed "Celne" jako non-breaking space (\u00A0 / \xa0),
    // który NIE jest dzielony przez split(' ') (ASCII 0x20).
    // Rozwiązanie: zastąp wszystkie rodzaje białych znaków zwykłą spacją przed podziałem.
    const sisNormalized = rawSIS.replace(/[\u00A0\u202F\u2009\u2002\u2003\t]/g, ' ');
    const sisClean = sisNormalized.split(' ')[0].trim();

    // Parsuj datę
    const date = parseExcelDate(rawData);

    // Czas awizacji: ułamek doby
    const godzRaw = r[idxGodz] !== undefined && r[idxGodz] !== '' ? r[idxGodz] : null;
    const godzTime = godzRaw !== null ? excelTimeToHHMM(godzRaw) : '—';

    const row = {
      data:           date,
      sos:            rawSOS,
      nrRejestracyjny: String(r[idxNrRej] || '').trim(),
      sis:            sisClean,
      sisFull:        rawSIS,                            // z sufiksami (np. "Celne")
      godzTime:       godzTime,
      linie:          toNumber(r[idxLinie]),
      ac:             toNumber(r[idxAC]),
      st:             toNumber(r[idxST]),
      cross:          toNumber(r[idxCross]),
      ac2:            toNumber(r[idxAC2]),
      st2:            toNumber(r[idxST2]),
      healthcare:     toNumber(r[idxHC]),
      celneShipmenty: String(r[idxCelne] || '').trim(),
      isCelne:        sisNormalized.toLowerCase().includes('celne'),
      isKontener:     rawSOS.toUpperCase().includes('KONTENER'),
      isKontenerManual: rawSOS.toUpperCase() === 'KONTENER MANUAL',
    };

    rows.push(row);
  }

  return rows;
}
