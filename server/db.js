const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'airlines.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA synchronous = NORMAL;');
  _db.exec('PRAGMA cache_size = -64000;');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS months (
      ym TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      roc_year INTEGER NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      total_flights INTEGER NOT NULL DEFAULT 0,
      total_seats INTEGER NOT NULL DEFAULT 0,
      total_pax INTEGER NOT NULL DEFAULT 0,
      load_factor REAL NOT NULL DEFAULT 0,
      parsed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS airport_totals (
      ym TEXT NOT NULL,
      airport TEXT NOT NULL,
      flights_total INTEGER NOT NULL DEFAULT 0,
      seats_total INTEGER NOT NULL DEFAULT 0,
      pax_total INTEGER NOT NULL DEFAULT 0,
      lf_total REAL NOT NULL DEFAULT 0,
      flights_in INTEGER NOT NULL DEFAULT 0,
      seats_in INTEGER NOT NULL DEFAULT 0,
      pax_in INTEGER NOT NULL DEFAULT 0,
      lf_in REAL NOT NULL DEFAULT 0,
      flights_out INTEGER NOT NULL DEFAULT 0,
      seats_out INTEGER NOT NULL DEFAULT 0,
      pax_out INTEGER NOT NULL DEFAULT 0,
      lf_out REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (ym, airport)
    );

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ym TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      airport TEXT NOT NULL,
      route_type TEXT NOT NULL,
      destination TEXT NOT NULL,
      airline TEXT NOT NULL,
      flights_total INTEGER NOT NULL DEFAULT 0,
      seats_total INTEGER NOT NULL DEFAULT 0,
      pax_total INTEGER NOT NULL DEFAULT 0,
      lf_total REAL NOT NULL DEFAULT 0,
      flights_in INTEGER NOT NULL DEFAULT 0,
      seats_in INTEGER NOT NULL DEFAULT 0,
      pax_in INTEGER NOT NULL DEFAULT 0,
      lf_in REAL NOT NULL DEFAULT 0,
      flights_out INTEGER NOT NULL DEFAULT 0,
      seats_out INTEGER NOT NULL DEFAULT 0,
      pax_out INTEGER NOT NULL DEFAULT 0,
      lf_out REAL NOT NULL DEFAULT 0,
      avg_seats REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_records_ym_airport ON records(ym, airport);
    CREATE INDEX IF NOT EXISTS idx_records_dest_airport ON records(destination, airport, ym);
    CREATE INDEX IF NOT EXISTS idx_records_airline_airport ON records(airline, airport, ym);
    CREATE INDEX IF NOT EXISTS idx_records_airport_ym_pax ON records(airport, ym, pax_total DESC);

    -- South Korea (Air Portal) tables
    CREATE TABLE IF NOT EXISTS kr_months (
      ym TEXT PRIMARY KEY,
      total_flights INTEGER NOT NULL DEFAULT 0,
      total_seats INTEGER NOT NULL DEFAULT 0,
      total_pax INTEGER NOT NULL DEFAULT 0,
      total_cargo REAL NOT NULL DEFAULT 0,
      load_factor REAL NOT NULL DEFAULT 0,
      parsed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kr_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ym TEXT NOT NULL,
      origin TEXT NOT NULL,
      origin_iata TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL,
      dest_iata TEXT NOT NULL DEFAULT '',
      flights INTEGER NOT NULL DEFAULT 0,
      pax INTEGER NOT NULL DEFAULT 0,
      cargo REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_kr_routes_ym ON kr_routes(ym);
    CREATE INDEX IF NOT EXISTS idx_kr_routes_dest ON kr_routes(dest_iata, ym);

    CREATE TABLE IF NOT EXISTS kr_airlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ym TEXT NOT NULL,
      airline TEXT NOT NULL,
      airline_code TEXT NOT NULL DEFAULT '',
      flights INTEGER NOT NULL DEFAULT 0,
      seats INTEGER NOT NULL DEFAULT 0,
      pax INTEGER NOT NULL DEFAULT 0,
      cargo REAL NOT NULL DEFAULT 0,
      load_factor REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_kr_airlines_ym ON kr_airlines(ym);
    CREATE INDEX IF NOT EXISTS idx_kr_airlines_code ON kr_airlines(airline_code, ym);

    -- Japan (MLIT e-Stat) tables
    CREATE TABLE IF NOT EXISTS jp_months (
      ym TEXT PRIMARY KEY,
      dom_flights INTEGER NOT NULL DEFAULT 0,
      dom_pax INTEGER NOT NULL DEFAULT 0,
      dom_lf REAL NOT NULL DEFAULT 0,
      dom_trunk_lf REAL NOT NULL DEFAULT 0,
      dom_local_lf REAL NOT NULL DEFAULT 0,
      dom_cargo_tons REAL NOT NULL DEFAULT 0,
      intl_flights INTEGER NOT NULL DEFAULT 0,
      intl_pax INTEGER NOT NULL DEFAULT 0,
      intl_lf REAL NOT NULL DEFAULT 0,
      intl_cargo_tons REAL NOT NULL DEFAULT 0,
      parsed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jp_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ym TEXT NOT NULL,
      category TEXT NOT NULL,
      route TEXT NOT NULL,
      pax INTEGER NOT NULL DEFAULT 0,
      pax_yoy REAL,
      cargo_tons REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_jp_routes_ym ON jp_routes(ym);
    CREATE INDEX IF NOT EXISTS idx_jp_routes_route ON jp_routes(route, ym);

    -- Taiwan Cargo (a=1738 monthly airline cargo & a=1736 airport annual history)
    CREATE TABLE IF NOT EXISTS tw_airline_cargo (
      ym TEXT NOT NULL,
      airline TEXT NOT NULL,
      flights INTEGER NOT NULL DEFAULT 0,
      pax INTEGER NOT NULL DEFAULT 0,
      pax_lf REAL NOT NULL DEFAULT 0,
      cargo_tons REAL NOT NULL DEFAULT 0,
      ftk REAL NOT NULL DEFAULT 0,
      aftk REAL NOT NULL DEFAULT 0,
      cargo_lf REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (ym, airline)
    );
    CREATE INDEX IF NOT EXISTS idx_tw_cargo_ym ON tw_airline_cargo(ym);

    CREATE TABLE IF NOT EXISTS tw_airport_history (
      year INTEGER NOT NULL,
      airport TEXT NOT NULL,
      flights INTEGER NOT NULL DEFAULT 0,
      pax INTEGER NOT NULL DEFAULT 0,
      cargo_tons REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (year, airport)
    );

    -- Taiwan On-Time Performance & Cancellations (a=1750)
    CREATE TABLE IF NOT EXISTS tw_otp (
      ym TEXT NOT NULL,
      airline TEXT NOT NULL,
      departures INTEGER NOT NULL DEFAULT 0,
      delays INTEGER NOT NULL DEFAULT 0,
      otp_rate REAL NOT NULL DEFAULT 0,
      delay_rate REAL NOT NULL DEFAULT 0,
      tpe_departures INTEGER NOT NULL DEFAULT 0,
      tpe_delays INTEGER NOT NULL DEFAULT 0,
      cancel_total INTEGER NOT NULL DEFAULT 0,
      cancel_fault INTEGER NOT NULL DEFAULT 0,
      scheduled INTEGER NOT NULL DEFAULT 0,
      exec_rate REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (ym, airline)
    );
    CREATE INDEX IF NOT EXISTS idx_tw_otp_ym ON tw_otp(ym);
  `);
}

function saveMonthData(ym, { records, airportTotals }) {
  const db = getDb();
  const [yearStr, monthStr] = ym.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const rocYear = year - 1911;

  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('DELETE FROM records WHERE ym = ?').run(ym);
    db.prepare('DELETE FROM airport_totals WHERE ym = ?').run(ym);

    const insertRec = db.prepare(`
      INSERT INTO records (
        ym, year, month, airport, route_type, destination, airline,
        flights_total, seats_total, pax_total, lf_total,
        flights_in, seats_in, pax_in, lf_in,
        flights_out, seats_out, pax_out, lf_out, avg_seats
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of records) {
      const avgSeats = r.flights_total > 0 ? Math.round((r.seats_total / r.flights_total) * 10) / 10 : 0;
      insertRec.run(
        ym, year, month, r.airport, r.route_type, r.destination, r.airline,
        r.flights_total, r.seats_total, r.pax_total, r.lf_total,
        r.flights_in, r.seats_in, r.pax_in, r.lf_in,
        r.flights_out, r.seats_out, r.pax_out, r.lf_out, avgSeats
      );
    }

    const insertTot = db.prepare(`
      INSERT OR REPLACE INTO airport_totals (
        ym, airport,
        flights_total, seats_total, pax_total, lf_total,
        flights_in, seats_in, pax_in, lf_in,
        flights_out, seats_out, pax_out, lf_out
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of airportTotals) {
      insertTot.run(
        ym, t.airport,
        t.flights_total, t.seats_total, t.pax_total, t.lf_total,
        t.flights_in, t.seats_in, t.pax_in, t.lf_in,
        t.flights_out, t.seats_out, t.pax_out, t.lf_out
      );
    }

    // Use ALL airport total if available, otherwise sum from ALL records
    let allTot = airportTotals.find(t => t.airport === 'ALL');
    if (!allTot) {
      const allRecs = records.filter(r => r.airport === 'ALL');
      const tf = allRecs.reduce((s, r) => s + r.flights_total, 0);
      const ts = allRecs.reduce((s, r) => s + r.seats_total, 0);
      const tp = allRecs.reduce((s, r) => s + r.pax_total, 0);
      allTot = {
        flights_total: tf,
        seats_total: ts,
        pax_total: tp,
        lf_total: ts > 0 ? Math.round((tp / ts) * 1000) / 10 : 0,
      };
    }

    db.prepare(`
      INSERT OR REPLACE INTO months (
        ym, year, month, roc_year, record_count,
        total_flights, total_seats, total_pax, load_factor, parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ym, year, month, rocYear, records.length,
      allTot.flights_total, allTot.seats_total, allTot.pax_total, allTot.lf_total,
      new Date().toISOString()
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function saveKrMonthData(ym, { summary, routes, airlines }) {
  const db = getDb();
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('DELETE FROM kr_routes WHERE ym = ?').run(ym);
    db.prepare('DELETE FROM kr_airlines WHERE ym = ?').run(ym);

    const insRoute = db.prepare(`
      INSERT INTO kr_routes (ym, origin, origin_iata, destination, dest_iata, flights, pax, cargo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of routes) {
      insRoute.run(ym, r.origin, r.origin_iata, r.destination, r.dest_iata, r.flights, r.pax, r.cargo);
    }

    const insAir = db.prepare(`
      INSERT INTO kr_airlines (ym, airline, airline_code, flights, seats, pax, cargo, load_factor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const a of airlines) {
      insAir.run(ym, a.airline, a.airline_code, a.flights, a.seats, a.pax, a.cargo, a.load_factor);
    }

    db.prepare(`
      INSERT OR REPLACE INTO kr_months (ym, total_flights, total_seats, total_pax, total_cargo, load_factor, parsed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      ym, summary.flights, summary.seats, summary.pax, summary.cargo, summary.load_factor,
      new Date().toISOString()
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function saveJpMonthData(ym, { summary, routes }) {
  const db = getDb();
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('DELETE FROM jp_routes WHERE ym = ?').run(ym);
    const insRoute = db.prepare(`
      INSERT INTO jp_routes (ym, category, route, pax, pax_yoy, cargo_tons)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const r of routes) {
      insRoute.run(ym, r.category, r.route, r.pax, r.pax_yoy, r.cargo_tons);
    }

    db.prepare(`
      INSERT OR REPLACE INTO jp_months (
        ym, dom_flights, dom_pax, dom_lf, dom_trunk_lf, dom_local_lf, dom_cargo_tons,
        intl_flights, intl_pax, intl_lf, intl_cargo_tons, parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ym,
      summary.dom_flights, summary.dom_pax, summary.dom_lf,
      summary.dom_trunk_lf, summary.dom_local_lf, summary.dom_cargo_tons,
      summary.intl_flights, summary.intl_pax, summary.intl_lf, summary.intl_cargo_tons,
      new Date().toISOString()
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  DB_PATH,
  getDb,
  saveMonthData,
  saveKrMonthData,
  saveJpMonthData,
};
