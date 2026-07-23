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

// Procesy, które liczą FTE wg wzoru: (ilość linii × wskaźnik) × czas standardowy / 408.
// Ilość linii jest liczona identycznie dla procesów z tym samym statusSet (patrz
// analyzeForecastRows) — różni je tylko wskaźnik logistyczny, czas standardowy
// i ewentualnie filtr LINE_STATUS (statusSet).
const LINE_COUNT_PROCESSES = [
  {
    key: "pickByOrder",
    indicatorId: "pick-by-order",
    label: "PICK BY ORDER",
    icon: "&#128230;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "pickByItem",
    indicatorId: "pick-by-item",
    label: "PICK BY ITEM",
    icon: "&#128203;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "pickByOrderMezzanine",
    indicatorId: "pick-by-order-mezzanine",
    label: "PICK BY ORDER / MEZZANINE",
    icon: "&#127970;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "pickByItemMezzanine",
    indicatorId: "pick-by-item-mezzanine",
    label: "PICK BY ITEM / MEZZANINE",
    icon: "&#128194;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "fullPalletsMission",
    indicatorId: "full-pallets-mission",
    label: "FULL PALLETS MISSION",
    icon: "&#127919;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "replenishment",
    indicatorId: "replenishment",
    label: "REPLENISHMENT",
    icon: "&#128230;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "transfer",
    indicatorId: "transfer",
    label: "TRANSFER",
    icon: "&#128341;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "palletsFoiling",
    indicatorId: "pallets-foiling",
    label: "PALLETS FOILING - DG & CROSS",
    icon: "&#129963;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "palletsLoading",
    indicatorId: "pallets-loading",
    label: "PALLETS LOADING - DG",
    icon: "&#128333;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "boxesLoading",
    indicatorId: "boxes-loading",
    label: "BOXES LOADING - DG",
    icon: "&#128111;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "palletsLoadingXDock",
    indicatorId: "pallets-loading-xdock",
    label: "PALLETS LOADING (XDOCK)",
    icon: "&#128222;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "boxesLoadingXDock",
    indicatorId: "boxes-loading-xdock",
    label: "BOXES LOADING (XDOCK)",
    icon: "&#128948;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "palletChange",
    indicatorId: "pallet-change",
    label: "PALLET CHANGE",
    icon: "&#113944;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "exports",
    indicatorId: "exports",
    label: "EXPORTS",
    icon: "&#128230;",
    statusSet: LINE_STATUS_OUT,
    filterGroup: "OUT",
  },
  {
    key: "checkPackPbo",
    indicatorId: "check-pack-pbo",
    label: "CHECK&PACK PBO",
    icon: "&#9989;",
    statusSet: LINE_STATUS_CHECK_PACK,
    filterGroup: "CHECK&PACK",
  },
  {
    key: "checkPackPbi",
    indicatorId: "check-pack-pbi",
    label: "CHECK&PACK PBI",
    icon: "&#9989;",
    statusSet: LINE_STATUS_CHECK_PACK,
    filterGroup: "CHECK&PACK",
  },
  {
    key: "checkPackDpd",
    indicatorId: "check-pack-dpd",
    label: "CHECK&PACK DPD",
    icon: "&#9989;",
    statusSet: LINE_STATUS_CHECK_PACK,
    filterGroup: "CHECK&PACK",
  },
];

// Mianownik wzoru FTE (minuty dostępne w zmianie po odliczeniach) — na razie
// stała podana wprost, docelowo razem z czasami standardowymi ma pochodzić z API.
const OUTBOUND_FTE_DIVISOR = 408;

/**
 * Analizuje wiersze Forecastu względem filtra statusu linii i reguł dat,
 * jednocześnie zbierając statystyki diagnostyczne (przydatne dopóki nie mamy
 * pewności co do dokładnego formatu plików wsadowych).
 *
 * Reguła dat: liczymy WSZYSTKIE zaległe linie (data <= dzień planowania —
 * czyli backlog z dni wcześniejszych oraz dzień dzisiejszy razem z jutrem),
 * bo skoro linia ma nadal status "otwarty", to trzeba ją domknąć przy
 * najbliższym planowaniu. Dodatkowo dla Polski doliczamy jeszcze jeden
 * dzień do przodu (extraDate), ale tylko dokładnie ten dzień.
 */
function analyzeForecastRows(rows, { planningDate, extraDate, statusSet }) {
  const statusLower = statusSet.map((s) => s.toLowerCase());
  const statusesSeen = new Map(); // status -> ile razy wystąpił
  const badDateSamples = [];

  let unparsedDates = 0;
  let statusMatch = 0;
  let dateMatch = 0;
  let bothMatch = 0;

  for (const row of rows) {
    if (row.lineStatus) {
      statusesSeen.set(
        row.lineStatus,
        (statusesSeen.get(row.lineStatus) || 0) + 1,
      );
    }

    if (!row.expectedShipDate) {
      unparsedDates++;
      if (badDateSamples.length < 5)
        badDateSamples.push(row.rawExpectedShipDate);
      continue;
    }

    const statusOk = statusLower.includes((row.lineStatus || "").toLowerCase());
    const isPoland = (row.nameCountry || "").trim().toUpperCase() === "POLSKA";
    const dateOk =
      row.expectedShipDate.getTime() <= planningDate.getTime() ||
      (isSameDay(row.expectedShipDate, extraDate) && isPoland);

    if (statusOk) statusMatch++;
    if (dateOk) dateMatch++;
    if (statusOk && dateOk) bothMatch++;
  }

  return {
    totalRows: rows.length,
    unparsedDates,
    statusMatch,
    dateMatch,
    bothMatch,
    badDateSamples,
    statusesSeen: [...statusesSeen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([status, count]) => ({ status, count })),
  };
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
 * Buduje wynik dla pojedynczego procesu "ilość linii × wskaźnik", korzystając
 * ze wspólnie policzonej ilości linii (lineStats) i wskaźnika/czasu danego procesu.
 */
function buildLineCountResult(
  indicatorId,
  indicators,
  planningDate,
  lineStats,
) {
  const indicator = indicators.find((i) => i.id === indicatorId) || {};
  const indicatorValue = indicator.value ?? 0;
  const standardTime = indicator.standardTime ?? 0;

  const buildClient = (client, stats) => {
    const result = round(stats.bothMatch * indicatorValue, 2);
    const fte = round((result * standardTime) / OUTBOUND_FTE_DIVISOR, 2);
    return {
      client,
      lineCount: stats.bothMatch,
      indicatorValue,
      result,
      standardTime,
      fte,
      debug: stats,
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
    result[def.key] = buildLineCountResult(
      def.indicatorId,
      indicators,
      planningDate,
      lineStats,
    );
  }
  return result;
}

export { LINE_COUNT_PROCESSES };
