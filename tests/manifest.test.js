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
    ...(manifest.background.scripts || []),
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap((script) => script.js)
  ];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
});

test("popup CSS lets the hidden attribute hide cards", () => {
  const css = fs.readFileSync(path.join(root, "src/popup/popup.css"), "utf8");
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
});

test("the extension version matches package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.version, pkg.version);
});

test("popup and options only reference files that exist", () => {
  for (const page of ["src/popup/popup.html", "src/options/options.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const reference = match[1];
      if (reference.startsWith("http") || reference.startsWith("#")) continue;
      const resolved = path.resolve(root, path.dirname(page), reference);
      assert.ok(fs.existsSync(resolved), `${page} -> ${reference}`);
    }
  }
});

test("shared modules load before the content script", () => {
  const scripts = manifest.content_scripts.flatMap((entry) => entry.js);
  assert.ok(scripts.includes("src/shared/browser-api.js"));
  assert.ok(scripts.indexOf("src/shared/browser-api.js") < scripts.indexOf("src/shared/settings.js"));
  assert.ok(scripts.indexOf("src/shared/settings.js") < scripts.indexOf("src/content/content.js"));
  assert.ok(scripts.indexOf("src/shared/engine.js") < scripts.indexOf("src/content/content.js"));
});

test("content scripts run at document_start and are top-frame only", () => {
  for (const script of manifest.content_scripts) {
    assert.equal(script.run_at, "document_start");
    assert.equal(script.all_frames, false);
  }
});

test("initial popup and options controls are disabled until load", () => {
  const popup = fs.readFileSync(path.join(root, "src/popup/popup.html"), "utf8");
  const options = fs.readFileSync(path.join(root, "src/options/options.html"), "utf8");
  assert.match(popup, /id="globalToggle"[^>]*disabled/);
  for (const id of ["globalToggle", "defaultCleanup", "defaultLayout", "defaultNetwork",
    "exceptionInput", "syncRulesButton", "restoreButton"]) {
    assert.match(options, new RegExp(`id="${id}"[^>]*disabled`), id);
  }
});

test("every indexed profile domain is covered by the manifest", () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, "profiles/index.json"), "utf8"));
  for (const entry of index.profiles) {
    assert.ok(
      manifest.host_permissions.some((pattern) => pattern.includes(`//${entry.domain}/`)),
      `${entry.domain} has no host permission`
    );
    assert.ok(
      manifest.content_scripts.some((script) => script.matches.some((pattern) => pattern.includes(`//${entry.domain}/`))),
      `${entry.domain} has no content-script match`
    );
  }
});
