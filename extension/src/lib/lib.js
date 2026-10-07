// Pure helpers shared by the extension page and the Node tests.

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Same rules as app.py's parse_recipients: split on newline/comma/semicolon,
// accept "Name <addr>", lowercase, drop invalid and duplicate addresses.
export function parseRecipients(raw) {
  const seen = new Set(), recipients = [], invalid = [];
  for (let item of String(raw).split(/[\n,;]+/)) {
    item = item.trim();
    if (!item) continue;
    const m = item.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    const name = m ? m[1].trim() : "";
    const addr = (m ? m[2] : item).trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) invalid.push(item);
    else if (!seen.has(addr)) { seen.add(addr); recipients.push({ name, email: addr }); }
  }
  return { recipients, invalid };
}

export const fill = (text, name, email) =>
  String(text).replaceAll("{name}", name || "").replaceAll("{email}", email);

// "rotate": spread recipients across senders; "all": every sender emails every recipient
export function planTasks(senders, recipients, mode) {
  if (mode === "all") return senders.flatMap(s => recipients.map(r => ({ sender: s, recipient: r })));
  return recipients.map((r, i) => ({ sender: senders[i % senders.length], recipient: r }));
}

export function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const utf8 = s => new TextEncoder().encode(s);
const b64 = s => bytesToBase64(utf8(s));
const wrap76 = s => s.replace(/.{1,76}/g, "$&\r\n");
const isPlainAscii = s => /^[\x20-\x7e]*$/.test(s);

// RFC 2047 encoded-word for headers that contain non-ASCII text
export const encodeHeader = s => (isPlainAscii(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export function formatAddress(name, email) {
  if (!name) return email;
  const display = isPlainAscii(name) ? `"${name.replace(/["\\]/g, "\\$&")}"` : encodeHeader(name);
  return `${display} <${email}>`;
}

export const stripTags = html => html.replace(/<[^>]+>/g, "");

// Build an RFC 5322 message (all-ASCII; bodies are base64) ready for Gmail's `raw` field.
export function buildMime({ fromName, fromEmail, toName, toEmail, subject, body, html, boundary }) {
  const part = (type, text) =>
    `Content-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(text))}`;
  const headers = [
    `From: ${formatAddress(fromName, fromEmail)}`,
    `To: ${formatAddress(toName, toEmail)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];
  if (!html) return `${headers.join("\r\n")}\r\n${part("text/plain", body)}`;
  const b = boundary || `b_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${b}"`,
    "",
    `--${b}`,
    part("text/plain", stripTags(body)),
    `--${b}`,
    part("text/html", body),
    `--${b}--`,
    "",
  ].join("\r\n");
}

export const base64Url = s => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
