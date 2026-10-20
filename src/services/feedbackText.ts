// src/services/feedbackText.ts
import type { FeedbackFailure, FeedbackKind, ThreadStatus } from './api/feedbackApi';

// The same rules the server applies, so the button is only enabled for text
// the server will accept. Counted in code points: an emoji is one character.
export const MAX_BODY_CHARS = 2000;
export const COUNTER_FROM = 1800;

export function countChars(s: string): number {
  return [...s].length;
}

export function canSend(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && countChars(t) <= MAX_BODY_CHARS && !t.includes('\u0000');
}

export function isKind(v: unknown): v is FeedbackKind {
  return v === 'suggestion' || v === 'bug' || v === 'question';
}

export function osVersionLabel(os: string, version: string | number): string {
  const label = `${os} ${String(version)}`.replace(/[^A-Za-z0-9 ._-]/g, '').trim().slice(0, 40);
  return label.length > 0 ? label : 'unknown';
}

export const KIND_OPTIONS: Array<{ kind: FeedbackKind; label: string }> = [
  { kind: 'suggestion', label: 'Sugerencia' },
  { kind: 'bug', label: 'Error' },
  { kind: 'question', label: 'Consulta' },
];

export const STATUS_LABELS: Record<ThreadStatus, string> = {
  open: 'Enviado',
  answered: 'Respondido',
  archived: 'Cerrado',
};

export const THREAD_GONE = 'Esta conversación ya no está disponible.';

export const FAILURE_COPY: Record<FeedbackFailure, string> = {
  offline: 'No pudimos enviar tu mensaje. Revisá tu conexión y probá de nuevo.',
  limit: 'Llegaste al límite de mensajes por hoy. Probá de nuevo mañana.',
  invalid: 'Revisá el mensaje: no puede estar vacío ni superar 2000 caracteres.',
  not_found: THREAD_GONE,
  unavailable: 'El servicio no está disponible ahora. Probá de nuevo en un rato.',
};
