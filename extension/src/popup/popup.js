"use strict";

const APP_URL = chrome.runtime.getURL("src/app/app.html");

// Focus the composer tab if it's already open, otherwise open one.
document.getElementById("open").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ url: APP_URL });
    if (tab) {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
    } else {
        await chrome.tabs.create({ url: APP_URL });
    }
    window.close();
});

chrome.storage.local.get(["accounts", "settings"], async (data) => {
    const gmail = (data.accounts || []).length;
    const localUrl = (data.settings && data.settings.localUrl) || "http://127.0.0.1:8025";

    let smtp = null;
    try {
        const r = await fetch(localUrl.replace(/\/$/, "") + "/api/senders", { signal: AbortSignal.timeout(1500) });
        if (r.ok) smtp = (await r.json()).length;
    } catch {
        // companion app not running
    }

    const total = gmail + (smtp || 0);
    document.getElementById("senderCount").textContent =
        total ? `${total} sender${total === 1 ? "" : "s"} ready` : "No senders yet";
    document.getElementById("localDot").classList.toggle("on", smtp !== null);
    document.getElementById("localStatus").textContent =
        smtp !== null ? "Companion app connected" : "Companion app offline";
});
