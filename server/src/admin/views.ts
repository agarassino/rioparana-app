// server/src/admin/views.ts
import { html, type SafeHtml } from './html.js';
import { getStationById } from '../config/stations.js';
import type { AdminThreadDetail, InboxFilter, InboxRow } from '../stores/feedbackAdminStore.js';
import type { FeedbackKind, ThreadStatus } from '../stores/feedbackStore.js';

// Server-rendered pages. Styles live in one same-origin stylesheet so the CSP
// can stay `default-src 'self'` with no inline exceptions.

export const FILTER_LABELS: Record<InboxFilter, string> = {
  pending: 'Sin responder',
  answered: 'Respondidos',
  archived: 'Archivados',
  errors: 'Errores',
};

export const KIND_LABELS: Record<FeedbackKind, string> = { suggestion: 'Sugerencia', bug: 'Error', question: 'Consulta' };

const STATUS_LABELS: Record<ThreadStatus, string> = { open: 'Sin responder', answered: 'Respondido', archived: 'Archivado' };

const AR_TIME = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatArDate(iso: string): string {
  return AR_TIME.format(new Date(iso));
}

function stationLabel(id: string | null): string {
  if (!id) return 'Sin estación';
  return getStationById(id)?.name ?? id;
}

export const ADMIN_CSS = `
:root{font-family:system-ui,sans-serif}
body{margin:0;background:#F5F0E8;color:#4A3A2A}
header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#3A6070;color:#F5F0E8}
header a{color:#F5F0E8;text-decoration:none;font-weight:700}
main{max-width:760px;margin:0 auto;padding:16px}
.narrow{max-width:360px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.tab{padding:6px 12px;border-radius:999px;background:#E8DCC8;color:#4A3A2A;text-decoration:none}
.tab.active{background:#4A7C8A;color:#fff}
.inbox,.thread{list-style:none;padding:0;margin:0}
.inbox li a{display:block;padding:12px;margin-bottom:8px;background:#fff;border-radius:12px;color:inherit;text-decoration:none}
.kind{font-weight:700}.station,time{color:#8B7B6B;font-size:13px}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}
.msg{padding:10px 12px;border-radius:12px;margin:8px 0;max-width:85%}
.msg p{white-space:pre-wrap;margin:0 0 4px}
.msg.device{background:#fff}.msg.admin{background:#E6F0F3;margin-left:auto}
label{display:block;margin:12px 0}
textarea,input[type=password]{width:100%;box-sizing:border-box;font:inherit;padding:8px}
button{padding:8px 16px;border:0;border-radius:8px;background:#4A7C8A;color:#fff;font:inherit;cursor:pointer}
button.secondary{background:#8B7B6B;margin-top:8px}
button.link{background:none;color:inherit;text-decoration:underline;padding:0}
.error{color:#C53030}
`;

function documentOf(title: string, body: SafeHtml): string {
  return '<!doctype html>' + html`<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Paraná Info</title><link rel="stylesheet" href="/admin/assets/admin.css"></head><body>${body}</body></html>`.value;
}

function header(csrf: string): SafeHtml {
  return html`<header><a href="/admin">Paraná Info · Mensajes</a><form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${csrf}"><button type="submit" class="link">Salir</button></form></header>`;
}

export function loginPage(o: { csrf: string; message?: string }): string {
  return documentOf('Ingresar', html`<main class="narrow">
<h1>Paraná Info · Admin</h1>
${o.message ? html`<p class="error">${o.message}</p>` : null}
<form method="post" action="/admin/login">
<input type="hidden" name="_csrf" value="${o.csrf}">
<label>Contraseña <input type="password" name="password" autocomplete="current-password" required></label>
<button type="submit">Ingresar</button>
</form>
</main>`);
}

export function inboxPage(o: { filter: InboxFilter; rows: InboxRow[]; csrf: string }): string {
  const tabs = (Object.keys(FILTER_LABELS) as InboxFilter[]).map(
    (f) => html`<a href="/admin?filter=${f}" class="${f === o.filter ? 'tab active' : 'tab'}">${FILTER_LABELS[f]}</a>`,
  );
  const list = o.rows.length === 0
    ? html`<p>No hay mensajes acá.</p>`
    : html`<ul class="inbox">${o.rows.map((r) => html`<li><a href="/admin/threads/${r.id}"><span class="kind">${KIND_LABELS[r.kind]}</span> <span class="station">${stationLabel(r.stationId)}</span> <time>${formatArDate(r.updatedAt)}</time><p>${r.preview}</p></a></li>`)}</ul>`;
  return documentOf('Mensajes', html`${header(o.csrf)}<main><nav class="tabs">${tabs}</nav>${list}</main>`);
}

export function threadPage(o: { thread: AdminThreadDetail; csrf: string; message?: string }): string {
  const t = o.thread;
  const bubbles = t.messages.map(
    (m) => html`<li class="${m.author === 'admin' ? 'msg admin' : 'msg device'}"><p>${m.body}</p><time>${m.author === 'admin' ? 'Paraná Info' : 'Usuario'} · ${formatArDate(m.createdAt)}</time></li>`,
  );
  return documentOf('Conversación', html`${header(o.csrf)}<main>
<p><a href="/admin">← Volver</a></p>
<dl class="meta">
<dt>Tipo</dt><dd>${KIND_LABELS[t.kind]}</dd>
<dt>Estado</dt><dd>${STATUS_LABELS[t.status]}</dd>
<dt>Estación</dt><dd>${stationLabel(t.stationId)}</dd>
<dt>Dispositivo</dt><dd>${t.shortDevice} (${t.deviceThreadCount} conversaciones)</dd>
<dt>App</dt><dd>${t.appVersion}</dd>
<dt>Sistema</dt><dd>${t.osVersion}</dd>
</dl>
<ol class="thread">${bubbles}</ol>
${o.message ? html`<p class="error">${o.message}</p>` : null}
<form method="post" action="/admin/threads/${t.id}/reply">
<input type="hidden" name="_csrf" value="${o.csrf}">
<label>Respuesta <textarea name="body" rows="5" required></textarea></label>
<button type="submit">Responder</button>
</form>
${t.status === 'archived' ? null : html`<form method="post" action="/admin/threads/${t.id}/archive"><input type="hidden" name="_csrf" value="${o.csrf}"><button type="submit" class="secondary">Archivar sin responder</button></form>`}
</main>`);
}

export function notFoundPage(): string {
  return documentOf('No encontrado', html`<main class="narrow"><h1>404</h1><p>No encontrado.</p></main>`);
}
