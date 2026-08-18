// ─────────────────────────────────────────────────────────────────────────────
// planningSnapshotApi.js — zapisywanie/odczyt ostatnich wyników FTE (Inbound/
// Outbound) na backendzie, żeby nowa osoba widziała ostatni wynik bez ponownego
// wgrywania plików.
//
// Kontrakt (ustalony z backendem):
//   POST   /api/apps/warehouse-planner/       -> tworzy nowy rekord
//   PATCH  /api/apps/warehouse-planner/{id}   -> aktualizuje istniejący
//   DELETE /api/apps/warehouse-planner/{id}
//   Pola:  department (string), total_fte (number), meta (string — JSON.stringify)
//
// Trzymamy PO JEDNYM aktualizowanym rekordzie na dział ('inbound' / 'outbound'),
// a kto/kiedy zapisał — w polu meta (created_by / updated_by / updated_at),
// zgodnie z sugestią backendu. GET (lista wszystkich rekordów) nie był pokazany
// w odpowiedzi — parser niżej jest odporny na kilka możliwych kształtów, ale
// trzeba to zweryfikować w przeglądarce (DevTools → Network).
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://cloud.fiege.pl/api/apps/warehouse-planner/";

/** Login zalogowanego pracownika — null, jeśli platforma xcloud nie jest dostępna. */
export function getCurrentUsername() {
  return window?.xcloud?.account?.username || null;
}

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseRecord(raw) {
  return {
    id: raw.id,
    department: raw.department,
    totalFte: raw.total_fte,
    meta: parseMeta(raw.meta),
  };
}

/**
 * Pobiera wszystkie zapisane rekordy i zwraca ostatni (po meta.updated_at) per dział.
 * Zwraca np. { inbound: {id, totalFte, meta} | undefined, outbound: {...} | undefined }.
 */
export async function fetchLatestSnapshots() {
  const res = await fetch(API_BASE);
  if (!res.ok) {
    throw new Error(`Błąd pobierania ostatnich wyników (HTTP ${res.status})`);
  }
  const body = await res.json();
  const list = Array.isArray(body)
    ? body
    : body.data || body.items || body.results || [];

  const latest = {};
  for (const raw of list) {
    const record = parseRecord(raw);
    if (!record.department) continue;
    const existing = latest[record.department];
    const recordTime = record.meta.updated_at || "";
    const existingTime = existing ? existing.meta.updated_at || "" : "";
    if (!existing || recordTime > existingTime) {
      latest[record.department] = record;
    }
  }
  return latest;
}

/**
 * Zapisuje aktualny total FTE dla danego działu. Jeśli podano existingRecord
 * (mamy już id z wcześniejszego GET/save), robi PATCH zachowując created_by
 * z poprzedniego meta; w przeciwnym razie tworzy nowy rekord przez POST.
 */
export async function saveSnapshot({ department, totalFte, existingRecord }) {
  const username = getCurrentUsername();
  const nowIso = new Date().toISOString();

  if (existingRecord?.id) {
    const meta = {
      ...existingRecord.meta,
      updated_by: username,
      updated_at: nowIso,
    };
    const res = await fetch(`${API_BASE}${existingRecord.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_fte: totalFte, meta: JSON.stringify(meta) }),
    });
    if (!res.ok) {
      throw new Error(`Błąd zapisu wyniku (PATCH, HTTP ${res.status})`);
    }
    return parseRecord(await res.json());
  }

  const meta = {
    created_by: username,
    updated_by: username,
    updated_at: nowIso,
  };
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      department,
      total_fte: totalFte,
      meta: JSON.stringify(meta),
    }),
  });
  if (!res.ok) {
    throw new Error(`Błąd zapisu wyniku (POST, HTTP ${res.status})`);
  }
  return parseRecord(await res.json());
}
