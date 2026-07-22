// ─────────────────────────────────────────────────────────────────────────────
// outboundIndicators.js — wskaźniki logistyczne Outbound (edytowalne, per proces)
// Na tym etapie trzymane w localStorage; docelowo do przeniesienia na backend.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'outboundLogisticIndicators';

export const DEFAULT_OUTBOUND_INDICATORS = [
  { id: 'pick-by-order',            label: 'PICK BY ORDER',              value: 3.251294 },
  { id: 'pick-by-item',             label: 'PICK BY ITEM',               value: 0.977313 },
  { id: 'pick-by-order-mezzanine',  label: 'PICK BY ORDER / MEZZANINE',  value: 0.281636 },
  { id: 'pick-by-item-mezzanine',   label: 'PICK BY ITEM / MEZZANINE',   value: 0.15271  },
  { id: 'full-pallets-mission',     label: 'FULL PALLETS MISSION',       value: 0.086396 },
  { id: 'replenishment',            label: 'REPLENISHMENT',              value: 0.097341 },
  { id: 'transfer',                 label: 'TRANSFER',                   value: 0.042848 },
  { id: 'pallets-foiling',          label: 'PALLETS FOILING',            value: 0.149472 },
  { id: 'pallets-loading',          label: 'PALLETS LOADING',            value: 0.159984 },
  { id: 'boxes-loading',            label: 'BOXES LOADING',              value: 0.03006  },
  { id: 'pallets-loading-xdock',    label: 'PALLETS LOADING (XDOCK)',    value: 0.126941 },
  { id: 'boxes-loading-xdock',      label: 'BOXES LOADING (XDOCK)',      value: 0.078636 },
  { id: 'pallet-change',            label: 'PALLET CHANGE',              value: 0.003009 },
  { id: 'exports',                  label: 'EXPORTS',                    value: 0.013497 },
  { id: 'spacer-1', spacer: true },
  { id: 'check-pack-pbo',           label: 'CHECK&PACK PBO',             value: 3.189373 },
  { id: 'check-pack-pbi',           label: 'CHECK&PACK PBI',             value: 1.115447 },
  { id: 'spacer-2', spacer: true },
  { id: 'check-pack-dpd',           label: 'CHECK&PACK DPD',             value: 0.317995 },
];

function cloneDefaults() {
  return DEFAULT_OUTBOUND_INDICATORS.map(row => ({ ...row }));
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

  return defaults.map(row => {
    if (row.spacer) return row;
    const savedRow = saved.find(r => r.id === row.id);
    return savedRow && Number.isFinite(savedRow.value) ? { ...row, value: savedRow.value } : row;
  });
}

export function setOutboundIndicatorValue(indicators, id, value) {
  const updated = indicators.map(row => (row.id === id ? { ...row, value } : row));
  persist(updated);
  return updated;
}

function persist(indicators) {
  const toSave = indicators
    .filter(row => !row.spacer)
    .map(row => ({ id: row.id, value: row.value }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}
