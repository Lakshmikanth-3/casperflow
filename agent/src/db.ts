/**
 * db.ts — SQLite persistent state for the CasperFlow agent
 *
 * Stores: monitor cycles, distribution history, DeFi positions,
 * contract events (mirrored from CSPR.cloud stream), notification subscribers.
 *
 * Database file: ./data/casperflow.db
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve("./data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db: any = new Database(path.join(DATA_DIR, "casperflow.db"));

// Enable WAL mode for concurrent reads during agent + API server
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema initialisation ────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS monitor_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id     TEXT    NOT NULL,
    oracle_mote  TEXT    NOT NULL,
    onchain_mote TEXT,
    verified     INTEGER NOT NULL DEFAULT 0,
    source_hash  TEXT,
    deploy_hash  TEXT,
    distributed  INTEGER NOT NULL DEFAULT 0,
    ts           INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS distribution_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id    TEXT    NOT NULL,
    amount_mote TEXT    NOT NULL,
    deploy_hash TEXT    NOT NULL,
    accuracy    INTEGER,
    ts          INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS defi_positions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pool_name       TEXT    NOT NULL,
    deposited_mote  TEXT    NOT NULL,
    deposited_at    INTEGER NOT NULL,
    tx_hash         TEXT    NOT NULL UNIQUE,
    withdrawn       INTEGER NOT NULL DEFAULT 0,
    withdrawn_mote  TEXT,
    withdrawn_at    INTEGER
  );

  CREATE TABLE IF NOT EXISTS contract_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type    TEXT    NOT NULL,
    contract_hash TEXT,
    deploy_hash   TEXT,
    data          TEXT,
    ts            INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_subscribers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT    NOT NULL UNIQUE,
    email          TEXT    NOT NULL,
    opted_in       INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL
  );
`);

console.log("[db] SQLite database initialised at", path.join(DATA_DIR, "casperflow.db"));
