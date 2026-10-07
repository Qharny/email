// Google sign-in (launchWebAuthFlow works in Chrome, Edge and Brave) and Gmail API sending.
import { base64Url, buildMime } from "./lib.js";

const SCOPES = "https://www.googleapis.com/auth/gmail.send email profile";

async function authorize(clientId, { interactive, loginHint }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: SCOPES,
    ...(loginHint ? { login_hint: loginHint } : {}),
    ...(interactive ? { prompt: loginHint ? "consent" : "select_account consent" } : { prompt: "none" }),
  });
  const redirect = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive });
  const params = new URLSearchParams(new URL(redirect).hash.slice(1));
  if (params.get("error")) throw new Error(params.get("error"));
  return { token: params.get("access_token"), expiry: Date.now() + Number(params.get("expires_in") || 3600) * 1000 };
}

// Interactive sign-in for a new account; returns {email, name, token, expiry}.
export async function signIn(clientId) {
  if (!clientId) throw new Error("Add your Google OAuth client ID in Settings first.");
  const auth = await authorize(clientId, { interactive: true });
  const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  if (!r.ok) throw new Error(`Could not read account info (${r.status})`);
  const info = await r.json();
  return { email: info.email.toLowerCase(), name: info.name || "", ...auth };
}

// Return a valid token for the account, refreshing silently (then interactively) when expired.
export async function ensureToken(clientId, account) {
  if (account.token && account.expiry - Date.now() > 60_000) return account;
  let auth;
  try {
    auth = await authorize(clientId, { interactive: false, loginHint: account.email });
  } catch {
    auth = await authorize(clientId, { interactive: true, loginHint: account.email });
  }
  return { ...account, ...auth };
}

export async function sendGmail(account, { toName, toEmail, subject, body, html }) {
  const raw = base64Url(buildMime({
    fromName: account.name, fromEmail: account.email, toName, toEmail, subject, body, html,
  }));
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (r.ok) return;
  const err = await r.json().catch(() => ({}));
  const e = new Error(err.error?.message || `Gmail API error ${r.status}`);
  e.status = r.status;
  throw e;
}
