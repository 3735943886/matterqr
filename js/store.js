// In-memory snapshot of the (small) inventory + the active filter state.
// The DB is the source of truth; we reload the whole set on any change and
// re-render — trivially fast for a personal inventory, and keeps logic flat.

const state = {
  db: null,
  devices: [],
  cats: { type: [], loc: [], status: [] },
  filters: { q: "", type: null, loc: null, status: null },
  subscribers: new Set(),
};

const FILTER_KEY = "matterqr.filters";

export function initStore(db) {
  state.db = db;
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || "{}");
    Object.assign(state.filters, saved);
  } catch {
    /* ignore */
  }
}

export function getState() {
  return state;
}

export async function reload() {
  const [devices, type, loc, status] = await Promise.all([
    state.db.listDevices(),
    state.db.listCategory("type"),
    state.db.listCategory("loc"),
    state.db.listCategory("status"),
  ]);
  devices.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  state.devices = devices;
  state.cats = { type, loc, status };
  emit();
}

export function onChange(fn) {
  state.subscribers.add(fn);
}

export function offChange(fn) {
  state.subscribers.delete(fn);
}

export function emit() {
  state.subscribers.forEach((fn) => fn());
}

export function setFilter(patch) {
  Object.assign(state.filters, patch);
  localStorage.setItem(FILTER_KEY, JSON.stringify(state.filters));
  emit();
}

export function catName(kind, id) {
  return state.cats[kind]?.find((c) => c.id === id)?.name || null;
}

// Text match across the fields a user would search by.
function matchesQuery(d, q) {
  if (!q) return true;
  const hay = [
    d.model,
    d.codeRaw,
    d.notes,
    d.url,
    d.matter?.vendorId,
    d.matter?.productId,
    catName("type", d.deviceTypeId),
    catName("loc", d.locationId),
    catName("status", d.statusId),
  ]
    .filter((x) => x != null)
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function filteredDevices() {
  const { q, type, loc, status } = state.filters;
  return state.devices.filter((d) => {
    if (!matchesQuery(d, q)) return false;
    if (type && d.deviceTypeId !== type) return false;
    if (status && d.statusId !== status) return false;
    if (loc === "__unassigned__") {
      if (d.locationId) return false;
    } else if (loc && d.locationId !== loc) return false;
    return true;
  });
}

// Count devices per category value for the filter chips (over query only, so
// each facet shows totals independent of the other facet selections).
export function facetCounts(kind) {
  const q = state.filters.q;
  const base = state.devices.filter((d) => matchesQuery(d, q));
  const counts = new Map();
  for (const d of base) {
    const id = kind === "type" ? d.deviceTypeId : kind === "status" ? d.statusId : d.locationId;
    const key = id || (kind === "loc" ? "__unassigned__" : "__none__");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
