const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const popup = fs.readFileSync(path.join(__dirname, "../src/popup/popup.html"), "utf8");

test("popup status changes are exposed as polite live regions", () => {
  assert.match(popup, /id="globalState"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(popup, /id="siteStatus"[^>]*role="status"[^>]*aria-live="polite"/);
});

test("popup switches and error banner have accessible semantics", () => {
  assert.match(popup, /id="errorBanner"[^>]*role="alert"/);
  for (const id of ["globalToggle", "cleanupToggle", "layoutToggle", "networkToggle"]) {
    assert.match(popup, new RegExp(`id="${id}"[^>]*aria-label=`), id);
  }
  for (const id of ["siteModeInherit", "siteModeEnabled", "siteModePaused"]) {
    assert.match(popup, new RegExp(`id="${id}"[^>]*name="siteMode"`), id);
  }
  assert.match(popup, /id="saveState"[^>]*role="status"[^>]*aria-live="polite"/);
});
