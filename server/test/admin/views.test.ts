// server/test/admin/views.test.ts
import { describe, it, expect } from 'vitest';
import { formatArDate, inboxPage, loginPage, notFoundPage, threadPage } from '../../src/admin/views.js';
import type { AdminThreadDetail, InboxRow } from '../../src/stores/feedbackAdminStore.js';

const EVIL = `<script>alert("x")</script>`;
const row: InboxRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'bug', stationId: 'rosario', status: 'open',
  preview: EVIL, updatedAt: '2026-10-13T15:00:00.000Z', shortDevice: '11111111',
};
const thread: AdminThreadDetail = {
  id: row.id, kind: 'bug', stationId: 'rosario', status: 'answered', appVersion: '2.2.0', osVersion: 'android 34',
  shortDevice: '11111111', deviceThreadCount: 3, createdAt: '2026-10-13T15:00:00.000Z',
  messages: [
    { id: 'm1', author: 'device', body: EVIL, createdAt: '2026-10-13T15:00:00.000Z' },
    { id: 'm2', author: 'admin', body: 'Gracias & saludos', createdAt: '2026-10-13T15:10:00.000Z' },
  ],
};

describe('admin views', () => {
  it('renders stored text in the inbox as text', () => {
    const page = inboxPage({ filter: 'pending', rows: [row], csrf: 'c' });
    expect(page).not.toContain('<script>alert');
    expect(page).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('renders stored text in a thread as text', () => {
    const page = threadPage({ thread, csrf: 'c' });
    expect(page).not.toContain('<script>alert');
    expect(page).toContain('Gracias &amp; saludos');
  });

  it('shows the four filters and marks the active one', () => {
    const page = inboxPage({ filter: 'errors', rows: [], csrf: 'c' });
    for (const label of ['Sin responder', 'Respondidos', 'Archivados', 'Errores']) expect(page).toContain(label);
    expect(page).toContain('href="/admin?filter=errors" class="tab active"');
  });

  it('shows the device context and signs owner replies as Paraná Info', () => {
    const page = threadPage({ thread, csrf: 'c' });
    expect(page).toContain('Rosario');
    expect(page).toContain('11111111 (3 conversaciones)');
    expect(page).toContain('2.2.0');
    expect(page).toContain('android 34');
    expect(page).toContain('Paraná Info ·');
  });

  it('puts the csrf token in every form', () => {
    const page = threadPage({ thread, csrf: 'TOKEN123' });
    const forms = page.match(/<form /g) ?? [];
    const tokens = page.match(/name="_csrf" value="TOKEN123"/g) ?? [];
    expect(forms.length).toBe(3); // logout, reply, archive
    expect(tokens.length).toBe(forms.length);
  });

  it('hides "Archivar sin responder" on an archived thread', () => {
    expect(threadPage({ thread: { ...thread, status: 'archived' }, csrf: 'c' })).not.toContain('Archivar sin responder');
  });

  it('escapes a login message and loads only same-origin CSS', () => {
    const page = loginPage({ csrf: 'c', message: EVIL });
    expect(page).not.toContain('<script>alert');
    expect(page).toContain('<link rel="stylesheet" href="/admin/assets/admin.css">');
    expect(page).not.toMatch(/<style|style="/);
  });

  it('formats dates in Argentine time', () => {
    expect(formatArDate('2026-10-13T03:30:00.000Z')).toMatch(/13\/10.*00:30/);
  });

  it('has a plain 404 page', () => {
    expect(notFoundPage()).toContain('No encontrado');
  });
});
