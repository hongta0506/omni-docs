const fs = require('fs');
const path = require('path');

// 1. Load backend registered routes in omni-core
const coreDir = 'D:/Company/Admatrix/omni-core/internal';
const backendRoutes = [];

function scanGo(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) scanGo(full);
    else if (ent.name.endsWith('.go')) {
      const code = fs.readFileSync(full, 'utf8');
      // Look for mux.HandleFunc("GET /api/v1/..." or r.HandleFunc, etc.)
      const re = /(?:mux|r|router)\.HandleFunc\s*\(\s*["']([A-Z]+)\s+([^"']+)["']/g;
      let m;
      while ((m = re.exec(code)) !== null) {
        backendRoutes.push({ method: m[1], path: m[2], file: path.relative(coreDir, full) });
      }
    }
  }
}

scanGo(coreDir);
console.log('Total registered routes in omni-core:', backendRoutes.length);

// 2. Normalize backend routes for comparison
const beSet = new Set(backendRoutes.map(r => `${r.method} ${r.path}`));

// 3. Scan omni-web calls
const webDir = 'D:/Company/Admatrix/omni-web/src';
const webCalls = [];

function scanWeb(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) scanWeb(full);
    else if (/\.(vue|ts|js)$/.test(ent.name)) {
      const code = fs.readFileSync(full, 'utf8');
      const re = /(?:api|http|axios|\$http|request)\s*\.\s*(get|post|put|delete|patch)\s*(?:<[^>]+>)?\s*\(\s*[`'"]([^`'"\s?]+)[`'"]/gi;
      let m;
      while ((m = re.exec(code)) !== null) {
        let p = m[2].trim();
        // remove query string
        p = p.split('?')[0];
        // normalize prefix
        if (!p.startsWith('/api/v1') && !p.startsWith('api/v1')) {
          if (p.startsWith('/api/')) p = '/api/v1' + p.substring(4);
          else if (p.startsWith('/')) p = '/api/v1' + p;
          else p = '/api/v1/' + p;
        }
        if (!p.startsWith('/')) p = '/' + p;
        webCalls.push({ method: m[1].toUpperCase(), rawPath: m[2], normPath: p, file: path.relative(webDir, full) });
      }
    }
  }
}

scanWeb(webDir);
console.log('Total valid web calls:', webCalls.length);

// Group web endpoints
const webEndpoints = new Map();
webCalls.forEach(c => {
  const key = `${c.method} ${c.normPath}`;
  if (!webEndpoints.has(key)) webEndpoints.set(key, c);
});
console.log('Unique web (method, path):', webEndpoints.size);

// Compare with backend
let matched = 0;
let unmatched = 0;
const missingByPrefix = {};

for (const [key, call] of webEndpoints.entries()) {
  // check exact match
  if (beSet.has(key)) {
    matched++;
  } else {
    // check parameterized match: e.g. /api/v1/contacts/{id} vs /api/v1/contacts/123
    let found = false;
    for (const be of backendRoutes) {
      if (be.method === call.method) {
        const bePattern = '^' + be.path.replace(/\{[^}]+\}/g, '[^/]+') + '$';
        if (new RegExp(bePattern).test(call.normPath)) {
          found = true;
          break;
        }
      }
    }
    if (found) {
      matched++;
    } else {
      unmatched++;
      const prefix = call.normPath.replace('/api/v1/', '').split('/')[0];
      missingByPrefix[prefix] = (missingByPrefix[prefix] || 0) + 1;
    }
  }
}

console.log('Matched routes (working/registered):', matched);
console.log('Unmatched routes (missing/404/405):', unmatched);
console.log('\nMissing/Unmatched distribution by submodule:');
console.table(Object.entries(missingByPrefix).sort((a,b)=>b[1]-a[1]));
