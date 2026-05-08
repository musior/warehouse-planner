// ─────────────────────────────────────────────────────────────────────────────
// ui.js — renderowanie: KPI, lista aut, panel szczegółów, tabele zakładek
// ─────────────────────────────────────────────────────────────────────────────

import { formatDate, round, isSameDay } from './utils.js';
import { buildSsccDetailTable }         from './dataModel.js';
import { PROCESSES }                    from './processes.js';

// ── Stan UI ───────────────────────────────────────────────────────────────────
let _selectedSis   = null;
let _model         = null;
let _onTruckSelect = null;

export function initUI({ onTruckSelect }) {
  _onTruckSelect = onTruckSelect;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER GŁÓWNY
// ─────────────────────────────────────────────────────────────────────────────

export function renderDashboard(model) {
  _model = model;
  renderKPI(model.kpi);
  renderTruckList(model.trucks);
  clearDetailPanel();
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI
// ─────────────────────────────────────────────────────────────────────────────

export function renderKPI(kpi) {
  const el = document.getElementById('kpi-row');
  if (!el) return;
  el.innerHTML = [
    { label: 'Auta w drodze',      value: kpi.inboundTrucks,        sub: `z ${kpi.totalTrucks} awizacji`,    cls: '' },
    { label: 'Auta przybyłe',      value: kpi.arrivedTrucks,        sub: 'już na placu / rozładowane',       cls: kpi.arrivedTrucks > 0 ? 'ok' : '' },
    { label: 'Palet hipotetycznie',value: kpi.totalPalletsFromSSCC, sub: 'wg raportu SSCC Inbound',          cls: kpi.totalPalletsFromSSCC > 300 ? 'warn' : '' },
    { label: 'Bez danych SSCC',    value: kpi.noSsccTrucks,         sub: 'awizacje bez dopasowania',         cls: kpi.noSsccTrucks > 0 ? 'warn' : '' },
  ].map(c => `
    <div class="kpi-card">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value ${c.cls}">${c.value}</div>
      <div class="kpi-sub">${c.sub}</div>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTA AUT
// ─────────────────────────────────────────────────────────────────────────────

export function renderTruckList(trucks) {
  const el = document.getElementById('truck-list');
  if (!el) return;
  if (!trucks?.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">&#128666;</div>
      <div class="empty-text">Brak awizacji w wybranym zakresie dat</div>
      <div class="empty-sub">Wczytaj pliki lub zmień zakres dat</div>
    </div>`;
    return;
  }
  el.innerHTML = trucks.map(buildTruckRow).join('');
  el.querySelectorAll('.truck-row').forEach(row => {
    row.addEventListener('click', () => selectTruck(row.dataset.sis));
  });
}

function buildTruckRow(t) {
  const sel      = _selectedSis === t.sis ? ' selected' : '';
  const pallets  = t.pallets.total > 0 ? `${t.pallets.total} pal.` : '—';
  const destStr  = t.destinations.length > 0
    ? `${t.destinations.length} kier.`
    : '—';
  const celne    = t.isCelne          ? `<span class="badge badge-celne">CELNE</span>`          : '';
  const kontener = t.isKontenerManual ? `<span class="badge badge-kontener-manual">KON.MAN</span>`
                 : t.isKontener       ? `<span class="badge badge-kontener">KON</span>`           : '';

  return `<div class="truck-row${sel}" data-sis="${esc(t.sis)}" data-status="${esc(t.status)}">
    <div class="truck-row-main">
      <div class="truck-plate">${esc(t.sisDisplay ?? t.sis)}</div>
      <div class="truck-meta">
        <span class="truck-sos">${esc(t.sos)}</span>
        ${celne}${kontener}
      </div>
    </div>
    <div class="truck-row-stats">
      <span class="truck-time">${t.godzTime}</span>
      <span class="truck-pallets">${pallets}</span>
      <span class="truck-dest">${destStr}</span>
      ${statusBadge(t.status)}
    </div>
  </div>`;
}

function statusBadge(status) {
  const map = {
    inbound:  { cls: 'badge-inbound',  label: 'W drodze'  },
    arrived:  { cls: 'badge-arrived',  label: 'Przybyłe'  },
    'no-sscc':{ cls: 'badge-no-sscc',  label: 'Brak SSCC' },
  };
  const b = map[status] || { cls: '', label: status };
  return `<span class="badge ${b.cls}">${b.label}</span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SELEKCJA TRANSPORTU
// ─────────────────────────────────────────────────────────────────────────────

export function selectTruck(sis) {
  _selectedSis = sis;
  document.querySelectorAll('.truck-row').forEach(el =>
    el.classList.toggle('selected', el.dataset.sis === sis)
  );
  if (!_model) return;
  const truck = _model.trucks.find(t => t.sis === sis);
  if (truck) renderDetailPanel(truck);
  if (_onTruckSelect) _onTruckSelect(truck);
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL SZCZEGÓŁÓW
// ─────────────────────────────────────────────────────────────────────────────

export function renderDetailPanel(truck) {
  const el = document.getElementById('detail-panel');
  if (!el) return;

  // Nagłówek wspólny dla wszystkich typów transportu
  const headerHtml = `
    <div class="detail-header">
      <div class="detail-title">
        <span class="detail-plate">${esc(truck.sisDisplay ?? truck.sis)}</span>
        ${statusBadge(truck.status)}
        ${truck.isCelne         ? `<span class="badge badge-celne">CELNE</span>`               : ''}
        ${truck.isKontenerManual? `<span class="badge badge-kontener-manual">KONTENER MANUAL</span>` : truck.isKontener ? `<span class="badge badge-kontener">KONTENER</span>` : ''}
      </div>
      <div class="detail-meta">
        <span>Nr rej.: <strong>${esc(truck.truckPlate)}</strong></span>
        <span>Godz: <strong>${truck.godzTime}</strong></span>
        <span>SOS: <strong>${esc(truck.sos)}</strong></span>
        ${truck.businessShipper ? `<span>Źródło: <strong>${esc(truck.businessShipper)}</strong></span>` : ''}
        ${truck.ssccCount > 0   ? `<span>Wierszy SSCC: <strong>${truck.ssccCount}</strong></span>` : ''}
      </div>
    </div>`;

  // ── KONTENER — osobny widok ────────────────────────────────────────────────
  if (truck.isKontener) {
    const a = truck.awizacja;
    const palety    = (a?.st  || 0) + (a?.st2  || 0);
    const kartony   = (a?.ac  || 0) + (a?.ac2  || 0);

    if (truck.isKontenerManual) {
      // KONTENER MANUAL: liczymy tylko kartony (AC+AC2), brak SSCC
      el.innerHTML = `
        ${headerHtml}
        <div class="detail-section">
          <div class="detail-section-title">Zawartość — Kontener Manual (dane z awizacji)</div>
          <div class="pallet-breakdown">
            <div class="pallet-item">
              <span class="pallet-item-label">Kartony (AC + AC2)</span>
              <span class="pallet-item-value">${kartony}</span>
            </div>
            <div class="pallet-item">
              <span class="pallet-item-label">Palety (ST + ST2, informacyjnie)</span>
              <span class="pallet-item-value">${palety}</span>
            </div>
            <div class="pallet-item pallet-total">
              <span class="pallet-item-label">Proces</span>
              <span class="pallet-item-value" style="font-size:12px">Rozładunek i przygotowanie kont. manual</span>
            </div>
          </div>
          <div class="detail-note">
            Kontener Manual jest liczony w osobnym procesie (kartony ÷ ~1050 os./zmianę).
            Nie wlicza się do hipotetycznych palet Rozładunku.
          </div>
        </div>
      `;
    } else {
      // KONTENER zwykły: palety ST+ST2
      el.innerHTML = `
        ${headerHtml}
        <div class="detail-section">
          <div class="detail-section-title">Zawartość kontenera — dane z awizacji</div>
          <div class="pallet-breakdown">
            <div class="pallet-item">
              <span class="pallet-item-label">Palety (ST + ST2)</span>
              <span class="pallet-item-value">${palety}</span>
            </div>
            <div class="pallet-item">
              <span class="pallet-item-label">Kartony (AC + AC2)</span>
              <span class="pallet-item-value">${kartony}</span>
            </div>
            <div class="pallet-item pallet-total">
              <span class="pallet-item-label">Razem palet</span>
              <span class="pallet-item-value">${palety}</span>
            </div>
          </div>
          <div class="detail-note">
            Zwykły kontener wlicza się do procesu Rozładunek (ST+ST2 palet).
            Dane SSCC nie są dostępne w raporcie SSCC Inbound.
          </div>
        </div>
      `;
    }
    return;
  }

  // ── STANDARDOWY TRANSPORT ─────────────────────────────────────────────────
  const pallets   = truck.pallets;
  const ssccTable = buildSsccDetailTable(truck.ssccRows);

  el.innerHTML = `
    ${headerHtml}

    <div class="detail-section">
      <div class="detail-section-title">Hipotetyczne palety do rozładunku</div>
      <div class="pallet-breakdown">
        <div class="pallet-item">
          <span class="pallet-item-label">Palety (PE i inne)</span>
          <span class="pallet-item-value">${pallets.part1}</span>
        </div>
        <div class="pallet-item">
          <span class="pallet-item-label">Kartony bez palety (÷ 30)</span>
          <span class="pallet-item-value">${pallets.part2}</span>
        </div>
        <div class="pallet-item">
          <span class="pallet-item-label">Unikalne palety rodziców BX</span>
          <span class="pallet-item-value">${pallets.part3}</span>
        </div>
        <div class="pallet-item pallet-total">
          <span class="pallet-item-label">Razem</span>
          <span class="pallet-item-value">${pallets.total}</span>
        </div>
      </div>
    </div>

    ${truck.destinations.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section-title">Kierunki docelowe (${truck.destinations.length})</div>
      <div class="dest-list">
        ${truck.destinations.map(d => `
          <div class="dest-item">
            <span class="dest-flag">${flagEmoji(d.country)}</span>
            <span class="dest-code">${esc(d.code)}</span>
            <span class="dest-count">${d.count} szt.</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${ssccTable.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section-title">SSCC — palety/grupy (${ssccTable.length})</div>
      <div class="sscc-table-wrap">
        <table class="sscc-table">
          <thead><tr>
            <th>SSCC palety</th><th>Typ</th><th>Kierunek</th>
            <th>Kraj</th><th>Kartony</th><th>Waga kg</th>
          </tr></thead>
          <tbody>
            ${ssccTable.map(g => `<tr>
              <td class="sscc-num">${esc(g.palletSscc || '— bez palety')}</td>
              <td><span class="badge badge-type">${g.isPallet ? esc(g.packageType || 'PE') : 'BX'}</span></td>
              <td>${esc(g.destination)}</td>
              <td>${flagEmoji(g.country)} ${esc(g.country)}</td>
              <td>${g.boxes.length || '—'}</td>
              <td>${g.totalWeight > 0 ? round(g.totalWeight) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : `
    <div class="detail-section">
      <div class="empty-state small">
        <div class="empty-text">Brak danych SSCC dla tego transportu</div>
        <div class="empty-sub">SIS ${esc(truck.sisDisplay ?? truck.sis)} nie występuje w raporcie SSCC Inbound</div>
      </div>
    </div>`}
  `;
}

export function clearDetailPanel() {
  const el = document.getElementById('detail-panel');
  if (!el) return;
  el.innerHTML = `<div class="empty-state">
    <div class="empty-icon">&#128269;</div>
    <div class="empty-text">Wybierz transport z listy</div>
    <div class="empty-sub">Kliknij wiersz aby zobaczyć szczegóły SSCC i rozkład palet</div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABELA AWIZACJI (zakładka Awizacje)
// ─────────────────────────────────────────────────────────────────────────────

export function renderAwizacjeTable(awizacje, dateFrom, dateTo) {
  const wrap = document.getElementById('awizacje-table-wrap');
  if (!wrap) return;
  if (!awizacje?.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-text">Brak danych awizacji</div></div>`;
    return;
  }

  // Filtruj wg zakresu dat
  const rows = awizacje.filter(a => {
    if (!a.data) return true;
    if (dateFrom && a.data < dateFrom && !isSameDay(a.data, dateFrom)) return false;
    if (dateTo   && a.data > dateTo   && !isSameDay(a.data, dateTo))   return false;
    return true;
  });

  if (!rows.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-text">Brak awizacji w wybranym zakresie dat</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Data</th>
        <th>SOS</th>
        <th>Nr rejestracyjny</th>
        <th>SIS</th>
        <th>Godz</th>
        <th>Linie</th>
        <th>AC</th>
        <th>ST</th>
        <th>Cross</th>
        <th>AC2</th>
        <th>ST2</th>
        <th>HC</th>
        <th>Celne</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr${r.isKontener ? ' class="row-kontener"' : ''}>
          <td>${r.data ? formatDate(r.data) : '—'}</td>
          <td><span class="sos-chip ${sosCls(r.sos)}">${esc(r.sos)}</span></td>
          <td class="mono">${esc(r.nrRejestracyjny)}</td>
          <td class="mono">${esc(r.sis)}</td>
          <td>${r.godzTime}</td>
          <td class="num">${r.linie   || '—'}</td>
          <td class="num">${r.ac      || '—'}</td>
          <td class="num">${r.st      || '—'}</td>
          <td class="num">${r.cross   || '—'}</td>
          <td class="num">${r.ac2     || '—'}</td>
          <td class="num">${r.st2     || '—'}</td>
          <td class="num">${r.healthcare || '—'}</td>
          <td>${esc(r.celneShipmenty)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABELA SSCC (zakładka Raport SSCC)
// ─────────────────────────────────────────────────────────────────────────────

export function renderSsccTable(rows) {
  const wrap = document.getElementById('sscc-table-wrap');
  if (!wrap) return;
  if (!rows?.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-text">Brak danych SSCC</div></div>`;
    return;
  }

  // Grupuj po SIS/TruckIdentification — pokaż podsumowanie per transport
  const byTruck = new Map();
  for (const r of rows) {
    const key = r.sisKey || '—';
    if (!byTruck.has(key)) byTruck.set(key, { sisKey: key, plate: r.licensePlate, source: r.businessShipper, rows: [] });
    byTruck.get(key).rows.push(r);
  }

  const trucks = Array.from(byTruck.values());

  wrap.innerHTML = `
    <div class="sscc-summary-bar">
      ${trucks.length} transportów · ${rows.length} wierszy SSCC
    </div>
    <table class="data-table">
      <thead><tr>
        <th>SIS (TruckID)</th>
        <th>Rejestracja</th>
        <th>Źródło</th>
        <th>Wierszy</th>
        <th>BX (kartony)</th>
        <th>PE / inne</th>
        <th>Pal. hipo.</th>
        <th>Kierunki</th>
      </tr></thead>
      <tbody>
        ${trucks.map(t => {
          const bx   = t.rows.filter(r => r.packageTypeCode === 'BX').length;
          const pe   = t.rows.filter(r => r.packageTypeCode !== 'BX').length;
          const bxNP = t.rows.filter(r => r.packageTypeCode === 'BX' && !r.parentSscc).length;
          const parents = new Set(t.rows.filter(r => r.packageTypeCode === 'BX' && r.parentSscc).map(r => r.parentSscc));
          const palHipo = round(pe + bxNP / 30 + parents.size, 1);
          const dests   = new Set(t.rows.map(r => r.destinationCountryCode).filter(Boolean));
          return `<tr>
            <td class="mono">${esc(t.sisKey)}</td>
            <td class="mono">${esc(t.plate || '—')}</td>
            <td>${esc(t.source || '—')}</td>
            <td class="num">${t.rows.length}</td>
            <td class="num">${bx}</td>
            <td class="num">${pe}</td>
            <td class="num bold">${palHipo}</td>
            <td>${Array.from(dests).map(c => flagEmoji(c) + ' ' + c).join(' ')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS PLIKÓW
// ─────────────────────────────────────────────────────────────────────────────

export function updateFileStatus(fileType, status) {
  const el = document.getElementById(`file-status-${fileType}`);
  if (!el) return;
  const icons = { idle: '○', loading: '…', ok: '✓', error: '✗' };
  el.textContent = icons[status] || '○';
  el.className   = `file-status-icon ${status !== 'idle' ? status : ''}`;
}

export function updateSlotUI(slotId, status, fileName) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const nameEl = slot.querySelector('.slot-filename');
  const iconEl = slot.querySelector('.slot-status-icon');
  if (nameEl) nameEl.textContent = fileName || '';
  if (iconEl) { iconEl.className = `slot-status-icon status-${status}`; iconEl.textContent = status === 'ok' ? '✓' : status === 'error' ? '✗' : status === 'loading' ? '…' : ''; }
  slot.classList.toggle('slot-ok',    status === 'ok');
  slot.classList.toggle('slot-error', status === 'error');
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  const base = 0x1F1E6 - 65;
  return String.fromCodePoint(...code.toUpperCase().split('').map(c => c.charCodeAt(0) + base));
}

function sosCls(sos) {
  if (!sos) return '';
  const s = sos.toUpperCase();
  if (s.includes('JUECHEN') || s.includes('JÜCHEN')) return 'sos-juechen';
  if (s.includes('WROCŁAW') || s.includes('WROCLAW')) return 'sos-wroclaw';
  if (s.includes('UNIFAM'))   return 'sos-unifam';
  if (s.includes('ZULPICH') || s.includes('ZÜLPICH')) return 'sos-zulpich';
  if (s.includes('KONTENER')) return 'sos-kontener';
  if (s.includes('UK'))       return 'sos-uk';
  if (s.includes('WŁOCH') || s.includes('ITALY')) return 'sos-italy';
  if (s.includes('FRANCJA') || s.includes('XPO')) return 'sos-francja';
  return 'sos-other';
}

// ─────────────────────────────────────────────────────────────────────────────
// ZAKŁADKA: PROCESY
// ─────────────────────────────────────────────────────────────────────────────

export function renderProcessesTab(staffing, trucks = [], selectedSisSet = null) {
  const wrap = document.getElementById('processes-content');
  if (!wrap) return;

  const hasData = staffing && (
    staffing.unloadingPallets > 0 ||
    staffing.manualCartons    > 0 ||
    staffing.dgBoxes          > 0 ||
    staffing.crossBoxes       > 0
  );

  if (!staffing && trucks.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9881;</div><div class="empty-text">Brak danych do obliczenia</div><div class="empty-sub">Wczytaj pliki Awizacje i SSCC Inbound</div></div>';
    return;
  }

  if (!staffing) {
    wrap.innerHTML = '<div class="processes-layout">' + buildTransportSelectionTable(trucks, selectedSisSet) + '</div>';
    return;
  }

  const { unloading, manualContainer, sortingDg, drobnical, wstawianiePalet, przygotowaniePalet, sortingCross, recoCross, foliaCross, sortingRampa, sortingPlac, sortingCrossRampa, sortingCrossPlac, recoCrossRampa, recoCrossPlac, foliaCrossRampa, foliaCrossPlac, przygowanieRampa, przygowaniePlac, wstawanieRampa, wstawaniePlac, drobnicaRampa, drobnicaPlac } = staffing.processes;

  const crossFlowNote =
    '<div class="process-flow-note">' +
      '&#8594; Przepływ CROSS: ' +
      '<strong>' + staffing.crossBoxes + '</strong> kart.' +
      '&nbsp;&#8594;&nbsp; reko: <strong>' + staffing.crossPalletsReko + '</strong> pal. (÷10)' +
      '&nbsp;&#8594;&nbsp; folia: <strong>' + staffing.crossPalletsFolia + '</strong> pal. (×0.75)' +
    '</div>';

  wrap.innerHTML =
    '<div class="processes-layout">' +

    // Tabela wyboru transportów
    buildTransportSelectionTable(trucks, selectedSisSet) +

    // Pasek podsumowania
    '<div class="process-summary-bar">' +
      buildSummaryItem('Palet — Rozładunek',  staffing.unloadingPallets, false) +
      (staffing.manualCartons > 0 ? buildSummaryItem('Kart. Kont. Manual', staffing.manualCartons, false) : '') +
      (staffing.dgBoxes       > 0 ? buildSummaryItem('Kart. Sort. DG',     staffing.dgBoxes,       false) : '') +
      (staffing.crossBoxes    > 0 ? buildSummaryItem('Kart. Sort. CROSS',  staffing.crossBoxes,    false) : '') +
      buildSummaryItem('FTE Inbound', staffing.totalInbound, false) +
      buildSummaryItem('FTE Magazyn', staffing.totalMagazyn, false) +
      buildSummaryItem('FTE Łącznie', staffing.totalPeople, true) +
    '</div>' +

    // SEKCJA: Rozładunek
    '<div class="process-section-header">' +
      '<span class="process-section-title">Rozładunek</span>' +
      '<span class="process-section-total">' + (unloading.peopleCeil + manualContainer.peopleCeil) + ' os.</span>' +
    '</div>' +
    '<div class="process-cards">' +
      buildProcessCard({ id: 'unloading', icon: '&#128666;', label: unloading.label, result: unloading, color: 'blue',
        tooltip: ttSimple('Palety', 'Suma palet ze wybranych transportów (BX, Awizacja)', '1,4838', 275)
      }) +
      (manualContainer.unitCount > 0
        ? buildProcessCard({ id: 'manualContainer', icon: '&#128230;', label: manualContainer.label, result: manualContainer, color: 'amber',
            tooltip: ttSimple('Kartony', 'Kont. Manual (SOS=KONTENER MANUAL, Celne=W drodze)', '0,3885', 1050)
          })
        : buildProcessCardPlaceholder('Kont. Manual (brak)')) +
    '</div>' +

    // SEKCJA: DG
    '<div class="process-section-header">' +
      '<span class="process-section-title">DG — Dąbrowa Hub</span>' +
      '<span class="process-section-total">' + (sortingDg.peopleCeil + drobnical.peopleCeil + wstawianiePalet.peopleCeil) + ' os.</span>' +
    '</div>' +
    '<div class="process-cards">' +
      buildProcessCard({ id: 'sortingDg', icon: '&#127968;', label: sortingDg.label, result: sortingDg, color: 'green',
        tooltip: ttSimple('Kartony', 'BX: Customer=PL Dabrowa Hub, Shipper=3M + kont. Celne=W drodze', '0,3467', 1177)
      }) +
      buildProcessCard({ id: 'drobnical', icon: '&#128269;', label: drobnical.label, result: drobnical, color: 'green',
        extraRows: [{ label: 'ATII drobnica (count<20, vol<0.1)', value: staffing.dgDrobnicalItems }],
        tooltip: ttSimple('Poz. ATII', 'Unikalne ATII (count&lt;20 i vol&lt;0.1); Customer=DG/SOLVENTUM, Shipper=3M', '0,44', 927)
      }) +
      buildProcessCard({ id: 'wstawianiePalet', icon: '&#128230;', label: wstawianiePalet.label, result: wstawianiePalet, color: 'teal',
        extraRows: [
          { label: 'Palety_z_20K (over01vol+over20)', value: staffing.dgPaletyZ20K },
          { label: 'Pelne palety DG (PE)', value: staffing.dgPelnePalety },
          { label: 'Kontener ST', value: staffing.dgKontenerSt },
          { label: 'FTE_20K + FTE_FP', value: wstawianiePalet.fte20K + ' + ' + wstawianiePalet.fteFP },
        ],
        tooltip: ttTwoComp('Palety_z_20K (over01vol+over20)', 'Pełne palety DG (PE) + Kontener ST', '2,9073', 140)
      }) +
      buildProcessCard({ id: 'przygotowaniePalet', icon: '&#128218;', label: przygotowaniePalet.label, result: przygotowaniePalet, color: 'indigo',
        extraRows: [
          { label: 'Palety_z_20K / ' + przygotowaniePalet.bench20K, value: 'FTE_20K = ' + przygotowaniePalet.fte20K },
          { label: '(PE+ST) / ' + przygotowaniePalet.benchFP, value: 'FTE_FP = ' + przygotowaniePalet.fteFP },
        ],
        tooltip: ttTwoCompDiff('Palety_z_20K', 'Pełne palety DG (PE) + Kontener ST', '1,56', 261, '1,22', 334)
      }) +
    '</div>' +

    // SEKCJA: CROSS
    '<div class="process-section-header">' +
      '<span class="process-section-title">CROSS</span>' +
      '<span class="process-section-total">' + (sortingCross.peopleCeil + recoCross.peopleCeil + foliaCross.peopleCeil) + ' os.</span>' +
    '</div>' +
    (staffing.crossBoxes > 0 ? crossFlowNote : '') +
    '<div class="process-cards">' +
      buildProcessCard({ id: 'sortingCross', icon: '&#8635;', label: sortingCross.label, result: sortingCross, color: 'purple',
        tooltip: ttSimple('Kartony', 'BX: Customer&ne;DG/SOLVENTUM, Shipper=3M, EffArrival puste', '0,3724', 1096)
      }) +
      buildProcessCard({ id: 'recoCross', icon: '&#128260;', label: recoCross.label, result: recoCross, color: 'teal',
        extraRows: [{ label: 'Kartony ÷ 10', value: staffing.crossBoxes + ' ÷ 10 = ' + staffing.crossPalletsReko }],
        tooltip: ttSimple('Palety', 'Kartony CROSS &divide; 10 = palety po rekonstrukcji', '0,342', 1193)
      }) +
      buildProcessCard({ id: 'foliaCross', icon: '&#127973;', label: foliaCross.label, result: foliaCross, color: 'indigo',
        extraRows: [{ label: 'Pal. reko × 0.75', value: staffing.crossPalletsReko + ' × 0.75 = ' + staffing.crossPalletsFolia }],
        tooltip: ttSimple('Palety', '(Kartony CROSS &divide; 10) &times; 0,75 = palety do folii', '3,49', 117)
      }) +
    '</div>' +

    // SEKCJA: Magazyn — DG
    '<div class="process-section-header process-section-header--magazyn">' +
      '<span class="process-section-title">&#127979; Magazyn — DG</span>' +
      '<span class="process-section-total">' + r2(+sortingRampa.peopleExact + +sortingPlac.peopleExact + +przygowanieRampa.peopleExact + +przygowaniePlac.peopleExact + +wstawanieRampa.peopleExact + +wstawaniePlac.peopleExact + +drobnicaRampa.peopleExact + +drobnicaPlac.peopleExact) + ' os.</span>' +
    '</div>' +
    '<div class="process-cards">' +
      buildProcessCard({ id: 'sortingRampa', icon: '&#128657;', label: sortingRampa.label, result: sortingRampa, color: 'teal',
        extraRows: [{ label: 'BX Inbound (EffArrival filled) + kont. Rozladowany', value: staffing.sortRampaBoxes }],
        tooltip: ttSimple('Kartony', 'BX Inbound (EffArrival wypełniony) + kont. Rozładowany', '0,3467', 1177)
      }) +
      buildProcessCard({ id: 'przygowanieRampa', icon: '&#128218;', label: przygowanieRampa.label, result: przygowanieRampa, color: 'teal',
        extraRows: [
          { label: 'Palety_z_20K rampa', value: (staffing.przygowanieRampa || przygowanieRampa).paletyZ20K },
          { label: 'PE rampa + kont. Rozlad. ST', value: ((staffing.przygowanieRampa || przygowanieRampa).pelnePaletyDg || 0) + ' + ' + ((staffing.przygowanieRampa || przygowanieRampa).kontenerST || 0) },
          { label: 'FTE_20K + FTE_FP', value: przygowanieRampa.fte20K + ' + ' + przygowanieRampa.fteFP },
        ],
        tooltip: ttTwoCompDiff('Palety_z_20K rampa', 'PE rampa + kont. Rozładowany ST', '1,56', 261, '1,22', 334)
      }) +
      buildProcessCard({ id: 'wstawanieRampa', icon: '&#128230;', label: wstawanieRampa.label, result: wstawanieRampa, color: 'teal',
        extraRows: [
          { label: 'Palety_z_20K rampa', value: wstawanieRampa.paletyZ20K },
          { label: 'PE + kont.Rozlad.ST + manAC/54', value: (wstawanieRampa.pelnePaletyDg||0) + '+' + (wstawanieRampa.kontenerRozladowanyST||0) + '+' + (wstawanieRampa.manualPal||0) },
          { label: 'FTE_20K + FTE_FP', value: wstawanieRampa.fte20K + ' + ' + wstawanieRampa.fteFP },
        ],
        tooltip: ttTwoComp('Palety_z_20K rampa', 'PE rampa + kont.ST + kont.Manual AC&divide;54', '2,9073', 140)
      }) +
      buildProcessCard({ id: 'drobnicaRampa', icon: '&#128269;', label: drobnicaRampa.label, result: drobnicaRampa, color: 'teal',
        extraRows: [
          { label: 'ATII (count<20, vol<0.1)', value: drobnicaRampa.drobnicalItems },
          { label: '+ kont. Rozladowany AC', value: drobnicaRampa.kontenerAC || 0 },
        ],
        tooltip: ttSimple('Poz. ATII', 'ATII Inbound (count&lt;20, vol&lt;0.1) + kont. Rozładowany AC', '0,44', 927)
      }) +
      buildProcessCard({ id: 'sortingPlac', icon: '&#128202;', label: sortingPlac.label, result: sortingPlac, color: 'indigo',
        extraRows: [{ label: 'BX Outbound (isDG, TaskClose blank) + kont. Na placu', value: staffing.sortPlacBoxes }],
        tooltip: ttSimple('Kartony', 'BX Outbound (isDG, TaskClose blank) + kont. Na placu', '0,3467', 1177)
      }) +
      buildProcessCard({ id: 'przygowaniePlac', icon: '&#128218;', label: przygowaniePlac.label, result: przygowaniePlac, color: 'indigo',
        extraRows: [
          { label: 'Palety_z_20K plac', value: przygowaniePlac.paletyZ20K },
          { label: 'PE plac + kont. Na placu ST', value: (przygowaniePlac.pelnePalety || 0) + ' + ' + (przygowaniePlac.kontenerST || 0) },
          { label: 'FTE_20K + FTE_FP', value: przygowaniePlac.fte20K + ' + ' + przygowaniePlac.fteFP },
        ],
        tooltip: ttTwoCompDiff('Palety_z_20K plac', 'PE plac + kont. Na placu ST', '1,56', 261, '1,22', 334)
      }) +
      buildProcessCard({ id: 'wstawaniePlac', icon: '&#128230;', label: wstawaniePlac.label, result: wstawaniePlac, color: 'indigo',
        extraRows: [
          { label: 'Palety_z_20K plac', value: wstawaniePlac.paletyZ20K },
          { label: 'PE plac + kont. Na placu ST', value: (wstawaniePlac.pelnePalety||0) + ' + ' + (wstawaniePlac.kontenerNaPlacu_ST||0) },
          { label: 'FTE_20K + FTE_FP', value: wstawaniePlac.fte20K + ' + ' + wstawaniePlac.fteFP },
        ],
        tooltip: ttTwoComp('Palety_z_20K plac', 'PE plac + kont. Na placu ST', '2,9073', 140)
      }) +
      buildProcessCard({ id: 'drobnicaPlac', icon: '&#128269;', label: drobnicaPlac.label, result: drobnicaPlac, color: 'indigo',
        extraRows: [
          { label: 'ATII Outbound (count<20, vol<0.1)', value: drobnicaPlac.drobnicalItems },
        ],
        tooltip: ttSimple('Poz. ATII', 'ATII Outbound (count&lt;20, vol&lt;0.1, isDG, TaskClose blank)', '0,44', 927)
      }) +
    '</div>' +

    // SEKCJA: Magazyn — CROSS
    '<div class="process-section-header process-section-header--magazyn">' +
      '<span class="process-section-title">&#127979; Magazyn — CROSS</span>' +
      '<span class="process-section-total">' + r2(+sortingCrossRampa.peopleExact + +sortingCrossPlac.peopleExact) + ' os.</span>' +
    '</div>' +
    '<div class="process-cards">' +
      buildProcessCard({ id: 'sortingCrossRampa', icon: '&#8635;', label: sortingCrossRampa.label, result: sortingCrossRampa, color: 'purple',
        extraRows: [{ label: 'BX Inbound (EffArrival filled, !isDG, 3M)', value: staffing.sortCrossRampaBoxes }],
        tooltip: ttSimple('Kartony', 'BX Inbound (EffArrival filled, !isDG, Shipper=3M)', '0,3724', 1096)
      }) +
      buildProcessCard({ id: 'sortingCrossPlac', icon: '&#8635;', label: sortingCrossPlac.label, result: sortingCrossPlac, color: 'purple',
        extraRows: [{ label: 'BX Outbound (!isDG, TaskClose blank, Finished blank)', value: staffing.sortCrossPlacBoxes }],
        tooltip: ttSimple('Kartony', 'BX Outbound (!isDG, TaskClose blank, FinishedScan blank)', '0,3724', 1096)
      }) +
      buildProcessCard({ id: 'recoCrossRampa', icon: '&#128260;', label: recoCrossRampa.label, result: recoCrossRampa, color: 'teal',
        extraRows: [{ label: 'BX bufor ÷ 10', value: (staffing.sortCrossRampaBoxes || 0) + ' ÷ 10 = ' + recoCrossRampa.palletsReko }],
        tooltip: ttSimple('Palety', 'BX bufor &divide; 10 = palety po rekonstrukcji', '0,342', 1193)
      }) +
      buildProcessCard({ id: 'recoCrossPlac', icon: '&#128260;', label: recoCrossPlac.label, result: recoCrossPlac, color: 'purple',
        extraRows: [{ label: 'BX plac ÷ 10', value: (staffing.sortCrossPlacBoxes || 0) + ' ÷ 10 = ' + recoCrossPlac.palletsReko }],
        tooltip: ttSimple('Palety', 'BX plac &divide; 10 = palety po rekonstrukcji', '0,342', 1193)
      }) +
      buildProcessCard({ id: 'foliaCrossRampa', icon: '&#127973;', label: foliaCrossRampa.label, result: foliaCrossRampa, color: 'teal',
        extraRows: [{ label: 'Pal. reko × 0.75', value: foliaCrossRampa.palletsReko + ' × 0.75 = ' + foliaCrossRampa.palletsFolia }],
        tooltip: ttSimple('Palety', '(BX bufor &divide; 10) &times; 0,75 = palety do folii', '3,49', 117)
      }) +
      buildProcessCard({ id: 'foliaCrossPlac', icon: '&#127973;', label: foliaCrossPlac.label, result: foliaCrossPlac, color: 'purple',
        extraRows: [{ label: 'Pal. reko × 0.75', value: foliaCrossPlac.palletsReko + ' × 0.75 = ' + foliaCrossPlac.palletsFolia }],
        tooltip: ttSimple('Palety', '(BX plac &divide; 10) &times; 0,75 = palety do folii', '3,49', 117)
      }) +
    '</div>' +

    '</div>';

}



function buildTransportSelectionTable(trucks, selectedSisSet) {
  if (!trucks || trucks.length === 0) return '';

  const allSelected    = selectedSisSet === null;
  const selectedCount  = allSelected ? trucks.length : selectedSisSet.size;
  const isSelected     = sis => allSelected || selectedSisSet.has(sis);

  const allChecked     = allSelected ? 'checked' : '';

  const statusLabel = s =>
    s === 'inbound'  ? 'W drodze' :
    s === 'arrived'  ? 'Przybyły' : 'Brak SSCC';
  const statusClass = s =>
    s === 'inbound'  ? 'ts-badge--inbound' :
    s === 'arrived'  ? 'ts-badge--arrived' : 'ts-badge--no-sscc';

  const rows = trucks.map(t => {
    const checked = isSelected(t.sis) ? 'checked' : '';
    return '<tr>' +
      '<td class="ts-cb-cell"><input type="checkbox" class="truck-select-cb" data-sis="' + t.sis + '" ' + checked + '></td>' +
      '<td class="ts-sis">' + t.sis + '</td>' +
      '<td>' + (t.truckPlate || '—') + '</td>' +
      '<td>' + (t.sos || '—') + '</td>' +
      '<td class="ts-time">' + (t.godzTime || '—') + '</td>' +
      '<td><span class="ts-badge ' + statusClass(t.status) + '">' + statusLabel(t.status) + '</span></td>' +
      '<td class="ts-num">' + (t.pallets ? t.pallets.total : 0) + '</td>' +
    '</tr>';
  }).join('');

  return (
    '<div class="transport-selection">' +
      '<div class="ts-header">' +
        '<span class="ts-title">Wybierz transporty do przeliczenia</span>' +
        '<span class="ts-count">' + selectedCount + ' / ' + trucks.length + ' wybranych</span>' +
      '</div>' +
      '<div class="ts-table-wrap">' +
        '<table class="ts-table">' +
          '<thead><tr>' +
            '<th class="ts-cb-cell"><input type="checkbox" class="truck-select-cb" data-all="1" ' + allChecked + '></th>' +
            '<th>SIS</th>' +
            '<th>Nr rej.</th>' +
            '<th>SOS</th>' +
            '<th>Godz.</th>' +
            '<th>Status</th>' +
            '<th class="ts-num">Palet</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>'
  );
}

function r2(v) { return Math.round(v * 100) / 100; }

function buildSummaryItem(label, value, highlight) {
  return (
    '<div class="process-summary-item' + (highlight ? ' highlight' : '') + '">' +
      '<span class="process-summary-label">' + label + '</span>' +
      '<span class="process-summary-value">' + value + '</span>' +
    '</div>'
  );
}

function makeTooltip(fields) {
  return (
    '<div class="card-tooltip-title">Jak obliczamy dane?</div>' +
    fields.map(function(f) {
      const fmls = Array.isArray(f.formulas) ? f.formulas : [f.formula];
      return (
        '<div class="card-tooltip-field">' +
          '<span class="card-tooltip-field-name">' + f.name + '</span>' +
          fmls.map(function(fml) { return '<span class="card-tooltip-field-formula">' + fml + '</span>'; }).join('') +
        '</div>'
      );
    }).join('')
  );
}

const _TT_UTIL = 'FTE &divide; ceil(FTE) &times; 100% &nbsp;&nbsp; ≥90% zielony · ≥70% żółty · &lt;70% szary';

function ttSimple(unitCap, unitSrc, mpu, bench) {
  return makeTooltip([
    { name: unitCap + ' (wejście)',     formula: unitSrc },
    { name: 'Czas łączny',              formula: 'Jedn. &times; ' + mpu + ' min/jedn.' },
    { name: unitCap + '/os./zmianę',    formula: '480 &times; 85% &divide; ' + mpu + ' &asymp; ' + bench },
    { name: 'FTE (wynik)',               formula: 'Jedn. &divide; ' + bench + ' = N,NN os.' },
    { name: 'Ceil (zaokrąglone w górę)', formula: '&lceil; FTE &rceil; &mdash; minimalna obsada' },
    { name: 'Wykorz. zmiany',           formula: _TT_UTIL },
  ]);
}

function ttTwoComp(src20K, srcFP, mpu, bench) {
  return makeTooltip([
    { name: 'Benchmark',                formula: '480 &times; 85% &divide; ' + mpu + ' &asymp; ' + bench + ' pal/os./zmianę' },
    { name: 'FTE_20K',                  formula: src20K + ' &divide; ' + bench },
    { name: 'FTE_FP',                   formula: srcFP  + ' &divide; ' + bench },
    { name: 'FTE (wynik)',               formula: 'FTE_20K + FTE_FP = N,NN os.' },
    { name: 'Ceil (zaokrąglone w górę)', formula: '&lceil; FTE &rceil; &mdash; minimalna obsada' },
    { name: 'Wykorz. zmiany',           formula: _TT_UTIL },
  ]);
}

function ttTwoCompDiff(src20K, srcFP, mpu20K, bench20K, mpuFP, benchFP) {
  return makeTooltip([
    { name: 'Benchmark 20K',            formula: '480 &times; 85% &divide; ' + mpu20K + ' &asymp; ' + bench20K + ' pal/os./zmianę' },
    { name: 'Benchmark FP',             formula: '480 &times; 85% &divide; ' + mpuFP  + ' &asymp; ' + benchFP  + ' pal/os./zmianę' },
    { name: 'FTE_20K',                  formula: src20K + ' &divide; ' + bench20K },
    { name: 'FTE_FP',                   formula: srcFP  + ' &divide; ' + benchFP },
    { name: 'FTE (wynik)',               formula: 'FTE_20K + FTE_FP = N,NN os.' },
    { name: 'Ceil (zaokrąglone w górę)', formula: '&lceil; FTE &rceil; &mdash; minimalna obsada' },
    { name: 'Wykorz. zmiany',           formula: _TT_UTIL },
  ]);
}

function buildProcessCard({ id, icon, label, result, color, extraRows = [], tooltip = null }) {
  const utilizationColor = result.utilizationPct >= 90 ? 'ok' : result.utilizationPct >= 70 ? 'warn' : 'low';
  const unitCapLabel     = result.unitLabel === 'kartonów' ? 'Kartony' : 'Palety';
  const extraHtml        = extraRows.map(row =>
    '<div class="process-breakdown-row process-breakdown-extra">' +
      '<span class="process-breakdown-label">' + row.label + '</span>' +
      '<span class="process-breakdown-value">' + row.value + '</span>' +
    '</div>'
  ).join('');
  const tooltipHtml = tooltip
    ? '<div class="card-tooltip-wrap">' +
        '<span class="card-tooltip-btn">?</span>' +
        '<div class="card-tooltip-content">' + tooltip + '</div>' +
      '</div>'
    : '';
  return (
    '<div class="process-card process-card--' + color + '" id="process-card-' + id + '">' +
      '<div class="process-card-header">' +
        '<span class="process-card-icon">' + icon + '</span>' +
        '<span class="process-card-label">' + label + '</span>' +
        tooltipHtml +
      '</div>' +
      '<div class="process-card-main">' +
        '<div class="process-people">' +
          '<span class="process-people-value">' + result.peopleExact + '</span>' +
          '<span class="process-people-unit">os.</span>' +
        '</div>' +
        '<div class="process-people-exact">ceil: ' + result.peopleCeil + ' os.</div>' +
      '</div>' +
      '<div class="process-card-breakdown">' +
        extraHtml +
        '<div class="process-breakdown-row"><span class="process-breakdown-label">' + unitCapLabel + ' (wejście)</span><span class="process-breakdown-value">' + result.unitCount + '</span></div>' +
        '<div class="process-breakdown-row"><span class="process-breakdown-label">Czas łączny</span><span class="process-breakdown-value">' + result.minutesNeeded + ' min</span></div>' +
        '<div class="process-breakdown-row"><span class="process-breakdown-label">' + unitCapLabel + '/os./zmianę</span><span class="process-breakdown-value">~' + result.unitsPerPerson + '</span></div>' +
        '<div class="process-breakdown-row"><span class="process-breakdown-label">Wykorz. zmiany</span><span class="process-breakdown-value util-' + utilizationColor + '">' + result.utilizationPct + '%</span></div>' +
      '</div>' +
    '</div>'
  );
}

function buildProcessCardPlaceholder(label) {
  return (
    '<div class="process-card process-card--placeholder">' +
      '<div class="process-card-header"><span class="process-card-icon">&#8943;</span><span class="process-card-label">' + label + '</span></div>' +
      '<div class="process-people"><span class="process-people-value" style="color:var(--text-3)">—</span></div>' +
      '<div class="process-people-exact" style="color:var(--text-3)">w przygotowaniu</div>' +
    '</div>'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ZAKŁADKA: CZASY
// ─────────────────────────────────────────────────────────────────────────────

export function renderTimesTab() {
  const wrap = document.getElementById('times-content');
  if (!wrap) return;

  const units = {
    unloading:          'min/paletę',
    manualContainer:    'min/karton',
    sortingDg:          'min/karton',
    sortingCross:       'min/karton',
    recoCross:          'min/paletę',
    foliaCross:         'min/paletę',
    drobnical:          'min/poz. ATII',
    wstawianiePaletDg:  'min/paletę',
    przygotowanie20K:   'min/paletę',
    przygotowanieFP:    'min/paletę',
    sortingRampa:       'min/karton',
    sortingPlac:        'min/karton',
    sortingCrossRampa:  'min/karton',
    sortingCrossPlac:   'min/karton',
    recoCrossRampa:     'min/paletę',
    recoCrossPlac:      'min/paletę',
    foliaCrossRampa:    'min/paletę',
    foliaCrossPlac:     'min/paletę',
    przygowanieRampa20K:'min/paletę',
    przygowanieRampaFP: 'min/paletę',
    przygowaniePlac20K: 'min/paletę',
    przygowaniePlacFP:  'min/paletę',
  };

  const groups = [
    {
      title: 'Inbound',
      keys: ['unloading', 'manualContainer', 'sortingDg', 'sortingCross', 'recoCross', 'foliaCross',
             'drobnical', 'wstawianiePaletDg', 'przygotowanie20K', 'przygotowanieFP'],
    },
    {
      title: 'Magazyn (towary na stanie)',
      keys: ['sortingRampa', 'sortingPlac', 'sortingCrossRampa', 'sortingCrossPlac',
             'recoCrossRampa', 'recoCrossPlac', 'foliaCrossRampa', 'foliaCrossPlac',
             'przygowanieRampa20K', 'przygowanieRampaFP', 'przygowaniePlac20K', 'przygowaniePlacFP'],
    },
  ];

  let rows = '';
  for (const group of groups) {
    rows += '<tr class="times-group-header"><td colspan="3">' + esc(group.title) + '</td></tr>';
    for (const key of group.keys) {
      const p = PROCESSES[key];
      if (!p) continue;
      rows += '<tr>' +
        '<td>' + esc(p.label || p.id) + '</td>' +
        '<td class="num">' + p.minutesPerUnit + '</td>' +
        '<td class="times-unit">' + esc(units[key] || '—') + '</td>' +
      '</tr>';
    }
  }

  wrap.innerHTML =
    '<div class="table-wrap">' +
      '<table class="data-table times-table">' +
        '<thead><tr>' +
          '<th>Proces</th>' +
          '<th class="num">Czas [min/jedn.]</th>' +
          '<th>Jednostka</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
}
