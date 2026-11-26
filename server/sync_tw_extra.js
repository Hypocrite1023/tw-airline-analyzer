const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { getDb } = require('./db');

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const RAW_CARGO_DIR = path.join(__dirname, '..', 'data', 'raw_cargo');
const RAW_OTP_DIR = path.join(__dirname, '..', 'data', 'raw_otp');

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[,%\s]/g, '');
  if (!s || s === '-' || s === '—' || s === '…') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanStr(v) {
  return String(v ?? '').replace(/[\r\n\t\u3000]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeAirline(name) {
  const s = cleanStr(name).replace(/\s+/g, '');
  if (s === '中華' || s === '華航' || s === '中華航空') return '中華';
  if (s === '長榮' || s === '長榮航空') return '長榮';
  if (s === '星宇' || s === '星宇航空') return '星宇';
  if (s === '台灣虎航' || s === '臺灣虎航' || s === '虎航') return '台灣虎航';
  if (s === '華信' || s === '華信航空') return '華信';
  if (s === '立榮' || s === '立榮航空') return '立榮';
  if (s === '德安' || s === '德安航空') return '德安';
  if (s === '遠東' || s === '遠東航空') return '遠東';
  if (s === '復興' || s === '復興航空') return '復興';
  if (s === '威航') return '威航';
  return s;
}

async function fetchXlsLinks(articleId) {
  const res = await fetch(`https://www.caa.gov.tw/article.aspx?a=${articleId}&lang=1`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for a=${articleId}`);
  const html = await res.text();
  const re = /<a[^>]+href="([^"]*FileAtt\.ashx[^"]*)"[^>]*title="([^"]+)"[^>]*>/gi;
  const list = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!/\.xlsx?$/i.test(m[2])) continue;
    list.push({
      url: m[1].replace(/^\.\.\//, 'https://www.caa.gov.tw/'),
      title: m[2].trim(),
    });
  }
  return list;
}

async function downloadCached(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1024) {
    return destPath;
  }
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(destPath, buf);
      return destPath;
    } catch (err) {
      if (i === 3) throw err;
      await new Promise(r => setTimeout(r, 600 * i));
    }
  }
}

// 1. Sync a=1736 (Airport 74-year annual cargo & pax history)
async function syncAirportHistory() {
  const links = await fetchXlsLinks(1736);
  if (!links.length) return 0;
  const filePath = await downloadCached(links[0].url, path.join(RAW_CARGO_DIR, 'airport_history_1736.xls'));
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

  // Find header row with "總計" and "臺灣桃園國際機場"
  let headerRowIdx = rows.findIndex(r => r.some(c => String(c).includes('臺灣桃園國際機場')));
  if (headerRowIdx === -1) return 0;

  const headerRow = rows[headerRowIdx];
  const airportCols = [];
  for (let c = 1; c < headerRow.length; c++) {
    const label = cleanStr(headerRow[c]);
    if (!label) continue;
    let code = null;
    if (label.includes('總計')) code = 'ALL';
    else if (label.includes('桃園')) code = 'TPE';
    else if (label.includes('高雄')) code = 'KHH';
    else if (label.includes('松山')) code = 'TSA';
    else if (label.includes('臺中') || label.includes('台中')) code = 'RMQ';
    else if (label.includes('臺南') || label.includes('台南')) code = 'TNN';
    if (code) {
      // Each airport block has 5 cols: flights(c), pax_total(c+1), transit(c+2), inout(c+3), cargo_tons(c+4)
      airportCols.push({ code, col: c });
    }
  }

  const db = getDb();
  const ins = db.prepare(`
    INSERT OR REPLACE INTO tw_airport_history (year, airport, flights, pax, cargo_tons)
    VALUES (?, ?, ?, ?, ?)
  `);

  let count = 0;
  db.exec('BEGIN TRANSACTION');
  try {
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const label = cleanStr(rows[i][0]);
      const ymMatch = label.match(/^(\d{2,3})年$/);
      if (!ymMatch) continue;
      const year = parseInt(ymMatch[1], 10) + 1911;
      for (const ac of airportCols) {
        const flights = Math.round(toNum(rows[i][ac.col]));
        const pax = Math.round(toNum(rows[i][ac.col + 1]));
        const cargo = Math.round(toNum(rows[i][ac.col + 4]) * 10) / 10;
        if (flights > 0 || pax > 0 || cargo > 0) {
          ins.run(year, ac.code, flights, pax, cargo);
          count++;
        }
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return count;
}

// 2. Sync a=1738 (Taiwan Airlines Monthly Global Cargo & Load Factor, 2009-2026)
async function syncAirlineCargo(minRocYear = 98) {
  const links = await fetchXlsLinks(1738);
  const targets = links.filter(l => {
    const m = l.title.match(/(\d{2,3})年/);
    return m && parseInt(m[1], 10) >= minRocYear;
  });

  const db = getDb();
  const ins = db.prepare(`
    INSERT OR REPLACE INTO tw_airline_cargo (ym, airline, flights, pax, pax_lf, cargo_tons, ftk, aftk, cargo_lf)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let savedRows = 0;
  for (const item of targets) {
    const m = item.title.match(/(\d{2,3})年/);
    const rocYear = parseInt(m[1], 10);
    const filePath = await downloadCached(item.url, path.join(RAW_CARGO_DIR, `1738_${rocYear}.xls`));
    const wb = XLSX.readFile(filePath);

    db.exec('BEGIN TRANSACTION');
    try {
      for (const sn of wb.SheetNames) {
        // Sheet name is usually like '11510', '9801', or '10月'
        let year = rocYear + 1911;
        let month = null;
        const sm1 = sn.match(/^(\d{2,3})(\d{2})$/);
        const sm2 = sn.match(/(\d{1,2})月/);
        if (sm1) {
          year = parseInt(sm1[1], 10) + 1911;
          month = parseInt(sm1[2], 10);
        } else if (sm2) {
          month = parseInt(sm2[1], 10);
        }
        if (!month || month < 1 || month > 12) continue;

        const ym = `${year}-${String(month).padStart(2, '0')}`;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });

        // Find "本月" section in left block (cols 0..10)
        let inThisMonth = false;
        for (let i = 0; i < rows.length; i++) {
          const c0 = cleanStr(rows[i][0]);
          if (c0 === '本月' || c0.includes('本月')) {
            inThisMonth = true;
            continue;
          }
          if (inThisMonth && (c0.includes('累計') || c0.includes('本年') || c0.includes('資料來源'))) {
            break;
          }
          if (!inThisMonth || !c0 || c0 === '總計' || c0 === '合計') continue;

          const airline = normalizeAirline(c0);
          const flights = Math.round(toNum(rows[i][1]));
          const pax = Math.round(toNum(rows[i][3]));
          const paxLf = Math.round(toNum(rows[i][6]) * 10) / 10;
          const cargoTons = Math.round(toNum(rows[i][7]) * 10) / 10;
          const ftk = Math.round(toNum(rows[i][8]));
          const aftk = Math.round(toNum(rows[i][9]));
          const cargoLf = Math.round(toNum(rows[i][10]) * 10) / 10;

          if (flights === 0 && pax === 0 && cargoTons === 0) continue;
          ins.run(ym, airline, flights, pax, paxLf, cargoTons, ftk, aftk, cargoLf);
          savedRows++;
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return { files: targets.length, savedRows };
}

// 3. Sync a=1750 (Taiwan Airlines Monthly On-Time Performance & Cancellations)
async function syncOtp() {
  const links = await fetchXlsLinks(1750);
  const targets = [];
  const seen = new Set();
  for (const l of links) {
    const m = l.title.match(/(\d{2,3})年(\d{1,2})月/);
    if (!m) continue;
    const year = parseInt(m[1], 10) + 1911;
    const month = parseInt(m[2], 10);
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    if (seen.has(ym)) continue;
    seen.add(ym);
    targets.push({ ym, url: l.url, title: l.title });
  }

  // Download with concurrency=6
  let idx = 0;
  const downloaded = [];
  async function worker() {
    while (idx < targets.length) {
      const t = targets[idx++];
      try {
        const ext = t.title.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'xls';
        const fp = await downloadCached(t.url, path.join(RAW_OTP_DIR, `${t.ym}.${ext}`));
        downloaded.push({ ym: t.ym, fp });
      } catch (err) {
        console.error(`OTP download ${t.ym} failed:`, err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));

  const db = getDb();
  const ins = db.prepare(`
    INSERT OR REPLACE INTO tw_otp (
      ym, airline, departures, delays, otp_rate, delay_rate,
      tpe_departures, tpe_delays, cancel_total, cancel_fault, scheduled, exec_rate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let savedRows = 0;
  db.exec('BEGIN TRANSACTION');
  try {
    for (const { ym, fp } of downloaded) {
      let wb;
      try {
        wb = XLSX.readFile(fp);
      } catch {
        continue;
      }

      const otpSheetName = wb.SheetNames.find(n => n.includes('準點')) || wb.SheetNames[0];
      const cancelSheetName = wb.SheetNames.find(n => n.includes('取消'));

      const otpRows = XLSX.utils.sheet_to_json(wb.Sheets[otpSheetName], { header: 1, defval: '' });
      // Find header row with airlines (usually row 2, col 0 has "機場")
      let hIdx = otpRows.findIndex(r => cleanStr(r[0]).includes('機場'));
      if (hIdx === -1) hIdx = 2;
      const hRow = otpRows[hIdx] || [];

      const airlineCols = [];
      for (let c = 1; c < hRow.length; c++) {
        const name = normalizeAirline(hRow[c]);
        if (name && !/離場|延誤|合計|總計/.test(name)) {
          airlineCols.push({ airline: name, col: c });
        }
      }

      const totalRow = otpRows.find(r => /^合\s*計$/.test(cleanStr(r[0])));
      const otpRateRow = otpRows.find(r => cleanStr(r[0]).includes('準點率'));
      const delayRateRow = otpRows.find(r => cleanStr(r[0]).includes('延誤率'));
      const tpeRow = otpRows.find(r => cleanStr(r[0]).includes('桃園'));

      // Parse cancellation sheet if present
      const cancelMap = new Map();
      if (cancelSheetName) {
        const cRows = XLSX.utils.sheet_to_json(wb.Sheets[cancelSheetName], { header: 1, defval: '' });
        let chIdx = cRows.findIndex(r => cleanStr(r[0]).includes('機場'));
        if (chIdx === -1) chIdx = 2;
        const chRow = cRows[chIdx] || [];
        const cTotalRow = cRows.find(r => /^合\s*計$/.test(cleanStr(r[0])));
        const cExecRow = cRows.find(r => cleanStr(r[0]).includes('執行率'));
        if (cTotalRow) {
          for (let c = 1; c < chRow.length; c++) {
            const name = normalizeAirline(chRow[c]);
            if (!name || /合計|總計/.test(name)) continue;
            const rawTot = cleanStr(cTotalRow[c]);
            const rawFault = cleanStr(cTotalRow[c + 1]);
            // Format "64｜2471" or numeric
            const mTot = rawTot.match(/(\d+)\s*[｜|\/]\s*(\d+)/);
            const mFault = rawFault.match(/(\d+)\s*[｜|\/]\s*(\d+)/);
            const cancelTotal = mTot ? parseInt(mTot[1], 10) : Math.round(toNum(rawTot));
            const scheduled = mTot ? parseInt(mTot[2], 10) : 0;
            const cancelFault = mFault ? parseInt(mFault[1], 10) : Math.round(toNum(rawFault));
            let execRate = cExecRow ? toNum(cExecRow[c + 1]) : 0;
            if (execRate > 0 && execRate <= 1) execRate = Math.round(execRate * 10000) / 100;
            else execRate = Math.round(execRate * 100) / 100;
            cancelMap.set(name, { cancelTotal, cancelFault, scheduled, execRate });
          }
        }
      }

      if (!totalRow) continue;
      for (const ac of airlineCols) {
        const dep = Math.round(toNum(totalRow[ac.col]));
        const del = Math.round(toNum(totalRow[ac.col + 1]));
        if (dep === 0 && del === 0) continue;

        let otpRate = otpRateRow ? toNum(otpRateRow[ac.col]) : 0;
        if (otpRate > 0 && otpRate <= 1) otpRate = Math.round(otpRate * 10000) / 100;
        else if (otpRate > 1) otpRate = Math.round(otpRate * 100) / 100;
        if (otpRate === 0 && dep > 0) {
          otpRate = Math.round(((dep - del) / dep) * 10000) / 100;
        }

        let delayRate = delayRateRow ? toNum(delayRateRow[ac.col]) : 0;
        if (delayRate > 0 && delayRate <= 1) delayRate = Math.round(delayRate * 10000) / 100;
        else if (delayRate > 1) delayRate = Math.round(delayRate * 100) / 100;
        if (delayRate === 0 && del > 0 && dep > 0) {
          delayRate = Math.round((del / dep) * 10000) / 100;
        }

        const tpeDep = tpeRow ? Math.round(toNum(tpeRow[ac.col])) : 0;
        const tpeDel = tpeRow ? Math.round(toNum(tpeRow[ac.col + 1])) : 0;
        const cInfo = cancelMap.get(ac.airline) || { cancelTotal: 0, cancelFault: 0, scheduled: dep, execRate: 100 };

        ins.run(
          ym, ac.airline, dep, del, otpRate, delayRate,
          tpeDep, tpeDel, cInfo.cancelTotal, cInfo.cancelFault, cInfo.scheduled, cInfo.execRate
        );
        savedRows++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { files: downloaded.length, savedRows };
}

async function main() {
  const start = Date.now();
  console.log('1/3 Syncing Taiwan Airport 74-year Cargo & Pax History (a=1736)...');
  const ah = await syncAirportHistory();
  console.log(`  Done! Saved ${ah} airport-year records.`);

  console.log('2/3 Syncing Taiwan Airlines Monthly Global Cargo (a=1738, 2009-2026)...');
  const ac = await syncAirlineCargo(98);
  console.log('  Done!', ac);

  console.log('3/3 Syncing Taiwan Airlines Monthly OTP & Cancellations (a=1750, all available months)...');
  const otp = await syncOtp();
  console.log('  Done!', otp);

  console.log(`\nAll Taiwan Cargo & OTP data synced in ${((Date.now() - start) / 1000).toFixed(1)}s!`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { syncAirportHistory, syncAirlineCargo, syncOtp };
