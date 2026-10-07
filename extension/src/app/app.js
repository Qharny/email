import { DEFAULT_LOCAL_URL, GOOGLE_CLIENT_ID } from "../lib/config.js";
import { ensureToken, sendGmail, signIn } from "../lib/gmail.js";
import { fill, parseRecipients, planTasks } from "../lib/lib.js";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const setMsg = (el, text, kind = "") => { el.className = `msg ${kind}`; el.textContent = text; };

// ---------- state ----------

let settings = { clientId: GOOGLE_CLIENT_ID, localUrl: DEFAULT_LOCAL_URL };
let gmailAccounts = [];   // [{email, name, token, expiry}] in chrome.storage.local
let smtpSenders = [];     // from the companion app's /api/senders
let localOnline = false;

async function loadState() {
  const stored = await chrome.storage.local.get(["settings", "accounts"]);
  settings = { ...settings, ...(stored.settings || {}) };
  if (!settings.clientId) settings.clientId = GOOGLE_CLIENT_ID;
  gmailAccounts = stored.accounts || [];
}

const saveAccounts = () => chrome.storage.local.set({ accounts: gmailAccounts });

async function local(path, body) {
  const r = await fetch(settings.localUrl.replace(/\/$/, "") + path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Companion app error ${r.status}`);
  return data;
}

async function refreshLocal() {
  try {
    smtpSenders = await local("/api/senders");
    localOnline = true;
  } catch {
    smtpSenders = [];
    localOnline = false;
  }
  $("#localDot").classList.toggle("on", localOnline);
  $("#localStatus").textContent = localOnline ? "Companion app connected" : "Companion app offline";
}

// ---------- senders ----------

function allSenders() {
  const gmailSet = new Set(gmailAccounts.map(a => a.email));
  return [
    ...gmailAccounts.map(a => ({ type: "gmail", email: a.email, name: a.name })),
    ...smtpSenders.filter(s => !gmailSet.has(s.email)).map(s => ({ type: "smtp", email: s.email, name: s.name })),
  ];
}

const senderId = s => `${s.type}:${s.email}`;
const typeLabel = s => (s.type === "gmail" ? "Gmail" : "SMTP");

function openAccounts() {
  $("#accountsPanel").open = true;
  $("#accountsPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

// sender ids already shown as pills; any sender not in here yet starts selected
const shownSenders = new Set();

function renderSenders() {
  const list = allSenders();
  const checked = new Set([...document.querySelectorAll("#from input:checked")].map(i => i.value));
  const isChecked = id => checked.has(id) || !shownSenders.has(id);

  $("#from").innerHTML = list.length
    ? list.map(s => `
      <label class="pill" title="${esc(s.name || s.email)}">
        <input type="checkbox" value="${esc(senderId(s))}" ${isChecked(senderId(s)) ? "checked" : ""}>
        <span>${esc(s.email)}</span><small>${typeLabel(s)}</small>
      </label>`).join("")
    : '<span class="empty">No accounts yet. <button type="button" class="link" data-open-accounts>Add one</button></span>';
  list.forEach(s => shownSenders.add(senderId(s)));

  $("#accounts").innerHTML = list.map(s => `
    <div class="row">
      <div class="who">${esc(s.name || s.email)}<small>${esc(s.email)}</small></div>
      <span class="badge">${typeLabel(s)}</span>
      <button type="button" class="link" data-del="${esc(senderId(s))}">Remove</button>
    </div>`).join("");
}

$("#manageBtn").addEventListener("click", openAccounts);
$("#from").addEventListener("click", e => e.target.closest("[data-open-accounts]") && openAccounts());

$("#accounts").addEventListener("click", async e => {
  const id = e.target.dataset.del;
  if (!id) return;
  const type = id.slice(0, id.indexOf(":")), email = id.slice(id.indexOf(":") + 1);
  if (!confirm(`Remove ${email}?`)) return;
  if (type === "gmail") {
    gmailAccounts = gmailAccounts.filter(a => a.email !== email);
    await saveAccounts();
  } else {
    await local("/api/senders/delete", { email }).catch(err => alert(err.message));
    await refreshLocal();
  }
  renderSenders();
});

$("#googleBtn").addEventListener("click", async () => {
  const msg = $("#googleMsg");
  if (!settings.clientId) {
    $("#settingsPanel").open = true;
    return setMsg(msg, "Add a Google OAuth client ID in Settings first.", "err");
  }
  setMsg(msg, "Waiting for Google…");
  try {
    const acct = await signIn(settings.clientId);
    gmailAccounts = [...gmailAccounts.filter(a => a.email !== acct.email), acct];
    await saveAccounts();
    renderSenders();
    setMsg(msg, `Signed in as ${acct.email}`, "ok");
  } catch (err) {
    setMsg(msg, err.message, "err");
  }
});

$("#smtpForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.target.querySelector("button"), msg = $("#smtpMsg");
  if (!localOnline) await refreshLocal();
  if (!localOnline) return setMsg(msg, "Start the companion app first: python3 app.py", "err");
  btn.disabled = true;
  setMsg(msg, "Logging in…");
  try {
    await local("/api/senders", Object.fromEntries(new FormData(e.target)));
    e.target.reset();
    setMsg(msg, "Account saved.", "ok");
    await refreshLocal();
    renderSenders();
  } catch (err) {
    setMsg(msg, err.message, "err");
  }
  btn.disabled = false;
});

// ---------- settings ----------

$("#redirectUri").textContent = chrome.identity.getRedirectURL();

$("#settingsForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  settings = { clientId: f.get("clientId").trim(), localUrl: f.get("localUrl").trim() || DEFAULT_LOCAL_URL };
  await chrome.storage.local.set({ settings });
  setMsg($("#settingsMsg"), "Saved.", "ok");
  await refreshLocal();
  renderSenders();
});

// ---------- sending ----------

$("#recipients").addEventListener("input", e => {
  $("#rcount").textContent = plural(parseRecipients(e.target.value).recipients.length, "recipient");
});

let job = null;

window.addEventListener("beforeunload", e => {
  if (job?.running) e.preventDefault();
});

$("#cancelBtn").addEventListener("click", () => job && (job.cancel = true));

async function sendOne(task, { subject, body, html }) {
  const { sender, recipient } = task;
  if (sender.type === "gmail") {
    const i = gmailAccounts.findIndex(a => a.email === sender.email);
    if (i < 0) throw new Error("Account was removed");
    gmailAccounts[i] = await ensureToken(settings.clientId, gmailAccounts[i]);
    await saveAccounts();
    await sendGmail(gmailAccounts[i], {
      toName: recipient.name, toEmail: recipient.email, html,
      subject: fill(subject, recipient.name, recipient.email),
      body: fill(body, recipient.name, recipient.email),
    });
  } else {
    // the companion app fills {name}/{email} itself
    await local("/api/send-one", { from: sender.email, to: recipient.email, name: recipient.name, subject, body, html });
  }
}

function renderJob() {
  const done = job.sent + job.failed;
  $("#pBar").style.width = job.total ? `${(done / job.total) * 100}%` : "0";
  $("#pTotal").textContent = `${done} / ${job.total}`;
  $("#pSent").textContent = `${job.sent} sent`;
  $("#pFailed").textContent = `${job.failed} failed`;
  $("#pLog").innerHTML =
    job.invalid.map(x => `<div class="err">skipped invalid address: ${esc(x)}</div>`).join("") +
    job.results.slice().reverse().map(r =>
      `<div class="${r.ok ? "ok" : "err"}">${r.ok ? "✓" : "✕"} ${esc(r.to)} <span class="via">via ${esc(r.from)}</span>${r.ok ? "" : ` · ${esc(r.error)}`}</div>`).join("");
}

$("#sendForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.target), msg = $("#sendMsg");
  const chosen = new Set([...document.querySelectorAll("#from input:checked")].map(i => i.value));
  const senders = allSenders().filter(s => chosen.has(senderId(s)));
  const { recipients, invalid } = parseRecipients(f.get("recipients"));
  const content = { subject: f.get("subject"), body: f.get("body"), html: f.has("html") };

  if (!senders.length) return setMsg(msg, "Pick at least one sender", "err");
  if (!recipients.length) return setMsg(msg, "Add at least one valid recipient", "err");
  if (!content.subject.trim() || !content.body.trim()) return setMsg(msg, "Subject and message are required", "err");
  if (senders.some(s => s.type === "smtp") && !localOnline) {
    return setMsg(msg, "SMTP accounts need the companion app running (python3 app.py)", "err");
  }

  const tasks = planTasks(senders, recipients, f.get("mode"));
  if (!confirm(`Send ${plural(tasks.length, "email")} from ${plural(senders.length, "account")}?`)) return;
  setMsg(msg, "");

  const delay = Math.max(0, Number(f.get("delay")) || 0) * 1000;
  job = { running: true, cancel: false, total: tasks.length, sent: 0, failed: 0, results: [], invalid };
  $("#sendBtn").disabled = true;
  $("#progress").hidden = false;
  $("#cancelBtn").hidden = false;
  $("#keepOpen").hidden = false;
  $("#pStatus").textContent = "Sending…";
  renderJob();

  for (let i = 0; i < tasks.length && !job.cancel; i++) {
    const entry = { from: tasks[i].sender.email, to: tasks[i].recipient.email };
    try {
      await sendOne(tasks[i], content);
      entry.ok = true;
      job.sent++;
    } catch (err) {
      entry.ok = false;
      entry.error = err.message;
      job.failed++;
    }
    job.results.push(entry);
    renderJob();
    // sleep in short steps so Stop responds quickly
    for (let t = 0; i < tasks.length - 1 && t < delay && !job.cancel; t += 200) await sleep(Math.min(200, delay - t));
  }

  job.running = false;
  $("#pStatus").textContent = job.cancel ? "Stopped" : "Finished";
  $("#cancelBtn").hidden = true;
  $("#keepOpen").hidden = true;
  $("#sendBtn").disabled = false;
});

// ---------- init ----------

await loadState();
$("[name=clientId]").value = settings.clientId;
$("[name=localUrl]").value = settings.localUrl;
renderSenders();
await refreshLocal();
renderSenders();
if (!allSenders().length) $("#accountsPanel").open = true;
