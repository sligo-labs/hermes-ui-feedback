const BRIDGE = "https://feedback.sligolabs.com";
const RELEASES_API = "https://api.github.com/repos/sligo-labs/hermes-ui-feedback/releases/latest";
const VERSION_CACHE_KEY = "latest-release-status";
const VERSION_CACHE_TTL = 6 * 60 * 60 * 1000;

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
      case "version-status":
        return latestReleaseStatus();
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

async function latestReleaseStatus() {
  const installed = chrome.runtime.getManifest().version;
  const cached = await chrome.storage.local.get(VERSION_CACHE_KEY);
  const cachedStatus = cached[VERSION_CACHE_KEY];
  if (cachedStatus?.latest && cachedStatus.checkedAt && Date.now() - cachedStatus.checkedAt < VERSION_CACHE_TTL) {
    return {
      ...cachedStatus,
      installed,
      updateAvailable: isNewerVersion(cachedStatus.latest, installed),
    };
  }

  try {
    const response = await fetch(RELEASES_API, {
      headers: { accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
    const release = await response.json();
    const latest = typeof release.tag_name === "string" ? release.tag_name.replace(/^v/, "") : "";
    if (!latest) throw new Error("GitHub returned no release version.");
    const status = {
      checkedAt: Date.now(),
      installed,
      latest,
      updateAvailable: isNewerVersion(latest, installed),
    };
    await chrome.storage.local.set({ [VERSION_CACHE_KEY]: status });
    return status;
  } catch {
    return cachedStatus ?? { installed, latest: "", updateAvailable: false };
  }
}

function isNewerVersion(candidate, installed) {
  const left = candidate.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = installed.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) > (right[index] ?? 0);
  }
  return false;
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
