const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest is MV3 with a narrow host footprint", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "WebTimize Live");
  assert.ok(!JSON.stringify(manifest).includes("<all_urls>"));
  assert.deepEqual(manifest.host_permissions.sort(), [
    "https://coolmathgames.com/*",
    "https://www.coolmathgames.com/*"
  ]);
  assert.ok(manifest.permissions.includes("declarativeNetRequest"));
});

test("every referenced local file exists", () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap((script) => script.js)
  ];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
});

test("content scripts run at document_start and are top-frame only", () => {
  for (const script of manifest.content_scripts) {
    assert.equal(script.run_at, "document_start");
    assert.equal(script.all_frames, false);
  }
});
