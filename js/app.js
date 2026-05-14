// ─────────────────────────────────────────────────────────────────────────────
// app.js — inicjalizacja, obsługa plików, filtrowanie dat, koordynacja
// ─────────────────────────────────────────────────────────────────────────────

import { parseSSCCCsv, parseSSCCOutboundCsv, parseAwizacjeXlsx,
         SSCC_INBOUND_FILENAME_PREFIX, SSCC_OUTBOUND_FILENAME_PREFIX } from './parsers.js';
import { buildModel, getLatestAwizacjeDate, buildKpiForSelection } from './dataModel.js';
import { initUI, renderDashboard, renderAwizacjeTable, renderSsccTable,
         renderProcessesTab, renderTimesTab, updateFileStatus, updateSlotUI } from './ui.js';
import { tomorrow, today, formatDate, isSameDay } from './utils.js';
import { calcAllProcesses }                      from './processes.js';

// ── Stan aplikacji ────────────────────────────────────────────────────────────
const state = {
  awizacje:        null,
  ssccInbound:     null,
  ssccArrived:     null,   // stary slot - nieużywany
  ssccOutbound:    null,   // SSCC Outbound (towary na magazynie)
  model:           null,
  staffing:        null,
  filterDateFrom:  null,
  filterDateTo:    null,
  selectedSisSet:  null,   // null = wszystkie zaznaczone
};

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Domyślnie: jutro
  const tmr = tomorrow();
  state.filterDateFrom = tmr;
  state.filterDateTo   = tmr;

  initUI({ onTruckSelect: () => {} });

  setupUploadOverlay();
  setupGlobalDragDrop();
  setupTabs();
  setupDateBar();
  setupTruckFilters();
  setupSearchBoxes();
  setupTruckSelection();

  applyDateToInputs();
  renderEmpty();
  renderTimesTab();
});

// ─────────────────────────────────────────────────────────────────────────────
// WYBÓR TRANSPORTÓW W ZAKŁADCE PROCESY
// ─────────────────────────────────────────────────────────────────────────────

function setupTruckSelection() {
  document.addEventListener('change', e => {
    const cb = e.target;
    if (!cb.classList.contains('truck-select-cb')) return;
    if (!state.model) return;

    const allIndividualCbs = [...document.querySelectorAll('.truck-select-cb[data-sis]')];

    if (cb.dataset.all !== undefined) {
      const checked = cb.checked;
      allIndividualCbs.forEach(c => { c.checked = checked; });
      state.selectedSisSet = checked ? null : new Set();
    } else {
      const checkedSisSet = new Set(
        allIndividualCbs.filter(c => c.checked).map(c => c.dataset.sis)
      );
      state.selectedSisSet = checkedSisSet.size === allIndividualCbs.length ? null : checkedSisSet;

      const selectAllCb = document.querySelector('.truck-select-cb[data-all]');
      if (selectAllCb) {
        selectAllCb.checked       = state.selectedSisSet === null;
        selectAllCb.indeterminate = state.selectedSisSet !== null && state.selectedSisSet.size > 0;
      }
    }

    recomputeProcessesForSelection();
  });
}

function recomputeProcessesForSelection() {
  if (!state.model) return;
  const kpi = buildKpiForSelection(state.model, state.selectedSisSet, {
    awizacje:     state.awizacje    || [],
    ssccInbound:  state.ssccInbound || [],
    ssccOutbound: state.ssccOutbound || [],
  });
  const staffing = calcAllProcesses(kpi);
  renderProcessesTab(staffing, state.model.trucks, state.selectedSisSet);

  // Przywróć stan indeterminate po ponownym renderze
  if (state.selectedSisSet !== null && state.selectedSisSet.size > 0) {
    const selectAllCb = document.querySelector('.truck-select-cb[data-all]');
    if (selectAllCb) selectAllCb.indeterminate = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUSTY STAN
// ─────────────────────────────────────────────────────────────────────────────

function renderEmpty() {
  renderDashboard({
    planningDate: state.filterDateFrom,
    trucks: [], trucksInbound: [], trucksArrived: [], trucksNoSscc: [],
    kpi: { totalTrucks:0, inboundTrucks:0, arrivedTrucks:0, noSsccTrucks:0,
           totalPalletsInbound:0, totalPalletsAll:0, totalPalletsFromSSCC:0, kontenerPallets:0 },
    awizacjeOnDate: [], ssccInbound: [], ssccArrived: [], arrivedSisSet: new Set(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PASEK DATY
// ─────────────────────────────────────────────────────────────────────────────

function setupDateBar() {
  const inputFrom  = document.getElementById('filter-date-from');
  const inputTo    = document.getElementById('filter-date-to');
  const btnPrev    = document.getElementById('btn-date-prev');
  const btnNext    = document.getElementById('btn-date-next');
  const presets    = document.querySelectorAll('.btn-preset');

  // Zmiany w inputach dat
  inputFrom?.addEventListener('change', () => {
    const d = parseDateInput(inputFrom.value);
    if (d) {
      state.filterDateFrom = d;
      clearPresets();
      updateDateBarSummary();
      tryRebuildModel();
    }
  });
  inputTo?.addEventListener('change', () => {
    const d = parseDateInput(inputTo.value);
    if (d) {
      state.filterDateTo = d;
      clearPresets();
      updateDateBarSummary();
      tryRebuildModel();
    }
  });

  // Nawigacja strzałkami — przesuń cały zakres o 1 dzień
  btnPrev?.addEventListener('click', () => shiftDateRange(-1));
  btnNext?.addEventListener('click', () => shiftDateRange(+1));

  // Presety
  presets.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      applyPreset(preset);
      presets.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function applyPreset(preset) {
  const now = today();
  const tmr = tomorrow();
  switch (preset) {
    case 'today':
      state.filterDateFrom = now;
      state.filterDateTo   = now;
      break;
    case 'tomorrow':
      state.filterDateFrom = tmr;
      state.filterDateTo   = tmr;
      break;
    case '3days': {
      state.filterDateFrom = tmr;
      const d = new Date(tmr); d.setDate(d.getDate() + 2);
      state.filterDateTo = d;
      break;
    }
    case 'week': {
      state.filterDateFrom = tmr;
      const d = new Date(tmr); d.setDate(d.getDate() + 6);
      state.filterDateTo = d;
      break;
    }
  }
  applyDateToInputs();
  tryRebuildModel();
}

function shiftDateRange(delta) {
  if (!state.filterDateFrom || !state.filterDateTo) return;
  const from = new Date(state.filterDateFrom); from.setDate(from.getDate() + delta);
  const to   = new Date(state.filterDateTo);   to.setDate(to.getDate()   + delta);
  state.filterDateFrom = from;
  state.filterDateTo   = to;
  clearPresets();
  applyDateToInputs();
  tryRebuildModel();
}

function applyDateToInputs() {
  const inputFrom = document.getElementById('filter-date-from');
  const inputTo   = document.getElementById('filter-date-to');
  if (inputFrom && state.filterDateFrom) inputFrom.value = toInputDate(state.filterDateFrom);
  if (inputTo   && state.filterDateTo)   inputTo.value   = toInputDate(state.filterDateTo);
  updateDateBarSummary();
}

function updateDateBarSummary() {
  const el = document.getElementById('date-bar-summary');
  if (!el) return;
  if (!state.filterDateFrom) { el.textContent = ''; return; }
  const from = formatDate(state.filterDateFrom);
  const to   = formatDate(state.filterDateTo);
  el.textContent = from === to ? `Wybrany dzień: ${from}` : `Zakres: ${from} — ${to}`;

  // Tytuł listy aut
  const title = document.getElementById('truck-list-title');
  if (title) title.textContent = from === to ? `Transporty — ${from}` : `Transporty ${from}–${to}`;
}

function clearPresets() {
  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
}

function toInputDate(date) {
  // YYYY-MM-DD dla input[type=date]
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateInput(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTRY LISTY AUT (W drodze / Przybyłe / Brak SSCC)
// ─────────────────────────────────────────────────────────────────────────────

function setupTruckFilters() {
  document.querySelectorAll('.btn-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      document.querySelectorAll('.truck-row').forEach(row => {
        const status = row.dataset.status || '';
        row.style.display = (filter === 'all' || status === filter) ? '' : 'none';
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WYSZUKIWARKI
// ─────────────────────────────────────────────────────────────────────────────

function setupSearchBoxes() {
  // Lista aut
  document.getElementById('truck-search')?.addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    document.querySelectorAll('.truck-row').forEach(row => {
      const visible = !q || row.textContent.toLowerCase().includes(q);
      if (!row.style.display || row.style.display !== 'none' || visible) {
        row.style.display = visible ? '' : 'none';
      }
    });
  });

  // Tabela awizacji
  document.getElementById('awizacje-search')?.addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    document.querySelectorAll('#awizacje-table-wrap tbody tr').forEach(row => {
      row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  });

  // Tabela SSCC
  document.getElementById('sscc-search')?.addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    document.querySelectorAll('#sscc-table-wrap tbody tr').forEach(row => {
      row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ZAKŁADKI
// ─────────────────────────────────────────────────────────────────────────────

function setupTabs() {
  const tabs   = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t   => t.classList.toggle('active', t.dataset.tab === target));
      panels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== target));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD OVERLAY
// ─────────────────────────────────────────────────────────────────────────────

function setupUploadOverlay() {
  const overlay  = document.getElementById('upload-overlay');
  const btnOpen  = document.getElementById('btn-upload-trigger');
  const btnClose = document.getElementById('btn-upload-close');
  const btnDone  = document.getElementById('btn-upload-close-bottom');

  btnOpen?.addEventListener('click',  () => overlay?.classList.remove('hidden'));
  btnClose?.addEventListener('click', () => overlay?.classList.add('hidden'));
  btnDone?.addEventListener('click',  () => overlay?.classList.add('hidden'));
  overlay?.addEventListener('click',  e => { if (e.target === overlay) overlay.classList.add('hidden'); });

  setupFileSlot('slot-awizacje',     'awizacje',     handleAwizacjeFile);
  setupFileSlot('slot-sscc-inbound', 'sscc-inbound', handleSsccInboundFile);
  setupFileSlot('slot-sscc-arrived', 'sscc-arrived', handleSsccArrivedFile);
}

function setupFileSlot(slotId, fileType, handler) {
  const slot  = document.getElementById(slotId);
  const input = slot?.querySelector('input[type="file"]');
  if (!slot || !input) return;

  slot.addEventListener('click',     e => { if (e.target !== input) input.click(); });
  input.addEventListener('change',   () => { if (input.files[0]) handler(input.files[0]); });
  slot.addEventListener('dragover',  e => { e.preventDefault(); slot.classList.add('drag-over'); });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', e => {
    e.preventDefault(); slot.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
  });
}

function setupGlobalDragDrop() {
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach(file => {
      const n = file.name;
      const nl = n.toLowerCase();
      if (nl.endsWith('.xlsx') || nl.endsWith('.xls')) {
        handleAwizacjeFile(file);
      } else if (nl.endsWith('.csv')) {
        const isOutbound = n.startsWith(SSCC_OUTBOUND_FILENAME_PREFIX) && !n.startsWith(SSCC_INBOUND_FILENAME_PREFIX);
        if (isOutbound) handleSsccArrivedFile(file);
        else            handleSsccInboundFile(file);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERY PLIKÓW
// ─────────────────────────────────────────────────────────────────────────────

async function handleAwizacjeFile(file) {
  updateFileStatus('awizacje', 'loading');
  updateSlotUI('slot-awizacje', 'loading', file.name);
  try {
    const buf = await readFile(file);
    state.awizacje = parseAwizacjeXlsx(buf);

    // Auto-wykryj datę planowania: szukamy "jutra" w awizacjach,
    // jeśli nie ma — bierzemy najświeższą dostępną datę z pliku.
    const tmr    = tomorrow();
    const latest = getLatestAwizacjeDate(state.awizacje);
    const hasTomorrow = state.awizacje.some(a => a.data && isSameDay(a.data, tmr));

    if (!hasTomorrow && latest) {
      // Plik nie zawiera danych na jutro — ustaw na ostatni dostępny dzień
      state.filterDateFrom = latest;
      state.filterDateTo   = latest;
      applyDateToInputs();
      clearPresets();
      // Podświetl komunikat w date-bar
      const sumEl = document.getElementById('date-bar-summary');
      if (sumEl) sumEl.title = 'Auto-ustawiono na ostatnią datę w pliku awizacji';
    }

    updateFileStatus('awizacje', 'ok');
    updateSlotUI('slot-awizacje', 'ok', file.name);
    tryRebuildModel();
  } catch (err) {
    console.error(err);
    updateFileStatus('awizacje', 'error');
    updateSlotUI('slot-awizacje', 'error', file.name);
    showError(`Błąd Awizacje: ${err.message}`);
  }
}

async function handleSsccInboundFile(file) {
  updateFileStatus('sscc-inbound', 'loading');
  updateSlotUI('slot-sscc-inbound', 'loading', file.name);
  try {
    const buf = await readFile(file);
    state.ssccInbound = parseSSCCCsv(buf, file.name);
    updateFileStatus('sscc-inbound', 'ok');
    updateSlotUI('slot-sscc-inbound', 'ok', file.name);
    tryRebuildModel();
  } catch (err) {
    console.error(err);
    updateFileStatus('sscc-inbound', 'error');
    updateSlotUI('slot-sscc-inbound', 'error', file.name);
    showError(`Błąd SSCC Inbound: ${err.message}`);
  }
}

async function handleSsccArrivedFile(file) {
  updateFileStatus('sscc-arrived', 'loading');
  updateSlotUI('slot-sscc-arrived', 'loading', file.name);
  try {
    const buf = await readFile(file);
    state.ssccOutbound = parseSSCCOutboundCsv(buf, file.name);
    // Zachowaj też w ssccArrived dla wstecznej kompatybilności z buildModel
    state.ssccArrived = state.ssccOutbound;
    updateFileStatus('sscc-arrived', 'ok');
    updateSlotUI('slot-sscc-arrived', 'ok', file.name);
    tryRebuildModel();
  } catch (err) {
    console.error(err);
    updateFileStatus('sscc-arrived', 'error');
    updateSlotUI('slot-sscc-arrived', 'error', file.name);
    showError(`Błąd SSCC Outbound: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDOWANIE MODELU
// ─────────────────────────────────────────────────────────────────────────────

function tryRebuildModel() {
  const awizacje    = state.awizacje    || [];
  const ssccInbound = state.ssccInbound || [];
  const ssccArrived = state.ssccArrived || [];
  if (awizacje.length === 0 && ssccInbound.length === 0) return;

  try {
    state.model = buildModel({
      awizacje, ssccInbound, ssccArrived,
      ssccOutbound:   state.ssccOutbound || [],
      planningDate:   state.filterDateFrom,
      filterDateFrom: state.filterDateFrom,
      filterDateTo:   state.filterDateTo,
    });

    // Oblicz zapotrzebowanie na ludzi (procesy)
    state.selectedSisSet = null; // reset selekcji przy przebudowie modelu
    state.staffing = calcAllProcesses(state.model.kpi, state.ssccOutbound || []);

    renderDashboard(state.model);
    renderAwizacjeTable(state.awizacje || [], state.filterDateFrom, state.filterDateTo);
    renderSsccTable(state.ssccInbound || []);
    renderProcessesTab(state.staffing, state.model.trucks, null);
    updateDataSummary();
  } catch (err) {
    console.error(err);
    showError(`Błąd modelu: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function updateDataSummary() {
  const el = document.getElementById('data-summary');
  if (!el || !state.model) return;
  const m = state.model;
  el.textContent = `${m.awizacjeOnDate.length} awizacji · ${m.ssccInbound.length} wierszy SSCC`;
}

function showError(msg) {
  const el = document.getElementById('error-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = () => rej(new Error('Błąd odczytu pliku'));
    r.readAsArrayBuffer(file);
  });
}
