// server/test/admin/html.test.ts
import { describe, it, expect } from 'vitest';
import { escapeHtml, html } from '../../src/admin/html.js';

describe('html', () => {
  it('escapes every interpolated string', () => {
    const body = `<script>alert("x")</script> & 'y'`;
    expect(html`<p>${body}</p>`.value).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;</p>',
    );
  });

  it('cannot be broken out of an attribute', () => {
    const value = `" onmouseover="alert(1)`;
    expect(html`<input value="${value}">`.value).toBe('<input value="&quot; onmouseover=&quot;alert(1)">');
  });

  it('does not escape nested templates twice', () => {
    const inner = html`<b>${'<i>'}</b>`;
    expect(html`<p>${inner}</p>`.value).toBe('<p><b>&lt;i&gt;</b></p>');
  });

  it('joins lists and drops null, undefined and false', () => {
    const items = ['<a>', 'b'].map((s) => html`<li>${s}</li>`);
    expect(html`<ul>${items}${null}${undefined}${false}</ul>`.value).toBe('<ul><li>&lt;a&gt;</li><li>b</li></ul>');
  });

  it('treats an object that only looks safe as text', () => {
    const forged = { value: '<script>' };
    expect(html`${forged}`.value).toBe('[object Object]');
  });

  it('escapes numbers as text', () => {
    expect(html`${42}`.value).toBe('42');
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
