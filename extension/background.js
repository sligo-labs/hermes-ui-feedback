const BRIDGE = "https://feedback.sligolabs.com";

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null || !/^https?:/.test(tab.url ?? "")) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["annotate.js"],
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  const storageKey = tabId == null ? null : `notes:${tabId}`;

  async function handle() {
    switch (message?.type) {
      case "load-notes": {
        if (!storageKey) return { notes: [] };
        const saved = await chrome.storage.session.get(storageKey);
        return { notes: saved[storageKey] ?? [] };
      }
      case "save-notes": {
        if (!storageKey || !Array.isArray(message.notes)) return { ok: false };
        await chrome.storage.session.set({
          [storageKey]: message.notes.slice(0, 50),
        });
        return { ok: true };
      }
      case "submit": {
        if (sender.tab?.windowId == null) throw new Error("No active browser tab.");
        const screenshot = await chrome.tabs.captureVisibleTab(
          sender.tab.windowId,
          { format: "png" },
        );
        return request("/api/feedback", {
          method: "POST",
          body: JSON.stringify({ ...message.payload, screenshot }),
        });
      }
      default:
        return { error: "Unknown extension message." };
    }
  }

  handle().then(
    (value) => sendResponse(value),
    (error) => sendResponse({ error: errorMessage(error) }),
  );
  return true;
});

async function request(path, init = {}) {
  await authenticate();
  const response = await fetch(`${BRIDGE}${path}`, {
    ...init,
    credentials: "include",
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(value.error || `Bridge returned ${response.status}.`);
  }
  return value;
}

async function authenticate() {
  const details = { url: `${BRIDGE}/auth`, interactive: false };
  try {
    await chrome.identity.launchWebAuthFlow(details);
  } catch {
    try {
      await chrome.identity.launchWebAuthFlow({ ...details, interactive: true });
    } catch {
      throw new Error("Sligo Access authorization was not completed.");
    }
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
