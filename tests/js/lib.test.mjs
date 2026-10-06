import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  base64Url, buildMime, encodeHeader, fill, formatAddress, parseRecipients, planTasks,
} from "../../extension/lib.js";

const decodeB64Url = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const decodeBodyPart = (mime, type) => {
  const m = mime.match(new RegExp(`Content-Type: ${type}; charset="UTF-8"\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+)`));
  return Buffer.from(m[1].replace(/\r\n/g, ""), "base64").toString("utf8");
};

test("parseRecipients matches app.py behaviour", () => {
  const { recipients, invalid } = parseRecipients("Jane <Jane@x.com>\nbob@y.com, bad; jane@x.com");
  assert.deepEqual(recipients, [
    { name: "Jane", email: "jane@x.com" },
    { name: "", email: "bob@y.com" },
  ]);
  assert.deepEqual(invalid, ["bad"]);
});

test("fill replaces placeholders", () => {
  assert.equal(fill("Hi {name} <{email}>", "Ann", "a@b.co"), "Hi Ann <a@b.co>");
  assert.equal(fill("Hi {name}", "", "a@b.co"), "Hi ");
});

test("planTasks rotate and all", () => {
  const s = [{ email: "a" }, { email: "b" }], r = [{ email: "1" }, { email: "2" }, { email: "3" }];
  assert.deepEqual(planTasks(s, r, "rotate").map(t => t.sender.email + t.recipient.email), ["a1", "b2", "a3"]);
  assert.equal(planTasks(s, r, "all").length, 6);
});

test("headers: ASCII kept, non-ASCII RFC 2047 encoded, names quoted", () => {
  assert.equal(encodeHeader("Hello"), "Hello");
  assert.match(encodeHeader("Héllo 👋"), /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
  assert.equal(formatAddress("", "a@b.co"), "a@b.co");
  assert.equal(formatAddress('Ann "A" Lee', "a@b.co"), '"Ann \\"A\\" Lee" <a@b.co>');
});

test("plain text MIME round-trips UTF-8", () => {
  const mime = buildMime({ fromName: "Me", fromEmail: "me@gmail.com", toName: "", toEmail: "x@y.com",
                           subject: "Sujet é", body: "Bonjour 👋\nline 2", html: false });
  assert.match(mime, /^From: "Me" <me@gmail.com>\r\nTo: x@y.com\r\nSubject: =\?UTF-8\?B\?/);
  assert.ok(/^[\x00-\x7f]*$/.test(mime), "message must be pure ASCII");
  assert.equal(decodeBodyPart(mime, "text/plain"), "Bonjour 👋\nline 2");
});

test("HTML MIME is multipart/alternative with a text fallback", () => {
  const mime = buildMime({ fromEmail: "me@gmail.com", toEmail: "x@y.com", subject: "S",
                           body: "<p>Hi <b>there</b></p>", html: true, boundary: "BOUND" });
  assert.match(mime, /Content-Type: multipart\/alternative; boundary="BOUND"/);
  assert.equal(decodeBodyPart(mime, "text/plain"), "Hi there");
  assert.equal(decodeBodyPart(mime, "text/html"), "<p>Hi <b>there</b></p>");
  assert.match(mime, /--BOUND--\r\n$/);
});

test("base64Url is URL-safe and unpadded", () => {
  const s = "subjects?>>>~~~ é";
  const enc = base64Url(s);
  assert.doesNotMatch(enc, /[+/=]/);
  assert.equal(decodeB64Url(enc), s);
});

test("manifest is valid MV3 and points at existing files", () => {
  const dir = new URL("../../extension/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const files = [manifest.background.service_worker, "app.html", "app.js", ...Object.values(manifest.icons)];
  for (const f of files) readFileSync(new URL(f, dir));
});
