import * as fs from 'fs';
import * as path from 'path';

const base = 'D:/Company/Admatrix/ZaloCRM/backend/src/modules';

let total = 0;
const results: { method: string; path: string; file: string }[] = [];

function scanDir(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.name.endsWith('.ts') && (entry.name.includes('route') || entry.name.includes('controller') || entry.name.includes('server'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const routeRegex = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
      let match: RegExpExecArray | null;
      while ((match = routeRegex.exec(content)) !== null) {
        total++;
        results.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file: path.relative(base, fullPath).replace(/\\/g, '/')
        });
      }
    }
  }
}

scanDir(base);
console.log('Total routes on prod branch release/orbstack-mini-20260924:', total);

const modCounts: Record<string, number> = {};
results.forEach(r => {
  const mod = r.file.split('/')[0];
  modCounts[mod] = (modCounts[mod] || 0) + 1;
});

const summary = Object.entries(modCounts).map(([mod, count]) => ({ mod, count })).sort((a,b) => b.count - a.count);
console.table(summary);

fs.writeFileSync('D:/Company/Admatrix/omni-docs/migration/PROD-ROUTES-AUDIT.json', JSON.stringify({ total, summary, results }, null, 2));
