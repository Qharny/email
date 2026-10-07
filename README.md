# Email Sender

Send one email to many recipients from one or more of your own email accounts. Available as a **browser extension** (Chrome, Edge, Brave) and as a small **local app** that runs in any browser. Everything stays on your machine.

![CI](https://github.com/Qharny/email/actions/workflows/ci.yml/badge.svg)

## Features

- Multiple sender accounts: Gmail via Google sign-in, plus Outlook, Yahoo, iCloud, Zoho or any SMTP server
- Paste many recipients — one per line or comma-separated; duplicates and invalid addresses are filtered
- Each recipient gets an individual email (nobody sees the other addresses)
- Personalisation with `{name}` and `{email}` (use `Jane <jane@example.com>` to supply a name)
- Plain text or HTML messages
- Two modes with several senders: **rotate** (split recipients across senders) or **all** (every sender emails every recipient)
- Configurable delay between emails, live progress and a stop button

## Browser extension

### Install

1. Download `email-sender-extension-vX.Y.Z.zip` from [Releases](https://github.com/Qharny/email/releases) and unzip it into a folder.
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode**, click **Load unpacked**, and select the unzipped folder.
4. Click the **Email Sender** icon in the toolbar. It opens in its own tab — keep that tab open while sending.

### How accounts work

| Account type | How it sends | Needs |
|---|---|---|
| Gmail / Google Workspace | Gmail API, directly from the extension | A Google OAuth client ID (one-time setup below) |
| Outlook, Yahoo, iCloud, other SMTP | Through the companion app on your computer | `python3 app.py` running (see [Local app](#local-app)) |

The Settings panel shows whether the companion app is connected. You only need it for non-Gmail accounts.

### One-time Google setup (for "Sign in with Google")

Browsers don't allow extensions to talk to mail servers directly, so Gmail sending goes through Google's Gmail API, which needs an OAuth client ID:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen** → choose **External**, fill in the app name and your email. Under **Scopes** add `.../auth/gmail.send`. Under **Test users** add every Gmail address that will send.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**. Under **Authorized redirect URIs** add:
   ```
   https://llgaclglhdcidecbnfbfikmfiliakgon.chromiumapp.org/
   ```
5. Copy the client ID (`….apps.googleusercontent.com`) into the extension's **Settings → Google OAuth client ID**, and save.
6. Click **Sign in with Google**. Repeat for each Gmail account you want to send from.

While the consent screen is in *Testing* mode, only the test users you listed can sign in (up to 100) and Google shows an "unverified app" warning — click **Continue**. To open it to everyone, submit the app for Google verification.

To ship a build with the client ID pre-filled, set `GOOGLE_CLIENT_ID` in `extension/config.js`.

## Local app

Also the companion for the extension's SMTP accounts. Requires Python 3.9 or newer, no packages to install.

1. Download `email-sender-vX.Y.Z.zip` from [Releases](https://github.com/Qharny/email/releases) and unzip it
   (or `git clone https://github.com/Qharny/email.git`).
2. Run `python3 app.py` (Windows: `py app.py`). Your browser opens <http://127.0.0.1:8025>, where you can also send without the extension.

### Adding an SMTP sender

Most providers don't accept your normal password over SMTP — create an **App Password**:

- Gmail: turn on 2-Step Verification, then create one at <https://myaccount.google.com/apppasswords>.
- Outlook, Yahoo and iCloud have equivalent app-password pages in their security settings.

Add the account in the extension (**+ Add Outlook / Yahoo / other SMTP account**) or in the local app. It logs in to verify before saving. For unknown providers, fill in the SMTP host and port (465 = SSL, anything else = STARTTLS).

## Data and privacy

- Gmail sign-in tokens (valid for one hour) and settings are kept in the extension's local browser storage.
- SMTP credentials are stored by the local app in `senders.json` (file mode `600`, git-ignored).
- The local app writes every send attempt to `send_log.jsonl` and only listens on `127.0.0.1`.

## Sending responsibly

Providers limit how much you can send (Gmail: roughly 500 recipients/day for personal accounts). Keep a delay of a few seconds between emails and only email people who expect to hear from you, or your account may be flagged.

## Development

```bash
python3 -m unittest discover -s tests -v   # local app
node --test tests/js/lib.test.mjs          # extension
```

To try the extension from source, load the `extension/` folder with **Load unpacked**.

CI runs both test suites on every push and pull request. To release, bump `version` in `extension/manifest.json`, then push a matching tag (e.g. `v1.3.0`): the workflow runs the tests and publishes the extension zip and the local-app zip/tarball as a GitHub Release.
