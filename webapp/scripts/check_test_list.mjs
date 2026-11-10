// Step 51 (owner Q45b, 2026-11-09; rules audit A16 T1-T3): every unit test
// file must be run by `npm test`. The test script is an explicit file list, so
// a new *.test.ts(x) under src/ that is not added to it is silently never run.
// This script lists every such file and fails naming them. Plain Node, no deps.
//
// Usage: node scripts/check_test_list.mjs  (from webapp/)  -> exit 0 when the
// list is complete, exit 1 with the missing files otherwise.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webapp = join(dirname(fileURLToPath(import.meta.url)), '..');

// Files under src/ that are allowed to stay out of `npm test`. Must be empty
// today; every entry added later needs a reason in a comment next to it.
const ALLOWLIST = new Set([]);

// Directories under src/ skipped by this check (e2e specs run with Playwright).
const SKIP_DIRS = new Set(['e2e']);

const pkg = JSON.parse(readFileSync(join(webapp, 'package.json'), 'utf8'));
const script = String(pkg.scripts?.test ?? '');
const listed = new Set(script.split(/\s+/).filter((t) => /\.test\.tsx?$/.test(t)).map((t) => t.replace(/^\.\//, '')));

const found = [];
function walk(dir, rel) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), relPath);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      found.push(`src/${relPath}`);
    }
  }
}
walk(join(webapp, 'src'), '');

const missing = found.filter((f) => !listed.has(f) && !ALLOWLIST.has(f)).sort();
// A listed entry that does not exist (typo such as a dropped extension) is a
// mistake too: node --test would silently run nothing for it.
const absent = [...listed].filter((f) => !existsSync(join(webapp, f))).sort();
// Non-test tokens that look like a test path with a broken extension.
const broken = script.split(/\s+/).filter((t) => /\.test(\.\w+)?$/.test(t) && !/\.test\.tsx?$/.test(t)).sort();

let ok = true;
if (missing.length) {
  ok = false;
  console.error(`check_test_list: ${missing.length} test file(s) under src/ are NOT in the "test" script of package.json (never run by npm test):`);
  for (const f of missing) console.error(`  - ${f}`);
  console.error('Add them to "scripts.test" in webapp/package.json (or to ALLOWLIST in scripts/check_test_list.mjs with a reason).');
}
if (absent.length || broken.length) {
  ok = false;
  console.error('check_test_list: entries in the "test" script that are not an existing *.test.ts(x) file:');
  for (const f of [...new Set([...absent, ...broken])].sort()) console.error(`  - ${f}`);
}
if (ok) console.log(`check_test_list: ok, all ${found.length} test files under src/ are in npm test.`);
process.exit(ok ? 0 : 1);
