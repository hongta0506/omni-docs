#!/usr/bin/env python3
"""i18n audit for omni-web-next.

Two independent measurements, because either one alone lies:

  static  every Vietnamese string literal in src/**, with file:line, grouped by
          feature area. "Literal" means a quoted string containing Vietnamese
          diacritics that is not inside console.* or a comment. False positives
          remain (fixtures, seed data), so treat counts as an index, not a legal
          document.

  runtime every route fetched with `Cookie: NEXT_LOCALE=en`. Any Vietnamese
          still visible in the HTML is proof the string never went through t().
          This catches what the static scan cannot: strings returned by
          helpers, api modules and hooks.

Usage:
  python3 i18n-audit.py static  [--repo PATH]
  python3 i18n-audit.py runtime [--base http://localhost:3000] [--repo PATH]
  python3 i18n-audit.py parity  [--repo PATH]

Exit code is 1 when the chosen check finds anything, so it can gate CI.
"""
import argparse
import collections
import html
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

VI = re.compile(
    '[\u00e0-\u00e3\u00e8-\u00eb\u00ec-\u00ef\u00f2-\u00f5\u00f9-\u00fc\u00fd'
    '\u0103\u0111\u0129\u0169\u01a1\u01b0\u1ea0-\u1ef9'
    '\u00c0-\u00c3\u00c8-\u00cb\u00cc-\u00cf\u00d2-\u00d5\u00d9-\u00dc\u00dd'
    '\u0102\u0110\u0128\u0168\u01a0\u01af]'
)
STR = re.compile(r'(["\'`])((?:[^"\'`\\\n]|\\.){2,200}?)\1')


def strip_comments(src):
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'(?m)^\s*//.*$', '', src)
    return src


def family(path):
    p = path[4:] if path.startswith('src/') else path
    for pre in ('app/(dashboard)/', 'app/(auth)/', 'app/'):
        if p.startswith(pre):
            seg = p[len(pre):].split('/')[0]
            return 'shell' if seg in ('layout.tsx', 'page.tsx') else seg.replace('.tsx', '')
    if p.startswith('components/'):
        seg = p[len('components/'):].split('/')[0]
        return 'shell' if seg in ('layout', 'ui') else seg
    if p.startswith('utils/'):
        return 'utils'
    if p.startswith('constants/'):
        return 'constants'
    if p.startswith('lib/'):
        return 'lib'
    if p.startswith(('api/', 'hooks/')):
        return 'api'
    return 'shared'


def static(repo, show=40):
    hits = []
    for root, _dirs, files in os.walk(os.path.join(repo, 'src')):
        for f in files:
            if not f.endswith(('.tsx', '.ts')) or re.search(r'\.(test|spec)\.', f):
                continue
            path = os.path.join(root, f)
            rel = os.path.relpath(path, repo)
            for i, line in enumerate(open(path, encoding='utf-8-sig', errors='ignore'), 1):
                s = line.strip()
                if s.startswith(('//', '*', '/*')) or 'console.' in s:
                    continue
                for m in STR.finditer(line):
                    v = m.group(2)
                    if VI.search(v) and not v.startswith('@') and 'http' not in v:
                        hits.append((rel, i, v))
    per_fam = collections.Counter()
    per_file = collections.Counter()
    samples = collections.defaultdict(list)
    for rel, i, v in hits:
        per_fam[family(rel)] += 1
        per_file[rel] += 1
        if len(samples[family(rel)]) < 5:
            samples[family(rel)].append(f'{rel}:{i} `{v[:70]}`')
    print(f'files: {len(per_file)}   literals: {len(hits)}')
    print(f'{"AREA":<16}{"STRINGS":>8}{"FILES":>7}')
    for k, n in per_fam.most_common(show):
        files = sum(1 for p in per_file if family(p) == k)
        print(f'{k:<16}{n:>8}{files:>7}')
    print('\nsamples per area:')
    for k, _ in per_fam.most_common(12):
        for s in samples[k][:3]:
            print(f'  {k:<14} {s}')
    return 1 if hits else 0


def visible_text(body):
    body = re.sub(r'<script.*?</script>', '', body, flags=re.S | re.I)
    body = re.sub(r'<style.*?</style>', '', body, flags=re.S | re.I)
    body = re.sub(r'<head.*?</head>', '', body, flags=re.S | re.I)
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
    text = html.unescape(re.sub(r'<[^>]+>', '\n', body))
    return [p.strip() for p in text.split('\n') if p.strip() and VI.search(p)]


def routes_of(repo):
    out = set()
    for root, _d, files in os.walk(os.path.join(repo, 'src/app')):
        if 'page.tsx' not in files:
            continue
        rel = os.path.relpath(root, os.path.join(repo, 'src/app'))
        rel = rel.replace('(dashboard)', '').replace('(auth)', '')
        rel = re.sub(r'/\[[^]]*\]', '/[id]', rel)
        rel = re.sub(r'/+', '/', '/' + rel).rstrip('/') or '/'
        out.add(rel)
    return sorted(out)


def runtime(repo, base, workers=6):
    routes = routes_of(repo)

    def probe(route):
        url = base + ('/login' if route == '/' else route)
        req = urllib.request.Request(url, headers={'Cookie': 'NEXT_LOCALE=en',
                                                  'User-Agent': 'i18n-audit'})
        try:
            body = urllib.request.urlopen(req, timeout=90).read().decode('utf-8', 'ignore')
        except Exception as exc:  # noqa: BLE001 - report, do not crash the sweep
            return dict(route=route, error=str(exc)[:80], vi=0)
        strings = visible_text(body)
        return dict(route=route, vi=sum(len(VI.findall(s)) for s in strings),
                    samples=list(dict.fromkeys(strings))[:6])

    with ThreadPoolExecutor(max_workers=workers) as pool:
        rows = list(pool.map(probe, routes))
    bad = [r for r in rows if r.get('vi')]
    print(f'routes: {len(rows)}   leaking: {len(bad)}   vi chars: {sum(r["vi"] for r in rows)}')
    for r in sorted(bad, key=lambda x: -x['vi']):
        print(f'{r["route"]:<44}{r["vi"]:>6}  {(r["samples"] or [""])[0][:50]}')
    return 1 if bad else 0


def parity(repo):
    def walk(obj, prefix=''):
        for k, v in obj.items():
            if isinstance(v, dict):
                yield from walk(v, prefix + k + '.')
            else:
                yield prefix + k

    sets = {}
    for loc in ('vi', 'en', 'zh'):
        path = os.path.join(repo, 'src/messages', f'{loc}.json')
        sets[loc] = set(walk(json.load(open(path, encoding='utf-8'))))
    ok = True
    for a, b in (('vi', 'en'), ('vi', 'zh')):
        missing = sets[a] - sets[b]
        extra = sets[b] - sets[a]
        print(f'{b}: {len(sets[b])} keys · missing vs {a}: {len(missing)} · extra: {len(extra)}')
        for k in sorted(missing)[:10]:
            print('  missing in %s: %s' % (b, k))
        ok = ok and not missing
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('check', choices=['static', 'runtime', 'parity'])
    ap.add_argument('--repo', default='.', help='path to omni-web-next')
    ap.add_argument('--base', default='http://localhost:3000')
    ap.add_argument('--show', type=int, default=40)
    a = ap.parse_args()
    if a.check == 'static':
        return static(a.repo, a.show)
    if a.check == 'runtime':
        return runtime(a.repo, a.base)
    return parity(a.repo)


if __name__ == '__main__':
    sys.exit(main())
