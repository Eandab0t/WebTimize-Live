const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../src/shared/browser-api.js"), "utf8");

function load(namespace) {
  const context = vm.createContext({ console, ...namespace });
  vm.runInContext(SOURCE, context);
  return context.WebTimizeBrowser;
}

test("the adapter prefers the Firefox browser namespace and wraps promises", async () => {
  const calls = [];
  const browser = {
    runtime: { id: "addon", getURL: (p) => `moz-extension://addon/${p}`, sendMessage: async () => ({ ok: true }) },
    storage: { sync: { get: async (key) => ({ [key]: 1 }), set: async (value) => calls.push(value) }, onChanged: {} },
    tabs: { query: async () => [{ id: 2 }], sendMessage: async () => ({ ok: true }) },
    declarativeNetRequest: { getDynamicRules: async () => [], updateDynamicRules: async () => {} }
  };
  const api = load({ browser });
  assert.equal(api.isFirefox, true);
  assert.deepEqual(await api.storage.get("key"), { key: 1 });
  assert.deepEqual(await api.tabs.query({ active: true }), [{ id: 2 }]);
  assert.deepEqual(await api.runtime.sendMessage({ type: "x" }), { ok: true });
  assert.deepEqual(await api.dnr.getDynamicRules(), []);
  assert.equal(api.runtime.getURL("popup.html"), "moz-extension://addon/popup.html");
});

test("the adapter reports unavailable APIs instead of throwing at load", async () => {
  const api = load({ chrome: { runtime: { id: "id", getURL: () => "x", getManifest: () => ({}) } } });
  assert.equal(api.isFirefox, false);
  assert.equal(api.storage.available, false);
  assert.equal(api.dnr.available, false);
  await assert.rejects(api.storage.get("key"), /unavailable/);
});
