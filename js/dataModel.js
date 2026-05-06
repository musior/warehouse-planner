// ─────────────────────────────────────────────────────────────────────────────
// dataModel.js — łączenie danych, obliczenia palet, lista aut
// ─────────────────────────────────────────────────────────────────────────────

import { isSameDay, round, toNumber } from './utils.js';

// Stała: liczba kartonów BX na paletę (gdy BX nie ma rodzica)
const BX_PER_PALLET = 30;

// ─────────────────────────────────────────────────────────────────────────────
// POMOCNICZA: znajdź najświeższą datę w awizacjach
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zwraca najświeższą datę znalezioną w wczytanych awizacjach.
 * Używane do auto-ustawienia filtra gdy plik nie zawiera "jutra".
 *
 * @param {AwizacjaRow[]} awizacje
 * @returns {Date|null}
 */
export function getLatestAwizacjeDate(awizacje) {
  let latest = null;
  for (const a of awizacje) {
    if (!a.data) continue;
    if (!latest || a.data > latest) latest = a.data;
  }
  return latest;
}

// ─────────────────────────────────────────────────────────────────────────────
// GŁÓWNA FUNKCJA: buduje model danych z obu plików
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buduje pełny model danych na podstawie wczytanych plików.
 *
 * @param {object} params
 * @param {AwizacjaRow[]}  params.awizacje     - sparsowane awizacje
 * @param {SSCCRow[]}      params.ssccInbound  - SSCC jadące do nas
 * @param {SSCCRow[]}      params.ssccArrived  - SSCC już przybyłe (opcjonalne)
 * @param {Date}           params.planningDate - data planowania (domyślnie jutro)
 * @param {Date|null}      params.filterDateFrom - filtr od daty (null = użyj planningDate)
 * @param {Date|null}      params.filterDateTo   - filtr do daty (null = użyj planningDate)
 * @returns {WarehouseModel}
 */
export function buildModel({ awizacje = [], ssccInbound = [], ssccArrived = [],
                             ssccOutbound = [], planningDate,
                             filterDateFrom = null, filterDateTo = null }) {

  // Zakres dat do filtrowania awizacji
  const dateFrom = filterDateFrom || planningDate;
  const dateTo   = filterDateTo   || planningDate;

  // ── 1. SIS które już przyjechały (są w ssccArrived / Outbound) ─────────────
  // Outbound ma EffectiveArrival WYPEŁNIONY — wszystkie SIS są "przybyłe"
  const arrivedSisSet = new Set(
    [...ssccArrived, ...ssccOutbound]
      .map(r => r.sisKey)
      .filter(Boolean)
  );

  // ── 2. Awizacje w wybranym zakresie dat ────────────────────────────────────
  const awizacjeOnDate = awizacje.filter(a => {
    if (!a.data) return false;
    if (dateFrom && a.data < dateFrom && !isSameDay(a.data, dateFrom)) return false;
    if (dateTo   && a.data > dateTo   && !isSameDay(a.data, dateTo))   return false;
    return true;
  });

  // ── 3. Zbuduj mapę: klucz -> awizacja ─────────────────────────────────────
  // Awizacje bez prawdziwego SIS (puste lub "brak") dostają unikalny klucz
  // oparty o numer rejestracyjny, żeby nie nadpisywały się nawzajem w Map.
  const awizacjeBySis = new Map();
  for (const a of awizacjeOnDate) {
    const hasSis = a.sis && a.sis.toLowerCase() !== 'brak';
    const key = hasSis ? a.sis : (a.nrRejestracyjny || `_brak_${awizacjeBySis.size}`);
    awizacjeBySis.set(key, a);
  }

  // ── 4. Zbierz SIS z SSCC Inbound (auta wciąż w drodze) ────────────────────
  // Każdy unikalny sisKey w ssccInbound to jeden transport
  const ssccBySis = new Map();
  for (const row of ssccInbound) {
    const key = row.sisKey;
    if (!key) continue;
    if (!ssccBySis.has(key)) ssccBySis.set(key, []);
    ssccBySis.get(key).push(row);
  }

  // ── 5. Buduj listę transportów na dzień planowania ─────────────────────────
  // Transport = awizacja na dany dzień, której SIS jest JESZCZE w SSCC Inbound
  // (czyli nie ma go w ssccArrived)

  const trucks = [];

  for (const [sis, awizacja] of awizacjeBySis.entries()) {
    // Pomiń jeśli już przyjechał (SIS jest w ssccArrived)
    const hasArrived = arrivedSisSet.has(sis);

    // Pobierz wiersze SSCC dla tego SIS
    const ssccRows = ssccBySis.get(sis) || [];

    // Oblicz hipotetyczną liczbę palet dla tego transportu
    const pallets = calcHypotheticalPallets(ssccRows, awizacja);

    // Zbierz unikalne kierunki docelowe
    const destinations = getDestinations(ssccRows);

    // Informacje o aucie z pierwszego wiersza SSCC (lub z awizacji)
    const firstRow = ssccRows[0] || null;

    trucks.push({
      sis,
      sisDisplay:      awizacja.sis || 'brak',
      awizacja,
      ssccRows,
      hasArrived,
      status:          hasArrived ? 'arrived' : (ssccRows.length > 0 ? 'inbound' : 'no-sscc'),
      truckPlate:      awizacja.nrRejestracyjny,
      sos:             awizacja.sos,
      godzTime:        awizacja.godzTime,
      isCelne:         awizacja.isCelne,
      isKontener:      awizacja.isKontener,
      isKontenerManual: awizacja.isKontenerManual,
      carrier:         firstRow?.carrier || '',
      businessShipper: firstRow?.businessShipper || '',  // np. "DE Juechen EDC"
      licensePlate:    firstRow?.licensePlate || '',      // rejestracja z SSCC
      pallets,
      destinations,
      ssccCount:       ssccRows.length,
    });
  }

  // Posortuj auta wg godziny awizacji
  trucks.sort((a, b) => {
    if (a.godzTime === '—') return 1;
    if (b.godzTime === '—') return -1;
    return a.godzTime.localeCompare(b.godzTime);
  });

  // ── 6. Globalne KPI ────────────────────────────────────────────────────────
  const trucksInbound  = trucks.filter(t => t.status === 'inbound');
  const trucksArrived  = trucks.filter(t => t.status === 'arrived');
  const trucksNoSscc   = trucks.filter(t => t.status === 'no-sscc');

  const kpi = computeKpiFromData(trucks, awizacjeOnDate, awizacje, ssccInbound, ssccOutbound);

  return {
    planningDate,
    trucks,
    trucksInbound,
    trucksArrived,
    trucksNoSscc,
    kpi,
    awizacjeOnDate,
    ssccInbound,
    ssccArrived,
    arrivedSisSet,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OBLICZANIE KPI Z TABLIC DANYCH (reużywane przez buildModel i buildKpiForSelection)
// ─────────────────────────────────────────────────────────────────────────────

function computeKpiFromData(trucks, awizacjeOnDate, awizacje, ssccInbound, ssccOutbound) {
  const trucksInbound   = trucks.filter(t => t.status === 'inbound');
  const trucksArrived   = trucks.filter(t => t.status === 'arrived');
  const trucksNoSscc    = trucks.filter(t => t.status === 'no-sscc');

  const totalPalletsInbound = trucksInbound.reduce((s, t) => s + t.pallets.total, 0);
  const totalPalletsAll     = trucks.reduce((s, t) => s + t.pallets.total, 0);

  const kontenerRegularRows    = awizacjeOnDate.filter(a => a.isKontener && !a.isKontenerManual && a.celneShipmenty === 'W drodze');
  const kontenerRegularPallets = kontenerRegularRows.reduce((s, a) => s + a.st + a.st2, 0);

  const kontenerManualRows    = awizacjeOnDate.filter(a => a.isKontenerManual && a.celneShipmenty === 'W drodze');
  const kontenerManualCartons = kontenerManualRows.reduce((s, a) => s + a.ac + a.ac2, 0);

  const totalPalletsFromSSCC = round(totalPalletsAll + kontenerRegularPallets);

  const activeSisSet = new Set(awizacjeOnDate.map(a => a.sis).filter(Boolean));

  const DG_DEST       = 'PL Dabrowa Hub';
  const DG_SHIPPER    = '3M';
  const CROSS_EXCLUDE = new Set([DG_DEST, 'SOLVENTUM FIEGE DABROWA PL 3PL DC']);
  const DG_DESTS      = new Set([DG_DEST, 'SOLVENTUM FIEGE DABROWA PL 3PL DC']);

  const bxDg = ssccInbound.filter(r =>
    r.packageTypeCode === 'BX'  &&
    r.customerShipTo  === DG_DEST &&
    r.shipper         === DG_SHIPPER &&
    !r.effectiveArrival &&
    activeSisSet.has(r.sisKey)
  ).length;
  const dgKontenerCartons = kontenerRegularRows.reduce((s, a) => s + a.ac + a.ac2, 0);
  const sortingDgBoxes    = bxDg + dgKontenerCartons;

  const bxCross = ssccInbound.filter(r =>
    r.packageTypeCode === 'BX'  &&
    !CROSS_EXCLUDE.has(r.customerShipTo) &&
    r.shipper         === DG_SHIPPER &&
    !r.effectiveArrival &&
    activeSisSet.has(r.sisKey)
  ).length;
  const sortingCrossBoxes = bxCross;

  const bxDgRows = ssccInbound.filter(r =>
    r.packageTypeCode === 'BX'  &&
    DG_DESTS.has(r.customerShipTo) &&
    r.shipper         === DG_SHIPPER &&
    !r.effectiveArrival &&
    activeSisSet.has(r.sisKey)
  );

  const atiiMap = new Map();
  for (const r of bxDgRows) {
    const atii = r.additionalTradeItemIdentification;
    if (!atii) continue;
    if (!atiiMap.has(atii)) atiiMap.set(atii, { count: 0, volume: 0 });
    const entry = atiiMap.get(atii);
    entry.count++;
    entry.volume += r.volume || 0;
  }

  let drobnicalItems = 0;
  let over01volItems = 0;
  let over20Items    = 0;

  for (const [, entry] of atiiMap) {
    if (entry.count >= 20)       over20Items++;
    else if (entry.volume < 0.1) drobnicalItems++;
    else                         over01volItems++;
  }

  const pelnePaletyDg = ssccInbound.filter(r =>
    r.packageTypeCode !== 'BX' &&
    DG_DESTS.has(r.customerShipTo) &&
    r.shipper === DG_SHIPPER &&
    !r.effectiveArrival &&
    activeSisSet.has(r.sisKey)
  ).length;

  const paletyZ20K = over01volItems + over20Items;

  const bxDgRampaRows = ssccInbound.filter(r =>
    r.packageTypeCode === 'BX'  &&
    r.customerShipTo  === DG_DEST &&
    r.shipper         === DG_SHIPPER &&
    r.effectiveArrival
  );
  const bxDgRampa = bxDgRampaRows.length;

  const kontenerRozladowanyAC = awizacje
    .filter(a => a.isKontener && !a.isKontenerManual && a.celneShipmenty === 'Rozładowany')
    .reduce((s, a) => s + a.ac + a.ac2, 0);
  const sortRampaBoxes = bxDgRampa + kontenerRozladowanyAC;

  const bxDgPlacRows = ssccOutbound.filter(r =>
    r.packageTypeCode === 'BX' && r.isDG && !r.taskCloseDate
  );
  const bxDgPlac = bxDgPlacRows.length;
  const kontenerNaPlacu = awizacje
    .filter(a => a.isKontener && !a.isKontenerManual && a.celneShipmenty === 'Na placu')
    .reduce((s, a) => s + a.ac + a.ac2, 0);
  const sortPlacBoxes = bxDgPlac + kontenerNaPlacu;

  const sortCrossRampaBoxes = ssccInbound.filter(r =>
    r.packageTypeCode === 'BX' &&
    !r.isDG &&
    r.shipper === DG_SHIPPER &&
    r.effectiveArrival
  ).length;

  const sortCrossPlacBoxes = ssccOutbound.filter(r =>
    r.packageTypeCode === 'BX' &&
    !r.isDG &&
    r.shipper === DG_SHIPPER &&
    !r.taskCloseDate &&
    !r.finishedScanDateTime
  ).length;

  const kontenerSt = kontenerRegularRows.reduce((s, a) => s + a.st + a.st2, 0);

  const atiiMapDrobnicaRampa = new Map();
  for (const r of bxDgRampaRows) {
    const atii = r.additionalTradeItemIdentification;
    if (!atii) continue;
    if (!atiiMapDrobnicaRampa.has(atii)) atiiMapDrobnicaRampa.set(atii, { count: 0, volume: 0 });
    const e = atiiMapDrobnicaRampa.get(atii);
    e.count++;  e.volume += r.volume || 0;
  }
  const drobnicalItemsRampa = [...atiiMapDrobnicaRampa.values()]
    .filter(e => e.count < 20 && e.volume < 0.1).length;

  const atiiMapDrobnicaPlac = new Map();
  for (const r of bxDgPlacRows) {
    const atii = r.additionalTradeItemIdentification;
    if (!atii) continue;
    if (!atiiMapDrobnicaPlac.has(atii)) atiiMapDrobnicaPlac.set(atii, { count: 0, volume: 0 });
    const e = atiiMapDrobnicaPlac.get(atii);
    e.count++;  e.volume += r.volume || 0;
  }
  const drobnicalItemsPlac = [...atiiMapDrobnicaPlac.values()]
    .filter(e => e.count < 20 && e.volume < 0.1).length;

  const atiiMapRampa = new Map();
  for (const r of bxDgRampaRows) {
    const atii = r.additionalTradeItemIdentification;
    if (!atii) continue;
    if (!atiiMapRampa.has(atii)) atiiMapRampa.set(atii, { count: 0, volume: 0 });
    const e = atiiMapRampa.get(atii);
    e.count++;
    e.volume += r.volume || 0;
  }
  let over01volRampa = 0, over20Rampa = 0;
  for (const [, e] of atiiMapRampa) {
    if (e.count >= 20)         over20Rampa++;
    else if (e.volume >= 0.1)  over01volRampa++;
  }
  const paletyZ20KRampa = over01volRampa + over20Rampa;
  const pelnePaletyDgRampa = ssccInbound.filter(r =>
    r.packageTypeCode !== 'BX' &&
    DG_DESTS.has(r.customerShipTo) &&
    r.shipper === DG_SHIPPER &&
    r.effectiveArrival
  ).length;
  const kontenerRozladowanyST = awizacje
    .filter(a => a.isKontener && !a.isKontenerManual && a.celneShipmenty === 'Rozładowany')
    .reduce((s, a) => s + a.st + a.st2, 0);

  const atiiMapPlac = new Map();
  for (const r of bxDgPlacRows) {
    const atii = r.additionalTradeItemIdentification;
    if (!atii) continue;
    if (!atiiMapPlac.has(atii)) atiiMapPlac.set(atii, { count: 0, volume: 0 });
    const e = atiiMapPlac.get(atii);
    e.count++;
    e.volume += r.volume || 0;
  }
  let over01volPlac = 0, over20Plac = 0;
  for (const [, e] of atiiMapPlac) {
    if (e.count >= 20)         over20Plac++;
    else if (e.volume >= 0.1)  over01volPlac++;
  }
  const paletyZ20KPlac = over01volPlac + over20Plac;
  const pelnePaletyDgPlac = ssccOutbound.filter(r =>
    r.packageTypeCode !== 'BX' &&
    r.isDG &&
    !r.taskCloseDate
  ).length;
  const kontenerNaPlacu_ST = awizacje
    .filter(a => a.isKontener && !a.isKontenerManual && a.celneShipmenty === 'Na placu')
    .reduce((s, a) => s + a.st + a.st2, 0);

  return {
    totalTrucks:             trucks.length,
    inboundTrucks:           trucksInbound.length,
    arrivedTrucks:           trucksArrived.length,
    noSsccTrucks:            trucksNoSscc.length,
    totalPalletsInbound:     round(totalPalletsInbound),
    totalPalletsAll:         round(totalPalletsAll),
    totalPalletsFromSSCC,
    kontenerRegularPallets,
    kontenerManualCartons,
    sortingDgBoxes,
    sortingCrossBoxes,
    drobnicalItems,
    over01volItems,
    over20Items,
    paletyZ20K,
    pelnePaletyDg,
    kontenerSt,
    sortRampaBoxes,
    sortPlacBoxes,
    sortCrossRampaBoxes,
    sortCrossPlacBoxes,
    drobnicalItemsRampa,
    drobnicalItemsPlac,
    kontenerRozladowanyAC,
    paletyZ20KRampa,
    pelnePaletyDgRampa,
    kontenerRozladowanyST,
    paletyZ20KPlac,
    pelnePaletyDgPlac,
    kontenerNaPlacu_ST,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI DLA WYBRANYCH TRANSPORTÓW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Przelicza KPI tylko dla wybranych transportów (po SIS).
 * selectedSisSet = null oznacza "wszystkie".
 */
export function buildKpiForSelection(model, selectedSisSet, { awizacje, ssccInbound, ssccOutbound }) {
  if (!selectedSisSet) return model.kpi;

  // Filtrujemy tylko trucks i awizacjeOnDate — z nich buduje się activeSisSet,
  // który filtruje obliczenia Inbound (Rozładunek, DG, CROSS).
  // ssccInbound, ssccOutbound i awizacje przekazujemy w całości, dzięki czemu
  // obliczenia Magazynu (oparte na effectiveArrival / ssccOutbound / celneShipmenty)
  // zawsze operują na pełnych danych i nie są filtrowane przez wybór transportów.
  const selectedTrucks        = model.trucks.filter(t => selectedSisSet.has(t.sis));
  const filteredAwizacjeOnDate = model.awizacjeOnDate.filter(a => selectedSisSet.has(a.sis));

  return computeKpiFromData(selectedTrucks, filteredAwizacjeOnDate, awizacje, ssccInbound, ssccOutbound);
}

// ─────────────────────────────────────────────────────────────────────────────
// OBLICZANIE HIPOTETYCZNYCH PALET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Oblicza hipotetyczną liczbę palet do rozładunku dla zestawu wierszy SSCC.
 *
 * Logika (na podstawie wzoru DAX):
 *
 * Część 1: wiersze gdzie PackageTypeCode != "BX"  (PE = palety — liczymy 1:1)
 * Część 2: wiersze BX bez rodzica (ParentPackageTypeCode puste) → dziel przez BX_PER_PALLET (30)
 * Część 3: unikalne numery SSCC rodziców BX (ParentPackageTypeCode wypełniony) → każdy = 1 paleta
 * Część 4: kontenery z awizacji (ST + ST2 gdzie SOS = KONTENER i status = W drodze)
 *
 * @param {SSCCRow[]} rows
 * @param {AwizacjaRow|null} awizacja
 * @returns {{ part1: number, part2: number, part3: number, part4: number, total: number }}
 */
export function calcHypotheticalPallets(rows, awizacja) {
  // Część 1: nie-BX (palety PE i inne)
  const part1 = rows.filter(r => r.packageTypeCode !== 'BX').length;

  // Część 2: BX bez palety-rodzica (parentPackageTypeCode pusty) podzielone przez BX_PER_PALLET
  // parentPackageTypeCode jest wypełniony gdy BX należy do palety PE
  const bxWithoutParent = rows.filter(r =>
    r.packageTypeCode === 'BX' && !r.parentPackageTypeCode
  ).length;
  const part2 = bxWithoutParent / BX_PER_PALLET;

  // Część 3: unikalne numery SSCC palet-rodziców dla BX które mają rodzica
  // parentSscc = numer SSCC palety nadrzędnej (gdy karton leży na palecie)
  const parentSsccSet = new Set();
  for (const r of rows) {
    if (r.packageTypeCode === 'BX' && r.parentSscc) {
      parentSsccSet.add(r.parentSscc);
    }
  }
  const part3 = parentSsccSet.size;

  // Część 4: kontenery z awizacji
  let part4 = 0;
  if (awizacja && awizacja.isKontener && awizacja.celneShipmenty === 'W drodze') {
    part4 = toNumber(awizacja.st) + toNumber(awizacja.st2);
  }

  const total = round(part1 + part2 + part3 + part4);

  return { part1, part2: round(part2), part3, part4, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// KIERUNKI DOCELOWE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zbiera unikalne kierunki z wierszy SSCC (Customer_Ship_To + kraj).
 * Zwraca tablicę obiektów { code, country, count }.
 */
export function getDestinations(rows) {
  const map = new Map();

  for (const r of rows) {
    const code = r.customerShipTo || '—';
    const country = r.destinationCountryCode || '';

    const key = code;
    if (!map.has(key)) {
      map.set(key, { code, country, count: 0 });
    }
    map.get(key).count++;
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────────────────────────
// SZCZEGÓŁY SSCC DLA JEDNEGO TRANSPORTU
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buduje tabelę SSCC dla podglądu jednego auta.
 * Grupuje wiersze po numerze SSCC (palety) i zlicza kartony.
 *
 * @param {SSCCRow[]} rows
 * @returns {SSCCPalletGroup[]}
 */
export function buildSsccDetailTable(rows) {
  const palletMap = new Map();

  // Grupuj BX wg numeru SSCC palety-rodzica (parentSscc)
  for (const r of rows) {
    if (r.packageTypeCode === 'BX') {
      const palletKey = r.parentSscc || '__no_parent__';
      if (!palletMap.has(palletKey)) {
        palletMap.set(palletKey, {
          palletSscc:      palletKey === '__no_parent__' ? null : palletKey,
          hasParent:       !!r.parentSscc,
          destination:     r.customerShipTo || '—',
          country:         r.destinationCountryCode || '',
          businessShipper: r.businessShipper || '',
          boxes:           [],
          totalWeight:     0,
        });
      }
      const group = palletMap.get(palletKey);
      group.boxes.push(r);
      group.totalWeight += r.weight || 0;
    }
  }

  // Dodaj PE (palety) które nie są rodzicami BX — samodzielne palety
  for (const r of rows) {
    if (r.packageTypeCode !== 'BX') {
      const key = `PE_${r.ssccNumber}`;
      palletMap.set(key, {
        palletSscc:      r.ssccNumber || '—',
        hasParent:       false,
        packageType:     r.packageTypeCode,
        destination:     r.customerShipTo || '—',
        country:         r.destinationCountryCode || '',
        businessShipper: r.businessShipper || '',
        boxes:           [],
        totalWeight:     r.weight || 0,
        isPallet:        true,
      });
    }
  }

  return Array.from(palletMap.values());
}
