// Test-only, intentionally limited Drizzle substitute. Unsupported operations throw.
// This models sequential query predicates and rollback, NOT PostgreSQL concurrency.
import assert from "node:assert/strict";

const tableNames = [
  "ordersTable", "orderEventsTable", "leadsTable", "subscriptionsTable",
  "walletLedgerTable", "payoutsTable", "businessProfilesTable", "campaignsTable",
  "campaignPaymentAttemptsTable",
];
const tables = Object.fromEntries(tableNames.map((name) => [
  name,
  new Proxy({ name }, {
    get(target, key) {
      return key === "name" ? target.name : { table: target.name, column: key };
    },
  }),
]));
export const {
  ordersTable, orderEventsTable, leadsTable, subscriptionsTable, walletLedgerTable,
  payoutsTable, businessProfilesTable, campaignsTable, campaignPaymentAttemptsTable,
} = tables;

export const state = { rows: {}, pushes: [], logs: [], transactions: 0, failInsert: null };
export function reset(seed = {}) {
  state.rows = Object.fromEntries(tableNames.map((name) => [name, structuredClone(seed[name] ?? [])]));
  state.pushes = [];
  state.logs = [];
  state.transactions = 0;
  state.failInsert = null;
}
reset();

export const eq = (field, value) => (row) => row[field.column] === value;
export const gt = (field, value) => (row) => row[field.column] > value;
export const and = (...predicates) => (row) => predicates.every((predicate) => predicate(row));
export const inArray = (field, values) => (row) => values.includes(row[field.column]);
export const isNotNull = (field) => (row) => row[field.column] != null;
export const asc = (field) => ({ field, direction: 1 });
export const desc = (field) => ({ field, direction: -1 });
export const sql = (strings, ...values) => ({ text: strings.join("?"), values });

function query(kind, table, selection) {
  let predicate = () => true;
  let values;
  let cap = Infinity;
  let sort;
  let ignoreConflict = false;
  let result;
  const execute = () => {
    if (result) return result;
    assert.ok(state.rows[table.name], `Unknown table: ${table.name}`);
    const rows = state.rows[table.name];
    if (kind === "select") {
      let selected = rows.filter(predicate);
      if (sort) selected = [...selected].sort((a, b) =>
        (a[sort.field.column] > b[sort.field.column] ? 1 : -1) * sort.direction);
      selected = selected.slice(0, cap);
      if (selection?.balance) {
        assert.match(selection.balance.text, /COALESCE\(SUM\(/);
        return result = [{ balance: String(selected.reduce((sum, row) => sum + Number(row.amount), 0)) }];
      }
      return result = structuredClone(selected.map((row) => selection
        ? Object.fromEntries(Object.entries(selection).map(([key, field]) => [key, row[field.column]]))
        : row));
    }
    if (kind === "update") {
      result = [];
      for (const row of rows.filter(predicate)) {
        Object.assign(row, structuredClone(values));
        result.push(structuredClone(row));
      }
      return result;
    }
    if (state.failInsert === table.name) {
      state.failInsert = null;
      throw new Error(`Injected insert failure: ${table.name}`);
    }
    if (table.name === "walletLedgerTable" && values.orderId != null &&
        rows.some((row) => row.orderId === values.orderId)) {
      if (!ignoreConflict) throw new Error("Duplicate wallet order credit");
      return result = [];
    }
    const defaults = ["ordersTable", "subscriptionsTable", "payoutsTable", "campaignPaymentAttemptsTable"]
      .includes(table.name) ? { status: "pendente" } : {};
    const row = { id: `${table.name}-${rows.length + 1}`, ...defaults, ...structuredClone(values) };
    rows.push(row);
    return result = [structuredClone(row)];
  };
  return {
    where(value) { predicate = value; return this; },
    limit(value) { cap = value; return this; },
    orderBy(value) { sort = value; return this; },
    set(value) { values = value; return this; },
    values(value) { values = value; return this; },
    onConflictDoNothing() { ignoreConflict = true; return this; },
    returning() { return Promise.resolve().then(execute); },
    then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject); },
  };
}

export const db = {
  select(selection) { return { from: (table) => query("select", table, selection) }; },
  update(table) { return query("update", table); },
  insert(table) { return query("insert", table); },
  async execute(statement) {
    assert.match(statement.text, /^SELECT pg_advisory_xact_lock\(/,
      "Only advisory-lock statements are supported; no real SQL is executed");
    return [];
  },
  async transaction(callback) {
    state.transactions++;
    const snapshot = structuredClone(state.rows);
    try { return await callback(db); }
    catch (error) { state.rows = snapshot; throw error; }
  },
};

export const logger = Object.fromEntries(["info", "warn", "error"].map((level) => [
  level, (...args) => state.logs.push({ level, args }),
]));
export async function sendPushToOwner(payload, businessId) {
  state.pushes.push({ payload, businessId });
}

// Only configuration reads are needed. All publishing calls fail closed.
export const IS_ZERNIO_SIMULATION = false;
export const isChannelConfigured = () => true;
const forbidden = () => { throw new Error("External ad publishing is forbidden in financial tests"); };
export const createAd = forbidden;
export const cancelAd = forbidden;
export const getAd = forbidden;
export const setAdStatus = forbidden;
export const utcIntervalRunKey = forbidden;
export const withScheduledJobLock = forbidden;

// Capture route handlers without starting an HTTP server.
export function Router() {
  return { routes: [], post(path, handler) { this.routes.push({ path, handler }); } };
}