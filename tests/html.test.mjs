import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, safeHttpsUrl } from "../app/core/html.js";

test("esc escaped HTML-Sonderzeichen", () => {
  assert.equal(esc('<a href="x">&\''), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(5), "5");
});

test("safeHttpsUrl lässt nur https durch", () => {
  assert.equal(safeHttpsUrl("javascript:alert(1)"), "#");
  assert.equal(safeHttpsUrl("http://example.com"), "#");
  assert.equal(safeHttpsUrl(" https://console.anthropic.com"), "#");
  assert.equal(safeHttpsUrl("https://console.anthropic.com"), "https://console.anthropic.com");
  assert.equal(safeHttpsUrl(undefined), "#");
});
