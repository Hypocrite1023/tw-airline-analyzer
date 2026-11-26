const fs = require('node:fs');
const path = require('node:path');
const { RAW_DIR, fetchCatalog, downloadBatch, getRawFilePath } = require('./scraper');
const { parseWorkbook } = require('./parser');
const { saveMonthData, getDb } = require('./db');

async function parseAllLocal({ filterYms = null, onProgress } = {}) {
  if (!fs.existsSync(RAW_DIR)) {
    return { parsed: 0, totalRecords: 0, warnings: [] };
  }
  let files = fs.readdirSync(RAW_DIR)
    .filter(f => /\.(xls|xlsx|ods)$/i.test(f))
    .sort();

  if (filterYms) {
    const set = new Set(filterYms);
    files = files.filter(f => set.has(f.replace(/\.(xls|xlsx|ods)$/i, '')));
  }

  let parsed = 0;
  let totalRecords = 0;
  const allWarnings = [];
  const emptyMonths = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ym = file.replace(/\.(xls|xlsx|ods)$/i, '');
    const fullPath = path.join(RAW_DIR, file);
    try {
      const result = parseWorkbook(fullPath);
      if (result.records.length === 0) {
        emptyMonths.push(ym);
      } else {
        saveMonthData(ym, result);
        parsed++;
        totalRecords += result.records.length;
      }
      if (result.warnings.length > 0) {
        allWarnings.push({ ym, warnings: result.warnings });
      }
    } catch (err) {
      allWarnings.push({ ym, warnings: [`Parse error: ${err.message}`] });
    }
    if (onProgress) onProgress(i + 1, files.length, ym);
  }

  return { parsed, totalRecords, warnings: allWarnings, emptyMonths };
}

async function syncFromCAA({ yms = null, force = false } = {}) {
  const catalog = await fetchCatalog();
  const targets = yms ? catalog.filter(c => yms.includes(c.ym)) : catalog;
  const dlResults = await downloadBatch(targets, { concurrency: 6, force });
  const okYms = dlResults.filter(r => r.ok).map(r => r.ym);
  const parseRes = await parseAllLocal({ filterYms: okYms });
  return {
    catalogCount: catalog.length,
    downloaded: dlResults.filter(r => r.ok && !r.skipped).length,
    skipped: dlResults.filter(r => r.ok && r.skipped).length,
    failed: dlResults.filter(r => !r.ok),
    ...parseRes,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const parseOnly = args.includes('--parse-only');
  const start = Date.now();

  (async () => {
    if (parseOnly) {
      console.log('Parsing all local Excel files into SQLite...');
      const res = await parseAllLocal({
        onProgress(done, total, ym) {
          if (done === total || done % 30 === 0) {
            console.log(`Parsed ${done}/${total} (latest: ${ym})`);
          }
        },
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`\nDone in ${elapsed}s! Parsed ${res.parsed} months, ${res.totalRecords.toLocaleString()} total rows.`);
      if (res.emptyMonths.length > 0) {
        console.log('Empty months:', res.emptyMonths);
      }
      if (res.warnings.length > 0) {
        console.log(`Warnings (${res.warnings.length}):`, res.warnings.slice(0, 15));
      } else {
        console.log('Zero warnings! All totals validated accurately.');
      }

      const db = getDb();
      const stats = db.prepare('SELECT COUNT(*) as months, MIN(ym) as minYm, MAX(ym) as maxYm FROM months').get();
      const recStats = db.prepare('SELECT COUNT(*) as rows, COUNT(DISTINCT destination) as dests, COUNT(DISTINCT airline) as airlines FROM records').get();
      console.log('DB Summary:', stats, recStats);
    } else {
      console.log('Syncing from CAA website...');
      const res = await syncFromCAA();
      console.log('Sync finished:', {
        catalogCount: res.catalogCount,
        downloaded: res.downloaded,
        skipped: res.skipped,
        parsed: res.parsed,
        totalRecords: res.totalRecords,
        warnings: res.warnings.length,
      });
    }
  })().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  parseAllLocal,
  syncFromCAA,
};
