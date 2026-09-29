const fs = require('fs');
const path = require('path');

const srcDir = 'D:/Company/Admatrix/omni-web/src';
const calls = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
    } else if (/\.(vue|ts|js)$/.test(ent.name)) {
      const code = fs.readFileSync(full, 'utf8');

      // Match axios/api/http/request calls
      const re = /(?:api|http|axios|\$http|request)\s*\.\s*(get|post|put|delete|patch)\s*(?:<[^>]+>)?\s*\(\s*[`'"]([^`'"\s?]+)[`'"]/gi;
      let m;
      while ((m = re.exec(code)) !== null) {
        calls.push({ method: m[1].toUpperCase(), path: m[2], file: path.relative(srcDir, full) });
      }

      // Match url strings like url: '/api/...'
      const reUrl = /(?:url|endpoint|path)\s*:\s*[`'"]([^`'"\s?]+)[`'"]/gi;
      while ((m = reUrl.exec(code)) !== null) {
        if (m[1].startsWith('/') || m[1].startsWith('api/')) {
          calls.push({ method: 'ANY', path: m[1], file: path.relative(srcDir, full) });
        }
      }
    }
  }
}

walk(srcDir);
console.log('Total calls matched in omni-web:', calls.length);

const uniqEndpoints = new Set(calls.map(c => c.path));
console.log('Unique path patterns:', uniqEndpoints.size);

const modCounts = {};
for (const p of uniqEndpoints) {
  const clean = p.replace(/^\/?api\/(?:v1\/)?/, '').replace(/^\//, '');
  const seg = clean.split('/')[0] || 'root';
  modCounts[seg] = (modCounts[seg] || 0) + 1;
}

const sorted = Object.entries(modCounts).sort((a,b) => b[1] - a[1]);
console.log('Top frontend path prefixes:');
console.table(sorted.slice(0, 20));
