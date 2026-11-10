const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const settingsApi = require("../src/shared/settings.js");

const SHARED = ["browser-api.js", "settings.js", "profile.js", "engine.js"].map((name) => ({
  name,
  source: fs.readFileSync(path.join(__dirname, "../src/shared", name), "utf8")
}));
const SOURCE = fs.readFileSync(path.join(__dirname, "../src/content/content.js"), "utf8");
const HOST = "www.coolmathgames.com";

function profile(overrides = {}) {
  return {
    id: "coolmathgames",
    name: "Cool Math Games",
    version: "1.0.0",
    domains: ["coolmathgames.com"],
    features: { cleanup: true, layout: true, network: false },
    selectors: { hide: [".ad-slot", "#leaderboard-1"] },
    styles: { cleanup: [], layout: [".content { max-width: none !important; }"] },
    networkRules: [],
    compatibility: { testedAt: "2026-10-30", testedViewports: ["1440x900"] },
    ...overrides
  };
}

function harness(options = {}) {
  const settings = options.settings || settingsApi.normalize();
  let stored = settings;
  const listeners = { storage: [], message: [] };
  const styles = [];
  const messages = [];
  const head = {
    children: [],
    appendChild(node) {
      head.children.push(node);
      node.parentNode = head;
      node.isConnected = true;
    }
  };
  const attributes = new Map();
  const documentElement = {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    appendChild: (node) => head.appendChild(node)
  };
  const document = {
    head,
    documentElement,
    createElement(tag) {
      assert.equal(tag, "style");
      const element = {
        id: "",
        textContent: "",
        isConnected: false,
        parentNode: null,
        remove() {
          if (element.parentNode) {
            element.parentNode.children = element.parentNode.children.filter((item) => item !== element);
          }
          element.parentNode = null;
          element.isConnected = false;
        }
      };
      styles.push(element);
      return element;
    },
    createDocumentFragment() {
      return {
        querySelector(selector) {
          if (/[{};<>]/.test(selector) || selector.startsWith(":invalid")) throw new Error("invalid selector");
          return null;
        }
      };
    },
    querySelectorAll() {
      return { length: options.hiddenCount ?? 0 };
    }
  };
  const chrome = {
    runtime: {
      id: options.contextGone ? undefined : "test-extension",
      sendMessage: async (message) => {
        messages.push(message);
        if (options.profileFailure) throw new Error("service worker asleep");
        if (options.profileError) return { error: "profile index is broken" };
        return { profile: options.profile === undefined ? profile() : options.profile };
      },
      onMessage: { addListener: (listener) => listeners.message.push(listener) }
    },
    storage: {
      sync: {
        get: async () => {
          if (options.storageFailure) throw new Error("storage unavailable");
          return { [settingsApi.STORAGE_KEY]: stored };
        },
        set: async (values) => {
          stored = values[settingsApi.STORAGE_KEY];
        }
      },
      onChanged: { addListener: (listener) => listeners.storage.push(listener) }
    }
  };
  // The shared modules are evaluated inside the same VM as the content script, so their chrome
  // lookups hit the fake extension API rather than Node's globals.
  const sandbox = {
    chrome,
    document,
    location: { hostname: HOST },
    console: { warn() {}, log() {}, error() {} }
  };
  const context = vm.createContext(sandbox);
  for (const shared of SHARED) vm.runInContext(shared.source, context);
  const ready = vm.runInContext(SOURCE, context);

  async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await ready;
  }
  function change(next) {
    stored = next;
    for (const listener of listeners.storage) {
      listener({ [settingsApi.STORAGE_KEY]: { newValue: next } }, "sync");
    }
  }
  function send(message) {
    return new Promise((resolve) => {
      for (const listener of listeners.message) {
        if (listener(message, {}, resolve) === true) return;
      }
      resolve(undefined);
    });
  }
  return { ready, styles, head, attributes, messages, change, send, flush, setStored: (value) => { stored = value; } };
}

test("styles are applied on load from the stored settings and profile", async () => {
  const page = harness();
  await page.flush();
  assert.equal(page.styles.length, 1);
  assert.equal(page.head.children.length, 1);
  assert.match(page.styles[0].textContent, /\.ad-slot/);
  assert.match(page.styles[0].textContent, /display: none !important/);
  assert.match(page.styles[0].textContent, /max-width: none/);
  assert.equal(page.attributes.get("data-webtim-live"), "on");
});

test("disabling globally removes the stylesheet and re-enabling restores one copy", async () => {
  const page = harness();
  await page.flush();
  page.change({ ...settingsApi.normalize(), enabled: false });
  await page.flush();
  assert.equal(page.head.children.length, 0);
  assert.equal(page.attributes.has("data-webtim-live"), false);

  page.change(settingsApi.normalize());
  await page.flush();
  assert.equal(page.head.children.length, 1);
  assert.equal(page.attributes.get("data-webtim-live"), "on");
});

test("repeated toggles never duplicate the stylesheet", async () => {
  const page = harness();
  await page.flush();
  for (let round = 0; round < 4; round += 1) {
    page.change({ ...settingsApi.normalize(), enabled: false });
    await page.flush();
    page.change(settingsApi.normalize());
    await page.flush();
  }
  assert.equal(page.head.children.length, 1);
  assert.equal(page.head.children.filter((node) => node.id === "webtim-live-style").length, 1);
});

test("a site override disables only that feature", async () => {
  const settings = settingsApi.setSite(settingsApi.normalize(), HOST, { cleanup: false });
  const page = harness({ settings });
  await page.flush();
  assert.equal(page.styles.length, 1);
  assert.doesNotMatch(page.styles[0].textContent, /display: none/);
  assert.match(page.styles[0].textContent, /max-width: none/);
});

test("pausing a site removes the stylesheet without hiding anything", async () => {
  const settings = settingsApi.setSite(settingsApi.normalize(), HOST, { enabled: false });
  const page = harness({ settings });
  await page.flush();
  assert.equal(page.head.children.length, 0);
  assert.equal(page.attributes.has("data-webtim-live"), false);
});

test("storage failure falls back to defaults instead of failing closed", async () => {
  const page = harness({ storageFailure: true });
  await page.flush();
  assert.equal(page.styles.length, 1);
});

test("a failed profile lookup leaves the page untouched and reports unsupported", async () => {
  const page = harness({ profileFailure: true });
  await page.flush();
  assert.equal(page.styles.length, 0);
  const status = await page.send({ type: "webtim:status" });
  assert.equal(status.supported, false);
  assert.equal(status.active, false);
});

test("an error response from the background is exposed in status", async () => {
  const page = harness({ profileError: true });
  await page.flush();
  const status = await page.send({ type: "webtim:status" });
  assert.equal(status.supported, false);
  assert.match(status.error, /profile index is broken/);
});

test("a dead extension context applies nothing and does not message the background", async () => {
  const page = harness({ contextGone: true });
  await page.flush();
  assert.equal(page.styles.length, 0);
  assert.equal(page.messages.length, 0);
});

test("invalid profile selectors are dropped while valid ones still apply", async () => {
  const page = harness({
    profile: profile({ selectors: { hide: [".ad-slot", "div{display:none}", ":invalid"] } })
  });
  await page.flush();
  assert.equal(page.styles.length, 1);
  assert.match(page.styles[0].textContent, /\.ad-slot/);
  assert.doesNotMatch(page.styles[0].textContent, /div\{/);
});

test("status reports the profile and how many elements cleanup matches", async () => {
  const page = harness({ hiddenCount: 3 });
  await page.flush();
  const status = await page.send({ type: "webtim:status" });
  assert.equal(status.supported, true);
  assert.equal(status.active, true);
  assert.equal(status.hidden, 3);
  assert.equal(status.profile.id, "coolmathgames");
  assert.equal(status.profile.version, "1.0.0");
  assert.equal(status.features.cleanup, true);
});

test("a refresh message re-reads settings and re-applies them", async () => {
  const page = harness();
  await page.flush();
  page.setStored({ ...settingsApi.normalize(), enabled: false });
  const status = await page.send({ type: "webtim:refresh" });
  assert.equal(status.active, false);
  assert.equal(page.head.children.length, 0);
});
