#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const DEFAULT_PORT = 43127;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 96 * 1024;
const EXTENSION_ORIGIN = "chrome-extension://mjdomngjkjjpfadhlhcobkefhdfgfdkp";

export function validateSubmission(value) {
  if (!value || typeof value !== "object") throw new Error("Invalid feedback payload.");
  if (!Array.isArray(value.annotations) || value.annotations.length < 1 || value.annotations.length > 50) {
    throw new Error("Send between 1 and 50 annotations.");
  }

  const annotations = value.annotations.map((note, index) => {
    if (!note || typeof note !== "object") throw new Error(`Annotation ${index + 1} is invalid.`);
    const message = boundedString(note.message, 2000);
    const url = boundedString(note.url, 4096);
    const selector = boundedString(note.selector, 2000);
    if (!message || !url || !selector) throw new Error(`Annotation ${index + 1} is incomplete.`);
    return {
      message,
      url,
      selector,
      component: boundedString(note.component, 200),
      label: boundedString(note.label, 500),
      html: boundedString(note.html, 4000),
      rect: note.rect && typeof note.rect === "object" ? note.rect : undefined,
    };
  });

  if (typeof value.screenshot === "string" && value.screenshot.length > 11 * 1024 * 1024) {
    throw new Error("Screenshot is too large.");
  }
  const screenshot = boundedString(value.screenshot, 11 * 1024 * 1024);
  if (screenshot && !screenshot.startsWith("data:image/png;base64,")) {
    throw new Error("Screenshot must be a PNG data URL.");
  }

  return {
    page: {
      url: boundedString(value.page?.url, 4096),
      title: boundedString(value.page?.title, 500),
    },
    viewport: value.viewport && typeof value.viewport === "object" ? value.viewport : {},
    annotations,
    screenshot,
  };
}

export function buildPrompt(feedback) {
  const context = JSON.stringify(
    {
      page: feedback.page,
      viewport: feedback.viewport,
      annotations: feedback.annotations,
    },
    null,
    2,
  );
  return `The user reviewed a UI in their browser and deliberately sent the feedback below.

Implement every annotation in the current checkout. Use the URL, selector, component hint, label, element HTML, coordinates, and attached visible-page screenshot to locate the right source. Inspect the existing implementation and shared callers before editing. Make the smallest coherent fix, preserve unrelated work, and run the narrowest relevant checks.

This handoff authorizes local edits and verification only. Do not commit, push, deploy, merge, create or modify remote resources, or send external messages. If an annotation is ambiguous, implement the least surprising interpretation and identify it in the final response.

UI feedback:
${context}`;
}

export function createFeedbackServer({ cwd = process.cwd(), port = DEFAULT_PORT, hermes = "hermes" } = {}) {
  const projectRoot = resolve(cwd);
  if (!existsSync(projectRoot)) throw new Error(`Worktree does not exist: ${projectRoot}`);

  let activeJob = null;
  const jobs = new Map();

  const server = createServer(async (request, response) => {
    setCors(request, response);
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (!allowedOrigin(request.headers.origin)) {
      json(response, 403, { error: "Only the installed browser extension may use this bridge." });
      return;
    }

    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/") {
      json(response, 200, { ok: true, cwd: projectRoot, running: Boolean(activeJob) });
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/jobs/")) {
      const job = jobs.get(url.pathname.slice(6));
      json(response, job ? 200 : 404, job ?? { error: "Feedback job not found." });
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/jobs") {
      json(response, 404, { error: "Not found." });
      return;
    }
    if (activeJob) {
      json(response, 409, { error: "Hermes is already handling another feedback batch." });
      return;
    }

    try {
      const feedback = validateSubmission(JSON.parse(await readBody(request)));
      const id = randomUUID();
      const job = { id, status: "running", output: "" };
      jobs.set(id, job);
      activeJob = id;
      runHermes({ feedback, job, cwd: projectRoot, hermes }).finally(() => {
        activeJob = null;
      });
      json(response, 202, { id });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return { server, projectRoot, port };
}

async function runHermes({ feedback, job, cwd, hermes }) {
  let temporaryDirectory;
  try {
    const args = ["chat", "-Q", "--source", "tool"];
    if (feedback.screenshot) {
      temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-ui-feedback-"));
      const screenshotPath = join(temporaryDirectory, "page.png");
      writeFileSync(screenshotPath, Buffer.from(feedback.screenshot.split(",", 2)[1], "base64"));
      args.push("--image", screenshotPath);
    }
    args.push("-q", buildPrompt(feedback));

    const child = spawn(hermes, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    job.status = code === 0 ? "complete" : "failed";
    job.output = (stdout.trim() || stderr.trim() || `Hermes exited with code ${code}.`).slice(-MAX_OUTPUT_BYTES);
  } catch (error) {
    job.status = "failed";
    job.output = error instanceof Error ? error.message : String(error);
  } finally {
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function boundedString(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function appendBounded(current, chunk) {
  return (current + String(chunk)).slice(-MAX_OUTPUT_BYTES);
}

function allowedOrigin(origin) {
  return !origin || origin === EXTENSION_ORIGIN;
}

function setCors(request, response) {
  const origin = request.headers.origin;
  if (origin === EXTENSION_ORIGIN) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
  }
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  if (request.headers["access-control-request-private-network"] === "true") {
    response.setHeader("access-control-allow-private-network", "true");
  }
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
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
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--cwd" && value) options.cwd = isAbsolute(value) ? value : resolve(value);
    else if (flag === "--port" && value) options.port = Number(value);
    else if (flag === "--hermes" && value) options.hermes = value;
    else throw new Error(`Unknown or incomplete option: ${flag}`);
    index += 1;
  }
  if (options.port && (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535)) {
    throw new Error("--port must be an integer from 1024 to 65535.");
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const { server, projectRoot, port } = createFeedbackServer(options);
  server.listen(port, "127.0.0.1", () => {
    const extensionPath = join(fileURLToPath(new URL(".", import.meta.url)), "extension");
    console.log(`Hermes UI Feedback ready on http://127.0.0.1:${port}`);
    console.log(`Worktree: ${projectRoot}`);
    console.log(`Load unpacked extension: ${extensionPath}`);
  });
}
