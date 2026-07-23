// ─────────────────────────────────────────────────────────────────────────────
// outboundIndicators.js — wskaźniki logistyczne Outbound (edytowalne, per proces)
// Na tym etapie trzymane w localStorage; docelowo do przeniesienia na backend/API.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "outboundLogisticIndicators";

// standardTime = "czas standardowy" per proces — na razie wpisany ręcznie,
// docelowo ma pochodzić z API. Podane tylko dla PICK BY ORDER, reszta = 0
// dopóki nie dostaniemy wartości dla kolejnych procesów.
export const DEFAULT_OUTBOUND_INDICATORS = [
  {
    id: "pick-by-order",
    label: "PICK BY ORDER",
    value: 3.251294,
    standardTime: 0.321,
  },
  {
    id: "pick-by-item",
    label: "PICK BY ITEM",
    value: 0.977313,
    standardTime: 0.44,
  },
  {
    id: "pick-by-order-mezzanine",
    label: "PICK BY ORDER / MEZZANINE",
    value: 0.281636,
    standardTime: 0.7319,
  },
  {
    id: "pick-by-item-mezzanine",
    label: "PICK BY ITEM / MEZZANINE",
    value: 0.15271,
    standardTime: 0.7108,
  },
  {
    id: "full-pallets-mission",
    label: "FULL PALLETS MISSION",
    value: 0.086396,
    standardTime: 3.2189,
  },
  {
    id: "replenishment",
    label: "REPLENISHMENT",
    value: 0.097341,
    standardTime: 2.6945,
  },
  { id: "transfer", label: "TRANSFER", value: 0.042848, standardTime: 0 },
  {
    id: "pallets-foiling",
    label: "PALLETS FOILING",
    value: 0.149472,
    standardTime: 0,
  },
  {
    id: "pallets-loading",
    label: "PALLETS LOADING",
    value: 0.159984,
    standardTime: 0,
  },
  {
    id: "boxes-loading",
    label: "BOXES LOADING",
    value: 0.03006,
    standardTime: 0,
  },
  {
    id: "pallets-loading-xdock",
    label: "PALLETS LOADING (XDOCK)",
    value: 0.126941,
    standardTime: 0,
  },
  {
    id: "boxes-loading-xdock",
    label: "BOXES LOADING (XDOCK)",
    value: 0.078636,
    standardTime: 0,
  },
  {
    id: "pallet-change",
    label: "PALLET CHANGE",
    value: 0.003009,
    standardTime: 0,
  },
  { id: "exports", label: "EXPORTS", value: 0.013497, standardTime: 0 },
  { id: "spacer-1", spacer: true },
  {
    id: "check-pack-pbo",
    label: "CHECK&PACK PBO",
    value: 3.189373,
    standardTime: 0,
  },
  {
    id: "check-pack-pbi",
    label: "CHECK&PACK PBI",
    value: 1.115447,
    standardTime: 0,
  },
  { id: "spacer-2", spacer: true },
  {
    id: "check-pack-dpd",
    label: "CHECK&PACK DPD",
    value: 0.317995,
    standardTime: 0,
  },
];

function cloneDefaults() {
  return DEFAULT_OUTBOUND_INDICATORS.map((row) => ({ ...row }));
}

export function loadOutboundIndicators() {
  const defaults = cloneDefaults();
  let saved;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  if (!Array.isArray(saved)) return defaults;

  return defaults.map((row) => {
    if (row.spacer) return row;
    const savedRow = saved.find((r) => r.id === row.id);
    if (!savedRow) return row;
    return {
      ...row,
      value: Number.isFinite(savedRow.value) ? savedRow.value : row.value,
      standardTime: Number.isFinite(savedRow.standardTime)
        ? savedRow.standardTime
        : row.standardTime,
    };
  });
}

export function setOutboundIndicatorField(indicators, id, field, value) {
  const updated = indicators.map((row) =>
    row.id === id ? { ...row, [field]: value } : row,
  );
  persist(updated);
  return updated;
}

function persist(indicators) {
  const toSave = indicators
    .filter((row) => !row.spacer)
    .map((row) => ({
      id: row.id,
      value: row.value,
      standardTime: row.standardTime,
    }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}
