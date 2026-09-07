// The message that gets forwarded to a WhatsApp group.
//
// Pure string building, no DOM: the page reads the values off the screen and
// hands them here, so what is shared is exactly what the reader was looking at.

// The page shows an em dash until the API answers. Forwarding "Rosario: —" is
// worse than forwarding nothing, so a placeholder is treated as no reading.
const PLACEHOLDER = /^[—\-\s]*$/;

const reading = (level) => (!level || PLACEHOLDER.test(level) ? null : String(level).trim());

/** `{ title, text, url }` for navigator.share. */
export function sharePayload({ locality, level, alert, day, url }) {
  const title = `Altura del río Paraná en ${locality}`;
  const m = reading(level);

  // The distance to the alert height only travels when the river is close
  // enough for it to mean something; the page decides that, not this function.
  const head = m ? `${title}: ${m}${alert ? ` — ${alert}` : ''}` : title;
  // The Web Share API appends the url itself. Repeating it here would put the
  // link in the message twice.
  const text = day ? `${head}\n${day}` : head;

  return { title, text, url };
}

/** The same message for a clipboard, which appends nothing on its own. */
export function clipboardText(payload) {
  return `${payload.text}\n${payload.url}`;
}
