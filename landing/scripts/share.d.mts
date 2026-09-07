export interface ShareInput {
  locality: string;
  url: string;
  /** As shown on the page; an em dash or empty means "no reading". */
  level?: string | null;
  /** Distance to the alert height, only when the page is flagging it. */
  alert?: string | null;
  /** The 24 h phrase, when the history can say. */
  day?: string | null;
}

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

export function sharePayload(input: ShareInput): SharePayload;
export function clipboardText(payload: SharePayload): string;

export function whatsappUrl(payload: SharePayload): string;
