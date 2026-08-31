import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscordContent,
  loadProjects,
  resolveProject,
  validateSubmission,
} from "./server.mjs";

const screenshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==";
const valid = {
  page: { url: "https://pid-chatbot.sligolabs.com/page", title: "Research @everyone" },
  viewport: { width: 1200, height: 800 },
  annotations: [
    {
      message: "Move this to the left.",
      url: "https://pid-chatbot.sligolabs.com/page",
      selector: "main > button:nth-of-type(2)",
      component: "Toolbar",
      label: "Toggle",
      html: "<button>Toggle</button>",
      rect: { x: 100, y: 200, width: 40, height: 24 },
    },
  ],
  screenshot,
};

const config = loadProjects(new URL("./projects.json", import.meta.url));

test("validates feedback and routes production and preview hosts", () => {
  const feedback = validateSubmission(valid);
  assert.equal(feedback.annotations[0].component, "Toolbar");
  assert.equal(resolveProject(feedback.page.url, config).preview, false);
  assert.equal(
    resolveProject("https://pid-git-feature-congress-expandable-member-rows-sligo-labs.vercel.app", config).preview,
    true,
  );
  assert.throws(() => resolveProject("https://example.com", config), /No feedback project/);
});

test("builds one safe human summary and rejects invalid screenshots", () => {
  const feedback = validateSubmission(valid);
  const content = buildDiscordContent(feedback, config, config.projects[0]);
  assert.match(content, /^<@1535453212637667368>/);
  assert.match(content, /Move this to the left/);
  assert.match(content, /＠everyone/);
  assert.throws(
    () => validateSubmission({ ...valid, screenshot: "data:image/png;base64,aGVsbG8=" }),
    /valid PNG/,
  );
});
