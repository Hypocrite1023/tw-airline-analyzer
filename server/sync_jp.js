const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { saveJpMonthData } = require('./db');

const RAW_JP_DIR = path.join(__dirname, '..', 'data', 'raw_jp');
const ESTAT_LIST_URL = 'https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00600360&tstat=000001136503&cycle=1&layout=datalist&tclass1val=0';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[,%\s]/g, '');
  if (!s || s.includes('*') || s === '-' || s === '…') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toOptNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/[,%\s]/g, '');
  if (!s || s.includes('*') || s === '-' || s === '…') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

async function fetchJpCatalog(minYear = 2019) {
  const res = await fetch(ESTAT_LIST_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`e-Stat list HTTP ${res.status}`);
  const html = await res.text();

  const links = [...html.matchAll(/href="(\/stat-search\/files\?[^"]*year=(\d{4})0&amp;month=\d{6}(\d{2})[^"]*)"/gi)];
  const seen = new Set();
  const entries = [];
  for (const m of links) {
    const year = parseInt(m[2], 10);
    const month = parseInt(m[3], 10);
    if (year < minYear || month < 1 || month > 12) continue;
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    if (seen.has(ym)) continue;
    seen.add(ym);
    entries.push({
      ym,
      year,
      month,
      pageUrl: 'https://www.e-stat.go.jp' + m[1].replace(/&amp;/g, '&'),
    });
  }
  entries.sort((a, b) => b.ym.localeCompare(a.ym));
  return entries;
}

async function downloadJpMonth(entry) {
  fs.mkdirSync(RAW_JP_DIR, { recursive: true });
  const dest = path.join(RAW_JP_DIR, `${entry.ym}.xlsx`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 2048) {
    return dest;
  }

  const pageRes = await fetch(entry.pageUrl, { headers: HEADERS });
  if (!pageRes.ok) throw new Error(`Page HTTP ${pageRes.status}`);
  const html = await pageRes.text();

  // Prefer fileKind=0 (Excel)
  const dlMatch = html.match(/href="(\/stat-search\/file-download\?statInfId=\d+&(?:amp;)?fileKind=0)"/i);
  if (!dlMatch) throw new Error('No Excel link found');
  const dlUrl = 'https://www.e-stat.go.jp' + dlMatch[1].replace(/&amp;/g, '&');

  const fileRes = await fetch(dlUrl, { headers: HEADERS });
  if (!fileRes.ok) throw new Error(`Download HTTP ${fileRes.status}`);
  const buf = Buffer.from(await fileRes.arrayBuffer());
  if (buf.length < 2048) throw new Error(`Small file (${buf.length} bytes)`);
  fs.writeFileSync(dest, buf);
  return dest;
}

function parseJpWorkbook(filePath) {
  const wb = XLSX.readFile(filePath);
  const summary = {
    dom_flights: 0,
    dom_pax: 0,
    dom_lf: 0,
    dom_trunk_lf: 0,
    dom_local_lf: 0,
    dom_cargo_tons: 0,
    intl_flights: 0,
    intl_pax: 0,
    intl_lf: 0,
    intl_cargo_tons: 0,
  };
  const routes = [];

  // Find sheets robustly (full-width or half-width numbers)
  const findSheet = (re) => {
    const name = wb.SheetNames.find(n => re.test(n));
    return name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) : null;
  };

  // Sheet 3-1: Overall Domestic & International summary
  const s31 = findSheet(/^[３3][－\-ー][１1]$/);
  if (s31) {
    // Detect column indices from header rows (usually col 3=国内計, 4=幹線, 5=ローカル, 7=国際)
    let colDom = 3, colTrunk = 4, colLocal = 5, colIntl = 7;
    for (let i = 0; i < Math.min(5, s31.length); i++) {
      const cells = s31[i].map(v => String(v).replace(/\s+/g, ''));
      const iDom = cells.findIndex(c => c === '計');
      const iTrunk = cells.findIndex(c => c === '幹線');
      const iLocal = cells.findIndex(c => c.includes('ローカル'));
      const iIntl = cells.findIndex(c => c === '国際');
      if (iDom !== -1) colDom = iDom;
      if (iTrunk !== -1) colTrunk = iTrunk;
      if (iLocal !== -1) colLocal = iLocal;
      if (iIntl !== -1) colIntl = iIntl;
    }

    for (const r of s31) {
      const label = r.slice(0, 3).map(v => String(v).replace(/\s+/g, '')).join('');
      if (label.includes('運航回数')) {
        summary.dom_flights = Math.round(toNum(r[colDom]));
        summary.intl_flights = Math.round(toNum(r[colIntl]));
      } else if (label.includes('輸送人数')) {
        summary.dom_pax = Math.round(toNum(r[colDom]));
        summary.intl_pax = Math.round(toNum(r[colIntl]));
      } else if (label.includes('座席利用率')) {
        summary.dom_lf = Math.round(toNum(r[colDom]) * 10) / 10;
        summary.dom_trunk_lf = Math.round(toNum(r[colTrunk]) * 10) / 10;
        summary.dom_local_lf = Math.round(toNum(r[colLocal]) * 10) / 10;
        summary.intl_lf = Math.round(toNum(r[colIntl]) * 10) / 10;
      } else if (label.includes('貨物輸送重量')) {
        summary.dom_cargo_tons = Math.round((toNum(r[colDom]) / 1000) * 10) / 10;
        summary.intl_cargo_tons = Math.round((toNum(r[colIntl]) / 1000) * 10) / 10;
      }
    }
  }

  // Sheet 3-2: Domestic Major Routes
  const s32 = findSheet(/^[３3][－\-ー][２2]$/);
  if (s32) {
    for (let i = 2; i < s32.length; i++) {
      const r = s32[i];
      const cat = String(r[0] || '').trim();
      const route = String(r[1] || '').trim();
      const pax = Math.round(toNum(r[2]));
      if (!route || route.includes('合計') || route.includes('計') || pax === 0) continue;
      routes.push({
        category: cat || '幹線',
        route,
        pax,
        pax_yoy: toOptNum(r[3]),
        cargo_tons: Math.round((toNum(r[4]) / 1000) * 10) / 10,
      });
    }
  }

  // Sheet 3-3: International by Region
  const s33 = findSheet(/^[３3][－\-ー][３3]$/);
  if (s33) {
    for (let i = 2; i < s33.length; i++) {
      const r = s33[i];
      const region = String(r[0] || '').trim();
      const pax = Math.round(toNum(r[1]));
      if (!region || region.includes('合計') || region.includes('※') || pax === 0) continue;
      routes.push({
        category: '国際方面',
        route: region,
        pax,
        pax_yoy: toOptNum(r[2]),
        cargo_tons: Math.round((toNum(r[3]) / 1000) * 10) / 10,
      });
    }
  }

  return { summary, routes };
}

async function syncJapan({ minYear = 2019, concurrency = 4 } = {}) {
  const catalog = await fetchJpCatalog(minYear);
  console.log(`JP e-Stat catalog: ${catalog.length} months (${catalog[catalog.length - 1]?.ym} to ${catalog[0]?.ym})`);
  let idx = 0;
  let saved = 0;
  let failed = 0;

  async function worker() {
    while (idx < catalog.length) {
      const entry = catalog[idx++];
      try {
        const filePath = await downloadJpMonth(entry);
        const parsed = parseJpWorkbook(filePath);
        if (parsed.summary.dom_pax > 0 || parsed.summary.intl_pax > 0) {
          saveJpMonthData(entry.ym, parsed);
          saved++;
        }
      } catch (err) {
        failed++;
        console.error(`JP ${entry.ym} failed:`, err.message);
      }
      if ((saved + failed) % 15 === 0) {
        console.log(`JP progress: ${saved + failed}/${catalog.length} (saved: ${saved}, latest: ${entry.ym})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { total: catalog.length, saved, failed };
}

if (require.main === module) {
  const start = Date.now();
  console.log('Syncing Japan (MLIT e-Stat) 2019-01 to latest...');
  syncJapan({ minYear: 2019, concurrency: 4 })
    .then(res => {
      console.log(`JP Sync Done in ${((Date.now() - start) / 1000).toFixed(1)}s!`, res);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { fetchJpCatalog, downloadJpMonth, parseJpWorkbook, syncJapan };
