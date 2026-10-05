# Email Sender

A small local tool for sending one email to many recipients from one or more of your own email accounts. It runs in your browser, uses only the Python standard library, and keeps everything on your machine.

![CI](https://github.com/Qharny/email/actions/workflows/ci.yml/badge.svg)

## Features

- Multiple sender accounts (Gmail, Outlook, Yahoo, iCloud, Zoho auto-configured; any SMTP server works)
- Paste many recipients — one per line or comma-separated; duplicates and invalid addresses are filtered
- Each recipient gets an individual email (nobody sees the other addresses)
- Personalisation with `{name}` and `{email}` (use `Jane <jane@example.com>` to supply a name)
- Plain text or HTML messages
- Two modes with several senders: **rotate** (split recipients across senders) or **all** (every sender emails every recipient)
- Configurable delay between emails, live progress, stop button, and a send log

## Install

Requires Python 3.9 or newer. No packages to install.

1. Download the latest `email-sender-vX.Y.Z.zip` from [Releases](https://github.com/Qharny/email/releases) and unzip it
   (or `git clone https://github.com/Qharny/email.git`).
2. Run:
   ```bash
   python3 app.py
   ```
   On Windows: `py app.py`
3. Your browser opens <http://127.0.0.1:8025>.

## Adding a Gmail sender

Gmail does not accept your normal password over SMTP. Create an **App Password**:

1. Turn on 2-Step Verification for your Google account.
2. Go to <https://myaccount.google.com/apppasswords>, create a password, and copy the 16 characters.
3. In the app, click **+ Add sender account**, enter your address and that app password. The app logs in to verify it before saving.

Outlook, Yahoo and iCloud work the same way with their own app passwords. For other providers, fill in the SMTP host and port (465 = SSL, anything else = STARTTLS).

## Data and privacy

- Sender credentials are stored locally in `senders.json` (file mode `600`, git-ignored).
- Every send attempt is appended to `send_log.jsonl`.
- The server only listens on `127.0.0.1`, so it isn't reachable from other machines.

## Sending responsibly

Providers limit how much you can send (Gmail: roughly 500 recipients/day for personal accounts). Keep a delay of a few seconds between emails and only email people who expect to hear from you, or your account may be flagged.

## Development

```bash
python3 -m unittest discover -s tests -v
```

CI runs the tests on Linux, macOS and Windows for every push and pull request. Pushing a tag like `v1.0.0` runs the tests, builds the zip/tarball and publishes a GitHub Release.
