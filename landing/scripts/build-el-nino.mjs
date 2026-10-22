import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const source = new URL('../../content/guides/el-nino.json', import.meta.url);
const output = new URL('../el-nino-y-el-parana/index.html', import.meta.url);
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderGuide(guide) {
  const links = guide.sources.map(({ label, url }) => {
    if (new URL(url).protocol !== 'https:') throw new Error('Sources require HTTPS');
    return `<li><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} (sitio externo)</a></li>`;
  }).join('\n');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(guide.title)} | Paraná Info</title>
<meta name="description" content="${escape(guide.description)}">
<link rel="canonical" href="https://rioparana.com.ar/el-nino-y-el-parana/">
<link rel="stylesheet" href="/tokens.css">
<link rel="stylesheet" href="/site.css">
<style>
.guide { max-width: 66ch; padding: var(--space-xl) 22px; margin: auto; }
.guide h1 { font-size: var(--text-3xl); margin: var(--space-sm) 0; }
.guide h2 { font-size: var(--text-xl); margin: var(--space-lg) 0 var(--space-sm); }
.guide p { margin-bottom: var(--space-sm); }
.guide aside { border-left: 3px solid var(--color-accent); padding-left: var(--space-sm); margin: var(--space-lg) 0; }
.guide a { color: var(--color-accent); text-underline-offset: 3px; }
.guide li a { display: inline-block; padding: 10px 0; }
a:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 4px; }
</style>
</head>
<body>
<header class="masthead"><div class="masthead-inner"><a class="wordmark" href="/">Paraná Info</a></div></header>
<main class="guide"><article>
<p>${escape(guide.readingTime)}</p>
<h1>${escape(guide.title)}</h1>
<p>${escape(guide.description)}</p>
${guide.sections.map(({ title, body }) => `<section><h2>${escape(title)}</h2><p>${escape(body)}</p></section>`).join('\n')}
<aside>${escape(guide.notice)}</aside>
<p><a href="/rio/">${escape(guide.heightLabel)}</a></p>
<footer><h2>Fuentes oficiales</h2>
<p><time datetime="${escape(guide.reviewedAt)}">Revisión editorial: ${new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(guide.reviewedAt))}</time></p>
<ul>${links}</ul></footer>
</article></main>
</body>
</html>
`;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const html = renderGuide(JSON.parse(readFileSync(source, 'utf8')));
  if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== html) {
      console.error('Guide page is stale. Run npm run guide:build.');
      process.exitCode = 1;
    }
  } else {
    mkdirSync(new URL('../el-nino-y-el-parana/', import.meta.url), { recursive: true });
    writeFileSync(output, html, { mode: 0o644 });
  }
}
