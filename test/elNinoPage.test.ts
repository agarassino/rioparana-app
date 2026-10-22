import { expect, test } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import guide from '../content/guides/el-nino.json';
import { renderGuide } from '../landing/scripts/build-el-nino.mjs';

const page = () => readFileSync('landing/el-nino-y-el-parana/index.html', 'utf8');
test('publishes every shared editorial paragraph, source and review date', () => {
  const html = renderGuide(guide);
  for (const section of guide.sections) expect(html).toContain(`<p>${section.body}</p>`);
  for (const source of guide.sources) expect(html).toContain(`href="${source.url}"`);
  expect(html).toContain('<time datetime="2026-10-22">');
  expect(html).toContain('Revisión editorial: 22 de octubre de 2026');
  expect(html).toContain('href="/rio/"');
  expect(html).toContain('lang="es"');
  expect(html).toContain('rel="canonical" href="https://rioparana.com.ar/el-nino-y-el-parana/"');
});

test('escapes editorial text and rejects non-HTTPS source URLs', () => {
  const html = renderGuide({ ...guide, title: '<script>"&', description: '<img>', sections: [{ title: '<h2>', body: '<img onerror="x">' }] });
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;&quot;&amp;');
  expect(html).toContain('&lt;img onerror=&quot;x&quot;&gt;');
  expect(() => renderGuide({ ...guide, sources: [{ label: 'bad', url: 'javascript:alert(1)' }] })).toThrow();
});

test('checks committed output without regenerating it', () => {
  expect(page()).toBe(renderGuide(guide));
  expect(spawnSync('node', ['landing/scripts/build-el-nino.mjs', '--check']).status).toBe(0);
});

test('drift check rejects a stale generated page', () => {
  const root = mkdtempSync(join(tmpdir(), 'el-nino-drift-'));
  try {
    mkdirSync(join(root, 'landing/scripts'), { recursive: true });
    mkdirSync(join(root, 'content/guides'), { recursive: true });
    copyFileSync('landing/scripts/build-el-nino.mjs', join(root, 'landing/scripts/build-el-nino.mjs'));
    copyFileSync('content/guides/el-nino.json', join(root, 'content/guides/el-nino.json'));
    const script = join(root, 'landing/scripts/build-el-nino.mjs');
    execFileSync('node', [script]);
    const output = join(root, 'landing/el-nino-y-el-parana/index.html');
    const first = readFileSync(output, 'utf8');
    execFileSync('node', [script]);
    expect(readFileSync(output, 'utf8')).toBe(first);
    writeFileSync(output, 'stale');
    expect(spawnSync('node', [script, '--check']).status).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe('stale');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('home and sitemap make the public guide discoverable', () => {
  expect(readFileSync('landing/index.html', 'utf8')).toContain('href="/el-nino-y-el-parana/"');
  expect(readFileSync('landing/sitemap.xml', 'utf8')).toContain('<loc>https://rioparana.com.ar/el-nino-y-el-parana/</loc>');
});

test('the deployment recipe copies the guide into its public route', () => {
  const copies = readFileSync('landing/Dockerfile', 'utf8').split('\n')
    .filter((line) => line.startsWith('COPY ')).map((line) => line.split(/\s+/).slice(1));
  expect(copies).toContainEqual(['el-nino-y-el-parana', '/usr/share/nginx/html/el-nino-y-el-parana']);
});

test('regeneration retains guide discovery and rebuilds the editorial output', () => {
  const generator = readFileSync('landing/scripts/build-directory.mjs', 'utf8');
  expect(generator).toContain('`${SITE}/el-nino-y-el-parana/`');
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  expect(scripts['landing:regen'].split(' && ')).toContain(scripts['guide:build']);
  expect(scripts['guide:build']).toBe('node landing/scripts/build-el-nino.mjs');
});
