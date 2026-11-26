const XLSX = require('xlsx');

const AIRPORT_PATTERNS = [
  { code: 'TPE', re: /桃園/ },
  { code: 'KHH', re: /高雄/ },
  { code: 'TSA', re: /松山/ },
  { code: 'RMQ', re: /[臺台]中/ },
  { code: 'TNN', re: /[臺台]南/ },
  { code: 'HUN', re: /花蓮/ },
  { code: 'CYI', re: /嘉義/ },
  { code: 'TTT', re: /[臺台]東/ },
  { code: 'KNH', re: /金門/ },
  { code: 'MZG', re: /馬公|澎湖/ },
];

function detectAirport(text) {
  for (const { code, re } of AIRPORT_PATTERNS) {
    if (re.test(text)) return code;
  }
  return 'ALL';
}

function cleanStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/[\r\n\t\u3000]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const s = String(val).replace(/[,%\s]/g, '');
  if (!s || s === '-' || s === '—' || s === '…' || s === 'N/A') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toInt(val) {
  return Math.round(toNum(val));
}

function toFloat1(val) {
  return Math.round(toNum(val) * 10) / 10;
}

function normalizeRouteType(text) {
  if (/兩岸/.test(text)) return '兩岸航線';
  if (/國際/.test(text)) return '國際航線(含港澳)';
  return text;
}

function normalizeName(name) {
  return cleanStr(name).replace(/\s+/g, '');
}

/**
 * Check if a sheet is a cumulative (YTD) sheet like "115年1月至115年10月" or "表42".
 */
function isCumulativeSheet(sheetName, rows) {
  const sn = cleanStr(sheetName);
  if (/累計/.test(sn)) return true;

  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const line = rows[i].map(cleanStr).join(' ');
    if (/\d+年\d+月\s*至/.test(line) || /\d+月\s*至\s*\d+月/.test(line) || /累計/.test(line)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a single CAA monthly .xls/.xlsx/.ods file.
 * Returns { records: [], airportTotals: [], warnings: [] }
 */
function parseWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const records = [];
  const airportTotalsMap = new Map();
  const warnings = [];
  const seenAirportRecordKeys = new Set();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 6) continue;

    if (isCumulativeSheet(sheetName, rows)) {
      continue;
    }

    // Walk row-by-row; a single sheet (like 36-5.6 in 2015) can contain multiple airport tables stacked vertically!
    let currentAirport = 'ALL';
    let currentRouteType = '國際航線(含港澳)';
    let currentDest = '';
    let seenTitleInSheet = false;
    let colSeq = 0;
    let colDest = 1;
    let colAirline = 2;
    let colNumStart = 3;
    let inTable = false;

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const rawRow = rows[rIdx];
      const cells = rawRow.map(cleanStr);
      const joined = cells.filter(Boolean).join(' ');
      if (!joined) continue;

      // Detect table title row (e.g. "表36-1 臺灣桃園國際機場..." or "(續1)")
      if (/^表\s*\d+/.test(joined) && /載客率/.test(joined)) {
        const nextAirport = detectAirport(joined);
        const isContinuation = /續/.test(joined) || (seenTitleInSheet && nextAirport === currentAirport);
        if (!isContinuation) {
          currentAirport = nextAirport;
          currentRouteType = '國際航線(含港澳)';
          currentDest = '';
        }
        seenTitleInSheet = true;
        inTable = false;
        continue;
      }

      // Skip cumulative sub-table if somehow embedded
      if (/\d+年\d+月\s*至/.test(joined)) {
        inTable = false;
        break;
      }

      // Detect header row containing "序號" or "航空公司"
      if (cells.some(c => /序\s*號/.test(c)) && cells.some(c => /航空公司/.test(c))) {
        colSeq = cells.findIndex(c => /序\s*號/.test(c));
        colDest = cells.findIndex(c => /航\s*[線點]/.test(c));
        colAirline = cells.findIndex(c => /航空公司/.test(c));
        if (colDest === -1) colDest = colSeq + 1;
        if (colAirline === -1) colAirline = colDest + 1;
        colNumStart = colAirline + 1;
        inTable = true;
        continue;
      }

      // Detect sub-header row ("飛行架次", "座位總數")
      if (cells.some(c => /飛行[架班]次/.test(c))) {
        const numIdx = cells.findIndex(c => /飛行[架班]次/.test(c));
        if (numIdx !== -1) colNumStart = numIdx;
        inTable = true;
        continue;
      }

      if (!inTable) continue;

      // Footer / notes / source lines end the current table
      if (/^(資料來源|附註|註[:：]|備註|說明)/.test(joined)) {
        inTable = false;
        continue;
      }

      const cSeq = cells[colSeq] || '';
      const cDest = cells[colDest] || '';
      const cAirline = cells[colAirline] || '';

      const flightsTotal = toInt(rawRow[colNumStart]);
      const seatsTotal = toInt(rawRow[colNumStart + 1]);
      const paxTotal = toInt(rawRow[colNumStart + 2]);
      const lfTotal = toFloat1(rawRow[colNumStart + 3]);

      const flightsIn = toInt(rawRow[colNumStart + 4]);
      const seatsIn = toInt(rawRow[colNumStart + 5]);
      const paxIn = toInt(rawRow[colNumStart + 6]);
      const lfIn = toFloat1(rawRow[colNumStart + 7]);

      const flightsOut = toInt(rawRow[colNumStart + 8]);
      const seatsOut = toInt(rawRow[colNumStart + 9]);
      const paxOut = toInt(rawRow[colNumStart + 10]);
      const lfOut = toFloat1(rawRow[colNumStart + 11]);

      // 1. Check Total row ("總計" or "合 計")
      if (/^總\s*計$/.test(cDest) || /^總\s*計$/.test(cSeq)) {
        airportTotalsMap.set(currentAirport, {
          airport: currentAirport,
          flights_total: flightsTotal,
          seats_total: seatsTotal,
          pax_total: paxTotal,
          lf_total: lfTotal,
          flights_in: flightsIn,
          seats_in: seatsIn,
          pax_in: paxIn,
          lf_in: lfIn,
          flights_out: flightsOut,
          seats_out: seatsOut,
          pax_out: paxOut,
          lf_out: lfOut,
        });
        continue;
      }

      // 2. Check Route Category header ("國際航線(含港澳)" / "兩岸航線")
      if (/^(國際航線|兩岸航線)/.test(cSeq) || /^(國際航線|兩岸航線)/.test(cDest)) {
        const catText = /^(國際航線|兩岸航線)/.test(cSeq) ? cSeq : cDest;
        currentRouteType = normalizeRouteType(catText);
        currentDest = '';
        continue;
      }

      // Skip subtotal rows
      if (/^(小\s*計|合\s*計)$/.test(cDest) || /^(小\s*計|合\s*計)$/.test(cSeq)) {
        continue;
      }

      // 3. Destination header row: cDest has city name, cAirline is empty
      if (cDest && !cAirline) {
        currentDest = normalizeName(cDest);
        continue;
      }

      // 4. Airline detail row: cAirline is non-empty
      if (cAirline) {
        if (cDest) {
          currentDest = normalizeName(cDest);
        }
        const airlineName = normalizeName(cAirline);
        if (!currentDest || !airlineName) continue;
        if (flightsTotal === 0 && seatsTotal === 0 && paxTotal === 0) continue;

        // Avoid duplicate if somehow same airport appears twice
        const key = `${currentAirport}|${currentRouteType}|${currentDest}|${airlineName}`;
        if (seenAirportRecordKeys.has(key)) continue;
        seenAirportRecordKeys.add(key);

        records.push({
          airport: currentAirport,
          route_type: currentRouteType,
          destination: currentDest,
          airline: airlineName,
          flights_total: flightsTotal,
          seats_total: seatsTotal,
          pax_total: paxTotal,
          lf_total: lfTotal,
          flights_in: flightsIn,
          seats_in: seatsIn,
          pax_in: paxIn,
          lf_in: lfIn,
          flights_out: flightsOut,
          seats_out: seatsOut,
          pax_out: paxOut,
          lf_out: lfOut,
        });
      }
    }
  }

  const airportTotals = Array.from(airportTotalsMap.values());

  // Validate ALL total vs sum of ALL records
  const allTot = airportTotalsMap.get('ALL');
  if (allTot) {
    const sumPax = records.filter(r => r.airport === 'ALL').reduce((s, r) => s + r.pax_total, 0);
    const diff = Math.abs(sumPax - allTot.pax_total);
    if (allTot.pax_total > 0 && diff / allTot.pax_total > 0.01) {
      warnings.push(`ALL pax mismatch: sum=${sumPax}, official=${allTot.pax_total} (diff=${diff})`);
    }
  }

  return { records, airportTotals, warnings };
}

module.exports = {
  parseWorkbook,
  detectAirport,
};
