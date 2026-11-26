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

const DATA_BASE = `${import.meta.env.BASE_URL}data`;
const cache = new Map();

async function fetchJsonCached(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
  const p = fetch(`${DATA_BASE}/${relPath}`).then(async (res) => {
    if (!res.ok) throw new Error(`無法讀取靜態資料 ${relPath} (HTTP ${res.status})`);
    return res.json();
  });
  cache.set(relPath, p);
  return p;
}

function prevYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function prevYearYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}`;
}

function pctChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// Tuple format from export_static.js:
// [0:airport, 1:rtIdx(0=intl,1=cross), 2:dest, 3:airline, 4:flt, 5:seats, 6:pax, 7:lf, 8:paxIn, 9:lfIn, 10:paxOut, 11:lfOut, 12:avgSeats]
function unpackRecord(t) {
  return {
    airport: t[0],
    route_type: t[1] === 1 ? '兩岸航線' : '國際航線(含港澳)',
    destination: t[2],
    airline: t[3],
    flights: t[4],
    seats: t[5],
    pax: t[6],
    load_factor: t[7],
    pax_in: t[8],
    lf_in: t[9],
    pax_out: t[10],
    lf_out: t[11],
    avg_seats: t[12],
  };
}

async function safeMonthData(ym, validSet) {
  if (!ym || (validSet && !validSet.has(ym))) return null;
  try {
    return await fetchJsonCached(`months/${ym}.json`);
  } catch {
    return null;
  }
}

export const IS_STATIC_MODE = true;

export const api = {
  getMeta: () => fetchJsonCached('meta.json'),

  getOverview: async ({ ym, airport = 'ALL', routeType = 'ALL' }) => {
    const [meta, macroAll] = await Promise.all([
      fetchJsonCached('meta.json'),
      fetchJsonCached('macro.json'),
    ]);
    const validYms = new Set(meta.months.map(m => m.ym));
    const targetYm = ym || meta.summary.maxYm;

    const [currData, prevData, yoyData] = await Promise.all([
      safeMonthData(targetYm, validYms),
      safeMonthData(prevYm(targetYm), validYms),
      safeMonthData(prevYearYm(targetYm), validYms),
    ]);
    if (!currData) return { empty: true };

    const calcKpi = (mData) => {
      if (!mData) return { flights: 0, seats: 0, pax: 0, loadFactor: 0, paxIn: 0, paxOut: 0, lfIn: 0, lfOut: 0, destCount: 0, airlineCount: 0 };
      const recs = mData.records
        .map(unpackRecord)
        .filter(r => r.airport === airport && (routeType === 'ALL' || r.route_type === routeType));
      const destSet = new Set(recs.map(r => r.destination));
      const airSet = new Set(recs.map(r => r.airline));
      const off = routeType === 'ALL' ? mData.totals[airport] : null;

      const flights = off ? off.flights : recs.reduce((s, r) => s + r.flights, 0);
      const seats = off ? off.seats : recs.reduce((s, r) => s + r.seats, 0);
      const pax = off ? off.pax : recs.reduce((s, r) => s + r.pax, 0);
      const paxIn = off ? off.paxIn : recs.reduce((s, r) => s + r.pax_in, 0);
      const paxOut = off ? off.paxOut : recs.reduce((s, r) => s + r.pax_out, 0);
      const lf = seats > 0 ? Math.round((pax / seats) * 1000) / 10 : 0;
      const lfIn = off ? off.lfIn : (seats > 0 ? Math.round((paxIn / (seats / 2)) * 1000) / 10 : 0);
      const lfOut = off ? off.lfOut : (seats > 0 ? Math.round((paxOut / (seats / 2)) * 1000) / 10 : 0);

      return { flights, seats, pax, loadFactor: lf, paxIn, paxOut, lfIn, lfOut, destCount: destSet.size, airlineCount: airSet.size };
    };

    const current = calcKpi(currData);
    const prev = calcKpi(prevData);
    const yoy = calcKpi(yoyData);

    const allUnpacked = currData.records.map(unpackRecord);
    const filtered = allUnpacked.filter(r => r.airport === airport && (routeType === 'ALL' || r.route_type === routeType));

    // Group by destination
    const destMap = new Map();
    for (const r of filtered) {
      let d = destMap.get(r.destination);
      if (!d) {
        d = { destination: r.destination, route_type: r.route_type, flights: 0, seats: 0, pax: 0, pax_in: 0, pax_out: 0, airlines: new Set() };
        destMap.set(r.destination, d);
      }
      d.flights += r.flights;
      d.seats += r.seats;
      d.pax += r.pax;
      d.pax_in += r.pax_in;
      d.pax_out += r.pax_out;
      d.airlines.add(r.airline);
    }
    const topDestinations = Array.from(destMap.values())
      .map(d => ({
        destination: d.destination,
        route_type: d.route_type,
        flights: d.flights,
        seats: d.seats,
        pax: d.pax,
        load_factor: d.seats > 0 ? Math.round((d.pax / d.seats) * 1000) / 10 : 0,
        lf_in: d.seats > 0 ? Math.round((d.pax_in / (d.seats / 2)) * 1000) / 10 : 0,
        lf_out: d.seats > 0 ? Math.round((d.pax_out / (d.seats / 2)) * 1000) / 10 : 0,
        airline_count: d.airlines.size,
        avg_seats: d.flights > 0 ? Math.round(d.seats / d.flights) : 0,
      }))
      .sort((a, b) => b.pax - a.pax)
      .slice(0, 25);

    // Group by airline
    const airMap = new Map();
    for (const r of filtered) {
      let a = airMap.get(r.airline);
      if (!a) {
        a = { airline: r.airline, flights: 0, seats: 0, pax: 0, dests: new Set() };
        airMap.set(r.airline, a);
      }
      a.flights += r.flights;
      a.seats += r.seats;
      a.pax += r.pax;
      a.dests.add(r.destination);
    }
    const topAirlines = Array.from(airMap.values())
      .map(a => ({
        airline: a.airline,
        flights: a.flights,
        seats: a.seats,
        pax: a.pax,
        load_factor: a.seats > 0 ? Math.round((a.pax / a.seats) * 1000) / 10 : 0,
        dest_count: a.dests.size,
        avg_seats: a.flights > 0 ? Math.round(a.seats / a.flights) : 0,
      }))
      .sort((a, b) => b.pax - a.pax)
      .slice(0, 20);

    // Airport breakdown
    const apMap = new Map();
    for (const r of allUnpacked) {
      if (r.airport === 'ALL') continue;
      if (routeType !== 'ALL' && r.route_type !== routeType) continue;
      let a = apMap.get(r.airport);
      if (!a) {
        a = { airport: r.airport, label: AIRPORT_LABELS[r.airport] || r.airport, flights: 0, seats: 0, pax: 0, dests: new Set() };
        apMap.set(r.airport, a);
      }
      a.flights += r.flights;
      a.seats += r.seats;
      a.pax += r.pax;
      a.dests.add(r.destination);
    }
    const airportBreakdown = Array.from(apMap.values())
      .map(a => ({
        airport: a.airport,
        label: a.label,
        flights: a.flights,
        seats: a.seats,
        pax: a.pax,
        load_factor: a.seats > 0 ? Math.round((a.pax / a.seats) * 1000) / 10 : 0,
        dest_count: a.dests.size,
      }))
      .sort((a, b) => b.pax - a.pax);

    // Route type breakdown
    const rtMap = new Map();
    for (const r of allUnpacked.filter(x => x.airport === airport)) {
      let rt = rtMap.get(r.route_type);
      if (!rt) {
        rt = { route_type: r.route_type, flights: 0, seats: 0, pax: 0 };
        rtMap.set(r.route_type, rt);
      }
      rt.flights += r.flights;
      rt.seats += r.seats;
      rt.pax += r.pax;
    }
    const routeTypeBreakdown = Array.from(rtMap.values())
      .map(rt => ({
        ...rt,
        load_factor: rt.seats > 0 ? Math.round((rt.pax / rt.seats) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.pax - a.pax);

    // Macro history
    const macroSeries = (macroAll[airport]?.timeline || []).map(row => {
      if (routeType === '國際航線(含港澳)') {
        const lf = row.intl_seats > 0 ? Math.round((row.intl_pax / row.intl_seats) * 1000) / 10 : 0;
        return { ym: row.ym, pax: row.intl_pax, seats: row.intl_seats, load_factor: lf };
      }
      if (routeType === '兩岸航線') {
        const lf = row.cross_strait_seats > 0 ? Math.round((row.cross_strait_pax / row.cross_strait_seats) * 1000) / 10 : 0;
        return { ym: row.ym, pax: row.cross_strait_pax, seats: row.cross_strait_seats, load_factor: lf };
      }
      return { ym: row.ym, pax: row.total_pax, seats: row.total_seats, load_factor: row.load_factor };
    });

    return {
      ym: targetYm,
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
      macroHistory: macroSeries,
    };
  },

  getRoute: async ({ destination, airport = 'ALL', ym }) => {
    const meta = await fetchJsonCached('meta.json');
    const targetYm = ym || meta.summary.maxYm;
    const destObj = meta.destinations.find(d => d.destination === destination);

    const [mData, routeData] = await Promise.all([
      safeMonthData(targetYm),
      destObj ? fetchJsonCached(`routes/${destObj.id}.json`).catch(() => null) : Promise.resolve(null),
    ]);

    const recs = (mData?.records || [])
      .map(unpackRecord)
      .filter(r => r.airport === airport && r.destination === destination)
      .sort((a, b) => b.pax - a.pax);

    const totalPax = recs.reduce((s, r) => s + r.pax, 0);
    const airlines = recs.map(r => ({
      ...r,
      marketShare: totalPax > 0 ? Math.round((r.pax / totalPax) * 1000) / 10 : 0,
    }));

    const airlineHistory = {};
    if (routeData?.airlineHistory) {
      for (const [k, arr] of Object.entries(routeData.airlineHistory)) {
        airlineHistory[k] = arr.map(([m, pax]) => ({ ym: m, pax }));
      }
    }

    return {
      ym: targetYm,
      airport,
      destination,
      airlines,
      history: routeData?.history || [],
      topHistAirlines: routeData?.topHistAirlines || [],
      airlineHistory,
    };
  },

  getAirline: async ({ airlines, airport = 'ALL', ym }) => {
    const [meta, allHist] = await Promise.all([
      fetchJsonCached('meta.json'),
      fetchJsonCached('airlines_history.json'),
    ]);
    const targetYm = ym || meta.summary.maxYm;
    const mData = await safeMonthData(targetYm);
    const primary = airlines[0] || '中華';

    const recs = (mData?.records || []).map(unpackRecord).filter(r => r.airport === airport);
    const selSet = new Set(airlines);

    const compMap = new Map();
    for (const r of recs) {
      if (!selSet.has(r.airline)) continue;
      let a = compMap.get(r.airline);
      if (!a) {
        a = { airline: r.airline, flights: 0, seats: 0, pax: 0, dests: new Set() };
        compMap.set(r.airline, a);
      }
      a.flights += r.flights;
      a.seats += r.seats;
      a.pax += r.pax;
      a.dests.add(r.destination);
    }
    const comparison = Array.from(compMap.values())
      .map(a => ({
        airline: a.airline,
        flights: a.flights,
        seats: a.seats,
        pax: a.pax,
        load_factor: a.seats > 0 ? Math.round((a.pax / a.seats) * 1000) / 10 : 0,
        dest_count: a.dests.size,
        avg_seats: a.flights > 0 ? Math.round(a.seats / a.flights) : 0,
      }))
      .sort((a, b) => b.pax - a.pax);

    const historyByAirline = {};
    for (const name of airlines) {
      historyByAirline[name] = (allHist[name] || []).map(([m, pax, lf]) => ({ ym: m, pax, load_factor: lf }));
    }

    const primaryRoutes = recs.filter(r => r.airline === primary).sort((a, b) => b.pax - a.pax);
    const bestRoutes = [...primaryRoutes].filter(r => r.flights >= 8).sort((a, b) => b.load_factor - a.load_factor).slice(0, 6);
    const weakestRoutes = [...primaryRoutes].filter(r => r.flights >= 8).sort((a, b) => a.load_factor - b.load_factor).slice(0, 6);

    return { ym: targetYm, airport, selectedAirlines: airlines, primary, comparison, historyByAirline, primaryRoutes, bestRoutes, weakestRoutes };
  },

  getTrends: async ({ ym, airport = 'ALL', startYear = 2023, endYear = 2026 }) => {
    const [meta, macroAll] = await Promise.all([
      fetchJsonCached('meta.json'),
      fetchJsonCached('macro.json'),
    ]);
    const validYms = new Set(meta.months.map(m => m.ym));
    const targetYm = ym || meta.summary.maxYm;
    const apMacro = macroAll[airport] || macroAll.ALL;

    const eraKey = `${startYear}-${endYear}`;
    const hm = apMacro.heatmaps[eraKey] || apMacro.heatmaps['2023-2026'] || { destinations: [], cells: [] };

    // Compute YoY movers from targetYm & prevYearYm
    const [currData, prevData] = await Promise.all([
      safeMonthData(targetYm, validYms),
      safeMonthData(prevYearYm(targetYm), validYms),
    ]);

    const aggByDest = (mData) => {
      const m = new Map();
      for (const t of (mData?.records || [])) {
        if (t[0] !== airport) continue;
        const dest = t[2];
        let o = m.get(dest);
        if (!o) {
          o = { destination: dest, flights: 0, seats: 0, pax: 0 };
          m.set(dest, o);
        }
        o.flights += t[4];
        o.seats += t[5];
        o.pax += t[6];
      }
      for (const o of m.values()) {
        o.lf = o.seats > 0 ? Math.round((o.pax / o.seats) * 1000) / 10 : 0;
      }
      return m;
    };

    const currMap = aggByDest(currData);
    const prevMap = aggByDest(prevData);

    const movers = [];
    const newOrResumed = [];
    for (const r of currMap.values()) {
      const p = prevMap.get(r.destination);
      if (p && r.pax >= 3000 && p.pax >= 2000) {
        movers.push({
          destination: r.destination,
          pax: r.pax,
          prevPax: p.pax,
          yoyGrowth: pctChange(r.pax, p.pax),
          lf: r.lf,
        });
      } else if (!p && r.flights >= 4) {
        newOrResumed.push(r);
      }
    }

    return {
      ym: targetYm,
      airport,
      startYear,
      endYear,
      timeline: apMacro.timeline,
      yearlySummary: apMacro.yearly,
      heatmapDestinations: hm.destinations,
      heatmap: hm.cells,
      insights: {
        fastestGrowing: [...movers].sort((a, b) => b.yoyGrowth - a.yoyGrowth).slice(0, 8),
        steepestDrop: [...movers].sort((a, b) => a.yoyGrowth - b.yoyGrowth).slice(0, 8),
        newOrResumed: newOrResumed.sort((a, b) => b.pax - a.pax).slice(0, 10),
      },
    };
  },

  getTwCargo: async (ym = '') => {
    const raw = await fetchJsonCached('cargo.json');
    const months = Array.from(new Set(raw.rows.map(r => r.ym))).sort().reverse();
    const targetYm = ym || months[0];
    if (!targetYm) return { empty: true };

    const airlinesInMonth = raw.rows.filter(r => r.ym === targetYm).sort((a, b) => b.cargo_tons - a.cargo_tons);
    const prevTons = raw.rows.filter(r => r.ym === prevYm(targetYm)).reduce((s, r) => s + r.cargo_tons, 0);
    const yoyTons = raw.rows.filter(r => r.ym === prevYearYm(targetYm)).reduce((s, r) => s + r.cargo_tons, 0);

    const totalCargo = Math.round(airlinesInMonth.reduce((s, a) => s + a.cargo_tons, 0) * 10) / 10;
    const totalFtk = airlinesInMonth.reduce((s, a) => s + a.ftk, 0);
    const totalAftk = airlinesInMonth.reduce((s, a) => s + a.aftk, 0);
    const avgCargoLf = totalAftk > 0 ? Math.round((totalFtk / totalAftk) * 1000) / 10 : 0;

    const historyByAirline = {};
    const monthlyTotMap = new Map();
    for (const r of raw.rows) {
      if (!historyByAirline[r.airline]) historyByAirline[r.airline] = [];
      historyByAirline[r.airline].push({ ym: r.ym, cargo_tons: r.cargo_tons, cargo_lf: r.cargo_lf });

      let mt = monthlyTotMap.get(r.ym);
      if (!mt) {
        mt = { ym: r.ym, cargo_tons: 0, ftk: 0, aftk: 0 };
        monthlyTotMap.set(r.ym, mt);
      }
      mt.cargo_tons += r.cargo_tons;
      mt.ftk += r.ftk;
      mt.aftk += r.aftk;
    }

    const totalMonthlyHistory = Array.from(monthlyTotMap.values())
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .map(m => ({
        ym: m.ym,
        cargo_tons: Math.round(m.cargo_tons * 10) / 10,
        cargo_lf: m.aftk > 0 ? Math.round((m.ftk / m.aftk) * 1000) / 10 : 0,
      }));

    return {
      ym: targetYm,
      months,
      kpi: {
        totalCargo,
        avgCargoLf,
        momCargo: pctChange(totalCargo, prevTons),
        yoyCargo: pctChange(totalCargo, yoyTons),
        topCarrier: airlinesInMonth[0]?.airline || '-',
        topCarrierShare: totalCargo > 0 && airlinesInMonth[0] ? Math.round((airlinesInMonth[0].cargo_tons / totalCargo) * 1000) / 10 : 0,
      },
      airlines: airlinesInMonth.map(a => ({
        ...a,
        share: totalCargo > 0 ? Math.round((a.cargo_tons / totalCargo) * 1000) / 10 : 0,
      })),
      historyByAirline,
      totalMonthlyHistory,
      airportHistory: raw.airportHistory,
    };
  },

  getTwOtp: async (ym = '') => {
    const raw = await fetchJsonCached('otp.json');
    const months = Array.from(new Set(raw.rows.map(r => r.ym))).sort().reverse();
    const targetYm = ym || months[0];
    if (!targetYm) return { empty: true };

    const airlinesInMonth = raw.rows.filter(r => r.ym === targetYm).sort((a, b) => b.otp_rate - a.otp_rate);
    const totalDep = airlinesInMonth.reduce((s, a) => s + a.departures, 0);
    const totalDel = airlinesInMonth.reduce((s, a) => s + a.delays, 0);
    const totalCancel = airlinesInMonth.reduce((s, a) => s + a.cancel_total, 0);
    const totalFault = airlinesInMonth.reduce((s, a) => s + a.cancel_fault, 0);
    const avgOtp = totalDep > 0 ? Math.round(((totalDep - totalDel) / totalDep) * 10000) / 100 : 0;

    const historyByAirline = {};
    const overallMap = new Map();
    for (const r of raw.rows) {
      if (!historyByAirline[r.airline]) historyByAirline[r.airline] = [];
      historyByAirline[r.airline].push(r);
      let ov = overallMap.get(r.ym);
      if (!ov) {
        ov = { ym: r.ym, departures: 0, delays: 0 };
        overallMap.set(r.ym, ov);
      }
      ov.departures += r.departures;
      ov.delays += r.delays;
    }

    const overallHistory = Array.from(overallMap.values())
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .map(o => ({
        ...o,
        otp_rate: o.departures > 0 ? Math.round(((o.departures - o.delays) / o.departures) * 10000) / 100 : 0,
      }));

    return {
      ym: targetYm,
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
      historyByAirline,
      overallHistory,
    };
  },

  getSyncStatus: async () => {
    const meta = await fetchJsonCached('meta.json');
    return {
      staticMode: true,
      generatedAt: meta.generatedAt,
      localMonths: meta.months,
    };
  },
};

export function fmtNum(n) {
  if (n === null || n === undefined) return '-';
  return Number(n).toLocaleString('en-US');
}

export function fmtCompact(n) {
  if (n === null || n === undefined) return '-';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 10_000).toFixed(1)}萬`;
  return Number(n).toLocaleString('en-US');
}

export function fmtYmRoc(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return `${y}/${String(m).padStart(2, '0')} (${y - 1911}年${m}月)`;
}
