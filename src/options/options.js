const settingsApi = WebTimizeSettings;
const presentation = WebTimizePresentation;
const profileApi = WebTimizeProfile;
const browserApi = WebTimizeBrowser;
const elements = {
  globalToggle: document.getElementById("globalToggle"),
  defaultCleanup: document.getElementById("defaultCleanup"),
  defaultLayout: document.getElementById("defaultLayout"),
  defaultNetwork: document.getElementById("defaultNetwork"),
  sitesList: document.getElementById("sitesList"),
  exceptionForm: document.getElementById("exceptionForm"),
  exceptionInput: document.getElementById("exceptionInput"),
  exceptionsList: document.getElementById("exceptionsList"),
  diagnostics: document.getElementById("diagnostics"),
  syncRulesButton: document.getElementById("syncRulesButton"),
  restoreButton: document.getElementById("restoreButton"),
  saveState: document.getElementById("saveState")
};

let settings = settingsApi.normalize(settingsApi.DEFAULT_SETTINGS);
let profiles = [];
let flashTimer;

function flash(message, failed = false) {
  elements.saveState.textContent = message;
  elements.saveState.classList.toggle("error", failed);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    elements.saveState.textContent = "Saved to browser sync";
    elements.saveState.classList.remove("error");
  }, 2400);
}

let writeQueue = Promise.resolve();

function persist(next) {
  settings = next;
  render();
  writeQueue = writeQueue
    .then(async () => {
      settings = await settingsApi.save(settings);
      render();
      flash("Saved to browser sync");
    })
    .catch((error) => {
      console.warn("WebTimize Live options: save failed", error);
      flash("Could not save settings", true);
    });
  return writeQueue;
}

function toggle(checked, label, onChange, disabled = false) {
  const wrapper = document.createElement("label");
  wrapper.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.disabled = disabled;
  input.setAttribute("aria-label", label);
  input.addEventListener("change", () => onChange(input.checked));
  const slider = document.createElement("span");
  slider.className = "slider";
  wrapper.append(input, slider);
  return wrapper;
}

function featureRow(profile, view, key, label) {
  const available = key === "network" ? view.networkAvailable : view[`${key}Available`];
  const wrapper = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(available && view[`${key}On`]);
  input.disabled = !available;
  input.addEventListener("change", () => {
    persist(settingsApi.setSite(settings, view.key, { [key]: input.checked }));
  });
  const inherited = !settings.sites[view.key] || !Object.prototype.hasOwnProperty.call(settings.sites[view.key], key);
  const suffix = document.createElement("small");
  suffix.textContent = inherited ? "default" : "override";
  wrapper.append(input, document.createTextNode(label), suffix);
  return wrapper;
}

function renderSites() {
  elements.sitesList.replaceChildren();
  if (!profiles.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No profiles are installed.";
    elements.sitesList.append(empty);
    return;
  }
  for (const profile of profiles) {
    const view = presentation.siteView(profile, settings, profile.domains[0]);
    const row = document.createElement("article");
    row.className = "site";

    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = profile.name;
    const meta = document.createElement("p");
    meta.textContent = `${profile.domains.join(", ")} · profile ${profile.version} · tested ${view.testedViewports.length ? view.testedViewports.join(", ") : "never"}`;
    copy.append(title, meta);
    if (view.stale) {
      const stale = document.createElement("p");
      stale.className = "warning";
      stale.textContent = `Check this profile: ${view.staleText}`;
      copy.append(stale);
    }
    if (view.excepted) {
      const excepted = document.createElement("p");
      excepted.className = "muted";
      excepted.textContent = "Excluded by a site exception. Remove the exception to apply this profile.";
      copy.append(excepted);
    }

    row.append(copy, toggle(view.active, `Enable ${profile.name}`, (checked) => {
      persist(settingsApi.setSite(settings, view.key, { enabled: checked }));
    }, !settings.enabled));

    const features = document.createElement("div");
    features.className = "site-features";
    for (const [key, label] of [["cleanup", "Cleanup"], ["layout", "Layout"], ["network", "Network"]]) {
      features.append(featureRow(profile, view, key, label));
    }
    const hasOverrides = Object.keys(settings.sites[view.key] || {}).length > 0;
    if (hasOverrides) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "link-button";
      reset.textContent = "Use defaults";
      reset.setAttribute("aria-label", `Reset ${profile.name} to global defaults`);
      reset.addEventListener("click", () => {
        persist(settingsApi.resetSite(settings, view.key));
        flash("Site reset to defaults");
      });
      features.append(reset);
    }
    row.append(features);
    elements.sitesList.append(row);
  }
}

function renderDiagnostics() {
  elements.diagnostics.replaceChildren();
  if (!profiles.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No profiles are installed.";
    elements.diagnostics.append(empty);
    return;
  }
  for (const profile of profiles) {
    const info = profileApi.compatibilityInfo(profile);
    const item = document.createElement("div");
    item.className = "diagnostic";
    const name = document.createElement("strong");
    name.textContent = `${profile.name} ${profile.version}`;
    const detail = document.createElement("p");
    detail.textContent = [
      `${profile.selectors?.hide?.length || 0} selectors`,
      `${(profile.styles?.cleanup?.length || 0) + (profile.styles?.layout?.length || 0)} style rules`,
      `${(profile.networkRules || []).length} network rules`,
      `tested ${info.testedAt || "never"}`
    ].join(" · ");
    item.append(name, detail);
    if (info.stale) {
      const stale = document.createElement("p");
      stale.className = "warning";
      stale.textContent = `Needs a fresh check: ${info.reason}.`;
      item.append(stale);
    }
    elements.diagnostics.append(item);
  }
}

function renderExceptions() {
  elements.exceptionsList.replaceChildren();
  if (!settings.exceptions.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No exceptions.";
    elements.exceptionsList.append(empty);
    return;
  }
  for (const domain of settings.exceptions) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.append(document.createTextNode(domain));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${domain} exception`);
    remove.addEventListener("click", () => {
      persist(settingsApi.removeException(settings, domain));
    });
    chip.append(remove);
    elements.exceptionsList.append(chip);
  }
}

function enableControls() {
  for (const element of [
    elements.globalToggle,
    elements.defaultCleanup,
    elements.defaultLayout,
    elements.defaultNetwork,
    elements.exceptionInput,
    elements.exceptionForm.querySelector("button[type=submit]"),
    elements.syncRulesButton,
    elements.restoreButton
  ]) element.disabled = false;
}

function render() {
  elements.globalToggle.checked = settings.enabled;
  elements.defaultCleanup.checked = settings.features.cleanup;
  elements.defaultLayout.checked = settings.features.layout;
  elements.defaultNetwork.checked = settings.features.network;
  renderSites();
  renderDiagnostics();
  renderExceptions();
}

elements.globalToggle.addEventListener("change", () => {
  persist({ ...settings, enabled: elements.globalToggle.checked });
});
elements.defaultCleanup.addEventListener("change", () => {
  persist({ ...settings, features: { ...settings.features, cleanup: elements.defaultCleanup.checked } });
});
elements.defaultLayout.addEventListener("change", () => {
  persist({ ...settings, features: { ...settings.features, layout: elements.defaultLayout.checked } });
});
elements.defaultNetwork.addEventListener("change", () => {
  persist({ ...settings, features: { ...settings.features, network: elements.defaultNetwork.checked } });
});

elements.exceptionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const domain = settingsApi.domainKey(elements.exceptionInput.value.trim());
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) {
    flash("Enter a domain like example.com", true);
    return;
  }
  elements.exceptionInput.value = "";
  persist(settingsApi.addException(settings, domain));
});

elements.syncRulesButton.addEventListener("click", async () => {
  elements.syncRulesButton.disabled = true;
  try {
    const response = await browserApi.runtime.sendMessage({ type: "webtim:sync-network-rules" });
    if (response?.ok) flash(`Network rules applied: ${response.count}`);
    else flash(`Could not apply rules: ${response?.error || "unknown error"}`, true);
  } catch (error) {
    flash(`Background unavailable: ${error.message}`, true);
  } finally {
    elements.syncRulesButton.disabled = false;
  }
});

elements.restoreButton.addEventListener("click", () => {
  if (!window.confirm("Restore all WebTimize Live settings to their defaults?")) return;
  persist(settingsApi.normalize(settingsApi.DEFAULT_SETTINGS));
});

try {
  browserApi.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[settingsApi.STORAGE_KEY]) return;
    settings = settingsApi.normalize(changes[settingsApi.STORAGE_KEY].newValue);
    render();
  });
} catch (error) {
  console.warn("WebTimize Live options: cannot watch settings", error);
}

async function init() {
  settings = await settingsApi.get();
  const response = await browserApi.runtime.sendMessage({ type: "webtim:list-profiles" }).catch(() => null);
  if (response?.error) flash("Profiles could not be loaded", true);
  profiles = response?.profiles || [];
  render();
  enableControls();
}

init().catch((error) => {
  console.warn("WebTimize Live options:", error);
  flash("Could not load settings", true);
});
