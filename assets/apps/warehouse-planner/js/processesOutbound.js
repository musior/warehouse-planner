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

const ICON_PICKING = "&#128230;"; // 📦 karton — Picking

const ICON_FORKLIFT =
  '<img src="/assets/apps/warehouse-planner/icons/pallet-operations.png" alt="">';

const ICON_PALLET_JACK =
  '<img src="/assets/apps/warehouse-planner/icons/loading.png" alt="">';

const ICON_EXPORT_DOC = "&#129534;";
const ICON_FOILING = "&#127744;";
const ICON_PALLET_CHANGE = "&#128260;";
const ICON_VAS = "🏷️";

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
    icon: ICON_PICKING,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Picking",
  },
  {
    key: "pickByItem",
    indicatorId: "pick-by-item",
    label: "PICK BY ITEM",
    icon: ICON_PICKING,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Picking",
  },
  {
    key: "pickByOrderMezzanine",
    indicatorId: "pick-by-order-mezzanine",
    label: "PICK BY ORDER / MEZZANINE",
    icon: ICON_PICKING,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Picking",
  },
  {
    key: "pickByItemMezzanine",
    indicatorId: "pick-by-item-mezzanine",
    label: "PICK BY ITEM / MEZZANINE",
    icon: ICON_PICKING,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Picking",
  },
  {
    key: "fullPalletsMission",
    indicatorId: "full-pallets-mission",
    label: "FULL PALLETS MISSION",
    icon: ICON_FORKLIFT,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Pallet Operations",
  },
  {
    key: "replenishment",
    indicatorId: "replenishment",
    label: "REPLENISHMENT",
    icon: ICON_FORKLIFT,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Pallet Operations",
  },
  {
    key: "transfer",
    indicatorId: "transfer",
    label: "TRANSFER",
    icon: ICON_FORKLIFT,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Pallet Operations",
  },
  {
    key: "palletsFoiling",
    indicatorId: "pallets-foiling",
    label: "PALLETS FOILING - DG & CROSS",
    icon: ICON_FOILING,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Others",
  },
  {
    key: "palletsLoading",
    indicatorId: "pallets-loading",
    label: "PALLETS LOADING - DG",
    icon: ICON_PALLET_JACK,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Loading",
  },
  {
    key: "boxesLoading",
    indicatorId: "boxes-loading",
    label: "BOXES LOADING - DG",
    icon: ICON_PALLET_JACK,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Loading",
  },
  {
    key: "palletsLoadingXDock",
    indicatorId: "pallets-loading-xdock",
    label: "PALLETS LOADING (XDOCK)",
    icon: ICON_PALLET_JACK,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Loading",
  },
  {
    key: "boxesLoadingXDock",
    indicatorId: "boxes-loading-xdock",
    label: "BOXES LOADING (XDOCK)",
    icon: ICON_PALLET_JACK,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Loading",
  },
  {
    key: "palletChange",
    indicatorId: "pallet-change",
    label: "PALLET CHANGE",
    icon: ICON_PALLET_CHANGE,
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
    group: "Others",
  },
  {
    key: "exports",
    indicatorId: "exports",
    label: "EXPORTS",
    icon: ICON_EXPORT_DOC,
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
    icon: ICON_VAS,
    statusSet: LINE_STATUS_VAS,
    filterGroup: "VAS",
    nameListFilter: "NOT_RWK", // wszystko poza NAME_LIST = "RWK" (ten trafia do procesu RWK)
    metric: "vasSum", // suma kolumny VAS z pasujących linii, bez mnożenia przez wskaźnik
    group: "VAS",
  },
  {
    key: "rwk",
    indicatorId: "rwk",
    label: "RWK",
    icon: ICON_VAS,
    statusSet: LINE_STATUS_VAS,
    filterGroup: "VAS",
    nameListFilter: "RWK", // wydzielone z VAS: tylko NAME_LIST = "RWK"
    metric: "vasSum",
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
 *
 * nameListFilter (opcjonalny) rozdziela VAS / RWK po kolumnie NAME_LIST:
 * - "RWK"     — liczymy tylko wiersze z NAME_LIST = "RWK" (proces RWK)
 * - "NOT_RWK" — liczymy wszystko OPRÓCZ NAME_LIST = "RWK" (proces VAS)
 */
function analyzeForecastRows(
  rows,
  { planningDate, extraDate, statusSet, nameListFilter },
) {
  const statusLower = statusSet.map((s) => s.toLowerCase());

  let bothMatch = 0;
  let vasSum = 0;

  for (const row of rows) {
    if (!row.expectedShipDate) continue;

    const statusOk = statusLower.includes((row.lineStatus || "").toLowerCase());
    if (!statusOk) continue;

    if (nameListFilter) {
      const isRwk = (row.nameList || "").trim().toUpperCase() === "RWK";
      if (nameListFilter === "RWK" && !isRwk) continue;
      if (nameListFilter === "NOT_RWK" && isRwk) continue;
    }

    const isPoland = (row.nameCountry || "").trim().toUpperCase() === "POLSKA";
    const dateOk =
      row.expectedShipDate.getTime() <= planningDate.getTime() ||
      (isSameDay(row.expectedShipDate, extraDate) && isPoland);

    if (dateOk) {
      bothMatch++;
      vasSum += row.vas || 0;
    }
  }

  return { bothMatch, vasSum: round(vasSum, 2) };
}

/**
 * Liczy ilość linii (per klient) dla danego zestawu statusów + opcjonalnego
 * filtra NAME_LIST — raz na oba pliki. Procesy dzielące dokładnie ten sam
 * statusSet i nameListFilter (np. wszystkie "OUT") współdzielą ten sam wynik,
 * żeby nie liczyć identycznego filtra po kilka razy.
 */
function computeLineStatsForStatusSet({
  forecast3m,
  forecastSolventum,
  planningDate,
  statusSet,
  nameListFilter,
}) {
  const extraDate = nextBusinessDay(planningDate);
  const opts = { planningDate, extraDate, statusSet, nameListFilter };
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

// Domyślny dzień planowania — najbliższy dzień roboczy po dzisiejszym.
// Wystawione jako funkcja (nie stała), żeby zawsze liczyć względem aktualnego "dziś".
export function getDefaultOutboundPlanningDate() {
  return nextBusinessDay(today());
}

export function calcAllOutboundProcesses({
  forecast3m,
  forecastSolventum,
  indicators,
  planningDate,
}) {
  planningDate = planningDate || getDefaultOutboundPlanningDate();
  const lineStatsByKey = new Map(); // "filterGroup|nameListFilter" -> lineStats

  const result = { planningDate };
  for (const def of LINE_COUNT_PROCESSES) {
    const cacheKey = def.filterGroup + "|" + (def.nameListFilter || "");
    let lineStats = lineStatsByKey.get(cacheKey);
    if (!lineStats) {
      lineStats = computeLineStatsForStatusSet({
        forecast3m,
        forecastSolventum,
        planningDate,
        statusSet: def.statusSet,
        nameListFilter: def.nameListFilter,
      });
      lineStatsByKey.set(cacheKey, lineStats);
    }
    result[def.key] = buildProcessResult(
      def,
      indicators,
      planningDate,
      lineStats,
    );
  }
  return result;
}

/**
 * Sumuje FTE ze wszystkich procesów Outbound — łącznie i per klient (3M / Solventum).
 * Dolicza też reprezentatywną liczbę linii Forecast (filtr OUT — najliczniejsza
 * grupa procesów), żeby "ilość linii" na przeglądzie reagowała na zmianę dnia
 * planowania dokładnie tak samo jak FTE, zamiast pokazywać stały rozmiar pliku.
 * Używane na karcie działu na stronie głównej i w zakładce Planowanie ludzi.
 */
export function sumOutboundFteByClient(processesResult) {
  let totalFte = 0;
  let fte3m = 0;
  let fteSolventum = 0;

  for (const def of LINE_COUNT_PROCESSES) {
    const result = processesResult?.[def.key];
    if (!result) continue;
    for (const c of result.clients) {
      totalFte += c.fte;
      if (c.client === "3M") fte3m += c.fte;
      else if (c.client === "Solventum") fteSolventum += c.fte;
    }
  }

  const outDef = LINE_COUNT_PROCESSES.find((def) => def.filterGroup === "OUT");
  const outResult = outDef ? processesResult?.[outDef.key] : null;
  const lineCount3m =
    outResult?.clients.find((c) => c.client === "3M")?.lineCount ?? 0;
  const lineCountSolventum =
    outResult?.clients.find((c) => c.client === "Solventum")?.lineCount ?? 0;

  return {
    totalFte: round(totalFte, 2),
    fte3m: round(fte3m, 2),
    fteSolventum: round(fteSolventum, 2),
    lineCount3m,
    lineCountSolventum,
  };
}

export { LINE_COUNT_PROCESSES };
