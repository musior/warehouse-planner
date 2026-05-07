// ─────────────────────────────────────────────────────────────────────────────
// processes.js — obliczenia zapotrzebowania na ludzi per proces
// ─────────────────────────────────────────────────────────────────────────────

// TODO: Docelowo wartości minutesPerUnit będą pobierane z serwera (GET /api/process-times)
// i zapisywane po edycji użytkownika (PUT /api/process-times/:id). Zakładka "Czasy" służy
// do ich podglądu i przyszłej edycji. Na razie wszystkie czasy są zakodowane na stałe poniżej.

export const SHIFT_MINUTES = 480; // 8h = 480 min

// Pomocnicza funkcja zaokrąglania
function r(value, decimals = 1) {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAŁE PROCESÓW
// ─────────────────────────────────────────────────────────────────────────────

export const PROCESSES = {
  unloading: {
    id:             'unloading',
    label:          'Rozładunek',
    minutesPerUnit: 1.4838,   // min/paletę
    productivity:   0.85,
    // ~275 pal./os./zmianę | wyklucza KONTENER MANUAL
  },
  manualContainer: {
    id:             'manualContainer',
    label:          'Rozładunek i przygotowanie kontenera manualnego',
    minutesPerUnit: 0.3885,   // min/karton
    productivity:   0.85,
    // ~1050 kart./os./zmianę | filtr: SOS=KONTENER MANUAL, Celne=W drodze
  },
  sortingDg: {
    id:             'sortingDg',
    label:          'Sortowanie DG',
    minutesPerUnit: 0.3467,   // min/karton
    productivity:   0.85,
    // ~1177 kart./os./zmianę
    // Filtr BX: Customer_Ship_To="PL Dabrowa Hub", Shipper="3M", EffectiveArrival blank
    // + kartony z awizacji: SOS=KONTENER (nie manual), Celne=W drodze
  },
  sortingCross: {
    id:             'sortingCross',
    label:          'Sortowanie CROSS',
    minutesPerUnit: 0.3724,   // min/karton
    productivity:   0.85,
    // ~1096 kart./os./zmianę
    // Filtr BX: Customer_Ship_To NOT IN {"PL Dabrowa Hub","SOLVENTUM FIEGE DABROWA PL 3PL DC"},
    //           Shipper="3M", EffectiveArrival blank
  },
  recoCross: {
    id:             'recoCross',
    label:          'Rekonstrukcja CROSS',
    minutesPerUnit: 0.342,    // min/paletę (wejście: BX_cross / 10)
    productivity:   0.85,
    // ~1193 pal./os./zmianę
  },
  foliaCross: {
    id:             'foliaCross',
    label:          'Foliowanie CROSS',
    minutesPerUnit: 3.49,     // min/paletę (wejście: BX_cross / 10 × 0.75)
    productivity:   0.85,
    // ~117 pal./os./zmianę
  },
  drobnical: {
    id:             'drobnical',
    label:          'Wstawianie drobnicy DG',
    minutesPerUnit: 0.44,     // min/unikalny ATII
    productivity:   0.85,
    // ~927 ATII/os/zmianę
    // Wejście: liczba unikalnych ATII gdzie rows < 20 AND volume < 0.1
    // Filtr: Customer_Ship_To IN {DG, SOLVENTUM}, Shipper=3M, EffectiveArrival blank
  },
  wstawianiePaletDg: {
    id:             'wstawianiePaletDg',
    label:          'Wstawianie palet DG',
    minutesPerUnit: 2.9073,
    productivity:   0.85,
    shiftMinutes:   SHIFT_MINUTES,
  },
  przygotowanie20K: {
    id:             'przygotowanie20K',
    label:          'Przygotowanie palet 20K',
    minutesPerUnit: 1.56,
    productivity:   0.85,
    shiftMinutes:   SHIFT_MINUTES,
    // ~261.5 pal/os/zmianę — dla Palety_z_20K
  },
  przygotowanieFP: {
    id:             'przygotowanieFP',
    label:          'Przygotowanie palet FP',
    minutesPerUnit: 1.22,
    productivity:   0.85,
    shiftMinutes:   SHIFT_MINUTES,
  },
  // ── Procesy dla towarów NA MAGAZYNIE (SSCC Outbound) ─────────────────────
  sortingRampa: {
    id:             'sortingRampa',
    label:          'Sortowanie — rampa DG',
    minutesPerUnit: 0.3467,
    productivity:   0.85,
    shiftMinutes:   SHIFT_MINUTES,
    // ~1177 kart/os/zmianę | SSCC Inbound (EffectiveArrival filled) + kontenery Rozładowany
  },
  sortingPlac: {
    id: 'sortingPlac', label: 'Sortowanie — plac DG',
    minutesPerUnit: 0.3467, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
  },
  sortingCrossRampa: {
    id: 'sortingCrossRampa', label: 'Sortowanie CROSS — bufor',
    minutesPerUnit: 0.3724, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
    // ~1096 kart/os/zmianę | Inbound, EffectiveArrival filled, !isDG, Shipper=3M
  },
  sortingCrossPlac: {
    id: 'sortingCrossPlac', label: 'Sortowanie CROSS — plac',
    minutesPerUnit: 0.3724, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
  },
  recoCrossRampa: {
    id: 'recoCrossRampa', label: 'Rekonstrukcja CROSS — bufor',
    minutesPerUnit: 0.342, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
    // ~1193 pal/os/zmianę | wejście: sortCrossRampaBoxes / 10
  },
  recoCrossPlac: {
    id: 'recoCrossPlac', label: 'Rekonstrukcja CROSS — plac',
    minutesPerUnit: 0.342, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
  },
  foliaCrossRampa: {
    id: 'foliaCrossRampa', label: 'Foliowanie CROSS — bufor',
    minutesPerUnit: 3.49, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
    // ~116.9 pal/os/zmianę | wejście: (sortCrossRampaBoxes / 10) × 0.75
  },
  foliaCrossPlac: {
    id: 'foliaCrossPlac', label: 'Foliowanie CROSS — plac',
    minutesPerUnit: 3.49, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
    // ~116.9 pal/os/zmianę | wejście: (sortCrossPlacBoxes / 10) × 0.75
  },
  przygowanieRampa20K: {
    id: 'przygowanieRampa20K', label: 'Przygotowanie palet 20K — rampa', minutesPerUnit: 1.56, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
  },
  przygowanieRampaFP: {
    id: 'przygowanieRampaFP',  label: 'Przygotowanie palet FP — rampa',  minutesPerUnit: 1.22, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
  },
  przygowaniePlac20K: {
    id: 'przygowaniePlac20K',  label: 'Przygotowanie palet 20K — plac',  minutesPerUnit: 1.56, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
  },
  przygowaniePlacFP: {
    id: 'przygowaniePlacFP',   label: 'Przygotowanie palet FP — plac',   minutesPerUnit: 1.22, productivity: 0.85, shiftMinutes: SHIFT_MINUTES,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WSPÓLNA FUNKCJA OBLICZENIOWA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Oblicza zapotrzebowanie na ludzi dla dowolnego procesu.
 *
 * Wzór (tożsamy z DAX):
 *   unitsPerPerson = shiftMinutes × productivity / minutesPerUnit
 *   peopleExact    = unitCount / unitsPerPerson
 *   peopleCeil     = ⌈ peopleExact ⌉
 *
 * Równoważnie: ⌈ unitCount / (480 / (minutesPerUnit / productivity)) ⌉
 */
function calcProcess(procDef, unitCount, unitLabel = 'kartonów') {
  const unitsPerPerson = SHIFT_MINUTES * procDef.productivity / procDef.minutesPerUnit;
  const peopleExact    = unitCount / unitsPerPerson;
  const peopleCeil     = Math.ceil(peopleExact);

  return {
    processId:      procDef.id,
    label:          procDef.label,
    unitCount,
    unitLabel,
    minutesNeeded:  r(procDef.minutesPerUnit * unitCount, 1),
    peopleExact:    r(peopleExact, 2),
    peopleCeil,
    unitsPerPerson: r(unitsPerPerson, 0),
    utilizationPct: peopleCeil > 0 ? r((peopleExact / peopleCeil) * 100, 1) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNKCJE PUBLICZNE
// ─────────────────────────────────────────────────────────────────────────────

export const calcUnloading       = (pallets)  => calcProcess(PROCESSES.unloading,       pallets,  'palet');
export const calcManualContainer = (cartons)  => calcProcess(PROCESSES.manualContainer, cartons,  'kartonów');
export const calcSortingDg       = (boxes)    => calcProcess(PROCESSES.sortingDg,       boxes,    'kartonów');
export const calcSortingCross    = (boxes)    => calcProcess(PROCESSES.sortingCross,    boxes,    'kartonów');
export const calcDrobnical       = (items)    => calcProcess(PROCESSES.drobnical,       items,    'poz. ATII');
export const calcSortingRampa    = (boxes)    => calcProcess(PROCESSES.sortingRampa,    boxes,    'kartonów');
export const calcSortingPlac     = (boxes)    => calcProcess(PROCESSES.sortingPlac,     boxes,    'kartonów');

export function calcRecoCross(bxCross) {
  const paletReko = bxCross / 10;
  const result    = calcProcess(PROCESSES.recoCross, paletReko, 'palet po reko');
  result.inputBoxes  = bxCross;
  result.palletsReko = r(paletReko, 1);
  return result;
}

export function calcFoliaCross(bxCross) {
  const paletReko  = bxCross / 10;
  const paletFolia = paletReko * 0.75;
  const result     = calcProcess(PROCESSES.foliaCross, paletFolia, 'palet do folii');
  result.inputBoxes   = bxCross;
  result.palletsReko  = r(paletReko,  1);
  result.palletsFolia = r(paletFolia, 1);
  return result;
}

/**
 * Wstawianie palet DG.
 *
 * Wzor DAX: FTE = FTE_20K + FTE_FP
 *   FTE_20K = paletyZ20K / (480 / (2.9073 / 0.85))
 *   FTE_FP  = (pelnePaletyDg + kontenerSt) / (480 / (2.9073 / 0.85))
 *
 * Wspolny benchmark: 480 * 0.85 / 2.9073 = ~140.3 pal/os/zmiane
 *
 * Wejscie:
 *   paletyZ20K  = over01vol + over20  (unikalne ATII z pelna paleta)
 *   pelnePaletyDg = PE (nie-BX) dla DG+SOLVENTUM
 *   kontenerSt  = ST z kontenerow zwyklych (Celne=W drodze)
 */
export function calcWstawianiePaletDg(paletyZ20K, pelnePaletyDg, kontenerSt) {
  const proc  = PROCESSES.wstawianiePaletDg;
  const bench = proc.shiftMinutes * proc.productivity / proc.minutesPerUnit;

  const fte20K  = paletyZ20K  / bench;
  const fteFP   = (pelnePaletyDg + kontenerSt) / bench;
  const fteExact = fte20K + fteFP;
  const peopleCeil = Math.ceil(fteExact);

  return {
    processId:      proc.id,
    label:          proc.label,
    unitCount:      paletyZ20K + pelnePaletyDg + kontenerSt, // lacznie
    unitLabel:      'palet',
    minutesNeeded:  r(proc.minutesPerUnit * (paletyZ20K + pelnePaletyDg + kontenerSt), 1),
    peopleExact:    r(fteExact, 2),
    peopleCeil,
    unitsPerPerson: r(bench, 1),
    utilizationPct: peopleCeil > 0 ? r((fteExact / peopleCeil) * 100, 1) : 0,
    // Szczegoly skladowych
    paletyZ20K,
    pelnePaletyDg,
    kontenerSt,
    fte20K:    r(fte20K,  3),
    fteFP:     r(fteFP,   3),
  };
}

export function calcPrzygotowaniePaletDg(paletyZ20K, pelnePaletyDg, kontenerSt) {
  const bench20K = SHIFT_MINUTES * PROCESSES.przygotowanie20K.productivity / PROCESSES.przygotowanie20K.minutesPerUnit;
  const benchFP  = SHIFT_MINUTES * PROCESSES.przygotowanieFP.productivity  / PROCESSES.przygotowanieFP.minutesPerUnit;

  const fte20K   = paletyZ20K / bench20K;
  const fteFP    = (pelnePaletyDg + kontenerSt) / benchFP;
  const fteExact = fte20K + fteFP;
  const peopleCeil = Math.ceil(fteExact);

  return {
    processId:      'przygotowaniePaletDg',
    label:          'Przygotowanie palet DG',
    unitCount:      paletyZ20K + pelnePaletyDg + kontenerSt,
    unitLabel:      'palet',
    minutesNeeded:  r(PROCESSES.przygotowanie20K.minutesPerUnit * paletyZ20K +
                      PROCESSES.przygotowanieFP.minutesPerUnit  * (pelnePaletyDg + kontenerSt), 1),
    peopleExact:    r(fteExact, 2),
    peopleCeil,
    unitsPerPerson: r((bench20K + benchFP) / 2, 0),
    utilizationPct: peopleCeil > 0 ? r((fteExact / peopleCeil) * 100, 1) : 0,
    paletyZ20K, pelnePaletyDg, kontenerSt,
    fte20K: r(fte20K, 3), fteFP: r(fteFP, 3),
    bench20K: r(bench20K, 1), benchFP: r(benchFP, 1),
  };
}

export function calcPrzygotowaniePaletRampa(paletyZ20K, pelnePaletyDg, kontenerST) {
  const bench20K = SHIFT_MINUTES * 0.85 / 1.56;
  const benchFP  = SHIFT_MINUTES * 0.85 / 1.22;
  const fte20K   = paletyZ20K / bench20K;
  const fteFP    = (pelnePaletyDg + kontenerST) / benchFP;
  const fteExact = fte20K + fteFP;
  return {
    processId: 'przygotowaniePaletRampa', label: 'Przygotowanie palet — rampa DG',
    unitCount: paletyZ20K + pelnePaletyDg + kontenerST, unitLabel: 'palet',
    minutesNeeded: r(1.56 * paletyZ20K + 1.22 * (pelnePaletyDg + kontenerST), 1),
    peopleExact: r(fteExact, 2), peopleCeil: Math.ceil(fteExact),
    unitsPerPerson: r((bench20K + benchFP) / 2, 0),
    utilizationPct: Math.ceil(fteExact) > 0 ? r((fteExact / Math.ceil(fteExact)) * 100, 1) : 0,
    paletyZ20K, pelnePaletyDg, kontenerST,
    fte20K: r(fte20K, 3), fteFP: r(fteFP, 3), bench20K: r(bench20K, 1), benchFP: r(benchFP, 1),
  };
}

export function calcPrzygotowaniePaletPlac(paletyZ20KPlac, pelnePaletyPlac, kontenerST) {
  const bench20K = SHIFT_MINUTES * 0.85 / 1.56;
  const benchFP  = SHIFT_MINUTES * 0.85 / 1.22;
  const fte20K   = paletyZ20KPlac / bench20K;
  const fteFP    = (pelnePaletyPlac + kontenerST) / benchFP;
  const fteExact = fte20K + fteFP;
  return {
    processId: 'przygotowaniePaletPlac', label: 'Przygotowanie palet — plac DG',
    unitCount: paletyZ20KPlac + pelnePaletyPlac + kontenerST, unitLabel: 'palet',
    minutesNeeded: r(1.56 * paletyZ20KPlac + 1.22 * (pelnePaletyPlac + kontenerST), 1),
    peopleExact: r(fteExact, 2), peopleCeil: Math.ceil(fteExact),
    unitsPerPerson: r((bench20K + benchFP) / 2, 0),
    utilizationPct: Math.ceil(fteExact) > 0 ? r((fteExact / Math.ceil(fteExact)) * 100, 1) : 0,
    paletyZ20K: paletyZ20KPlac, pelnePalety: pelnePaletyPlac, kontenerST,
    fte20K: r(fte20K, 3), fteFP: r(fteFP, 3), bench20K: r(bench20K, 1), benchFP: r(benchFP, 1),
  };
}

/**
 * Wstawianie pełnych palet DG — rampa.
 *
 * Jeden benchmark 2.9073 dla obu składników (inaczej niż Przygotowanie).
 * Dodatkowy składnik w FP: kontener MANUAL AC/54 = hipotetyczne palety.
 *
 *   FTE_20K = paletyZ20KRampa / bench
 *   FTE_FP  = (pelnePaletyDgRampa + kontenerRozladowanyST + kontenerManualAC/54) / bench
 */
export function calcWstawianiePaletRampa(paletyZ20K, pelnePaletyDg, kontenerRozladowanyST, kontenerManualAC) {
  const bench     = SHIFT_MINUTES * 0.85 / 2.9073; // ~140.3
  const manualPal = kontenerManualAC / 54;          // AC / 54 = hipot. palety z kont. manual
  const fte20K    = paletyZ20K / bench;
  const fteFP     = (pelnePaletyDg + kontenerRozladowanyST + manualPal) / bench;
  const fteExact  = fte20K + fteFP;
  const peopleCeil = Math.ceil(fteExact);
  return {
    processId: 'wstawianiePaletRampa', label: 'Wstawianie palet — rampa DG',
    unitCount:   r(paletyZ20K + pelnePaletyDg + kontenerRozladowanyST + manualPal, 1),
    unitLabel:   'palet',
    minutesNeeded: r(2.9073 * (paletyZ20K + pelnePaletyDg + kontenerRozladowanyST + manualPal), 1),
    peopleExact: r(fteExact, 2), peopleCeil,
    unitsPerPerson: r(bench, 1),
    utilizationPct: peopleCeil > 0 ? r((fteExact / peopleCeil) * 100, 1) : 0,
    paletyZ20K, pelnePaletyDg, kontenerRozladowanyST, kontenerManualAC, manualPal: r(manualPal, 2),
    fte20K: r(fte20K, 3), fteFP: r(fteFP, 3),
  };
}

/**
 * Wstawianie pełnych palet DG — plac.
 *
 *   FTE_20K = paletyZ20KPlac / bench
 *   FTE_FP  = (pelnePaletyDgPlac + kontenerNaPlacu_ST) / bench
 */
export function calcWstawianiePaletPlac(paletyZ20KPlac, pelnePaletyPlac, kontenerNaPlacu_ST) {
  const bench     = SHIFT_MINUTES * 0.85 / 2.9073;
  const fte20K    = paletyZ20KPlac / bench;
  const fteFP     = (pelnePaletyPlac + kontenerNaPlacu_ST) / bench;
  const fteExact  = fte20K + fteFP;
  const peopleCeil = Math.ceil(fteExact);
  return {
    processId: 'wstawianiePaletPlac', label: 'Wstawianie palet — plac DG',
    unitCount:   paletyZ20KPlac + pelnePaletyPlac + kontenerNaPlacu_ST,
    unitLabel:   'palet',
    minutesNeeded: r(2.9073 * (paletyZ20KPlac + pelnePaletyPlac + kontenerNaPlacu_ST), 1),
    peopleExact: r(fteExact, 2), peopleCeil,
    unitsPerPerson: r(bench, 1),
    utilizationPct: peopleCeil > 0 ? r((fteExact / peopleCeil) * 100, 1) : 0,
    paletyZ20K: paletyZ20KPlac, pelnePalety: pelnePaletyPlac, kontenerNaPlacu_ST,
    fte20K: r(fte20K, 3), fteFP: r(fteFP, 3),
  };
}

/**
 * Wstawianie drobnicy DG — rampa.
 * Źródło: ATII z Inbound (EffectiveArrival filled, DG, 3M), count<20, vol<0.1
 * + kartony z kontenerów Rozładowany (AC)
 */
export function calcWstawianieDrobnicyRampa(drobnicalItemsRampa, kontenerRozladowanyAC) {
  const bench    = SHIFT_MINUTES * 0.85 / 0.44;
  const total    = drobnicalItemsRampa + kontenerRozladowanyAC;
  const fteExact = total / bench;
  const peopleCeil = Math.ceil(fteExact);
  return {
    processId: 'wstawianieDrobnicyRampa', label: 'Wstawianie drobnicy — rampa DG',
    unitCount: total, unitLabel: 'poz. ATII',
    minutesNeeded: r(0.44 * total, 1),
    peopleExact: r(fteExact, 2), peopleCeil,
    unitsPerPerson: r(bench, 0),
    utilizationPct: peopleCeil > 0 ? r((fteExact / peopleCeil) * 100, 1) : 0,
    drobnicalItems: drobnicalItemsRampa, kontenerAC: kontenerRozladowanyAC,
  };
}

/**
 * Wstawianie drobnicy DG — plac.
 * Źródło: ATII z Outbound (isDG, TaskCloseDate blank), count<20, vol<0.1
 * Brak składnika kontenerowego (DAX nie ma go w wzorze dla placu).
 */
export function calcWstawianieDrobnicyPlac(drobnicalItemsPlac) {
  const bench    = SHIFT_MINUTES * 0.85 / 0.44;
  const fteExact = drobnicalItemsPlac / bench;
  const peopleCeil = Math.ceil(fteExact);
  return {
    processId: 'wstawianieDrobnicyPlac', label: 'Wstawianie drobnicy — plac DG',
    unitCount: drobnicalItemsPlac, unitLabel: 'poz. ATII',
    minutesNeeded: r(0.44 * drobnicalItemsPlac, 1),
    peopleExact: r(fteExact, 2), peopleCeil,
    unitsPerPerson: r(bench, 0),
    utilizationPct: peopleCeil > 0 ? r((fteExact / peopleCeil) * 100, 1) : 0,
    drobnicalItems: drobnicalItemsPlac,
  };
}

/**
 * Rekonstrukcja CROSS — bufor (Inbound, EffectiveArrival filled, !isDG).
 * Wejście: bxCrossRampa / 10 = palety po rekonstrukcji
 */
export function calcRecoCrossRampa(bxCrossRampa) {
  const paletReko  = bxCrossRampa / 10;
  const result     = calcProcess(PROCESSES.recoCrossRampa, paletReko, 'palet po reko');
  result.inputBoxes  = bxCrossRampa;
  result.palletsReko = r(paletReko, 1);
  return result;
}

/**
 * Rekonstrukcja CROSS — plac (Outbound, !isDG, TaskCloseDate blank).
 * Wejście: bxCrossPlac / 10 = palety po rekonstrukcji
 * Uwaga: DAX nie ma filtra FinishedScanDateTime dla reko plac (tylko dla sortowania).
 */
export function calcRecoCrossPlac(bxCrossPlac) {
  const paletReko  = bxCrossPlac / 10;
  const result     = calcProcess(PROCESSES.recoCrossPlac, paletReko, 'palet po reko');
  result.inputBoxes  = bxCrossPlac;
  result.palletsReko = r(paletReko, 1);
  return result;
}

export function calcFoliaCrossRampa(bxCrossRampa) {
  const paletFolia = bxCrossRampa / 10 * 0.75;
  const result     = calcProcess(PROCESSES.foliaCrossRampa, paletFolia, 'palet do folii');
  result.inputBoxes   = bxCrossRampa;
  result.palletsReko  = r(bxCrossRampa / 10, 1);
  result.palletsFolia = r(paletFolia, 1);
  return result;
}

export function calcFoliaCrossPlac(bxCrossPlac) {
  const paletFolia = bxCrossPlac / 10 * 0.75;
  const result     = calcProcess(PROCESSES.foliaCrossPlac, paletFolia, 'palet do folii');
  result.inputBoxes   = bxCrossPlac;
  result.palletsReko  = r(bxCrossPlac / 10, 1);
  result.palletsFolia = r(paletFolia, 1);
  return result;
}

export function calcAllProcesses(kpi, ssccOutbound = []) {
  const bxCross       = kpi.sortingCrossBoxes || 0;
  const paletyZ20K    = kpi.paletyZ20K        || 0;
  const pelnePaletyDg = kpi.pelnePaletyDg     || 0;
  const kontenerSt    = kpi.kontenerSt        || 0;

  const unloading          = calcUnloading           (kpi.totalPalletsFromSSCC || 0);
  const manualContainer    = calcManualContainer     (kpi.kontenerManualCartons || 0);
  const sortingDg          = calcSortingDg           (kpi.sortingDgBoxes        || 0);
  const drobnical          = calcDrobnical           (kpi.drobnicalItems         || 0);
  const wstawianiePalet    = calcWstawianiePaletDg   (paletyZ20K, pelnePaletyDg, kontenerSt);
  const przygotowaniePalet = calcPrzygotowaniePaletDg(paletyZ20K, pelnePaletyDg, kontenerSt);
  const sortingCross       = calcSortingCross        (bxCross);
  const recoCross          = calcRecoCross           (bxCross);
  const foliaCross         = calcFoliaCross          (bxCross);

  const sortingRampa       = calcProcess(PROCESSES.sortingRampa,     kpi.sortRampaBoxes      || 0, 'kartonow');
  const sortingPlac        = calcProcess(PROCESSES.sortingPlac,      kpi.sortPlacBoxes       || 0, 'kartonow');
  const sortingCrossRampa  = calcProcess(PROCESSES.sortingCrossRampa, kpi.sortCrossRampaBoxes || 0, 'kartonow');
  const sortingCrossPlac   = calcProcess(PROCESSES.sortingCrossPlac,  kpi.sortCrossPlacBoxes  || 0, 'kartonow');
  const recoCrossRampa     = calcRecoCrossRampa(kpi.sortCrossRampaBoxes || 0);
  const recoCrossPlac      = calcRecoCrossPlac (kpi.sortCrossPlacBoxes  || 0);
  const foliaCrossRampa    = calcFoliaCrossRampa(kpi.sortCrossRampaBoxes || 0);
  const foliaCrossPlac     = calcFoliaCrossPlac (kpi.sortCrossPlacBoxes  || 0);
  const przygowanieRampa = calcPrzygotowaniePaletRampa(
    kpi.paletyZ20KRampa       || 0,
    kpi.pelnePaletyDgRampa    || 0,
    kpi.kontenerRozladowanyST || 0
  );
  const przygowaniePlac  = calcPrzygotowaniePaletPlac(
    kpi.paletyZ20KPlac        || 0,
    kpi.pelnePaletyDgPlac     || 0,
    kpi.kontenerNaPlacu_ST    || 0
  );
  const wstawanieRampa       = calcWstawianiePaletRampa(
    kpi.paletyZ20KRampa       || 0,
    kpi.pelnePaletyDgRampa    || 0,
    kpi.kontenerRozladowanyST || 0,
    kpi.kontenerManualCartons || 0
  );
  const wstawaniePlac        = calcWstawianiePaletPlac(
    kpi.paletyZ20KPlac        || 0,
    kpi.pelnePaletyDgPlac     || 0,
    kpi.kontenerNaPlacu_ST    || 0
  );
  const drobnicaRampa        = calcWstawianieDrobnicyRampa(
    kpi.drobnicalItemsRampa   || 0,
    kpi.kontenerRozladowanyAC || 0
  );
  const drobnicaPlac         = calcWstawianieDrobnicyPlac(kpi.drobnicalItemsPlac || 0);

  const totalInbound =
    unloading.peopleExact + manualContainer.peopleExact +
    sortingDg.peopleExact + drobnical.peopleExact +
    wstawianiePalet.peopleExact + przygotowaniePalet.peopleExact +
    sortingCross.peopleExact + recoCross.peopleExact + foliaCross.peopleExact;

  const totalMagazyn =
    sortingRampa.peopleExact + sortingPlac.peopleExact +
    sortingCrossRampa.peopleExact + sortingCrossPlac.peopleExact +
    recoCrossRampa.peopleExact + recoCrossPlac.peopleExact +
    foliaCrossRampa.peopleExact + foliaCrossPlac.peopleExact +
    przygowanieRampa.peopleExact + przygowaniePlac.peopleExact +
    wstawanieRampa.peopleExact + wstawaniePlac.peopleExact +
    drobnicaRampa.peopleExact + drobnicaPlac.peopleExact;

  return {
    unloadingPallets:  kpi.totalPalletsFromSSCC || 0,
    manualCartons:     kpi.kontenerManualCartons || 0,
    dgBoxes:           kpi.sortingDgBoxes        || 0,
    dgDrobnicalItems:  kpi.drobnicalItems        || 0,
    dgPaletyZ20K:      paletyZ20K,
    dgPelnePalety:     pelnePaletyDg,
    dgKontenerSt:      kontenerSt,
    crossBoxes:        bxCross,
    crossPalletsReko:  r(bxCross / 10,        1),
    crossPalletsFolia: r(bxCross / 10 * 0.75, 1),
    sortRampaBoxes:      kpi.sortRampaBoxes        || 0,
    sortPlacBoxes:       kpi.sortPlacBoxes         || 0,
    sortCrossRampaBoxes: kpi.sortCrossRampaBoxes   || 0,
    sortCrossPlacBoxes:  kpi.sortCrossPlacBoxes    || 0,
    przygowanieRampa, przygowaniePlac,
    wstawanieRampa, wstawaniePlac,
    drobnicaRampa, drobnicaPlac,
    recoCrossRampa, recoCrossPlac,
    foliaCrossRampa, foliaCrossPlac,
    processes: {
      unloading, manualContainer,
      sortingDg, drobnical, wstawianiePalet, przygotowaniePalet,
      sortingCross, recoCross, foliaCross,
      sortingRampa, sortingPlac, sortingCrossRampa, sortingCrossPlac,
      recoCrossRampa, recoCrossPlac, foliaCrossRampa, foliaCrossPlac,
      przygowanieRampa, przygowaniePlac,
      wstawanieRampa, wstawaniePlac,
      drobnicaRampa, drobnicaPlac,
    },
    totalPeople:  r(totalInbound + totalMagazyn, 2),
    totalInbound: r(totalInbound, 2),
    totalMagazyn: r(totalMagazyn, 2),
  };
}
