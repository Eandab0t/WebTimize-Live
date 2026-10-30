const settingsApi = WebTimizeSettings;
const elements = {
  globalToggle: document.getElementById("globalToggle"),
  defaultCleanup: document.getElementById("defaultCleanup"),
  defaultLayout: document.getElementById("defaultLayout"),
  defaultNetwork: document.getElementById("defaultNetwork"),
  sitesList: document.getElementById("sitesList"),
  exceptionForm: document.getElementById("exceptionForm"),
  exceptionInput: document.getElementById("exceptionInput"),
  exceptionsList: document.getElementById("exceptionsList"),
  restoreButton: document.getElementById("restoreButton"),
  saveState: document.getElementById("saveState")
};

let settings;
let profiles = [];
let flashTimer;

function flash(message) {
  elements.saveState.textContent = message;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    elements.saveState.textContent = "Saved locally";
  }, 1800);
}

async function persist(next) {
  settings = await settingsApi.save(next);
  render();
  flash("Saved locally");
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

function storedSite(profile) {
  const key = settingsApi.domainKey(profile.domains[0]);
  const stored = settings.sites[key] || {};
  return {
    key,
    enabled: stored.enabled !== false,
    cleanup: stored.cleanup ?? settings.features.cleanup,
    layout: stored.layout ?? settings.features.layout,
    network: stored.network ?? settings.features.network
  };
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
    const site = storedSite(profile);
    const row = document.createElement("article");
    row.className = "site";

    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = profile.name;
    const meta = document.createElement("p");
    meta.textContent = `${profile.domains.join(", ")} · profile ${profile.version}`;
    copy.append(title, meta);

    row.append(copy, toggle(site.enabled, `Enable ${profile.name}`, (checked) => {
      persist(settingsApi.setSite(settings, site.key, { enabled: checked }));
    }));

    const features = document.createElement("div");
    features.className = "site-features";
    for (const [key, label] of [["cleanup", "Cleanup"], ["layout", "Layout"], ["network", "Network"]]) {
      const available = key === "network"
        ? profile.features.network && (profile.networkRules || []).length > 0
        : profile.features[key];
      const featureLabel = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = available && site[key];
      input.disabled = !available;
      input.addEventListener("change", () => {
        persist(settingsApi.setSite(settings, site.key, { [key]: input.checked }));
      });
      featureLabel.append(input, document.createTextNode(label));
      features.append(featureLabel);
    }
    row.append(features);
    elements.sitesList.append(row);
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

function render() {
  elements.globalToggle.checked = settings.enabled;
  elements.defaultCleanup.checked = settings.features.cleanup;
  elements.defaultLayout.checked = settings.features.layout;
  elements.defaultNetwork.checked = settings.features.network;
  renderSites();
  renderExceptions();
}

async function init() {
  settings = await settingsApi.get();
  const response = await chrome.runtime.sendMessage({ type: "webtim:list-profiles" }).catch(() => null);
  profiles = response?.profiles || [];
  render();
}

elements.globalToggle.addEventListener("change", () => {
  settings.enabled = elements.globalToggle.checked;
  persist(settings);
});
elements.defaultCleanup.addEventListener("change", () => {
  settings.features.cleanup = elements.defaultCleanup.checked;
  persist(settings);
});
elements.defaultLayout.addEventListener("change", () => {
  settings.features.layout = elements.defaultLayout.checked;
  persist(settings);
});
elements.defaultNetwork.addEventListener("change", () => {
  settings.features.network = elements.defaultNetwork.checked;
  persist(settings);
});

elements.exceptionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const domain = settingsApi.domainKey(elements.exceptionInput.value.trim());
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    flash("Enter a domain like example.com");
    return;
  }
  elements.exceptionInput.value = "";
  persist(settingsApi.addException(settings, domain));
});

elements.restoreButton.addEventListener("click", () => {
  if (!window.confirm("Restore all WebTimize Live settings to their defaults?")) return;
  persist(settingsApi.normalize(settingsApi.DEFAULT_SETTINGS));
});

init().catch((error) => {
  flash("Could not load settings");
  console.warn("WebTimize Live options:", error);
});
