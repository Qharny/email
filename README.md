<div align="center">
  <img src="extension/assets/logo.png" width="150">
  <h1>Email Sender</h1>
</div>

Email Sender is a minimal extension for sending one email to many people from your own Gmail, Outlook or SMTP accounts. Each recipient gets their own copy, personalised with their name.

<p align="center">
  <a rel="noreferrer noopener" href="https://github.com/Qharny/email/releases/latest/download/email-sender-extension.zip">
    <img alt="Download" src="https://img.shields.io/badge/Download-141e24.svg?&style=for-the-badge&logo=github&logoColor=white" />
  </a>
  <a rel="noreferrer noopener" href="#installation-chrome-microsoft-edge-or-brave">
    <img alt="Chrome" src="https://img.shields.io/badge/Chrome-141e24.svg?&style=for-the-badge&logo=google-chrome&logoColor=white" />
  </a>
  <a rel="noreferrer noopener" href="#installation-chrome-microsoft-edge-or-brave">
    <img alt="Microsoft Edge" src="https://img.shields.io/badge/Edge-141e24.svg?&style=for-the-badge" />
  </a>
  <a rel="noreferrer noopener" href="#installation-chrome-microsoft-edge-or-brave">
    <img alt="Brave" src="https://img.shields.io/badge/Brave-141e24.svg?&style=for-the-badge&logo=brave&logoColor=white" />
  </a>
</p>

<p align="center">
  <img src="assets/screenshot.png" width="1080" alt="Email Sender in Google Chrome">
</p>

## Setup guide

Setup has three parts: **install the extension** (2 minutes), **connect Gmail** (about 10 minutes, once), and optionally **connect Outlook, Yahoo or other accounts**.

## Installation (Chrome, Microsoft Edge or Brave)
1. **[Download](https://github.com/Qharny/email/releases/latest/download/email-sender-extension.zip)** `email-sender-extension.zip` and **unzip it into a folder you'll keep** (for example `~/Extensions/email-sender`). The extension stops working if that folder is moved or deleted. You can also **clone this repo** and use the `extension` folder.
2. **Open the extensions page**: `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. **Toggle "Developer mode"** on. This is usually at the top right of the extensions page.
4. Click **_Load unpacked_** and **select the unzipped folder**. It must contain `manifest.json` directly inside it.
5. Click the puzzle-piece icon in the toolbar and **pin** _Email Sender_.
6. **Done!** Click the _Email Sender_ icon, then **Open composer**.

## Connect Gmail
Gmail accounts sign in with Google and send through the Gmail API. For that you create your own free Google Cloud "app", which gives you a **Client ID**. Google sometimes renames these menus; alternative names are given in brackets.

**1. Create a project**
1. Go to **[console.cloud.google.com](https://console.cloud.google.com/)** and sign in.
2. Click the **project picker** (top left), then **New project**. Name it `Email Sender` and click **Create**.
3. Make sure the new project is **selected** in the project picker before continuing.

**2. Enable the Gmail API**
1. Open ☰ → **APIs & Services → Library**.
2. Search for **Gmail API**, open it and click **Enable**.

**3. Set up the consent screen** (what users see when they sign in)
1. Open ☰ → **APIs & Services → OAuth consent screen** (or **Google Auth Platform**). Click **Get started** if you see it.
2. **App information**: app name `Email Sender`, user support email: your email.
3. **Audience**: choose **External**.
4. **Contact information**: your email. Agree to the policy and click **Create**.

**4. Add the "send email" permission**
1. Go to **Data Access** (or **Scopes**) → **Add or remove scopes**.
2. Search for `gmail.send` and tick **…/auth/gmail.send** ("Send email on your behalf"). If it isn't listed, paste `https://www.googleapis.com/auth/gmail.send` into **Manually add scopes**.
3. Click **Update**, then **Save**.

The extension can only **send** mail. It can't read your inbox.

**5. Add test users**
1. Go to **Audience** (or **OAuth consent screen → Test users**).
2. Under **Test users**, click **Add users**, enter **every Gmail address you'll send from**, and click **Save**.

Only addresses on this list can sign in (up to 100).

**6. Create the Client ID**
1. Go to **Clients** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**) → **Create client**.
2. **Application type**: **Web application**. Don't pick "Chrome extension": that type doesn't work in Edge or Brave.
3. **Name**: `Email Sender extension`.
4. Under **Authorized redirect URIs**, click **Add URI** and paste this exactly, including the slash at the end:
   ```
   https://llgaclglhdcidecbnfbfikmfiliakgon.chromiumapp.org/
   ```
5. Click **Create** and **copy the Client ID** (it looks like `123456789-abc….apps.googleusercontent.com`). You **don't** need the client secret; don't share it or put it anywhere.

**7. Connect the extension**
1. In the composer, open **Settings** at the bottom.
2. Check that the **Redirect URI** shown there matches the one you registered in step 6.
3. Paste your **Client ID** and click **Save**.
4. Open **Accounts** → **Sign in with Google** and pick your Gmail account.
5. You'll see **"Google hasn't verified this app"**. That's expected for your own app: click **Continue**.
6. Allow **"Send email on your behalf"**. Your address appears as a **Gmail** pill under **From**.
7. Repeat steps 4–6 for each extra Gmail account. Each one must be a test user from step 5.

**8. Send a test**
1. Put **your own address** in **To**, write a subject and message, and click **Send**.
2. Check your inbox, and the Sent folder of the account you sent from.

## Connect Outlook, Yahoo or other accounts
Browsers can't talk to mail servers directly, so these accounts send through a small companion app on your computer.
1. Check you have **Python 3.9 or newer**: `python3 --version`.
2. **[Download](https://github.com/Qharny/email/releases/latest/download/email-sender.zip)** `email-sender.zip`, unzip it and **run** `python3 app.py` in that folder (Windows: `py app.py`). Keep it running while you send. It also opens a standalone web version at `http://127.0.0.1:8025`.
3. **Create an app password** for the account. Your normal password won't work.
   - **Outlook**: account.microsoft.com → Security → Advanced security options → App passwords (needs 2-step verification on).
   - **Yahoo**: Account security → Generate app password.
   - **Gmail via this route**: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
4. In the composer, open **Accounts → Add Outlook, Yahoo or another SMTP account**, enter the email and app password, leave host and port on **auto**, and click **Verify & save**.
5. The account appears as an **SMTP** pill. The green dot in **Settings** and in the popup shows the companion app is connected.

## Share it with others
**Pre-fill the Client ID** so people who install your build don't have to paste anything:
1. Set `export const GOOGLE_CLIENT_ID = "your-id.apps.googleusercontent.com";` in `extension/src/lib/config.js`. The Client ID isn't a secret, so it's safe to commit. Never commit the client secret.
2. Bump `"version"` in `extension/manifest.json` (for example `1.3.1`).
3. Commit, then `git tag v1.3.1 && git push origin main v1.3.1`. GitHub Actions publishes the release.

Until Google verifies your app, everyone must still be on your **test users** list. To go past 100 users and remove the "unverified app" warning, fill in **Branding → App domain** (or **OAuth consent screen → App domain**) with this project's website, then start verification from **Verification Center** (or **Publish app**). Sending email is a "sensitive" permission, so Google will also ask for a short demo video.

| Field | Value |
|---|---|
| Application home page | `https://qharny.github.io/email/` |
| Privacy policy link | `https://qharny.github.io/email/privacy.html` |
| Terms of service link | `https://qharny.github.io/email/terms.html` |
| Authorized domains | `qharny.github.io` |

## Troubleshooting
| What you see | Fix |
|---|---|
| `redirect_uri_mismatch` | The URI in Google Cloud must exactly match the one in **Settings**, including `https://` and the slash at the end. |
| "Access blocked: … has not completed the Google verification process" | That Gmail address isn't a test user. Add it under **Audience → Test users**. |
| "Gmail API has not been used in project…" | Enable the Gmail API (step 2), wait a minute and try again. |
| "Add a Google OAuth client ID in Settings first" | Paste the Client ID in **Settings** and click **Save**. |
| A Google window pops up while sending | Sign-ins last one hour. The extension renews them silently when it can, otherwise it asks you to confirm. |
| "Companion app offline" | Start `python3 app.py` and keep it running. |
| SMTP "Login failed" | Use an app password, not your normal password, and make sure 2-step verification is on. |

## Good to know
- **Recipients**: one per line or comma-separated; write `Jane Doe <jane@example.com>` to fill `{name}`. Duplicates and invalid addresses are skipped.
- **Several senders**: they either _take turns_ (recipients are split between them) or _all send to everyone_.
- **Limits**: providers cap daily sending (Gmail: about 500 recipients a day). Keep a delay of a few seconds and only email people who expect it.
- **Privacy**: Gmail tokens and settings stay in the extension's local storage. SMTP passwords stay in `senders.json` next to `app.py` (owner-only, git-ignored), and the companion app only listens on `127.0.0.1`.

## Development
```bash
python3 -m unittest discover -s tests -v   # companion app
node --test tests/js/lib.test.mjs          # extension
```
Load the `extension` folder with **_Load unpacked_** to try changes. To release, bump `version` in `extension/manifest.json` and push a matching tag (e.g. `v1.3.0`); GitHub Actions runs the tests and publishes the zips.

## License

[MIT](LICENSE)

### Related

Design inspired by [Minimal YouTube](https://github.com/ephraimduncan/minimal-youtube).
