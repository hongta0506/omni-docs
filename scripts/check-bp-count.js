const fs = require('fs');
const content = fs.readFileSync('D:/Company/Admatrix/omni-docs/architecture/MASTER-ARCHITECTURE-BLUEPRINT.md', 'utf8');

const lines = content.split('\n');
const routes = [];

for (const line of lines) {
  if (line.trim().startsWith('|') && line.includes('`GET`') || line.includes('`POST`') || line.includes('`PUT`') || line.includes('`PATCH`') || line.includes('`DELETE`')) {
    const parts = line.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const method = parts[0].replace(/`/g, '');
      const ep = parts[1].replace(/`/g, '');
      if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(method)) {
        routes.push({ method, ep, desc: parts[2] || '' });
      }
    }
  }
}

console.log('Total table endpoint rows in Master Blueprint:', routes.length);
const uniq = new Set(routes.map(r => r.method + ' ' + r.ep));
console.log('Unique blueprint endpoints:', uniq.size);

// Check blueprint vs omni-core (413 routes)
const coreDir = 'D:/Company/Admatrix/omni-core/internal';
const backendRoutes = [];

function scanGo(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = dir + '/' + ent.name;
    if (ent.isDirectory()) scanGo(full);
    else if (ent.name.endsWith('.go')) {
      const code = fs.readFileSync(full, 'utf8');
      const re = /(?:mux|r|router)\.HandleFunc\s*\(\s*["']([A-Z]+)\s+([^"']+)["']/g;
      let m;
      while ((m = re.exec(code)) !== null) {
        backendRoutes.push({ method: m[1], path: m[2] });
      }
    }
  }
}
scanGo(coreDir);
console.log('Total routes registered in Go ServeMux:', backendRoutes.length);
