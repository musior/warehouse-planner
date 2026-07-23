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

// Procesy, które liczą FTE wg wzoru: (ilość linii × wskaźnik) × czas standardowy / 408.
// Ilość linii jest liczona identycznie dla każdego z nich (patrz analyzeForecastRows),
// różni je tylko wskaźnik logistyczny i czas standardowy z zakładki Wskaźniki.
const LINE_COUNT_PROCESSES = [
  {
    key: "pickByOrder",
    indicatorId: "pick-by-order",
    label: "PICK BY ORDER",
    icon: "&#128230;",
  },
  {
    key: "pickByItem",
    indicatorId: "pick-by-item",
    label: "PICK BY ITEM",
    icon: "&#128203;",
  },
  {
    key: "pickByOrderMezzanine",
    indicatorId: "pick-by-order-mezzanine",
    label: "PICK BY ORDER / MEZZANINE",
    icon: "&#127970;",
  },
  {
    key: "pickByItemMezzanine",
    indicatorId: "pick-by-item-mezzanine",
    label: "PICK BY ITEM / MEZZANINE",
    icon: "&#128194;",
  },
  {
    key: "fullPalletsMission",
    indicatorId: "full-pallets-mission",
    label: "FULL PALLETS MISSION",
    icon: "&#127919;",
  },
  {
    key: "replenishment",
    indicatorId: "replenishment",
    label: "REPLENISHMENT",
    icon: "&#128230;",
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
 * Liczy ilość linii (per klient) wg wspólnej reguły "out" — raz na oba pliki,
 * bo wszystkie procesy z LINE_COUNT_PROCESSES filtrują dokładnie tak samo.
 */
function computeOutLineStats({ forecast3m, forecastSolventum, planningDate }) {
  const extraDate = nextBusinessDay(planningDate);
  const opts = { planningDate, extraDate, statusSet: LINE_STATUS_OUT };
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
  const lineStats = computeOutLineStats({
    forecast3m,
    forecastSolventum,
    planningDate,
  });

  const result = { planningDate };
  for (const def of LINE_COUNT_PROCESSES) {
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
