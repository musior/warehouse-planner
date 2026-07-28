// ─────────────────────────────────────────────────────────────────────────────
// processesOutbound.js — logika procesów Outbound (Forecast 3M / Solventum)
// ─────────────────────────────────────────────────────────────────────────────

import { isSameDay, nextBusinessDay, today, round } from "./utils.js";

// Statusy linii dla procesów "out" i procesów "VAS" (VAS = out + copacking)
export const LINE_STATUS_OUT = [
  "During picking",
  "Not released",
  "Ready for picking",
];
export const LINE_STATUS_VAS = [...LINE_STATUS_OUT, "On copacking zone"];

// Check&Pack filtrują szerzej niż zwykłe procesy "out" — dodatkowo uwzględniają
// linie już przekazane dalej w procesie (kontrola, copacking, konsolidacja).
export const LINE_STATUS_CHECK_PACK = [
  ...LINE_STATUS_OUT,
  "On control zone",
  "On copacking zone",
  "Waiting for consolidation",
];

// Kolejność wyświetlania grup procesów w zakładce Procesy (Outbound).
export const PROCESS_GROUP_ORDER = [
  "Picking",
  "Pallet Operations",
  "Loading",
  "Exports",
  "Check&Pack",
  "VAS",
  "Others",
];

// Procesy, które liczą FTE wg wzoru: (ilość linii × wskaźnik) × czas standardowy / 408.
// Ilość linii jest liczona identycznie dla procesów z tym samym statusSet (patrz
// analyzeForecastRows) — różni je tylko wskaźnik logistyczny, czas standardowy
// i ewentualnie filtr LINE_STATUS (statusSet). Pole "group" decyduje tylko o
// pogrupowaniu wizualnym w UI, nie wpływa na obliczenia.
const LINE_COUNT_PROCESSES = [
  {
    key: "pickByOrder",
    indicatorId: "pick-by-order",
    label: "PICK BY ORDER",
    icon: "&#128230;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Picking",
  },
  {
    key: "pickByItem",
    indicatorId: "pick-by-item",
    label: "PICK BY ITEM",
    icon: "&#128203;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Picking",
  },
  {
    key: "pickByOrderMezzanine",
    indicatorId: "pick-by-order-mezzanine",
    label: "PICK BY ORDER / MEZZANINE",
    icon: "&#127970;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Picking",
  },
  {
    key: "pickByItemMezzanine",
    indicatorId: "pick-by-item-mezzanine",
    label: "PICK BY ITEM / MEZZANINE",
    icon: "&#128194;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Picking",
  },
  {
    key: "fullPalletsMission",
    indicatorId: "full-pallets-mission",
    label: "FULL PALLETS MISSION",
    icon: "&#127919;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Pallet Operations",
  },
  {
    key: "replenishment",
    indicatorId: "replenishment",
    label: "REPLENISHMENT",
    icon: "&#128230;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Pallet Operations",
  },
  {
    key: "transfer",
    indicatorId: "transfer",
    label: "TRANSFER",
    icon: "&#128341;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Pallet Operations",
  },
  {
    key: "palletsFoiling",
    indicatorId: "pallets-foiling",
    label: "PALLETS FOILING - DG & CROSS",
    icon: "&#129963;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Others",
  },
  {
    key: "palletsLoading",
    indicatorId: "pallets-loading",
    label: "PALLETS LOADING - DG",
    icon: "&#128333;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Loading",
  },
  {
    key: "boxesLoading",
    indicatorId: "boxes-loading",
    label: "BOXES LOADING - DG",
    icon: "&#128111;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Loading",
  },
  {
    key: "palletsLoadingXDock",
    indicatorId: "pallets-loading-xdock",
    label: "PALLETS LOADING (XDOCK)",
    icon: "&#128222;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Loading",
  },
  {
    key: "boxesLoadingXDock",
    indicatorId: "boxes-loading-xdock",
    label: "BOXES LOADING (XDOCK)",
    icon: "&#128948;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Loading",
  },
  {
    key: "palletChange",
    indicatorId: "pallet-change",
    label: "PALLET CHANGE",
    icon: "&#113944;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Others",
  },
  {
    key: "exports",
    indicatorId: "exports",
    label: "EXPORTS",
    icon: "&#128230;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Exports",
  },
  {
    key: "checkPackPbo",
    indicatorId: "check-pack-pbo",
    label: "CHECK&PACK PBO",
    icon: "&#9989;",
    statusSet: LINE_STATUS_CHECK_PACK,
    filterGroup: "CHECK&PACK",
    group: "Check&Pack",
  },
  {
    key: "checkPackPbi",
    indicatorId: "check-pack-pbi",
    label: "CHECK&PACK PBI",
    icon: "&#9989;",
    statusSet: LINE_STATUS_CHECK_PACK,
    filterGroup: "CHECK&PACK",
    group: "Check&Pack",
  },
  {
    key: "checkPackDpd",
    indicatorId: "check-pack-dpd",
    label: "CHECK&PACK DPD",
    icon: "&#9989;",
    statusSet: LINE_STATUS_CHECK_PACK,
    filterGroup: "CHECK&PACK",
    group: "Check&Pack",
  },
  {
    key: "vas",
    indicatorId: "vas",
    label: "VAS",
    icon: "&#127991;",
    statusSet: LINE_STATUS_VAS,
    filterGroup: "VAS",
    metric: "vasSum", // suma kolumny VAS z pasujących linii, bez mnożenia przez wskaźnik
    group: "VAS",
  },
];

// Mianownik wzoru FTE (minuty dostępne w zmianie po odliczeniach) — na razie
// stała podana wprost, docelowo razem z czasami standardowymi ma pochodzić z API.
const OUTBOUND_FTE_DIVISOR = 408;

/**
 * Analizuje wiersze Forecastu względem filtra statusu linii i reguł dat.
 *
 * Reguła dat: liczymy WSZYSTKIE zaległe linie (data <= dzień planowania —
 * czyli backlog z dni wcześniejszych oraz dzień dzisiejszy razem z jutrem),
 * bo skoro linia ma nadal status "otwarty", to trzeba ją domknąć przy
 * najbliższym planowaniu. Dodatkowo dla Polski doliczamy jeszcze jeden
 * dzień do przodu (extraDate), ale tylko dokładnie ten dzień.
 */
function analyzeForecastRows(rows, { planningDate, extraDate, statusSet }) {
  const statusLower = statusSet.map((s) => s.toLowerCase());

  let bothMatch = 0;
  let vasSum = 0;

  for (const row of rows) {
    if (!row.expectedShipDate) continue;

    const statusOk = statusLower.includes((row.lineStatus || "").toLowerCase());
    const isPoland = (row.nameCountry || "").trim().toUpperCase() === "POLSKA";
    const dateOk =
      row.expectedShipDate.getTime() <= planningDate.getTime() ||
      (isSameDay(row.expectedShipDate, extraDate) && isPoland);

    if (statusOk && dateOk) {
      bothMatch++;
      vasSum += row.vas || 0;
    }
  }

  return { bothMatch, vasSum: round(vasSum, 2) };
}

/**
 * Liczy ilość linii (per klient) dla danego zestawu statusów (statusSet) — raz
 * na oba pliki. Procesy dzielące ten sam statusSet (np. wszystkie "OUT") współdzielą
 * ten sam wynik, żeby nie liczyć identycznego filtra po kilka razy.
 */
function computeLineStatsForStatusSet({
  forecast3m,
  forecastSolventum,
  planningDate,
  statusSet,
}) {
  const extraDate = nextBusinessDay(planningDate);
  const opts = { planningDate, extraDate, statusSet };
  return {
    extraDate,
    stats3m: analyzeForecastRows(forecast3m || [], opts),
    statsSolventum: analyzeForecastRows(forecastSolventum || [], opts),
  };
}

/**
 * Buduje wynik dla pojedynczego procesu, korzystając ze wspólnie policzonych
 * statystyk (lineStats) i wskaźnika/czasu danego procesu. Obsługuje dwie metryki:
 * - "count"  — ilość linii × wskaźnik logistyczny (domyślne, większość procesów)
 * - "vasSum" — suma kolumny VAS z pasujących linii, BEZ mnożenia przez wskaźnik
 *   (proces VAS nie ma osobnego wskaźnika logistycznego — tylko czas standardowy)
 */
function buildProcessResult(def, indicators, planningDate, lineStats) {
  const indicator = indicators.find((i) => i.id === def.indicatorId) || {};
  const indicatorValue = indicator.value ?? 0;
  const standardTime = indicator.standardTime ?? 0;
  const metric = def.metric || "count";

  const buildClient = (client, stats) => {
    const result =
      metric === "vasSum"
        ? round(stats.vasSum, 2)
        : round(stats.bothMatch * indicatorValue, 2);
    const fte = round((result * standardTime) / OUTBOUND_FTE_DIVISOR, 2);
    return {
      client,
      lineCount: stats.bothMatch,
      vasSum: stats.vasSum,
      indicatorValue,
      result,
      standardTime,
      fte,
    };
  };

  return {
    planningDate,
    extraDate: lineStats.extraDate,
    clients: [
      buildClient("3M", lineStats.stats3m),
      buildClient("Solventum", lineStats.statsSolventum),
    ],
  };
}

export function calcAllOutboundProcesses({
  forecast3m,
  forecastSolventum,
  indicators,
}) {
  const planningDate = nextBusinessDay(today());
  const lineStatsByStatusSet = new Map(); // statusSet (referencja) -> lineStats

  const result = { planningDate };
  for (const def of LINE_COUNT_PROCESSES) {
    let lineStats = lineStatsByStatusSet.get(def.statusSet);
    if (!lineStats) {
      lineStats = computeLineStatsForStatusSet({
        forecast3m,
        forecastSolventum,
        planningDate,
        statusSet: def.statusSet,
      });
      lineStatsByStatusSet.set(def.statusSet, lineStats);
    }
    result[def.key] = buildProcessResult(def, indicators, planningDate, lineStats);
  }
  return result;
}

export { LINE_COUNT_PROCESSES };
