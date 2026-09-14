import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedbackAttachment,
  buildDiscordContent,
  createFeedbackServer,
  loadProjects,
  resolveProject,
  validateSubmission,
} from "./server.mjs";

const screenshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==";
const valid = {
  page: { url: "https://pid-chatbot.sligolabs.com/page", title: "Research @everyone" },
  viewport: { width: 1200, height: 800 },
  extensionVersion: "0.3.16",
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
  assert.equal(feedback.extensionVersion, "0.3.16");
  assert.equal(buildFeedbackAttachment(feedback, { name: "PID Chatbot" }).extensionVersion, "0.3.16");
  const general = validateSubmission({
    ...valid,
    annotations: [{ kind: "note", message: "Keep the page-level context in mind.", url: valid.page.url }],
  });
  assert.equal(general.annotations[0].kind, "note");
  assert.equal(general.annotations[0].selector, "");
  assert.equal(resolveProject(feedback.page.url, config).preview, false);
  const preview = resolveProject("https://pid-chatbot-git-feature-congress-expandable-member-rows-sligo-labs.vercel.app", config);
  assert.equal(preview.preview, true);
  assert.equal(preview.project.previewDiscordParentChannelId, "1505275259006484570");
  assert.equal(preview.project.previewWebhookEnv, "PID_CHATBOT_TO_PID_DISCORD_WEBHOOK_URL");
  const stableVercel = resolveProject("https://pid.sligo-labs.vercel.app", config);
  assert.equal(stableVercel.project.name, "PID Production");
  assert.equal(stableVercel.preview, false);
  const generatedVercel = resolveProject("https://pid-3udz8pw1m-sligo-labs.vercel.app", config);
  assert.equal(generatedVercel.project.name, "PID Production");
  assert.equal(generatedVercel.preview, true);
  assert.equal(resolveProject("https://pid.sligolabs.com", config).project.name, "PID Production");
  assert.equal(resolveProject("https://agora-graph-git-redesign-sligo-labs.vercel.app", config).project.name, "PID Graph");
  assert.equal(resolveProject("https://pid-newsletter-git-redesign-sligo-labs.vercel.app", config).project.name, "PID Newsletter");
  assert.equal(resolveProject("https://pid-map-git-redesign-sligo-labs.vercel.app", config).project.name, "PID Map");
  assert.equal(resolveProject("https://agora-electability-7ppelovyi-sligo-labs.vercel.app", config).project.name, "PID Map");
  assert.throws(() => resolveProject("https://example.com", config), /No feedback project/);
});

test("builds one safe human summary and rejects invalid screenshots", () => {
  const feedback = validateSubmission(valid);
  const content = buildDiscordContent(feedback, config, resolveProject(feedback.page.url, config).project);
  assert.match(content, /^<@1535453212637667368>/);
  assert.match(content, /Move this to the left/);
  assert.match(content, /＠everyone/);
  const passive = buildDiscordContent(feedback, config, resolveProject(feedback.page.url, config).project, "passive@example.test");
  assert.match(passive, /^<@1535453212637667368>/);
  const previousPassiveSubmitter = process.env.FEEDBACK_PASSIVE_SUBMITTER_EMAIL;
  process.env.FEEDBACK_PASSIVE_SUBMITTER_EMAIL = "passive@example.test";
  try {
    assert.doesNotMatch(
      buildDiscordContent(feedback, config, resolveProject(feedback.page.url, config).project, "passive@example.test"),
      /^<@1535453212637667368>/,
    );
  } finally {
    if (previousPassiveSubmitter === undefined) delete process.env.FEEDBACK_PASSIVE_SUBMITTER_EMAIL;
    else process.env.FEEDBACK_PASSIVE_SUBMITTER_EMAIL = previousPassiveSubmitter;
  }
  assert.throws(
    () => validateSubmission({ ...valid, screenshot: "data:image/png;base64,aGVsbG8=" }),
    /valid PNG/,
  );
});

test("completes Chrome's Cloudflare authentication flow", async () => {
  const { server } = createFeedbackServer({ port: 43129 });
  await new Promise((resolve) => server.listen(43129, "127.0.0.1", resolve));
  try {
    const response = await fetch("http://127.0.0.1:43129/auth", { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://mjdomngjkjjpfadhlhcobkefhdfgfdkp.chromiumapp.org/");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
