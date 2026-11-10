const settingsApi = WebTimizeSettings;
const presentation = WebTimizePresentation;
const browserApi = WebTimizeBrowser;
const elements = {
  globalToggle: document.getElementById("globalToggle"),
  globalState: document.getElementById("globalState"),
  globalNote: document.getElementById("globalNote"),
  errorBanner: document.getElementById("errorBanner"),
  siteCard: document.getElementById("siteCard"),
  siteName: document.getElementById("siteName"),
  siteHost: document.getElementById("siteHost"),
  siteStatus: document.getElementById("siteStatus"),
  siteNote: document.getElementById("siteNote"),
  siteModeInherit: document.getElementById("siteModeInherit"),
  siteModeEnabled: document.getElementById("siteModeEnabled"),
  siteModePaused: document.getElementById("siteModePaused"),
  cleanupToggle: document.getElementById("cleanupToggle"),
  layoutToggle: document.getElementById("layoutToggle"),
  networkToggle: document.getElementById("networkToggle"),
  networkHint: document.getElementById("networkHint"),
  staleWarning: document.getElementById("staleWarning"),
  profileMeta: document.getElementById("profileMeta"),
  unsupportedCard: document.getElementById("unsupportedCard"),
  unsupportedTitle: document.getElementById("unsupportedTitle"),
  settingsButton: document.getElementById("settingsButton"),
  saveState: document.getElementById("saveState"),
  version: document.getElementById("version")
};

let settings = settingsApi.normalize(settingsApi.DEFAULT_SETTINGS);
let tab;
let hostname = "";
let profile = null;
let loadError = "";
let ready = false;
let queuedSave = null;
let draining = false;

function showError(message) {
  elements.errorBanner.textContent = message;
  elements.errorBanner.hidden = !message;
}

function showSaveState(message, failed = false) {
  elements.saveState.textContent = message;
  elements.saveState.classList.toggle("error", failed);
}

function featureInputs() {
  return [elements.cleanupToggle, elements.layoutToggle, elements.networkToggle];
}

function render() {
  elements.globalToggle.disabled = !ready;
  elements.globalToggle.checked = settings.enabled;
  elements.globalState.textContent = settings.enabled ? "On" : "Off";
  elements.globalState.classList.toggle("off", !settings.enabled);
  elements.globalNote.textContent = settings.enabled
    ? "Profiles are active on supported sites."
    : "Every site is left unchanged until you turn protection back on.";

  const site = hostname ? settingsApi.siteFor(settings, hostname) : null;
  if (!profile) {
    elements.siteCard.hidden = true;
    elements.unsupportedCard.hidden = false;
    elements.unsupportedTitle.textContent = loadError || presentation.unsupportedTitle(hostname);
    for (const input of [...document.querySelectorAll('input[name="siteMode"]'), ...featureInputs()]) {
      input.disabled = true;
    }
    return;
  }

  const view = presentation.siteView(profile, settings, hostname);
  elements.siteCard.hidden = false;
  elements.unsupportedCard.hidden = true;
  elements.siteName.textContent = profile.name;
  elements.siteHost.textContent = hostname;
  elements.siteStatus.textContent = view.statusText;
  elements.siteStatus.className = `status ${view.mode}`;
  elements.siteNote.textContent = view.siteNote;
  elements.siteNote.hidden = view.mode === "inherit";

  elements.siteModeInherit.checked = view.mode === "inherit";
  elements.siteModeEnabled.checked = view.mode === "enabled";
  elements.siteModePaused.checked = view.mode === "paused" || view.mode === "excepted";
  for (const input of document.querySelectorAll('input[name="siteMode"]')) input.disabled = !ready;

  elements.cleanupToggle.checked = view.cleanupOn;
  elements.layoutToggle.checked = view.layoutOn;
  elements.networkToggle.checked = view.networkOn;
  const active = Boolean(site?.enabled);
  elements.cleanupToggle.disabled = !ready || !active || !view.cleanupAvailable;
  elements.layoutToggle.disabled = !ready || !active || !view.layoutAvailable;
  elements.networkToggle.disabled = !ready || !active || !view.networkAvailable;

  elements.networkHint.hidden = view.networkAvailable;
  elements.networkHint.textContent = view.networkHint;
  elements.staleWarning.hidden = !view.stale;
  elements.staleWarning.textContent = view.staleText;
  elements.profileMeta.textContent = `${view.profileMeta} · ${view.inheritanceText}`;
}

async function refreshTab() {
  if (!tab?.id) return;
  try {
    await browserApi.tabs.sendMessage(tab.id, { type: "webtim:refresh" });
  } catch {
    // The active tab has no content script (unsupported page or reload in progress).
  }
}

async function drainSaves() {
  if (draining) return;
  draining = true;
  showSaveState("Saving…");
  try {
    while (queuedSave) {
      const value = queuedSave;
      queuedSave = null;
      const saved = await settingsApi.save(value);
      if (!queuedSave) settings = saved;
      render();
    }
    showSaveState("Saved");
    await refreshTab();
  } catch (error) {
    console.warn("WebTimize Live popup: save failed", error);
    showError("Settings could not be saved. Try again.");
    showSaveState("Not saved", true);
  } finally {
    draining = false;
    if (queuedSave) drainSaves();
  }
}

function commit(next) {
  settings = next;
  render();
  queuedSave = settings;
  drainSaves();
}

function setSiteMode(mode) {
  if (!hostname) return;
  let next = settingsApi.removeException(settings, hostname);
  if (mode === "paused") {
    next = settingsApi.setSite(next, hostname, { enabled: false });
  } else if (mode === "enabled") {
    next = settingsApi.setSite(next, hostname, { enabled: true });
  } else {
    next = settingsApi.setSite(next, hostname, { enabled: null });
  }
  commit(next);
}

elements.globalToggle.addEventListener("change", () => {
  commit({ ...settings, enabled: elements.globalToggle.checked });
});

for (const input of document.querySelectorAll('input[name="siteMode"]')) {
  input.addEventListener("change", () => {
    if (input.checked) setSiteMode(input.value);
  });
}

elements.cleanupToggle.addEventListener("change", () => {
  commit(settingsApi.setSite(settings, hostname, { cleanup: elements.cleanupToggle.checked }));
});

elements.layoutToggle.addEventListener("change", () => {
  commit(settingsApi.setSite(settings, hostname, { layout: elements.layoutToggle.checked }));
});

elements.networkToggle.addEventListener("change", () => {
  commit(settingsApi.setSite(settings, hostname, { network: elements.networkToggle.checked }));
});

elements.settingsButton.addEventListener("click", () => {
  browserApi.runtime.openOptionsPage().catch((error) => {
    showError(`Settings could not be opened: ${error.message}`);
  });
});

try {
  browserApi.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[settingsApi.STORAGE_KEY]) return;
    settings = settingsApi.normalize(changes[settingsApi.STORAGE_KEY].newValue);
    render();
    if (ready) showSaveState("Updated");
  });
} catch (error) {
  console.warn("WebTimize Live popup: cannot watch settings", error);
}

function isExtensionPage(value) {
  try {
    const { protocol } = new URL(value || "");
    return protocol === "moz-extension:" || protocol === "chrome-extension:";
  } catch {
    return false;
  }
}

async function activeTab() {
  let [candidate] = await browserApi.tabs.query({ active: true, currentWindow: true });
  if (candidate && !isExtensionPage(candidate.url)) return candidate;
  const active = await browserApi.tabs.query({ active: true });
  return active.find((item) => !isExtensionPage(item.url)) || candidate;
}

async function init() {
  elements.version.textContent = `v${browserApi.runtime.getManifest().version}`;
  settings = await settingsApi.get();
  tab = await activeTab();
  try {
    hostname = new URL(tab?.url || "").hostname;
  } catch {
    hostname = "";
  }
  if (hostname) {
    try {
      const response = await browserApi.runtime.sendMessage({ type: "webtim:get-profile", hostname });
      if (response?.error) loadError = "The extension background is not responding. Reload the extension.";
      profile = response?.profile || null;
    } catch (error) {
      console.warn("WebTimize Live popup: profile lookup failed", error);
      loadError = "The extension background is not responding. Reload the extension.";
      profile = null;
    }
  }
  ready = true;
  render();
  showSaveState("Saved");
}

init().catch((error) => {
  console.warn("WebTimize Live popup:", error);
  profile = null;
  loadError = "Could not load WebTimize Live. Open the extension settings and reload.";
  ready = true;
  render();
  showSaveState("Not loaded", true);
});
