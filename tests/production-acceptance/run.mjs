#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const DEFAULT_BASE_URL = "https://olrig-bank.com";
const DEFAULT_DEVELOPMENT_URL = "https://soccotash.onrender.com";
const DEFAULT_PUBLIC_PATHS = [
  "/",
  "/listings/",
  "/local-guide/",
  "/guest-information/",
  "/contact/",
  "/book/",
];

function parseArguments(argv) {
  const options = {
    baseUrl: process.env.PRODUCTION_BASE_URL ?? DEFAULT_BASE_URL,
    developmentUrl:
      process.env.DEVELOPMENT_BASE_URL ?? DEFAULT_DEVELOPMENT_URL,
    expectedHost: process.env.PRODUCTION_EXPECTED_HOST ?? "olrig-bank.com",
    requireAnalytics: true,
    checkDevelopment: true,
    jsonPath: process.env.ACCEPTANCE_JSON_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--base-url" && value) {
      options.baseUrl = value;
      index += 1;
    } else if (argument === "--development-url" && value) {
      options.developmentUrl = value;
      index += 1;
    } else if (argument === "--expected-host" && value) {
      options.expectedHost = value;
      index += 1;
    } else if (argument === "--json" && value) {
      options.jsonPath = value;
      index += 1;
    } else if (argument === "--skip-analytics") {
      options.requireAnalytics = false;
    } else if (argument === "--skip-development") {
      options.checkDevelopment = false;
    } else if (argument === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  options.baseUrl = normaliseOrigin(options.baseUrl);
  options.developmentUrl = normaliseOrigin(options.developmentUrl);
  return options;
}

function normaliseOrigin(value) {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function printHelp() {
  console.log(`Usage: node tests/production-acceptance/run.mjs [options]

Read-only production acceptance checks.

Options:
  --base-url URL          Production origin (default: ${DEFAULT_BASE_URL})
  --expected-host HOST    Canonical production host (default: olrig-bank.com)
  --development-url URL   Development origin (default: ${DEFAULT_DEVELOPMENT_URL})
  --skip-development      Do not check the development origin
  --skip-analytics        Do not require Umami on public pages
  --json PATH             Write the full result as JSON
  --help                  Show this help

Environment equivalents:
  PRODUCTION_BASE_URL, PRODUCTION_EXPECTED_HOST, DEVELOPMENT_BASE_URL,
  ACCEPTANCE_JSON_PATH
`);
}

async function request(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    return await fetch(url, {
      ...init,
      redirect: init.redirect ?? "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "OlrigBank-Production-Acceptance/1.0",
        ...init.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createRecorder() {
  const results = [];

  return {
    pass(name, evidence) {
      results.push({ status: "pass", name, evidence });
      console.log(`PASS  ${name}${evidence ? ` — ${evidence}` : ""}`);
    },
    fail(name, error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ status: "fail", name, evidence: message });
      console.error(`FAIL  ${name} — ${message}`);
    },
    async check(name, action) {
      try {
        const evidence = await action();
        this.pass(name, evidence);
      } catch (error) {
        this.fail(name, error);
      }
    },
    results,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function analyticsEvidence(html) {
  const scripts = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
  ];
  const analytics = scripts.find(
    (script) =>
      new URL(script[1], DEFAULT_BASE_URL).pathname === "/analytics.js" ||
      /umami/i.test(script[1]),
  );
  assert(analytics, "Analytics bootstrap script was not found");
  return analytics[1];
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const recorder = createRecorder();
  const startedAt = new Date().toISOString();

  await recorder.check("Production origin uses HTTPS", async () => {
    const url = new URL(options.baseUrl);
    assert(url.protocol === "https:", `Unexpected protocol: ${url.protocol}`);
    return options.baseUrl;
  });

  await recorder.check("Production resolves to the canonical host", async () => {
    const response = await request(`${options.baseUrl}/`);
    assert(response.ok, `HTTP ${response.status}`);
    assert(
      new URL(response.url).hostname === options.expectedHost,
      `Resolved to ${new URL(response.url).hostname}`,
    );
    return response.url;
  });

  await recorder.check("www redirects to the canonical host", async () => {
    const response = await request(`https://www.${options.expectedHost}/`, {
      redirect: "manual",
    });
    assert(
      response.status >= 300 && response.status < 400,
      `Expected redirect, received HTTP ${response.status}`,
    );
    const location = response.headers.get("location");
    assert(location, "Redirect has no Location header");
    const destination = new URL(location, `https://www.${options.expectedHost}`);
    assert(
      destination.hostname === options.expectedHost,
      `Redirected to ${destination.hostname}`,
    );
    return `HTTP ${response.status} → ${destination}`;
  });

  await recorder.check("Health endpoint confirms database access", async () => {
    const response = await request(`${options.baseUrl}/api/health/`, {
      headers: { accept: "application/json" },
    });
    assert(response.ok, `HTTP ${response.status}`);
    const body = await response.json();
    assert(body.status === "ok", `status=${JSON.stringify(body.status)}`);
    assert(body.database === "ok", `database=${JSON.stringify(body.database)}`);
    return JSON.stringify(body);
  });

  if (options.requireAnalytics) {
    await recorder.check("Analytics bootstrap configures privacy-safe Umami", async () => {
      const response = await request(`${options.baseUrl}/analytics.js`);
      assert(response.ok, `HTTP ${response.status}`);
      assert(
        response.headers.get("content-type")?.includes("javascript"),
        `Unexpected content type: ${response.headers.get("content-type")}`,
      );
      const javascript = await response.text();
      assert(
        /cloud\.umami\.is\/script\.js/.test(javascript),
        "Umami client script is not configured",
      );
      assert(
        /dataset\.websiteId\s*=\s*["'][^"']+["']/.test(javascript),
        "Umami website ID is not configured",
      );
      assert(
        /\/booking\/manage/.test(javascript) && /cleanPage/.test(javascript),
        "Private booking-page sanitisation was not found",
      );
      return "Umami configured; private booking paths sanitised";
    });
  }

  for (const path of DEFAULT_PUBLIC_PATHS) {
    await recorder.check(`Public page ${path}`, async () => {
      const response = await request(`${options.baseUrl}${path}`);
      assert(response.ok, `HTTP ${response.status}`);
      assert(
        response.headers.get("content-type")?.includes("text/html"),
        `Unexpected content type: ${response.headers.get("content-type")}`,
      );
      const html = await response.text();
      assert(/<html[\s>]/i.test(html), "Response does not contain an HTML document");
      const analytics = options.requireAnalytics
        ? `; analytics=${analyticsEvidence(html)}`
        : "";
      return `HTTP ${response.status}; ${html.length} bytes${analytics}`;
    });
  }

  await recorder.check("Unknown public route fails safely", async () => {
    const marker = "production-acceptance-route-that-must-not-exist";
    const response = await request(`${options.baseUrl}/${marker}`);
    assert(response.status === 404, `Expected HTTP 404, received ${response.status}`);
    const body = await response.text();
    assert(!/\b(stack trace|node_modules|database_url)\b/i.test(body), "Response leaks implementation details");
    return "HTTP 404 without obvious implementation details";
  });

  if (options.checkDevelopment) {
    await recorder.check("Development uses a distinct origin", async () => {
      assert(
        new URL(options.developmentUrl).origin !== new URL(options.baseUrl).origin,
        "Production and development origins are identical",
      );
      const response = await request(`${options.developmentUrl}/api/health/`, {
        headers: { accept: "application/json" },
      });
      assert(response.ok, `Development health returned HTTP ${response.status}`);
      const body = await response.json();
      assert(body.status === "ok", `Development status=${JSON.stringify(body.status)}`);
      assert(
        body.database === "ok",
        `Development database=${JSON.stringify(body.database)}`,
      );
      return `${options.developmentUrl} ${JSON.stringify(body)}`;
    });
  }

  const failed = recorder.results.filter((result) => result.status === "fail");
  const report = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: "read-only",
    options: {
      ...options,
      jsonPath: undefined,
    },
    summary: {
      total: recorder.results.length,
      passed: recorder.results.length - failed.length,
      failed: failed.length,
    },
    results: recorder.results,
  };

  if (options.jsonPath) {
    await writeFile(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nEvidence written to ${options.jsonPath}`);
  }

  console.log(
    `\n${report.summary.passed}/${report.summary.total} checks passed; ${report.summary.failed} failed.`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

run().catch((error) => {
  console.error(`FATAL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
