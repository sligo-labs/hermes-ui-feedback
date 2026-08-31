#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const DEFAULT_PORT = 43127;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const EXTENSION_ORIGIN = "chrome-extension://mjdomngjkjjpfadhlhcobkefhdfgfdkp";

export function validateSubmission(value) {
  if (!value || typeof value !== "object") throw new Error("Invalid feedback payload.");
  if (!Array.isArray(value.annotations) || value.annotations.length < 1 || value.annotations.length > 50) {
    throw new Error("Send between 1 and 50 annotations.");
  }

  const parsedUrl = httpUrl(value.page?.url, "Page");

  const annotations = value.annotations.map((note, index) => {
    if (!note || typeof note !== "object") throw new Error(`Annotation ${index + 1} is invalid.`);
    const message = boundedString(note.message, 2000);
    const selector = boundedString(note.selector, 2000);
    const noteUrl = httpUrl(note.url, `Annotation ${index + 1}`);
    if (!message || !selector || noteUrl.origin !== parsedUrl.origin) {
      throw new Error(`Annotation ${index + 1} is incomplete or belongs to another site.`);
    }
    return {
      id: boundedString(note.id, 100),
      message,
      url: noteUrl.href,
      selector,
      component: boundedString(note.component, 200),
      label: boundedString(note.label, 500),
      html: sanitizeHtml(boundedString(note.html, 4000)),
      rect: numericFields(note.rect, ["x", "y", "width", "height", "documentX", "documentY"]),
    };
  });

  if (typeof value.screenshot !== "string" || value.screenshot.length > 12 * 1024 * 1024) {
    throw new Error("Screenshot is missing or too large.");
  }
  const screenshot = value.screenshot.trim();
  if (!screenshot.startsWith("data:image/png;base64,")) throw new Error("A PNG screenshot is required.");
  const screenshotBytes = Buffer.from(screenshot.slice(screenshot.indexOf(",") + 1), "base64");
  if (screenshotBytes.length > MAX_SCREENSHOT_BYTES) throw new Error("Screenshot is too large.");
  if (!screenshotBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Screenshot is not a valid PNG.");
  }

  return {
    page: { url: parsedUrl.href, title: boundedString(value.page?.title, 500) },
    viewport: numericFields(value.viewport, ["width", "height", "devicePixelRatio"]),
    annotations,
    screenshotBytes,
  };
}

export function loadProjects(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || !Array.isArray(value.projects)) {
    throw new Error("Project configuration must contain a projects array.");
  }
  const botId = requiredSnowflake(value.botId, "botId");
  const guildId = requiredSnowflake(value.guildId, "guildId");
  const projects = value.projects.map((project, index) => ({
    name: boundedString(project.name, 100) || `Project ${index + 1}`,
    productionHosts: stringArray(project.productionHosts),
    previewHostPatterns: stringArray(project.previewHostPatterns).map((pattern) => new RegExp(pattern, "i")),
    discordParentChannelId: requiredSnowflake(project.discordParentChannelId, `projects[${index}].discordParentChannelId`),
    webhookEnv: boundedString(project.webhookEnv, 100),
  }));
  if (projects.some((project) => !project.webhookEnv)) throw new Error("Every project requires webhookEnv.");
  return { botId, guildId, projects };
}

export function resolveProject(pageUrl, config) {
  const hostname = new URL(pageUrl).hostname.toLowerCase();
  for (const project of config.projects) {
    if (project.productionHosts.some((host) => host.toLowerCase() === hostname)) {
      return { project, preview: false };
    }
    if (project.previewHostPatterns.some((pattern) => pattern.test(hostname))) {
      return { project, preview: true };
    }
  }
  throw new Error(`No feedback project is configured for ${hostname}.`);
}

export function buildDiscordContent(feedback, config, project) {
  const title = escapeDiscord(feedback.page.title || project.name);
  const lines = [`<@${config.botId}> **UI feedback · ${title}**`, `<${feedback.page.url}>`, ""];
  let shown = 0;
  for (const [index, note] of feedback.annotations.entries()) {
    const line = `${index + 1}. ${escapeDiscord(note.message).replace(/\s+/g, " ")}`;
    if ([...lines, line, "", "Screenshot and structured context attached."].join("\n").length > 1850) break;
    lines.push(line);
    shown += 1;
  }
  if (shown < feedback.annotations.length) lines.push(`…${feedback.annotations.length - shown} more in feedback.json`);
  lines.push("", "Screenshot and structured context attached.");
  return lines.join("\n");
}

export function createFeedbackServer({
  configPath = fileURLToPath(new URL("./projects.json", import.meta.url)),
  hermes = process.env.HERMES_CLI || "hermes",
  port = DEFAULT_PORT,
  requireAccess = process.env.FEEDBACK_REQUIRE_ACCESS === "1",
} = {}) {
  const config = loadProjects(configPath);
  const server = createServer(async (request, response) => {
    setCors(request, response);
    if (request.method === "OPTIONS") return response.writeHead(204).end();

    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/") {
      return json(response, 200, { ok: true, projects: config.projects.map((project) => project.name) });
    }
    if (request.method !== "POST" || url.pathname !== "/api/feedback") {
      return json(response, 404, { error: "Not found." });
    }
    if (request.headers.origin !== EXTENSION_ORIGIN) {
      return json(response, 403, { error: "Only the Hermes UI Feedback extension may submit feedback." });
    }
    if (requireAccess && !request.headers["cf-access-jwt-assertion"]) {
      return json(response, 401, { error: "Sign in to Sligo Access, then send again." });
    }

    try {
      const feedback = validateSubmission(JSON.parse(await readBody(request)));
      const { project, preview } = resolveProject(feedback.page.url, config);
      const threadId = preview
        ? await findPreviewThread(project, feedback.page.url, hermes).catch(() => null)
        : null;
      const result = await postFeedback({ feedback, config, project, threadId });
      json(response, 201, {
        id: result.id,
        permalink: `https://discord.com/channels/${config.guildId}/${result.channel_id}/${result.id}`,
        routedTo: result.usedThread ? "preview-thread" : "new-thread",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      json(response, /configured|payload|annotation|screenshot|URL|PNG/.test(message) ? 400 : 502, { error: message });
    }
  });
  return { server, port };
}

export async function findPreviewThread(project, pageUrl, hermes) {
  const target = new URL(pageUrl).origin;
  const recent = await runDiscord(hermes, ["recent", project.discordParentChannelId, "--limit", "100", "--json"]);
  const threadIds = recent.messages
    ?.map((message) => message.thread?.id)
    .filter((id) => typeof id === "string") ?? [];

  // ponytail: scan the latest 100 project threads; add a registry only if this becomes slow or misses real previews.
  let cursor = 0;
  let match = null;
  async function worker() {
    while (!match && cursor < threadIds.length) {
      const threadId = threadIds[cursor++];
      try {
        const thread = await runDiscord(hermes, ["get-thread", threadId, "--limit", "100", "--json"]);
        if (thread.messages?.some((message) => typeof message.content === "string" && message.content.includes(target))) {
          match = threadId;
        }
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, threadIds.length) }, worker));
  return match;
}

async function runDiscord(hermes, args) {
  const { stdout } = await execFileAsync(hermes, ["discord", ...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000,
  });
  return JSON.parse(stdout);
}

async function postFeedback({ feedback, config, project, threadId }) {
  const webhook = process.env[project.webhookEnv];
  if (!webhook) throw new Error(`${project.name} feedback webhook is not configured.`);
  const endpoint = new URL(webhook);
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "discord.com" || !endpoint.pathname.startsWith("/api/webhooks/")) {
    throw new Error(`${project.name} feedback webhook is not configured.`);
  }

  const batchId = randomUUID();
  const attachment = {
    schemaVersion: 1,
    batchId,
    submittedAt: new Date().toISOString(),
    project: project.name,
    page: feedback.page,
    viewport: feedback.viewport,
    annotations: feedback.annotations,
  };
  const payload = {
    content: buildDiscordContent(feedback, config, project),
    allowed_mentions: { parse: [], users: [config.botId] },
    attachments: [
      { id: 0, filename: "feedback.json", description: "Structured UI feedback" },
      { id: 1, filename: "screenshot.png", description: "Visible page at submission" },
    ],
  };
  endpoint.searchParams.set("wait", "true");
  if (threadId) endpoint.searchParams.set("thread_id", threadId);

  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  form.append("files[0]", new Blob([JSON.stringify(attachment, null, 2)], { type: "application/json" }), "feedback.json");
  form.append("files[1]", new Blob([feedback.screenshotBytes], { type: "image/png" }), "screenshot.png");
  let usedThread = Boolean(threadId);
  let response = await fetch(endpoint, { method: "POST", body: form });
  if ([403, 404].includes(response.status) && threadId) {
    endpoint.searchParams.delete("thread_id");
    usedThread = false;
    response = await fetch(endpoint, { method: "POST", body: form });
  }
  if (!response.ok) throw new Error(`${project.name} Discord delivery failed.`);
  const message = await response.json();
  if (!message?.id || !message?.channel_id) throw new Error("Discord delivery returned an invalid message.");
  return { ...message, usedThread };
}

function setCors(request, response) {
  if (request.headers.origin === EXTENSION_ORIGIN) {
    response.setHeader("access-control-allow-origin", EXTENSION_ORIGIN);
    response.setHeader("access-control-allow-credentials", "true");
    response.setHeader("vary", "Origin");
  }
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Feedback payload is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function boundedString(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function httpUrl(value, label) {
  try {
    const url = new URL(boundedString(value, 4096));
    if (["http:", "https:"].includes(url.protocol)) return url;
  } catch {}
  throw new Error(`${label} URL must use HTTP or HTTPS.`);
}

function numericFields(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(fields.flatMap((field) => Number.isFinite(value[field]) ? [[field, value[field]]] : []));
}

function sanitizeHtml(value) {
  return value.replace(/\s(?:value|srcdoc|nonce|on[a-z]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function requiredSnowflake(value, label) {
  const text = boundedString(value, 30);
  if (!/^\d{15,25}$/.test(text)) throw new Error(`${label} must be a Discord snowflake.`);
  return text;
}

function escapeDiscord(value) {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1").replace(/</g, "‹").replace(/@/g, "＠");
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--config" && value) options.configPath = value;
    else if (flag === "--port" && value) options.port = Number(value);
    else if (flag === "--hermes" && value) options.hermes = value;
    else throw new Error(`Unknown or incomplete option: ${flag}`);
  }
  if (options.port && (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535)) {
    throw new Error("--port must be an integer from 1024 to 65535.");
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const { server, port } = createFeedbackServer(options);
  server.listen(port, "127.0.0.1", () => console.log(`Hermes UI Feedback ready on http://127.0.0.1:${port}`));
}
