const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const settingsApi = require("../src/shared/settings.js");

const SOURCE = fs.readFileSync(path.join(__dirname, "../src/background/service-worker.js"), "utf8");
// Objects built inside the VM have that realm's prototypes; compare plain copies instead.
const plain = (value) => JSON.parse(JSON.stringify(value));
const SHARED = ["browser-api.js", "settings.js", "profile.js", "rules.js"].map((name) => ({
  name,
  source: fs.readFileSync(path.join(__dirname, "../src/shared", name), "utf8")
}));

function profile() {
  return {
    schemaVersion: 1,
    id: "fixture",
    name: "Fixture",
    version: "1.0.0",
    updated: "2026-10-30",
    domains: ["fixture.example"],
    features: { cleanup: true, layout: true, network: true },
    selectors: { hide: [".ad"] },
    styles: { cleanup: [], layout: [] },
    networkRules: [{ urlFilter: "||ads.fixture.example^", resourceTypes: ["script"] }],
    compatibility: { testedAt: "2026-10-30", testedViewports: ["1440x900"] }
  };
}

function harness(options = {}) {
  let stored = options.settings || settingsApi.normalize();
  let dynamicRules = [];
  const updates = [];
  const listeners = { installed: [], startup: [], storage: [], message: [] };
  const files = options.files || {
    "profiles/index.json": { schemaVersion: 1, profiles: [{ domain: "fixture.example", file: "fixture.example.json" }] },
    "profiles/fixture.example.json": profile()
  };
  const chrome = {
    runtime: {
      getURL: (file) => file,
      onInstalled: { addListener: (listener) => listeners.installed.push(listener) },
      onStartup: { addListener: (listener) => listeners.startup.push(listener) },
      onMessage: { addListener: (listener) => listeners.message.push(listener) }
    },
    storage: {
      sync: { get: async () => ({ [settingsApi.STORAGE_KEY]: stored }), set: async () => {} },
      onChanged: { addListener: (listener) => listeners.storage.push(listener) }
    },
    declarativeNetRequest: {
      getDynamicRules: async () => dynamicRules,
      updateDynamicRules: async ({ removeRuleIds, addRules }) => {
        updates.push({ removeRuleIds, addRules });
        dynamicRules = addRules;
      }
    }
  };
  const sandbox = {
    chrome,
    console: { warn() {}, log() {}, error() {} },
    fetch: async (file) => {
      if (!(file in files)) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => JSON.parse(JSON.stringify(files[file])) };
    }
  };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...names) => {
    for (const name of names) {
      const base = path.basename(name);
      const shared = SHARED.find((item) => item.name === base);
      if (shared) vm.runInContext(shared.source, context);
    }
  };
  vm.runInContext(SOURCE, context);

  function respond(message) {
    return new Promise((resolve) => {
      for (const listener of listeners.message) {
        if (listener(message, {}, resolve) === true) return;
      }
      resolve(undefined);
    });
  }
  return {
    respond,
    updates,
    get dynamicRules() {
      return dynamicRules;
    },
    set stored(value) {
      stored = value;
    },
    triggerStorage() {
      for (const listener of listeners.storage) {
        listener({ [settingsApi.STORAGE_KEY]: { newValue: stored } }, "sync");
      }
    },
    listeners
  };
}

test("network rules are not installed while filtering is off by default", async () => {
  const worker = harness();
  const response = await worker.respond({ type: "webtim:sync-network-rules" });
  assert.equal(response.ok, true);
  assert.equal(response.count, 0);
  assert.deepEqual(plain(worker.updates.at(-1).addRules), []);
});

test("enabling network filtering installs a deterministic, collision-free rule", async () => {
  const settings = settingsApi.normalize({ features: { cleanup: true, layout: true, network: true } });
  const worker = harness({ settings });
  const first = await worker.respond({ type: "webtim:sync-network-rules" });
  assert.equal(first.ok, true);
  assert.equal(first.count, 1);
  const rule = worker.updates.at(-1).addRules[0];
  assert.equal(rule.condition.urlFilter, "||ads.fixture.example^");
  assert.deepEqual(plain(rule.condition.initiatorDomains), ["fixture.example"]);
  assert.deepEqual(plain(rule.condition.resourceTypes), ["script"]);
  assert.ok(rule.id > 0);

  const second = await worker.respond({ type: "webtim:sync-network-rules" });
  assert.equal(second.count, 1);
  assert.equal(worker.updates.at(-1).addRules[0].id, rule.id, "ids stay stable across syncs");
  assert.deepEqual(plain(worker.updates.at(-1).removeRuleIds), [rule.id], "old ids are removed before adding");
});

test("a global disable removes rules that were installed earlier", async () => {
  const enabled = settingsApi.normalize({ features: { cleanup: true, layout: true, network: true } });
  const worker = harness({ settings: enabled });
  await worker.respond({ type: "webtim:sync-network-rules" });
  assert.equal(worker.dynamicRules.length, 1);

  worker.stored = { ...enabled, enabled: false };
  worker.triggerStorage();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(plain(worker.dynamicRules), []);
});

test("an unrelated sync key does not rebuild network rules", async () => {
  const worker = harness();
  const before = worker.updates.length;
  for (const listener of worker.listeners.storage) {
    listener({ somethingElse: { newValue: true } }, "sync");
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(worker.updates.length, before);
});

test("a malformed index disables every profile instead of loading part of it", async () => {
  const worker = harness({
    files: {
      "profiles/index.json": { schemaVersion: 1, profiles: [{ domain: "fixture.example", file: "../escape.json" }] }
    }
  });
  const response = await worker.respond({ type: "webtim:list-profiles" });
  assert.deepEqual(plain(response.profiles), []);
});

test("a profile whose index domain it does not declare is skipped", async () => {
  const files = {
    "profiles/index.json": { schemaVersion: 1, profiles: [{ domain: "other.example", file: "fixture.example.json" }] },
    "profiles/fixture.example.json": profile()
  };
  const worker = harness({ files });
  const response = await worker.respond({ type: "webtim:list-profiles" });
  assert.deepEqual(plain(response.profiles), []);
});

test("the profile lookup is by hostname and ignores unrelated sites", async () => {
  const worker = harness();
  const hit = await worker.respond({ type: "webtim:get-profile", hostname: "www.fixture.example" });
  assert.equal(hit.profile.id, "fixture");
  const miss = await worker.respond({ type: "webtim:get-profile", hostname: "elsewhere.example" });
  assert.equal(miss.profile, null);
});
