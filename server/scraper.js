const fs = require('node:fs');
const path = require('node:path');

const CAA_ARTICLE_URL = 'https://www.caa.gov.tw/article.aspx?a=1752&lang=1';
const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
};

function ensureRawDir() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

/**
 * Fetch the CAA article HTML and return the list of all available monthly reports.
 * Returns array sorted newest -> oldest:
 * [{ ym: '2026-10', rocYear: 115, month: 10, label: '115年10月', xlsUrl, odsUrl, pdfUrl, updatedAt }]
 */
async function fetchCatalog() {
  const res = await fetch(CAA_ARTICLE_URL, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch CAA catalog: HTTP ${res.status}`);
  }
  const html = await res.text();
  return parseCatalogHtml(html);
}

function parseCatalogHtml(html) {
  const rowRe = /<tr>([\s\S]*?)<\/tr>/gi;
  const entries = [];
  const seen = new Set();
  let rm;

  while ((rm = rowRe.exec(html)) !== null) {
    const row = rm[1];
    if (!row.includes('FileAtt.ashx')) continue;

    const labelMatch = row.match(/(\d{2,3})年(\d{1,2})月/);
    if (!labelMatch) continue;

    const rocYear = parseInt(labelMatch[1], 10);
    const month = parseInt(labelMatch[2], 10);
    const year = rocYear + 1911;
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    if (seen.has(ym)) continue;
    seen.add(ym);

    const linkRe = /<a[^>]+href=["']([^"']*FileAtt\.ashx[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const files = {};
    let updatedAt = null;
    let lm;
    while ((lm = linkRe.exec(row)) !== null) {
      const href = lm[1].replace(/^\.\.\//, 'https://www.caa.gov.tw/');
      const title = lm[2];
      const inner = lm[3];
      const ext = title.split('.').pop().toLowerCase();
      files[ext] = { url: href, title };
      if (!updatedAt) {
        const um = inner.match(/最後更新日期：<b>([^<]+)<\/b>/);
        if (um) updatedAt = um[1].trim();
      }
    }

    entries.push({
      ym,
      year,
      rocYear,
      month,
      label: `${rocYear}年${month}月`,
      xlsUrl: files.xls?.url || files.xlsx?.url || null,
      odsUrl: files.ods?.url || null,
      pdfUrl: files.pdf?.url || null,
      updatedAt,
    });
  }

  entries.sort((a, b) => b.ym.localeCompare(a.ym));
  return entries;
}

function getRawFilePath(ym) {
  return path.join(RAW_DIR, `${ym}.xls`);
}

async function downloadFile(url, destPath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`File too small (${buf.length} bytes)`);
      fs.writeFileSync(destPath, buf);
      return buf.length;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

async function downloadMonth(entry, { force = false } = {}) {
  ensureRawDir();
  const dest = getRawFilePath(entry.ym);
  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 1024) {
    return { ym: entry.ym, path: dest, skipped: true };
  }
  const url = entry.xlsUrl || entry.odsUrl;
  if (!url) throw new Error(`No spreadsheet URL for ${entry.ym}`);
  const bytes = await downloadFile(url, dest);
  return { ym: entry.ym, path: dest, skipped: false, bytes };
}

/**
 * Download multiple months with controlled concurrency.
 */
async function downloadBatch(entries, { concurrency = 5, force = false, onProgress } = {}) {
  ensureRawDir();
  const results = [];
  let idx = 0;
  let completed = 0;

  async function worker() {
    while (idx < entries.length) {
      const current = entries[idx++];
      try {
        const r = await downloadMonth(current, { force });
        results.push({ ...r, ok: true });
      } catch (err) {
        results.push({ ym: current.ym, ok: false, error: err.message });
      }
      completed++;
      if (onProgress) onProgress(completed, entries.length, current.ym);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

module.exports = {
  CAA_ARTICLE_URL,
  RAW_DIR,
  fetchCatalog,
  parseCatalogHtml,
  getRawFilePath,
  downloadMonth,
  downloadBatch,
};
