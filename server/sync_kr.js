const { saveKrMonthData } = require('./db');

const HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function extractCode(str) {
  const m = String(str || '').match(/\(([A-Z0-9]{2,4})\)\s*$/);
  return m ? m[1] : '';
}

function cleanName(str) {
  return String(str || '').replace(/\([A-Z0-9]{2,4}\)\s*$/, '').trim();
}

function toInt(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toFloat(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

async function fetchJson(url, body, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 700 * i));
    }
  }
}

async function fetchKoreaMonth(ym) {
  const ymCompact = ym.replace('-', '');

  const [routeRes, airRes] = await Promise.all([
    fetchJson('https://www.airportal.go.kr/stats/transport/getDetailedAirTransportStats3.do', {
      last_yearmonth: ymCompact,
      this_yearmonth: ymCompact,
      sn_gubun: 'total',
      airport_gubun: 'total',
      forreign_airport_gubun: 'total',
      pass_gubun: 'total',
      carge_gubun: 'total',
      di_gubun: 'I',
      arvl_type: 'total',
      pyn_gubun: 'Y',
    }),
    fetchJson('https://www.airportal.go.kr/stats/transport/getDetailedAirTransportStats1.do', {
      last_yearmonth: ymCompact,
      this_yearmonth: ymCompact,
      sn_gubun: 'total',
      airline_gubun: 'total',
      pass_gubun: 'total',
      carge_gubun: 'total',
      di_gubun: 'I',
      arvl_type: 'total',
      pyn_gubun: 'Y',
    }),
  ]);

  const rawRoutes = routeRes?.content || [];
  const rawAirlines = airRes?.content || [];

  const routes = [];
  for (const r of rawRoutes) {
    if (!r.code_name || r.code_name.includes('합계') || !r.airport_name) continue;
    const pax = toInt(r.pass);
    const flights = toInt(r.flight_cnt);
    if (pax === 0 && flights === 0) continue;
    routes.push({
      origin: cleanName(r.code_name),
      origin_iata: extractCode(r.code_name),
      destination: cleanName(r.airport_name),
      dest_iata: extractCode(r.airport_name),
      flights,
      pax,
      cargo: toFloat(r.cargo),
    });
  }

  let totalRow = null;
  const airlines = [];
  for (const a of rawAirlines) {
    const name = String(a.airline_name || '');
    if (!name) continue;
    if (name.includes('전체 합계')) {
      totalRow = a;
      continue;
    }
    if (name.includes('국적사 계') || name.includes('외항사 계') || name.includes('실적') || name.includes('합계')) {
      continue;
    }
    const seats = toInt(a.flight_seat);
    const pax = toInt(a.pass);
    const flights = toInt(a.flight_cnt);
    if (pax === 0 && flights === 0) continue;
    const lf = seats > 0 ? Math.round((pax / seats) * 1000) / 10 : 0;
    airlines.push({
      airline: cleanName(name),
      airline_code: extractCode(name),
      flights,
      seats,
      pax,
      cargo: toFloat(a.cargo),
      load_factor: lf,
    });
  }

  const totalFlights = totalRow ? toInt(totalRow.flight_cnt) : airlines.reduce((s, a) => s + a.flights, 0);
  const totalSeats = totalRow ? toInt(totalRow.flight_seat) : airlines.reduce((s, a) => s + a.seats, 0);
  const totalPax = totalRow ? toInt(totalRow.pass) : airlines.reduce((s, a) => s + a.pax, 0);
  const totalCargo = totalRow ? toFloat(totalRow.cargo) : Math.round(airlines.reduce((s, a) => s + a.cargo, 0) * 10) / 10;
  const loadFactor = totalSeats > 0 ? Math.round((totalPax / totalSeats) * 1000) / 10 : 0;

  return {
    ym,
    summary: { flights: totalFlights, seats: totalSeats, pax: totalPax, cargo: totalCargo, load_factor: loadFactor },
    routes,
    airlines,
  };
}

function generateMonths(startYear, endYear, endMonth = 12) {
  const list = [];
  for (let y = startYear; y <= endYear; y++) {
    const maxM = y === endYear ? endMonth : 12;
    for (let m = 1; m <= maxM; m++) {
      list.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  return list;
}

async function syncKorea({ startYear = 2019, endYear = 2026, endMonth = 10, concurrency = 4 } = {}) {
  const months = generateMonths(startYear, endYear, endMonth);
  let idx = 0;
  let saved = 0;
  let failed = 0;

  async function worker() {
    while (idx < months.length) {
      const ym = months[idx++];
      try {
        const data = await fetchKoreaMonth(ym);
        if (data.summary.pax > 0 && data.routes.length > 0) {
          saveKrMonthData(ym, data);
          saved++;
        }
      } catch (err) {
        failed++;
        console.error(`KR ${ym} failed:`, err.message);
      }
      if ((saved + failed) % 15 === 0) {
        console.log(`KR progress: ${saved + failed}/${months.length} (saved: ${saved}, latest: ${ym})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { total: months.length, saved, failed };
}

if (require.main === module) {
  const start = Date.now();
  console.log('Syncing South Korea (Air Portal) 2019-01 to 2026-10...');
  syncKorea({ startYear: 2019, endYear: 2026, endMonth: 10, concurrency: 4 })
    .then(res => {
      console.log(`KR Sync Done in ${((Date.now() - start) / 1000).toFixed(1)}s!`, res);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { fetchKoreaMonth, syncKorea };
