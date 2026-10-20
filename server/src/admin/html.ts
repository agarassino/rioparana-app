// server/src/admin/html.ts
// The admin renders text people typed into the app. Every interpolation is
// escaped; the only thing inserted as-is is another html`` result, and there
// is deliberately no way to mark a plain string as safe.

const SAFE: unique symbol = Symbol('safe-html');

export interface SafeHtml {
  readonly [SAFE]: true;
  readonly value: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafe(v: unknown): v is SafeHtml {
  return typeof v === 'object' && v !== null && (v as { [SAFE]?: unknown })[SAFE] === true;
}

function render(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (isSafe(v)) return v.value;
  return escapeHtml(String(v));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return { [SAFE]: true, value: out };
}
