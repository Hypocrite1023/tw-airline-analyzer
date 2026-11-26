const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cors = require('cors');
const { getDb } = require('./db');
const { fetchCatalog } = require('./scraper');
const { syncFromCAA, parseAllLocal } = require('./sync');
const { getDestinationCode } = require('./airport_codes');

const app = express();
app.use(cors());
app.use(express.json());

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

function prevYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function prevYearYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}`;
}

function pctChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// 1. Metadata
app.get('/api/meta', (req, res) => {
  try {
    const db = getDb();
    const months = db.prepare('SELECT ym, year, month, roc_year, total_pax, total_seats, total_flights, load_factor FROM months ORDER BY ym DESC').all();
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
    `).all().map(d => ({
      ...d,
      ...getDestinationCode(d.destination),
    }));

    const airlines = db.prepare(`
      SELECT airline, SUM(pax_total) as total_pax, COUNT(DISTINCT ym) as months_active
      FROM records WHERE airport = 'ALL'
      GROUP BY airline
      ORDER BY total_pax DESC
    `).all();

    const stats = db.prepare('SELECT COUNT(*) as totalRows FROM records').get();

    res.json({
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Overview Dashboard
app.get('/api/overview', (req, res) => {
  try {
    const db = getDb();
    const latest = db.prepare('SELECT ym FROM months ORDER BY ym DESC LIMIT 1').get();
    const ym = req.query.ym || latest?.ym;
    const airport = req.query.airport || 'ALL';
    const routeType = req.query.routeType || 'ALL';

    if (!ym) return res.json({ empty: true });

    const rtClause = routeType !== 'ALL' ? ' AND route_type = ?' : '';
    const baseParams = routeType !== 'ALL' ? [ym, airport, routeType] : [ym, airport];

    const getKpi = (targetYm) => {
      const params = routeType !== 'ALL' ? [targetYm, airport, routeType] : [targetYm, airport];
      const agg = db.prepare(`
        SELECT
          COALESCE(SUM(flights_total), 0) as flights,
          COALESCE(SUM(seats_total), 0) as seats,
          COALESCE(SUM(pax_total), 0) as pax,
          COALESCE(SUM(flights_in), 0) as flights_in,
          COALESCE(SUM(seats_in), 0) as seats_in,
          COALESCE(SUM(pax_in), 0) as pax_in,
          COALESCE(SUM(flights_out), 0) as flights_out,
          COALESCE(SUM(seats_out), 0) as seats_out,
          COALESCE(SUM(pax_out), 0) as pax_out,
          COUNT(DISTINCT destination) as dest_count,
          COUNT(DISTINCT airline) as airline_count
        FROM records
        WHERE ym = ? AND airport = ?${rtClause}
      `).get(...params);

      // Prefer official total if routeType === 'ALL' and available
      let official = null;
      if (routeType === 'ALL') {
        official = db.prepare('SELECT * FROM airport_totals WHERE ym = ? AND airport = ?').get(targetYm, airport);
      }

      const flights = official ? official.flights_total : agg.flights;
      const seats = official ? official.seats_total : agg.seats;
      const pax = official ? official.pax_total : agg.pax;
      const lf = seats > 0 ? Math.round((pax / seats) * 1000) / 10 : 0;
      const lfIn = agg.seats_in > 0 ? Math.round((agg.pax_in / agg.seats_in) * 1000) / 10 : 0;
      const lfOut = agg.seats_out > 0 ? Math.round((agg.pax_out / agg.seats_out) * 1000) / 10 : 0;

      return {
        ym: targetYm,
        flights,
        seats,
        pax,
        loadFactor: lf,
        paxIn: official ? official.pax_in : agg.pax_in,
        paxOut: official ? official.pax_out : agg.pax_out,
        lfIn: official ? official.lf_in : lfIn,
        lfOut: official ? official.lf_out : lfOut,
        destCount: agg.dest_count,
        airlineCount: agg.airline_count,
      };
    };

    const current = getKpi(ym);
    const prev = getKpi(prevYm(ym));
    const yoy = getKpi(prevYearYm(ym));

    const topDestinations = db.prepare(`
      SELECT
        destination,
        route_type,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        ROUND(CASE WHEN SUM(seats_in) > 0 THEN SUM(pax_in) * 100.0 / SUM(seats_in) ELSE 0 END, 1) as lf_in,
        ROUND(CASE WHEN SUM(seats_out) > 0 THEN SUM(pax_out) * 100.0 / SUM(seats_out) ELSE 0 END, 1) as lf_out,
        COUNT(DISTINCT airline) as airline_count,
        ROUND(CASE WHEN SUM(flights_total) > 0 THEN SUM(seats_total) * 1.0 / SUM(flights_total) ELSE 0 END, 0) as avg_seats
      FROM records
      WHERE ym = ? AND airport = ?${rtClause}
      GROUP BY destination
      ORDER BY pax DESC
      LIMIT 25
    `).all(...baseParams);

    const topAirlines = db.prepare(`
      SELECT
        airline,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        COUNT(DISTINCT destination) as dest_count,
        ROUND(CASE WHEN SUM(flights_total) > 0 THEN SUM(seats_total) * 1.0 / SUM(flights_total) ELSE 0 END, 0) as avg_seats
      FROM records
      WHERE ym = ? AND airport = ?${rtClause}
      GROUP BY airline
      ORDER BY pax DESC
      LIMIT 20
    `).all(...baseParams);

    const airportBreakdown = db.prepare(`
      SELECT
        airport,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        COUNT(DISTINCT destination) as dest_count
      FROM records
      WHERE ym = ? AND airport != 'ALL'${rtClause}
      GROUP BY airport
      ORDER BY pax DESC
    `).all(...(routeType !== 'ALL' ? [ym, routeType] : [ym])).map(r => ({
      ...r,
      label: AIRPORT_LABELS[r.airport] || r.airport,
    }));

    const routeTypeBreakdown = db.prepare(`
      SELECT
        route_type,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor
      FROM records
      WHERE ym = ? AND airport = ?
      GROUP BY route_type
      ORDER BY pax DESC
    `).all(ym, airport);

    const macroHistory = db.prepare(`
      SELECT
        ym,
        SUM(pax_total) as pax,
        SUM(seats_total) as seats,
        SUM(flights_total) as flights,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor
      FROM records
      WHERE airport = ?${rtClause}
      GROUP BY ym
      ORDER BY ym ASC
    `).all(...(routeType !== 'ALL' ? [airport, routeType] : [airport]));

    res.json({
      ym,
      airport,
      airportLabel: AIRPORT_LABELS[airport] || airport,
      routeType,
      kpi: {
        ...current,
        momPax: pctChange(current.pax, prev.pax),
        momLf: prev.seats > 0 ? Math.round((current.loadFactor - prev.loadFactor) * 10) / 10 : null,
        yoyPax: pctChange(current.pax, yoy.pax),
        yoyLf: yoy.seats > 0 ? Math.round((current.loadFactor - yoy.loadFactor) * 10) / 10 : null,
      },
      topDestinations,
      topAirlines,
      airportBreakdown,
      routeTypeBreakdown,
      macroHistory,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Route Deep-Dive
app.get('/api/route', (req, res) => {
  try {
    const db = getDb();
    const latest = db.prepare('SELECT ym FROM months ORDER BY ym DESC LIMIT 1').get();
    const ym = req.query.ym || latest?.ym;
    const airport = req.query.airport || 'ALL';
    const destination = req.query.destination || '大阪';

    const airlinesInMonth = db.prepare(`
      SELECT
        airline,
        route_type,
        flights_total as flights,
        seats_total as seats,
        pax_total as pax,
        lf_total as load_factor,
        pax_in, pax_out, lf_in, lf_out, avg_seats
      FROM records
      WHERE ym = ? AND airport = ? AND destination = ?
      ORDER BY pax_total DESC
    `).all(ym, airport, destination);

    const totalPax = airlinesInMonth.reduce((s, r) => s + r.pax, 0);
    const airlinesWithShare = airlinesInMonth.map(r => ({
      ...r,
      marketShare: totalPax > 0 ? Math.round((r.pax / totalPax) * 1000) / 10 : 0,
    }));

    const history = db.prepare(`
      SELECT
        ym,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        COUNT(DISTINCT airline) as airline_count
      FROM records
      WHERE airport = ? AND destination = ?
      GROUP BY ym
      ORDER BY ym ASC
    `).all(airport, destination);

    // Top 6 airlines historically on this route
    const topHistAirlines = db.prepare(`
      SELECT airline, SUM(pax_total) as total_pax
      FROM records
      WHERE airport = ? AND destination = ?
      GROUP BY airline
      ORDER BY total_pax DESC
      LIMIT 6
    `).all(airport, destination).map(r => r.airline);

    const airlineHistory = {};
    if (topHistAirlines.length > 0) {
      const placeholders = topHistAirlines.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT ym, airline, pax_total as pax, lf_total as load_factor, flights_total as flights
        FROM records
        WHERE airport = ? AND destination = ? AND airline IN (${placeholders})
        ORDER BY ym ASC
      `).all(airport, destination, ...topHistAirlines);

      for (const r of rows) {
        if (!airlineHistory[r.airline]) airlineHistory[r.airline] = [];
        airlineHistory[r.airline].push({ ym: r.ym, pax: r.pax, load_factor: r.load_factor, flights: r.flights });
      }
    }

    const byAirport = db.prepare(`
      SELECT
        airport,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor
      FROM records
      WHERE ym = ? AND destination = ? AND airport != 'ALL'
      GROUP BY airport
      ORDER BY pax DESC
    `).all(ym, destination).map(r => ({
      ...r,
      label: AIRPORT_LABELS[r.airport] || r.airport,
    }));

    res.json({
      ym,
      airport,
      destination,
      airlines: airlinesWithShare,
      history,
      topHistAirlines,
      airlineHistory,
      byAirport,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Airline Arena
app.get('/api/airline', (req, res) => {
  try {
    const db = getDb();
    const latest = db.prepare('SELECT ym FROM months ORDER BY ym DESC LIMIT 1').get();
    const ym = req.query.ym || latest?.ym;
    const airport = req.query.airport || 'ALL';
    const rawAirlines = req.query.airlines || '中華,長榮,星宇,台灣虎航';
    const selectedAirlines = rawAirlines.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
    const primary = selectedAirlines[0] || '中華';

    const placeholders = selectedAirlines.map(() => '?').join(',');

    const comparison = db.prepare(`
      SELECT
        airline,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        COUNT(DISTINCT destination) as dest_count,
        ROUND(CASE WHEN SUM(flights_total) > 0 THEN SUM(seats_total) * 1.0 / SUM(flights_total) ELSE 0 END, 0) as avg_seats
      FROM records
      WHERE ym = ? AND airport = ? AND airline IN (${placeholders})
      GROUP BY airline
      ORDER BY pax DESC
    `).all(ym, airport, ...selectedAirlines);

    const historyRows = db.prepare(`
      SELECT
        ym,
        airline,
        SUM(flights_total) as flights,
        SUM(seats_total) as seats,
        SUM(pax_total) as pax,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        COUNT(DISTINCT destination) as dest_count
      FROM records
      WHERE airport = ? AND airline IN (${placeholders})
      GROUP BY ym, airline
      ORDER BY ym ASC
    `).all(airport, ...selectedAirlines);

    const historyByAirline = {};
    for (const r of historyRows) {
      if (!historyByAirline[r.airline]) historyByAirline[r.airline] = [];
      historyByAirline[r.airline].push(r);
    }

    const primaryRoutes = db.prepare(`
      SELECT
        destination,
        route_type,
        flights_total as flights,
        seats_total as seats,
        pax_total as pax,
        lf_total as load_factor,
        lf_in, lf_out, avg_seats
      FROM records
      WHERE ym = ? AND airport = ? AND airline = ?
      ORDER BY pax_total DESC
    `).all(ym, airport, primary);

    const bestRoutes = [...primaryRoutes]
      .filter(r => r.flights >= 8)
      .sort((a, b) => b.load_factor - a.load_factor)
      .slice(0, 6);

    const weakestRoutes = [...primaryRoutes]
      .filter(r => r.flights >= 8)
      .sort((a, b) => a.load_factor - b.load_factor)
      .slice(0, 6);

    res.json({
      ym,
      airport,
      selectedAirlines,
      primary,
      comparison,
      historyByAirline,
      primaryRoutes,
      bestRoutes,
      weakestRoutes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Cross-Period Trends, Seasonality Heatmap & Insights
app.get('/api/trends', (req, res) => {
  try {
    const db = getDb();
    const latest = db.prepare('SELECT ym FROM months ORDER BY ym DESC LIMIT 1').get();
    const ym = req.query.ym || latest?.ym;
    const airport = req.query.airport || 'ALL';
    const startYear = parseInt(req.query.startYear || '2023', 10);
    const endYear = parseInt(req.query.endYear || String(new Date().getFullYear()), 10);

    // Full timeline with intl vs cross-strait split
    const timeline = db.prepare(`
      SELECT
        ym,
        SUM(pax_total) as total_pax,
        SUM(seats_total) as total_seats,
        SUM(flights_total) as total_flights,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as load_factor,
        SUM(CASE WHEN route_type != '兩岸航線' THEN pax_total ELSE 0 END) as intl_pax,
        SUM(CASE WHEN route_type = '兩岸航線' THEN pax_total ELSE 0 END) as cross_strait_pax
      FROM records
      WHERE airport = ?
      GROUP BY ym
      ORDER BY ym ASC
    `).all(airport);

    // Top 15 destinations in [startYear..endYear] for Seasonality Heatmap
    const top15 = db.prepare(`
      SELECT destination, SUM(pax_total) as tp
      FROM records
      WHERE airport = ? AND year >= ? AND year <= ?
      GROUP BY destination
      ORDER BY tp DESC
      LIMIT 15
    `).all(airport, startYear, endYear).map(r => r.destination);

    let heatmap = [];
    if (top15.length > 0) {
      const ph = top15.map(() => '?').join(',');
      heatmap = db.prepare(`
        SELECT
          destination,
          month,
          ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as avg_lf,
          ROUND(AVG(pax_total), 0) as avg_pax
        FROM (
          SELECT ym, month, destination, SUM(seats_total) as seats_total, SUM(pax_total) as pax_total
          FROM records
          WHERE airport = ? AND year >= ? AND year <= ? AND destination IN (${ph})
          GROUP BY ym, destination
        )
        GROUP BY destination, month
      `).all(airport, startYear, endYear, ...top15);
    }

    // Insights for selected ym: YoY growth & New routes
    const lastYr = prevYearYm(ym);
    const currDests = db.prepare(`
      SELECT destination, SUM(pax_total) as pax, SUM(seats_total) as seats, SUM(flights_total) as flights,
        ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as lf
      FROM records WHERE ym = ? AND airport = ?
      GROUP BY destination
    `).all(ym, airport);

    const prevYrDests = new Map(
      db.prepare(`
        SELECT destination, SUM(pax_total) as pax, SUM(seats_total) as seats,
          ROUND(CASE WHEN SUM(seats_total) > 0 THEN SUM(pax_total) * 100.0 / SUM(seats_total) ELSE 0 END, 1) as lf
        FROM records WHERE ym = ? AND airport = ?
        GROUP BY destination
      `).all(lastYr, airport).map(r => [r.destination, r])
    );

    const movers = currDests
      .filter(r => r.pax >= 3000 && prevYrDests.has(r.destination) && prevYrDests.get(r.destination).pax >= 2000)
      .map(r => {
        const p = prevYrDests.get(r.destination);
        return {
          destination: r.destination,
          pax: r.pax,
          prevPax: p.pax,
          yoyGrowth: pctChange(r.pax, p.pax),
          lf: r.lf,
          lfDiff: Math.round((r.lf - p.lf) * 10) / 10,
        };
      });

    const fastestGrowing = [...movers].sort((a, b) => b.yoyGrowth - a.yoyGrowth).slice(0, 8);
    const steepestDrop = [...movers].sort((a, b) => a.yoyGrowth - b.yoyGrowth).slice(0, 8);
    const newOrResumed = currDests
      .filter(r => !prevYrDests.has(r.destination) && r.flights >= 4)
      .sort((a, b) => b.pax - a.pax)
      .slice(0, 10);

    // Annual summary (2009-2026)
    const yearlySummary = db.prepare(`
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
    `).all(airport);

    res.json({
      ym,
      airport,
      startYear,
      endYear,
      timeline,
      yearlySummary,
      heatmapDestinations: top15,
      heatmap,
      insights: {
        fastestGrowing,
        steepestDrop,
        newOrResumed,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Sync / Data Management
app.get('/api/sync/status', async (req, res) => {
  try {
    const db = getDb();
    const localMonths = db.prepare('SELECT ym, record_count, total_pax, load_factor, parsed_at FROM months ORDER BY ym DESC').all();
    let remoteCatalog = null;
    let remoteError = null;
    if (req.query.checkRemote === '1') {
      try {
        remoteCatalog = await fetchCatalog();
      } catch (err) {
        remoteError = err.message;
      }
    }
    res.json({
      localMonths,
      remoteCatalog,
      remoteError,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/run', async (req, res) => {
  try {
    const { yms = null, force = false, parseOnly = false } = req.body || {};
    if (parseOnly) {
      const result = await parseAllLocal({ filterYms: yms });
      return res.json({ ok: true, mode: 'parseOnly', ...result });
    }
    const result = await syncFromCAA({ yms, force });
    res.json({ ok: true, mode: 'sync', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 7. South Korea (Air Portal) APIs
app.get('/api/kr/overview', (req, res) => {
  try {
    const db = getDb();
    const months = db.prepare('SELECT * FROM kr_months ORDER BY ym DESC').all();
    const ym = req.query.ym || months[0]?.ym;
    const origin = req.query.origin || 'ALL';
    if (!ym) return res.json({ empty: true });

    const current = db.prepare('SELECT * FROM kr_months WHERE ym = ?').get(ym);
    const prev = db.prepare('SELECT * FROM kr_months WHERE ym = ?').get(prevYm(ym));
    const yoy = db.prepare('SELECT * FROM kr_months WHERE ym = ?').get(prevYearYm(ym));

    const originClause = origin !== 'ALL' ? ' AND origin_iata = ?' : '';
    const rParams = origin !== 'ALL' ? [ym, origin] : [ym];

    const topRoutes = db.prepare(`
      SELECT
        destination, dest_iata,
        SUM(flights) as flights,
        SUM(pax) as pax,
        ROUND(SUM(cargo), 1) as cargo,
        GROUP_CONCAT(DISTINCT origin_iata) as origins
      FROM kr_routes
      WHERE ym = ?${originClause}
      GROUP BY dest_iata, destination
      ORDER BY pax DESC
      LIMIT 25
    `).all(...rParams);

    const origins = db.prepare(`
      SELECT origin, origin_iata, SUM(flights) as flights, SUM(pax) as pax, ROUND(SUM(cargo), 1) as cargo
      FROM kr_routes
      WHERE ym = ?
      GROUP BY origin_iata, origin
      ORDER BY pax DESC
    `).all(ym);

    const topAirlines = db.prepare(`
      SELECT airline, airline_code, flights, seats, pax, cargo, load_factor
      FROM kr_airlines
      WHERE ym = ?
      ORDER BY pax DESC
      LIMIT 25
    `).all(ym);

    const history = db.prepare('SELECT ym, total_flights as flights, total_seats as seats, total_pax as pax, total_cargo as cargo, load_factor FROM kr_months ORDER BY ym ASC').all();

    res.json({
      ym,
      origin,
      months: months.map(m => m.ym),
      kpi: {
        ...current,
        momPax: pctChange(current?.total_pax, prev?.total_pax),
        yoyPax: pctChange(current?.total_pax, yoy?.total_pax),
        yoyLf: yoy?.total_seats > 0 ? Math.round((current.load_factor - yoy.load_factor) * 10) / 10 : null,
      },
      origins,
      topRoutes,
      topAirlines,
      history,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/kr/route', (req, res) => {
  try {
    const db = getDb();
    const destIata = (req.query.destIata || 'TPE').toUpperCase();
    const history = db.prepare(`
      SELECT ym, SUM(flights) as flights, SUM(pax) as pax, ROUND(SUM(cargo), 1) as cargo
      FROM kr_routes
      WHERE dest_iata = ?
      GROUP BY ym
      ORDER BY ym ASC
    `).all(destIata);
    const metaRow = db.prepare('SELECT destination, dest_iata FROM kr_routes WHERE dest_iata = ? LIMIT 1').get(destIata);
    res.json({ destIata, destination: metaRow?.destination || destIata, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Japan (MLIT e-Stat) APIs
app.get('/api/jp/overview', (req, res) => {
  try {
    const db = getDb();
    const months = db.prepare('SELECT * FROM jp_months ORDER BY ym DESC').all();
    const ym = req.query.ym || months[0]?.ym;
    if (!ym) return res.json({ empty: true });

    const current = db.prepare('SELECT * FROM jp_months WHERE ym = ?').get(ym);
    const yoy = db.prepare('SELECT * FROM jp_months WHERE ym = ?').get(prevYearYm(ym));

    const domRoutes = db.prepare(`
      SELECT category, route, pax, pax_yoy, cargo_tons
      FROM jp_routes
      WHERE ym = ? AND category != '国際方面'
      ORDER BY pax DESC
    `).all(ym);

    const intlRegions = db.prepare(`
      SELECT route as region, pax, pax_yoy, cargo_tons
      FROM jp_routes
      WHERE ym = ? AND category = '国際方面'
      ORDER BY pax DESC
    `).all(ym);

    const history = db.prepare('SELECT * FROM jp_months ORDER BY ym ASC').all();

    res.json({
      ym,
      months: months.map(m => m.ym),
      kpi: {
        ...current,
        yoyDomPax: pctChange(current?.dom_pax, yoy?.dom_pax),
        yoyIntlPax: pctChange(current?.intl_pax, yoy?.intl_pax),
      },
      domRoutes,
      intlRegions,
      history,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jp/route', (req, res) => {
  try {
    const db = getDb();
    const route = req.query.route || '東京（羽田）－新千歳';
    const history = db.prepare(`
      SELECT ym, category, pax, pax_yoy, cargo_tons
      FROM jp_routes
      WHERE route = ?
      ORDER BY ym ASC
    `).all(route);
    res.json({ route, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. East Asia 3-Country Comparison (TW vs KR vs JP)
app.get('/api/east-asia/compare', (req, res) => {
  try {
    const db = getDb();
    const tw = db.prepare("SELECT ym, total_pax as pax, load_factor as lf, total_flights as flights FROM months WHERE ym >= '2019-01' ORDER BY ym ASC").all();
    const kr = db.prepare("SELECT ym, total_pax as pax, load_factor as lf, total_flights as flights, total_cargo as cargo FROM kr_months WHERE ym >= '2019-01' ORDER BY ym ASC").all();
    const jp = db.prepare("SELECT ym, intl_pax, intl_lf, dom_pax, dom_lf, intl_flights, dom_flights FROM jp_months WHERE ym >= '2019-01' ORDER BY ym ASC").all();

    // Bilateral TW <-> KR (TPE/KHH/TSA -> ICN/GMP/PUS/CJU vs KR -> TPE/KHH/TSA/RMQ)
    const twToKr = db.prepare(`
      SELECT ym, SUM(pax_total) as pax
      FROM records
      WHERE airport = 'ALL' AND ym >= '2019-01' AND destination IN ('首爾仁川', '仁川', '首爾金浦', '釜山', '濟州', '濟州島', '大邱', '清州', '務安', '襄陽')
      GROUP BY ym ORDER BY ym ASC
    `).all();
    const krToTw = db.prepare(`
      SELECT ym, SUM(pax) as pax
      FROM kr_routes
      WHERE ym >= '2019-01' AND dest_iata IN ('TPE', 'KHH', 'TSA', 'RMQ')
      GROUP BY ym ORDER BY ym ASC
    `).all();

    res.json({ tw, kr, jp, bilateral: { twToKr, krToTw } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Taiwan Cargo Analysis (a=1738 monthly airline cargo + a=1736 airport 74-year history)
app.get('/api/tw/cargo', (req, res) => {
  try {
    const db = getDb();
    const months = db.prepare('SELECT DISTINCT ym FROM tw_airline_cargo ORDER BY ym DESC').all().map(r => r.ym);
    const ym = req.query.ym || months[0];
    if (!ym) return res.json({ empty: true });

    const airlinesInMonth = db.prepare(`
      SELECT airline, flights, pax, pax_lf, cargo_tons, ftk, aftk, cargo_lf
      FROM tw_airline_cargo
      WHERE ym = ?
      ORDER BY cargo_tons DESC
    `).all(ym);

    const prevMonthRows = db.prepare('SELECT SUM(cargo_tons) as tons FROM tw_airline_cargo WHERE ym = ?').get(prevYm(ym));
    const yoyMonthRows = db.prepare('SELECT SUM(cargo_tons) as tons FROM tw_airline_cargo WHERE ym = ?').get(prevYearYm(ym));

    const totalCargo = Math.round(airlinesInMonth.reduce((s, a) => s + a.cargo_tons, 0) * 10) / 10;
    const totalFtk = airlinesInMonth.reduce((s, a) => s + a.ftk, 0);
    const totalAftk = airlinesInMonth.reduce((s, a) => s + a.aftk, 0);
    const avgCargoLf = totalAftk > 0 ? Math.round((totalFtk / totalAftk) * 1000) / 10 : 0;

    // Historical monthly cargo by main carriers
    const mainCarriers = ['中華', '長榮', '星宇', '台灣虎航', '立榮', '華信'];
    const ph = mainCarriers.map(() => '?').join(',');
    const histRows = db.prepare(`
      SELECT ym, airline, cargo_tons, cargo_lf
      FROM tw_airline_cargo
      WHERE airline IN (${ph})
      ORDER BY ym ASC
    `).all(...mainCarriers);

    const historyByAirline = {};
    for (const r of histRows) {
      if (!historyByAirline[r.airline]) historyByAirline[r.airline] = [];
      historyByAirline[r.airline].push({ ym: r.ym, cargo_tons: r.cargo_tons, cargo_lf: r.cargo_lf });
    }

    const totalMonthlyHistory = db.prepare(`
      SELECT
        ym,
        ROUND(SUM(cargo_tons), 1) as cargo_tons,
        ROUND(CASE WHEN SUM(aftk) > 0 THEN SUM(ftk) * 100.0 / SUM(aftk) ELSE 0 END, 1) as cargo_lf
      FROM tw_airline_cargo
      GROUP BY ym
      ORDER BY ym ASC
    `).all();

    const airportHistory = db.prepare(`
      SELECT year, airport, flights, pax, cargo_tons
      FROM tw_airport_history
      WHERE airport IN ('ALL', 'TPE', 'KHH', 'TSA', 'RMQ')
      ORDER BY year ASC
    `).all();

    res.json({
      ym,
      months,
      kpi: {
        totalCargo,
        avgCargoLf,
        momCargo: pctChange(totalCargo, prevMonthRows?.tons),
        yoyCargo: pctChange(totalCargo, yoyMonthRows?.tons),
        topCarrier: airlinesInMonth[0]?.airline || '-',
        topCarrierShare: totalCargo > 0 && airlinesInMonth[0] ? Math.round((airlinesInMonth[0].cargo_tons / totalCargo) * 1000) / 10 : 0,
      },
      airlines: airlinesInMonth.map(a => ({
        ...a,
        share: totalCargo > 0 ? Math.round((a.cargo_tons / totalCargo) * 1000) / 10 : 0,
      })),
      mainCarriers,
      historyByAirline,
      totalMonthlyHistory,
      airportHistory,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Taiwan On-Time Performance & Cancellations (a=1750)
app.get('/api/tw/otp', (req, res) => {
  try {
    const db = getDb();
    const months = db.prepare('SELECT DISTINCT ym FROM tw_otp ORDER BY ym DESC').all().map(r => r.ym);
    const ym = req.query.ym || months[0];
    if (!ym) return res.json({ empty: true });

    const airlinesInMonth = db.prepare(`
      SELECT *
      FROM tw_otp
      WHERE ym = ?
      ORDER BY otp_rate DESC
    `).all(ym);

    const totalDep = airlinesInMonth.reduce((s, a) => s + a.departures, 0);
    const totalDel = airlinesInMonth.reduce((s, a) => s + a.delays, 0);
    const totalCancel = airlinesInMonth.reduce((s, a) => s + a.cancel_total, 0);
    const totalFault = airlinesInMonth.reduce((s, a) => s + a.cancel_fault, 0);
    const avgOtp = totalDep > 0 ? Math.round(((totalDep - totalDel) / totalDep) * 10000) / 100 : 0;

    // Historical OTP by airline
    const mainCarriers = ['中華', '長榮', '星宇', '台灣虎航', '立榮', '華信'];
    const ph = mainCarriers.map(() => '?').join(',');
    const histRows = db.prepare(`
      SELECT ym, airline, otp_rate, delay_rate, departures, delays, cancel_fault
      FROM tw_otp
      WHERE airline IN (${ph})
      ORDER BY ym ASC
    `).all(...mainCarriers);

    const historyByAirline = {};
    for (const r of histRows) {
      if (!historyByAirline[r.airline]) historyByAirline[r.airline] = [];
      historyByAirline[r.airline].push(r);
    }

    const overallHistory = db.prepare(`
      SELECT
        ym,
        SUM(departures) as departures,
        SUM(delays) as delays,
        ROUND(CASE WHEN SUM(departures) > 0 THEN (SUM(departures) - SUM(delays)) * 100.0 / SUM(departures) ELSE 0 END, 2) as otp_rate,
        SUM(cancel_total) as cancel_total,
        SUM(cancel_fault) as cancel_fault
      FROM tw_otp
      GROUP BY ym
      ORDER BY ym ASC
    `).all();

    res.json({
      ym,
      months,
      kpi: {
        avgOtp,
        totalDep,
        totalDel,
        totalCancel,
        totalFault,
        bestAirline: airlinesInMonth[0]?.airline || '-',
        bestOtp: airlinesInMonth[0]?.otp_rate || 0,
      },
      airlines: airlinesInMonth,
      mainCarriers,
      historyByAirline,
      overallHistory,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve built frontend in production
const webDist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`TW Airline Analyzer server running at http://localhost:${PORT}`);
});
