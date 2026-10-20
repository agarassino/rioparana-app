// scripts/update-privacy-policy.mjs
// Applies the 2.2.0 policy changes to the three copies identically. Fails
// loudly if an anchor is missing, so a copy that drifted is not half-edited.
import { readFileSync, writeFileSync } from 'node:fs';

const COPIES = ['docs/privacy-policy.html', 'privacy-policy/index.html', 'landing/privacy-policy.html'];

const EDITS = [
  { anchor: 'Sirve únicamente para contar cuántos dispositivos usan la aplicación y qué estaciones se consultan. No contiene datos personales, no permite identificar a la persona, y no se comparte con terceros.', replace: 'Se utiliza para contar cuántos dispositivos usan la aplicación y qué estaciones se consultan, autenticar al dispositivo mediante una credencial y asociar sus conversaciones de contacto y sus notificaciones. El identificador es aleatorio y no incorpora nombre, correo ni teléfono. No se utiliza para identificar personalmente a quien usa la aplicación.' },
  { anchor: 'Se usa únicamente para enviarle una vez por día la altura del río en la estación que más consulta, y para que pueda ver en la aplicación las notificaciones anteriores.', replace: 'Se usa para enviarle una vez por día la altura del río en la estación que más consulta y, si nos escribe desde la aplicación, avisarle cuando respondemos a sus mensajes de contacto. El aviso de respuesta no incluye el texto de la respuesta. También puede consultar en la aplicación el historial de notificaciones diarias del río. Estas notificaciones son opcionales.' },
  {
    anchor: 'Última actualización: 15 de septiembre de 2026',
    replace: 'Última actualización: 13 de octubre de 2026',
  },
  {
    anchor: 'el token deja de utilizarse.</li>',
    append: '\n            <li><strong>Mensajes de contacto:</strong> Si nos escribe desde "Contacto y sugerencias", guardamos el texto que envía, el tipo de mensaje (sugerencia, error o consulta), la estación sobre la que escribe si la eligió, y la versión de la aplicación y del sistema operativo, asociados al identificador del dispositivo. No solicitamos nombre, correo ni teléfono como campos de contacto ni los recopilamos automáticamente; evite incluirlos en el mensaje. El texto que escriba voluntariamente se guarda como parte del mensaje. Usamos estos datos únicamente para leer y responder su mensaje dentro de la aplicación y para corregir errores.</li>',
  },
  {
    anchor: '<li>Enviar la notificación diaria con la altura del río, si la solicitó</li>',
    append: '\n            <li>Leer y responder los mensajes que nos envía desde la aplicación</li>',
  },
  {
    anchor: 'Estos datos se actualizan periódicamente y no contienen información personal.</p>',
    append: '\n        <p>Los mensajes de contacto y sus respuestas se conservan durante 12 meses desde la última actividad de la conversación; pasado ese plazo se eliminan automáticamente.</p>',
  },
  {
    anchor: 'no recibe información sobre la persona usuaria.</li>',
    append: '\n            <li><strong>Resend:</strong> Envía al responsable de la aplicación un aviso por correo cuando llega un mensaje nuevo. El aviso incluye el tipo de mensaje, la estación y un extracto de los primeros 140 caracteres del texto. El extracto puede contener información que usted escriba voluntariamente. Recomendamos no incluir datos personales sensibles. No se incluyen automáticamente el identificador del dispositivo, los tokens ni las versiones de la aplicación y del sistema operativo en este correo.</li>',
  },
  {
    anchor: '<li>Desactivar las notificaciones desde la configuración de su dispositivo</li>',
    append: '\n            <li>Pedir la eliminación de sus mensajes escribiéndonos desde "Contacto y sugerencias" en la aplicación</li>',
  },
];

for (const path of COPIES) {
  let html = readFileSync(path, 'utf8');
  for (const edit of EDITS) {
    if (!html.includes(edit.anchor)) throw new Error(`${path}: anchor not found: ${edit.anchor}`);
    html = html.replace(edit.anchor, edit.replace ?? edit.anchor + edit.append);
  }
  writeFileSync(path, html);
  console.log(`updated ${path}`);
}
