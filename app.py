#!/usr/bin/env python3
"""Local email automation tool.

Run:  python3 app.py   then open http://127.0.0.1:8025

- Add one or more sender accounts (SMTP; Gmail needs an App Password).
- Write a subject + body, paste many recipients, pick senders, send.
- Each recipient gets their own individual email ({name} / {email} placeholders supported).
"""
import json
import os
import re
import smtplib
import ssl
import threading
import time
import uuid
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HOST, PORT = "127.0.0.1", 8025
BASE = Path(__file__).parent
SENDERS_FILE = BASE / "senders.json"
LOG_FILE = BASE / "send_log.jsonl"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SMTP_PRESETS = {
    "gmail.com": ("smtp.gmail.com", 465),
    "googlemail.com": ("smtp.gmail.com", 465),
    "outlook.com": ("smtp-mail.outlook.com", 587),
    "hotmail.com": ("smtp-mail.outlook.com", 587),
    "live.com": ("smtp-mail.outlook.com", 587),
    "yahoo.com": ("smtp.mail.yahoo.com", 465),
    "icloud.com": ("smtp.mail.me.com", 587),
    "zoho.com": ("smtp.zoho.com", 465),
}

lock = threading.Lock()
jobs = {}


# ---------- sender storage ----------

def load_senders():
    if not SENDERS_FILE.exists():
        return []
    return json.loads(SENDERS_FILE.read_text())


def save_senders(senders):
    SENDERS_FILE.write_text(json.dumps(senders, indent=2))
    os.chmod(SENDERS_FILE, 0o600)  # contains passwords: owner-only


def public_sender(s):
    return {k: v for k, v in s.items() if k != "password"}


# ---------- smtp ----------

def connect(sender):
    host, port = sender["host"], int(sender["port"])
    ctx = ssl.create_default_context()
    if port == 465:
        conn = smtplib.SMTP_SSL(host, port, context=ctx, timeout=30)
    else:
        conn = smtplib.SMTP(host, port, timeout=30)
        conn.starttls(context=ctx)
    conn.login(sender["email"], sender["password"])
    return conn


def build_message(sender, to_name, to_email, subject, body, is_html):
    fill = lambda t: t.replace("{name}", to_name or "").replace("{email}", to_email)
    msg = EmailMessage()
    msg["From"] = formataddr((sender.get("name") or "", sender["email"]))
    msg["To"] = formataddr((to_name, to_email))
    msg["Subject"] = fill(subject)
    msg["Message-ID"] = make_msgid(domain=sender["email"].split("@")[1])
    text = fill(body)
    if is_html:
        msg.set_content(re.sub(r"<[^>]+>", "", text))
        msg.add_alternative(text, subtype="html")
    else:
        msg.set_content(text)
    return msg


def parse_recipients(raw):
    seen, out, invalid = set(), [], []
    for item in re.split(r"[\n,;]+", raw):
        item = item.strip()
        if not item:
            continue
        name, addr = parseaddr(item)
        addr = addr.strip().lower()
        if not EMAIL_RE.match(addr):
            invalid.append(item)
        elif addr not in seen:
            seen.add(addr)
            out.append((name, addr))
    return out, invalid


def run_job(job_id, senders, recipients, subject, body, is_html, mode, delay):
    job = jobs[job_id]
    # "rotate": spread recipients across senders; "all": every sender emails every recipient
    if mode == "all":
        tasks = [(s, r) for s in senders for r in recipients]
    else:
        tasks = [(senders[i % len(senders)], r) for i, r in enumerate(recipients)]
    job["total"] = len(tasks)
    conns = {}
    try:
        for i, (sender, (name, addr)) in enumerate(tasks):
            if job["cancel"]:
                job["status"] = "cancelled"
                break
            entry = {"from": sender["email"], "to": addr, "time": time.strftime("%Y-%m-%d %H:%M:%S")}
            msg = build_message(sender, name, addr, subject, body, is_html)
            for attempt in range(2):
                try:
                    if sender["email"] not in conns:
                        conns[sender["email"]] = connect(sender)
                    conns[sender["email"]].send_message(msg)
                    entry["ok"] = True
                    break
                except (smtplib.SMTPServerDisconnected, smtplib.SMTPSenderRefused, OSError) as e:
                    conns.pop(sender["email"], None)  # reconnect once, then give up
                    entry.update(ok=False, error=str(e))
                except smtplib.SMTPException as e:
                    entry.update(ok=False, error=str(e))
                    break
            with lock:
                job["results"].append(entry)
                job["sent" if entry["ok"] else "failed"] += 1
            with LOG_FILE.open("a") as f:
                f.write(json.dumps({**entry, "subject": subject}) + "\n")
            if delay and i < len(tasks) - 1:
                time.sleep(delay)
        else:
            job["status"] = "done"
    except Exception as e:
        job.update(status="error", error=str(e))
    finally:
        for c in conns.values():
            try:
                c.quit()
            except Exception:
                pass


# ---------- http ----------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":
            body = (BASE / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif url.path == "/api/senders":
            self.send_json([public_sender(s) for s in load_senders()])
        elif url.path == "/api/job":
            job = jobs.get(parse_qs(url.query).get("id", [""])[0])
            if not job:
                return self.send_json({"error": "Unknown job"}, 404)
            with lock:
                self.send_json({k: v for k, v in job.items() if k != "cancel"})
        else:
            self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        data = self.read_json()

        if path == "/api/senders":
            addr = (data.get("email") or "").strip().lower()
            if not EMAIL_RE.match(addr) or not data.get("password"):
                return self.send_json({"error": "Email and password are required"}, 400)
            host, port = SMTP_PRESETS.get(addr.split("@")[1], (None, None))
            sender = {
                "email": addr,
                "name": (data.get("name") or "").strip(),
                "password": data["password"].replace(" ", ""),
                "host": (data.get("host") or "").strip() or host,
                "port": int(data.get("port") or port or 587),
            }
            if not sender["host"]:
                return self.send_json({"error": "Unknown provider: enter the SMTP host"}, 400)
            try:
                connect(sender).quit()
            except Exception as e:
                return self.send_json({"error": f"Login failed: {e}"}, 400)
            senders = [s for s in load_senders() if s["email"] != addr] + [sender]
            save_senders(senders)
            return self.send_json(public_sender(sender))

        if path == "/api/senders/delete":
            save_senders([s for s in load_senders() if s["email"] != data.get("email")])
            return self.send_json({"ok": True})

        if path == "/api/send":
            chosen = set(data.get("senders") or [])
            senders = [s for s in load_senders() if s["email"] in chosen]
            recipients, invalid = parse_recipients(data.get("recipients") or "")
            subject, body = data.get("subject") or "", data.get("body") or ""
            if not senders:
                return self.send_json({"error": "Pick at least one sender"}, 400)
            if not recipients:
                return self.send_json({"error": "Add at least one valid recipient"}, 400)
            if not subject.strip() or not body.strip():
                return self.send_json({"error": "Subject and body are required"}, 400)
            job_id = uuid.uuid4().hex[:8]
            jobs[job_id] = {"id": job_id, "status": "running", "total": 0, "sent": 0,
                            "failed": 0, "results": [], "invalid": invalid, "cancel": False}
            threading.Thread(target=run_job, daemon=True, args=(
                job_id, senders, recipients, subject, body, bool(data.get("html")),
                data.get("mode", "rotate"), max(0.0, float(data.get("delay") or 0)),
            )).start()
            return self.send_json({"id": job_id})

        if path == "/api/job/cancel":
            if data.get("id") in jobs:
                jobs[data["id"]]["cancel"] = True
            return self.send_json({"ok": True})

        self.send_json({"error": "Not found"}, 404)


if __name__ == "__main__":
    import webbrowser

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print(f"Email automation running at {url}  (Ctrl+C to stop)")
    threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
