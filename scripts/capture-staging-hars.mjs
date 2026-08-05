import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = "https://staging.news-con-seen.com";
const password = process.env.ACCEPTANCE_PASSWORD;
if (!password) throw new Error("ACCEPTANCE_PASSWORD is required");

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const artifacts = path.resolve("artifacts/browser-acceptance");
fs.mkdirSync(artifacts, { recursive: true });

const scenarios = [
  { role: "administrator", email: "acceptance-admin@news-con-seen.com", width: 1440, height: 900, surface: "desktop" },
  { role: "manager", email: "acceptance-manager@news-con-seen.com", width: 1280, height: 800, surface: "desktop" },
  { role: "manager", email: "acceptance-manager@news-con-seen.com", width: 390, height: 844, surface: "mobile-manager" },
  { role: "technician", email: "acceptance-technician@news-con-seen.com", width: 1366, height: 768, surface: "desktop" },
  { role: "worker", email: "acceptance-worker@news-con-seen.com", width: 390, height: 844, surface: "mobile-worker" },
];

const browser = await chromium.launch({ executablePath: edge, headless: true });
const results = [];

for (const scenario of scenarios) {
  const name = `${scenario.role}-${scenario.surface}`;
  const harPath = path.join(artifacts, `${name}.har`);
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    recordHar: { path: harPath, mode: "full", content: "embed" },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500)); });
  page.on("requestfailed", request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  let status = "pass";
  let detail = "";
  try {
    await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator('input[type="email"]').fill(scenario.email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    await page.waitForURL(url => !url.pathname.toLowerCase().includes("login"), { timeout: 90_000 });
    await page.goto(`${baseURL}/CompanyGraphHome`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByText("CompanyGraphHome", { exact: true }).first().waitFor({ state: "attached", timeout: 90_000 });
    await page.waitForTimeout(2_000);

    // Keyboard-only evidence: move focus and activate accessible equivalents.
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 80) }));
    const relationshipTab = page.getByRole("button", { name: "Relationship table" });
    const summaryTab = page.getByRole("button", { name: "Text summary" });
    if (await relationshipTab.count()) {
      await relationshipTab.focus();
      await page.keyboard.press("Enter");
    }
    if (await summaryTab.count()) {
      await summaryTab.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: /Company Graph textual summary/i }).waitFor({ timeout: 20_000 });
    }

    await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
    // Exercise rotation/narrow layout for mobile surfaces.
    if (scenario.surface.startsWith("mobile")) {
      await page.setViewportSize({ width: scenario.height, height: scenario.width });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(artifacts, `${name}-landscape.png`), fullPage: true });
    }
    // Session refresh must remain authenticated.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.getByText("CompanyGraphHome", { exact: true }).first().waitFor({ state: "attached", timeout: 90_000 });
    const refreshedAuthenticated = !new URL(page.url()).pathname.toLowerCase().includes("login");
    if (!refreshedAuthenticated) throw new Error("session was lost after refresh");
    detail = JSON.stringify({ focused, refreshedAuthenticated, url: page.url() });
  } catch (error) {
    status = "fail";
    detail = String(error?.message || error).slice(0, 1000);
    await page.screenshot({ path: path.join(artifacts, `${name}-failure.png`), fullPage: true }).catch(() => {});
  }
  await context.close();
  const harText = fs.existsSync(harPath) ? fs.readFileSync(harPath, "utf8") : "";
  const legacyMatches = [...harText.matchAll(/base44(?:\.onrender\.com)?|app\.base44\.com/gi)].map(match => match[0]);
  if (legacyMatches.length) status = "fail";
  results.push({
    ...scenario, status, detail, har: path.relative(process.cwd(), harPath),
    legacyRequestMatches: legacyMatches.length,
    consoleErrors,
    failedRequests: failedRequests.filter(item => !item.url.includes("sentry.io")).slice(0, 30),
  });
}

await browser.close();
const report = {
  contract: "newsconseen-browser-role-acceptance.v1",
  environment: "staging",
  generatedAt: new Date().toISOString(),
  results,
  summary: {
    passed: results.filter(result => result.status === "pass").length,
    failed: results.filter(result => result.status === "fail").length,
    legacyRequestMatches: results.reduce((sum, result) => sum + result.legacyRequestMatches, 0),
  },
};
fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.summary.failed ? 1 : 0;
