import assert from "node:assert/strict";
import test from "node:test";

import { buildPrompt, validateSubmission } from "./server.mjs";

const valid = {
  page: { url: "https://example.test/page", title: "Example" },
  viewport: { width: 1200, height: 800 },
  annotations: [
    {
      message: "Move this to the left.",
      url: "https://example.test/page",
      selector: "main > button:nth-of-type(2)",
      component: "Toolbar",
      label: "Toggle",
      html: "<button>Toggle</button>",
      rect: { x: 100, y: 200, width: 40, height: 24 },
    },
  ],
  screenshot: "data:image/png;base64,aGVsbG8=",
};

test("validates a bounded batch and builds a local-only implementation prompt", () => {
  const feedback = validateSubmission(valid);
  const prompt = buildPrompt(feedback);
  assert.equal(feedback.annotations[0].component, "Toolbar");
  assert.match(prompt, /Move this to the left/);
  assert.match(prompt, /Do not commit, push, deploy, merge/);
});

test("rejects an empty batch and non-PNG screenshot", () => {
  assert.throws(() => validateSubmission({ annotations: [] }), /between 1 and 50/);
  assert.throws(
    () => validateSubmission({ ...valid, screenshot: "data:image/jpeg;base64,aGVsbG8=" }),
    /PNG data URL/,
  );
});
