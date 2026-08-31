// ─────────────────────────────────────────────────────────────────────────────
// report.js — zbiorczy raport (Volumen per proces / FTE per proces),
// łączący procesy Inbound (processes.js) i Outbound (processesOutbound.js)
// w jedną listę na potrzeby wysyłki mailowej.
// ─────────────────────────────────────────────────────────────────────────────

import { round, nextBusinessDay, today, formatDate } from "./utils.js";

// Kolejność i etykiety wierszy = docelowy raport ustalony z użytkownikiem.
// computed:false → proces jeszcze nie liczony w aplikacji, wiersz zostaje
// w tabeli jako placeholder ("—", na czerwono), do dogrania później.
export const REPORT_ROWS = [
  { id: "pickByOrder",           label: "Pick by Order",                    unit: "karton",   source: "outbound", key: "pickByOrder" },
  { id: "pickByItem",            label: "Pick by Item",                     unit: "karton",   source: "outbound", key: "pickByItem" },
  { id: "pickByOrderMezzanine",  label: "Pick by Order - Mezzanine",        unit: "karton",   source: "outbound", key: "pickByOrderMezzanine" },
  { id: "pickByItemMezzanine",   label: "Pick by Item - Mezzanine",         unit: "karton",   source: "outbound", key: "pickByItemMezzanine" },
  { id: "fullPallets",           label: "Full pallets",                     unit: "paleta",   source: "outbound", key: "fullPalletsMission" },
  { id: "replenishment",         label: "Replenishment",                    unit: "paleta",   source: "outbound", key: "replenishment" },
  { id: "transfer",              label: "Transfer",                         unit: "paleta",   source: "outbound", key: "transfer" },
  { id: "foilingCross",          label: "Foiling (system + cross)",         unit: "paleta",   source: "outbound", key: "palletsFoiling" },
  { id: "loadingPallets",        label: "Loading pallets (system + cross)", unit: "paleta",   source: null },
  { id: "loadingBoxes",          label: "Loading boxes (system + cross)",   unit: "karton",   source: null },
  { id: "exports",               label: "Exports",                          unit: "—",        source: null },
  { id: "repalletizing",         label: "Repalletizing",                    unit: "—",        source: null },
  { id: "checkPack",             label: "Check&Pack",                       unit: "—",        source: null },
  { id: "consolidationPbi",      label: "Consolidation PBI",                unit: "—",        source: null },
  { id: "checkPackParcels",      label: "Check&Pack Parcels",               unit: "—",        source: null },
  { id: "unloadingPallet",       label: "Unloading pallet",                 unit: "—",        source: null },
  { id: "unloadingBox",          label: "Unloading box",                    unit: "—",        source: null },
  { id: "palletSorting",         label: "Pallet sorting",                   unit: "paleta",   source: "inbound",  key: "przygotowaniePalet" },
  { id: "receivingFullPallet",   label: "Receiving Full Pallet",            unit: "paleta",   source: "inbound",  key: "unloading" },
  { id: "boxSorting",            label: "Box sorting",                      unit: "karton",   source: "inbound",  key: "sortingDg" },
  { id: "receivingBox",          label: "Receiving box",                    unit: "karton",   source: "inbound",  key: "manualContainer" },
  { id: "crossDockRecon",        label: "Cross Dock - recon.",              unit: "paleta",   source: "inbound",  key: "recoCross" },
  { id: "crossDockSorting",      label: "Cross Dock - sorting",             unit: "karton",   source: "inbound",  key: "sortingCross" },
  { id: "vasLabels",             label: "VAS labels",                       unit: "etykieta", source: "outbound", key: "vas" },
];

function sumOutboundField(processesResult, key, field) {
  const result = processesResult?.[key];
  if (!result) return null;
  const total = result.clients.reduce((sum, c) => sum + (c[field] || 0), 0);
  return round(total, field === "fte" ? 2 : 1);
}

/**
 * Buduje wiersze raportu na podstawie aktualnie policzonych procesów
 * Inbound (calcAllProcesses → staffing) i Outbound (calcAllOutboundProcesses).
 * Zwraca dla każdego wiersza: volume (Ilość) i fteProcess/fteShift (FTE
 * per proces / FTE per zmianę = fteProcess / 3). Wartość null = brak danych
 * (albo proces jeszcze nie wgrany, albo w ogóle nie liczony w aplikacji).
 */
export function buildReportRows(staffing, outboundProcesses) {
  return REPORT_ROWS.map((def) => {
    if (!def.source) {
      return { ...def, computed: false, volume: null, fteProcess: null, fteShift: null };
    }

    let volume = null;
    let fteProcess = null;

    if (def.source === "inbound") {
      const proc = staffing?.processes?.[def.key];
      if (proc) {
        volume = round(proc.unitCount, 1);
        fteProcess = proc.peopleExact;
      }
    } else {
      volume = sumOutboundField(outboundProcesses, def.key, "result");
      fteProcess = sumOutboundField(outboundProcesses, def.key, "fte");
    }

    const fteShift = fteProcess != null ? round(fteProcess / 3, 1) : null;
    return { ...def, computed: true, volume, fteProcess, fteShift };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WYSYŁKA MAILEM — konfiguracja odbiorców + tabela w formacie do wklejenia
// ─────────────────────────────────────────────────────────────────────────────

// Dzień, na który zawsze planujemy: najbliższy dzień roboczy (piątek → poniedziałek).
export function getMailPlanningDateLabel() {
  return formatDate(nextBusinessDay(today()));
}

export const VOLUME_MAIL = {
  to: "denys.pylypko@fortunahr.pl",
  cc: [
    "Artur.Stasinski@fiege.pl",
    "Witold.Masson@fiege.pl",
    "magazyn3m.dg@fiege.pl",
    "Agnieszka.Tosza@fiege.pl",
  ],
  subject: "Zamawianie usługi",
};

export const FTE_MAIL = {
  to: "magazyn3m.dg@fiege.pl",
  cc: [
    "Witold.Masson@fiege.pl",
    "Artur.Stasinski@fiege.pl",
  ],
  subject: "RE: Planowanie",
};

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumberPl(value) {
  return (value ?? 0).toLocaleString("pl-PL");
}

// Style inline (nie klasy CSS) — tabela trafia do schowka i jest wklejana
// do maila, więc nie ma dostępu do arkusza stylów aplikacji.
const MAIL_TABLE_CELL = {
  th:     'style="border:1px solid #b5b3ad;padding:6px 10px;background:#f0efe9;' +
          'font:600 12px/1.3 Calibri,Arial,sans-serif;text-align:left;"',
  thNum:  'style="border:1px solid #b5b3ad;padding:6px 10px;background:#f0efe9;' +
          'font:600 12px/1.3 Calibri,Arial,sans-serif;text-align:right;"',
  td:     'style="border:1px solid #d8d6d0;padding:5px 10px;' +
          'font:12px/1.3 Calibri,Arial,sans-serif;"',
  tdNum:  'style="border:1px solid #d8d6d0;padding:5px 10px;' +
          'font:12px/1.3 Calibri,Arial,sans-serif;text-align:right;"',
  tdNa:   'style="border:1px solid #d8d6d0;padding:5px 10px;color:#a32d2d;' +
          'font:12px/1.3 Calibri,Arial,sans-serif;"',
  tdNaNum:'style="border:1px solid #d8d6d0;padding:5px 10px;color:#a32d2d;' +
          'font:12px/1.3 Calibri,Arial,sans-serif;text-align:right;"',
};

/**
 * Buduje samodzielną (inline style) tabelę HTML "Volumen per proces" —
 * do skopiowania do schowka i wklejenia w treści maila.
 */
export function buildVolumeMailTableHtml(rows) {
  const head =
    `<tr><th ${MAIL_TABLE_CELL.th}>Proces</th>` +
    `<th ${MAIL_TABLE_CELL.thNum}>Volumen</th>` +
    `<th ${MAIL_TABLE_CELL.th}>Jednostka</th></tr>`;

  const body = rows
    .map((row) => {
      const hasValue = row.computed && row.volume != null;
      const tdText = hasValue ? MAIL_TABLE_CELL.td : MAIL_TABLE_CELL.tdNa;
      const tdNum  = hasValue ? MAIL_TABLE_CELL.tdNum : MAIL_TABLE_CELL.tdNaNum;
      return (
        `<tr><td ${tdText}>${escapeHtml(row.label)}</td>` +
        `<td ${tdNum}>${hasValue ? formatNumberPl(row.volume) : "—"}</td>` +
        `<td ${tdText}>${hasValue ? escapeHtml(row.unit) : ""}</td></tr>`
      );
    })
    .join("");

  return `<table style="border-collapse:collapse;">${head}${body}</table>`;
}

/**
 * Buduje samodzielną (inline style) tabelę HTML "FTE per proces" —
 * do skopiowania do schowka i wklejenia w treści maila. Zawiera też
 * wiersz "Razem" z sumą FTE per proces / FTE per zmianę, tak jak na stronie.
 */
export function buildFteMailTableHtml(rows) {
  const head =
    `<tr><th ${MAIL_TABLE_CELL.th}>Proces</th>` +
    `<th ${MAIL_TABLE_CELL.thNum}>FTE per proces</th>` +
    `<th ${MAIL_TABLE_CELL.thNum}>FTE per zmianę</th></tr>`;

  let fteProcTotal = 0;
  let fteShiftTotal = 0;
  const body = rows
    .map((row) => {
      const fteProc  = row.computed ? row.fteProcess : null;
      const fteShift = row.computed ? row.fteShift   : null;
      if (fteProc  != null) fteProcTotal  += fteProc;
      if (fteShift != null) fteShiftTotal += fteShift;
      const tdText = fteProc != null ? MAIL_TABLE_CELL.td    : MAIL_TABLE_CELL.tdNa;
      const tdNum  = fteProc != null ? MAIL_TABLE_CELL.tdNum : MAIL_TABLE_CELL.tdNaNum;
      return (
        `<tr><td ${tdText}>${escapeHtml(row.label)}</td>` +
        `<td ${tdNum}>${fteProc  != null ? formatNumberPl(fteProc)  : "—"}</td>` +
        `<td ${tdNum}>${fteShift != null ? formatNumberPl(fteShift) : "—"}</td></tr>`
      );
    })
    .join("");

  const totalRow =
    `<tr><td ${MAIL_TABLE_CELL.th}>Razem</td>` +
    `<td ${MAIL_TABLE_CELL.thNum}>${formatNumberPl(round(fteProcTotal, 2))}</td>` +
    `<td ${MAIL_TABLE_CELL.thNum}>${formatNumberPl(round(fteShiftTotal, 1))}</td></tr>`;

  return `<table style="border-collapse:collapse;">${head}${body}${totalRow}</table>`;
}
