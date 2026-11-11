const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { FIREFOX_ID, manifestFor, build } = require("../scripts/build-extensions.js");
const root = path.join(__dirname, "..");

test("Chrome and Firefox manifests preserve one shared permission and code model", () => {
  const chrome = manifestFor("chrome");
  const firefox = manifestFor("firefox");
  assert.equal(chrome.background.service_worker, "src/background/service-worker.js");
  assert.equal(chrome.background.scripts, undefined);
  assert.equal(chrome.browser_specific_settings, undefined);
  assert.deepEqual(firefox.background.scripts, [
    "src/shared/browser-api.js",
    "src/shared/settings.js",
    "src/shared/profile.js",
    "src/shared/rules.js",
    "src/background/service-worker.js"
  ]);
  assert.equal(firefox.background.service_worker, undefined);
  assert.equal(firefox.browser_specific_settings.gecko.id, FIREFOX_ID);
  assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, "142.0");
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
  assert.deepEqual(chrome.permissions, firefox.permissions);
  assert.deepEqual(chrome.host_permissions, firefox.host_permissions);
});

test("build output contains extension files only and validates both manifests", () => {
  for (const browser of ["chrome", "firefox"]) {
    const directory = build(browser);
    const files = fs.readdirSync(directory, { recursive: true }).map((file) => file.replaceAll("\\", "/"));
    assert.ok(files.includes("manifest.json"));
    assert.ok(files.includes("src/shared/browser-api.js"));
    assert.ok(files.some((file) => file.endsWith(".png")));
    assert.ok(!files.some((file) => file.startsWith("tests")));
    assert.ok(!files.some((file) => file.startsWith("scripts")));
    assert.ok(!files.includes("package.json"));
    assert.ok(!files.includes(".env"));
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  }
});
