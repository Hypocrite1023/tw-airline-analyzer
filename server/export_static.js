const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('./db');
const { getDestinationCode } = require('./airport_codes');

const OUT_DIR = path.join(__dirname, '..', 'web', 'public', 'data');

const AIRPORT_LABELS = {
  ALL: '全國合計',
  TPE: '臺灣桃園 (TPE)',
  KHH: '高雄國際 (KHH)',
  TSA: '臺北松山 (TSA)',
  RMQ: '臺中國際 (RMQ)',
  TNN: '臺南機場 (TNN)',
  HUN: '花蓮機場 (HUN)',
  CYI: '嘉義機場 (CYI)',
  TTT: '臺東機場 (TTT)',
  KNH: '金門機場 (KNH)',
  MZG: '澎湖機場 (MZG)',
};

function writeJson(relPath, obj) {
  const full = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj));
}

function exportStatic() {
  const start = Date.now();
  const db = getDb();

  // Clean output directory
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. meta.json
  const months = db.prepare(`
    SELECT ym, year, month, roc_year, total_pax, total_seats, total_flights, load_factor, record_count
    FROM months ORDER BY ym DESC
  `).all();

  const airportCodes = db.prepare('SELECT DISTINCT airport FROM records').all().map(r => r.airport);
  const orderedCodes = Object.keys(AIRPORT_LABELS).filter(c => airportCodes.includes(c));
  for (const c of airportCodes) {
    if (!orderedCodes.includes(c)) orderedCodes.push(c);
  }
  const airports = orderedCodes.map(code => ({ code, label: AIRPORT_LABELS[code] || code }));

  const destinations = db.prepare(`
    SELECT destination, SUM(pax_total) as total_pax, COUNT(DISTINCT ym) as months_active
    FROM records WHERE airport = 'ALL'
    GROUP BY destination
    ORDER BY total_pax DESC
  `).all().map((d, idx) => ({
    id: idx,
    ...d,
    ...getDestinationCode(d.destination),
  }));

  const destIdMap = new Map(destinations.map(d => [d.destination, d.id]));

  const airlines = db.prepare(`
    SELECT airline, SUM(pax_total) as total_pax, COUNT(DISTINCT ym) as months_active
    FROM records WHERE airport = 'ALL'
    GROUP BY airline
    ORDER BY total_pax DESC
  `).all();

  const stats = db.prepare('SELECT COUNT(*) as totalRows FROM records').get();

  writeJson('meta.json', {
    generatedAt: new Date().toISOString(),
    months,
    airports,
    destinations,
    airlines,
    summary: {
      totalMonths: months.length,
      totalRows: stats.totalRows,
      minYm: months.length ? months[months.length - 1].ym : null,
      maxYm: months.length ? months[0].ym : null,
    },
  });

  // 2. macro.json (monthly macro series by airport + route_type split + yearly summary)
  const macroByAirport = {};
  for (const { code } of airports) {
    const timeline = db.prepare(`
      SELECT
        ym,
        SUM(pax_total) as total_pax,
        SUM(seats_total) as total_seats,
        SUM(flights_total) as total_flights,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        SUM(CASE WHEN route_type != '兩岸航線' THEN pax_total ELSE 0 END) as intl_pax,
        SUM(CASE WHEN route_type = '兩岸航線' THEN pax_total ELSE 0 END) as cross_strait_pax,
        SUM(CASE WHEN route_type != '兩岸航線' THEN seats_total ELSE 0 END) as intl_seats,
        SUM(CASE WHEN route_type = '兩岸航線' THEN seats_total ELSE 0 END) as cross_strait_seats
      FROM records
      WHERE airport = ?
      GROUP BY ym
      ORDER BY ym ASC
    `).all(code);

    const yearly = db.prepare(`
      SELECT
        year,
        COUNT(DISTINCT ym) as months_count,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        COUNT(DISTINCT destination) as dest_count,
        COUNT(DISTINCT airline) as airline_count
      FROM records
      WHERE airport = ?
      GROUP BY year
      ORDER BY year ASC
    `).all(code);

    // Precompute seasonality heatmaps for the 3 eras
    const eras = [
      { key: '2023-2026', start: 2023, end: 2026 },
      { key: '2015-2019', start: 2015, end: 2019 },
      { key: '2009-2026', start: 2009, end: 2026 },
    ];
    const heatmaps = {};
    for (const era of eras) {
      const top15 = db.prepare(`
        SELECT destination, SUM(pax_total) as tp
        FROM records
        WHERE airport = ? AND year >= ? AND year <= ?
        GROUP BY destination
        ORDER BY tp DESC
        LIMIT 15
      `).all(code, era.start, era.end).map(r => r.destination);

      let cells = [];
      if (top15.length > 0) {
        const ph = top15.map(() => '?').join(',');
        cells = db.prepare(`
          SELECT
            destination,
            month,
            ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as avg_lf
          FROM (
            SELECT ym, month, destination, SUM(seats_total) as seats_total, SUM(pax_total) as pax_total
            FROM records
            WHERE airport = ? AND year >= ? AND year <= ? AND destination IN (${ph})
            GROUP BY ym, destination
          )
          GROUP BY destination, month
        `).all(code, era.start, era.end, ...top15);
      }
      heatmaps[era.key] = { destinations: top15, cells };
    }

    macroByAirport[code] = { timeline, yearly, heatmaps };
  }
  writeJson('macro.json', macroByAirport);

  // 3. months/{ym}.json (compact array format for fast loading)
  // Row tuple: [airport, rtIdx (0=intl,1=cross), dest, airline, flt, seats, pax, lf, paxIn, lfIn, paxOut, lfOut, avgSeats]
  const stmtMonthRecs = db.prepare(`
    SELECT airport, route_type, destination, airline,
      flights_total, seats_total, pax_total, lf_total,
      pax_in, lf_in, pax_out, lf_out, avg_seats
    FROM records WHERE ym = ?
  `);
  const stmtMonthTotals = db.prepare('SELECT * FROM airport_totals WHERE ym = ?');

  for (const m of months) {
    const recs = stmtMonthRecs.all(m.ym).map(r => [
      r.airport,
      r.route_type === '兩岸航線' ? 1 : 0,
      r.destination,
      r.airline,
      r.flights_total,
      r.seats_total,
      r.pax_total,
      r.lf_total,
      r.pax_in,
      r.lf_in,
      r.pax_out,
      r.lf_out,
      r.avg_seats,
    ]);
    const totals = {};
    for (const t of stmtMonthTotals.all(m.ym)) {
      totals[t.airport] = {
        flights: t.flights_total,
        seats: t.seats_total,
        pax: t.pax_total,
        lf: t.lf_total,
        paxIn: t.pax_in,
        lfIn: t.lf_in,
        paxOut: t.pax_out,
        lfOut: t.lf_out,
      };
    }
    writeJson(`months/${m.ym}.json`, { ym: m.ym, totals, records: recs });
  }

  // 4. routes/{id}.json (per destination historical battle across ALL airport)
  const stmtRouteHist = db.prepare(`
    SELECT ym, SUM(flights_total) as flights, SUM(seats_total) as seats, SUM(pax_total) as pax,
      ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as lf
    FROM records WHERE airport = 'ALL' AND destination = ?
    GROUP BY ym ORDER BY ym ASC
  `);
  const stmtRouteTopAir = db.prepare(`
    SELECT airline, SUM(pax_total) as tp
    FROM records WHERE airport = 'ALL' AND destination = ?
    GROUP BY airline ORDER BY tp DESC LIMIT 6
  `);
  const stmtRouteAirHist = db.prepare(`
    SELECT ym, airline, pax_total as pax
    FROM records WHERE airport = 'ALL' AND destination = ?
    ORDER BY ym ASC
  `);

  for (const d of destinations) {
    const history = stmtRouteHist.all(d.destination);
    const topHistAirlines = stmtRouteTopAir.all(d.destination).map(r => r.airline);
    const topSet = new Set(topHistAirlines);
    const airlineHistory = {};
    for (const r of stmtRouteAirHist.all(d.destination)) {
      if (!topSet.has(r.airline)) continue;
      if (!airlineHistory[r.airline]) airlineHistory[r.airline] = [];
      airlineHistory[r.airline].push([r.ym, r.pax]);
    }
    writeJson(`routes/${d.id}.json`, {
      id: d.id,
      destination: d.destination,
      history,
      topHistAirlines,
      airlineHistory,
    });
  }

  // 5. airlines_history.json (monthly history for all airlines, ALL airport)
  const airHistRows = db.prepare(`
    SELECT ym, airline, SUM(pax_total) as pax,
      ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as lf
    FROM records WHERE airport = 'ALL'
    GROUP BY ym, airline ORDER BY ym ASC
  `).all();
  const airlinesHistory = {};
  for (const r of airHistRows) {
    if (!airlinesHistory[r.airline]) airlinesHistory[r.airline] = [];
    airlinesHistory[r.airline].push([r.ym, r.pax, r.lf]);
  }
  writeJson('airlines_history.json', airlinesHistory);

  // 6. cargo.json
  const cargoRows = db.prepare(`
    SELECT ym, airline, flights, pax, pax_lf, cargo_tons, ftk, aftk, cargo_lf
    FROM tw_airline_cargo ORDER BY ym ASC
  `).all();
  const airportHistory = db.prepare(`
    SELECT year, airport, flights, pax, cargo_tons
    FROM tw_airport_history
    WHERE airport IN ('ALL', 'TPE', 'KHH', 'TSA', 'RMQ')
    ORDER BY year ASC
  `).all();
  writeJson('cargo.json', { rows: cargoRows, airportHistory });

  // 7. otp.json
  const otpRows = db.prepare('SELECT * FROM tw_otp ORDER BY ym ASC').all();
  writeJson('otp.json', { rows: otpRows });

  // Calculate total size
  let totalBytes = 0;
  let fileCount = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else {
        totalBytes += fs.statSync(p).size;
        fileCount++;
      }
    }
  }
  walk(OUT_DIR);

  console.log(`Static export done in ${((Date.now() - start) / 1000).toFixed(1)}s!`);
  console.log(`Files: ${fileCount}, Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB -> ${OUT_DIR}`);
}

if (require.main === module) {
  exportStatic();
}

module.exports = { exportStatic };
