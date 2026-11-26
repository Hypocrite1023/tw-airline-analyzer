const { fetchCatalog, downloadBatch } = require('./scraper');

async function main() {
  console.log('Fetching CAA catalog...');
  const catalog = await fetchCatalog();
  console.log(`Found ${catalog.length} months (${catalog[catalog.length - 1].ym} to ${catalog[0].ym}).`);

  let lastLog = 0;
  const results = await downloadBatch(catalog, {
    concurrency: 6,
    onProgress(done, total, ym) {
      const now = Date.now();
      if (done === total || now - lastLog > 2000) {
        console.log(`Progress: ${done}/${total} (latest: ${ym})`);
        lastLog = now;
      }
    },
  });

  const ok = results.filter(r => r.ok).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.ok);
  console.log(`Done! OK: ${ok} (skipped: ${skipped}), Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('Failed entries:', failed);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
