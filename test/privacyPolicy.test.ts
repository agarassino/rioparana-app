// test/privacyPolicy.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// Three copies exist (docs/ for the repo, privacy-policy/ for the old URL,
// landing/ for the one nginx serves). Play reads the served one; all three
// must say the same thing.
const COPIES = ['docs/privacy-policy.html', 'privacy-policy/index.html', 'landing/privacy-policy.html'];
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe.each(COPIES)('%s', (path) => {
  const html = read(path);

  test('declares the contact messages and what travels with them', () => {
    expect(html).toContain('<strong>Mensajes de contacto:</strong>');
    expect(html).toContain('No solicitamos nombre, correo ni teléfono como campos de contacto ni los recopilamos automáticamente; evite incluirlos en el mensaje.');
  });

  test('states the 12-month retention', () => {
    expect(html).toContain('se conservan durante 12 meses desde la última actividad de la conversación');
  });

  test('names Resend as the email processor', () => {
    expect(html).toContain('<strong>Resend:</strong>');
  });

  test('explains how to ask for deletion', () => {
    expect(html).toContain('Pedir la eliminación de sus mensajes');
  });

  test('carries the new date', () => {
    expect(html).toContain('Última actualización: 13 de octubre de 2026');
  });
});

test('keeps every published copy identical and nginx-readable', () => {
 const body = (path: string) => read(path).split('<body>')[1];
 expect(body(COPIES[0])).toBe(body(COPIES[1]));
 expect(body(COPIES[0])).toBe(body(COPIES[2]));
});

describe.each(COPIES)('%s notification purposes', (path) => {
 test('declares optional feedback reply notices without claiming daily-only delivery', () => {
  const html = read(path);
  expect(html).toContain('avisarle cuando respondemos a sus mensajes de contacto');
  expect(html).not.toContain('Se usa únicamente para enviarle una vez por día');
  expect(html).toContain('El aviso de respuesta no incluye el texto de la respuesta.');
 });
});

describe.each(COPIES)('%s email excerpt disclosure', (path) => {
 test('does not guarantee that voluntarily written excerpts contain no personal data', () => {
  const html = read(path);
  expect(html).not.toContain('no incluye datos que identifiquen a la persona');
  expect(html).toContain('El extracto puede contener información que usted escriba voluntariamente.');
  expect(html).toContain('Recomendamos no incluir datos personales sensibles.');
  expect(html).toContain('No se incluyen automáticamente el identificador del dispositivo, los tokens ni las versiones de la aplicación y del sistema operativo en este correo.');
 });
});

describe.each(COPIES)('%s device identifier purposes', (path) => {
 test('covers credential and conversation ownership without a statistics-only guarantee', () => {
  const html = read(path);
  expect(html).not.toContain('Sirve únicamente para contar');
  expect(html).toContain('autenticar al dispositivo mediante una credencial');
  expect(html).toContain('asociar sus conversaciones de contacto y sus notificaciones');
  expect(html).not.toContain('No pedimos ni guardamos nombre, correo ni teléfono.');
 });
});
