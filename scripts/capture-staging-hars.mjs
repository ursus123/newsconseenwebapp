import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = process.env.ACCEPTANCE_BASE_URL || "https://staging.news-con-seen.com";
const password = process.env.ACCEPTANCE_PASSWORD;
if (!password) throw new Error("ACCEPTANCE_PASSWORD is required");

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const artifacts = path.resolve(process.env.ACCEPTANCE_ARTIFACT_DIR || "artifacts/browser-acceptance");
fs.mkdirSync(artifacts, { recursive: true });

const allScenarios = [
  { role: "administrator", email: "acceptance-admin@news-con-seen.com", width: 1440, height: 900, surface: "desktop" },
  { role: "manager", email: "acceptance-manager@news-con-seen.com", width: 1280, height: 800, surface: "desktop" },
  { role: "manager", email: "acceptance-manager@news-con-seen.com", width: 390, height: 844, surface: "mobile-manager" },
  { role: "technician", email: "acceptance-technician@news-con-seen.com", width: 1366, height: 768, surface: "desktop" },
  { role: "worker", email: "acceptance-worker@news-con-seen.com", width: 390, height: 844, surface: "mobile-worker" },
];
const scenarioFilter = process.env.ACCEPTANCE_SCENARIO;
const scenarios = scenarioFilter
  ? allScenarios.filter(scenario => `${scenario.role}-${scenario.surface}` === scenarioFilter)
  : allScenarios;
if (!scenarios.length) throw new Error(`Unknown ACCEPTANCE_SCENARIO: ${scenarioFilter}`);

const browser = await chromium.launch({ executablePath: edge, headless: true });
const results = [];

for (const scenario of scenarios) {
  const name = `${scenario.role}-${scenario.surface}`;
  const harPath = path.join(artifacts, `${name}.har`);
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    reducedMotion: process.env.ACCEPTANCE_CHECK_PHASE7 === "1" ? "reduce" : "no-preference",
    recordHar: { path: harPath, mode: "full", content: "embed" },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500)); });
  page.on("requestfailed", request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  let status = "pass";
  let detail = "";
  let phase1 = null;
  let phase2 = null;
  let phase3 = null;
  let phase4 = null;
  let phase5 = null;
  let phase6 = null;
  let phase7 = null;
  try {
    await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.locator('input[type="email"]').fill(scenario.email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /^Sign in$/ }).click();
    await page.waitForURL(url => !url.pathname.toLowerCase().includes("login"), { timeout: 90_000 });
    await page.goto(`${baseURL}/CompanyGraphHome`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByText("CompanyGraphHome", { exact: true }).first().waitFor({ state: "attached", timeout: 90_000 });
    await page.waitForTimeout(2_000);

    if (process.env.ACCEPTANCE_CHECK_PHASE1 === "1") {
      const workspace = page.locator('section[aria-label="Primary Company Graph workspace"]');
      const workspaceBox = await workspace.boundingBox();
      const guideBox = await page.getByRole("button", { name: /What is Company Graph/i }).boundingBox();
      if (!workspaceBox || workspaceBox.y >= scenario.height || workspaceBox.height < 600) {
        throw new Error(`primary graph workspace is not usable in the initial viewport: ${JSON.stringify(workspaceBox)}`);
      }
      if (!guideBox || guideBox.y >= workspaceBox.y) {
        throw new Error(`Company Graph orientation must appear above the primary workspace: ${JSON.stringify({ guideBox, workspaceBox })}`);
      }
      const briefingToggle = page.getByRole("button", { name: /operational detail/i });
      const expectedBriefingState = await briefingToggle.getAttribute("aria-expanded") !== "true";
      await briefingToggle.click();
      const relationshipToggle = page.getByRole("button", { name: /Relationship review/i }).first();
      const relationshipAvailable = await relationshipToggle.count() > 0;
      const expectedRelationshipState = relationshipAvailable
        ? await relationshipToggle.getAttribute("aria-expanded") !== "true"
        : true;
      if (relationshipAvailable) await relationshipToggle.click();
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.getByText("CompanyGraphHome", { exact: true }).first().waitFor({ state: "attached", timeout: 90_000 });
      await page.locator('[data-company-graph-preferences-ready="true"]').waitFor({ state: "attached", timeout: 20_000 });
      const briefingPersisted = (await page.getByRole("button", { name: /operational detail/i }).getAttribute("aria-expanded") === "true") === expectedBriefingState;
      const relationshipPersisted = !relationshipAvailable || (await page.getByRole("button", { name: /Relationship review/i }).first().getAttribute("aria-expanded") === "true") === expectedRelationshipState;
      if (!briefingPersisted || !relationshipPersisted) throw new Error(`section preferences did not persist across refresh: ${JSON.stringify({ expectedBriefingState, expectedRelationshipState, briefingPersisted, relationshipPersisted })}`);
      phase1 = { workspaceBox, guideBox, briefingPersisted, relationshipPersisted };
    }

    if (process.env.ACCEPTANCE_CHECK_PHASE2 === "1") {
      const embeddedCanvas = page.locator('[data-company-graph-canvas="embedded"]');
      const embeddedBox = await embeddedCanvas.boundingBox();
      const embeddedMinimum = scenario.width < 640 ? 400 : 480;
      if (!embeddedBox || embeddedBox.width < 1 || embeddedBox.height < embeddedMinimum) throw new Error(`embedded graph canvas violates its size contract: ${JSON.stringify({ embeddedBox, embeddedMinimum })}`);
      const scopeBefore = await page.getByLabel("Organization or operational-unit scope").inputValue();
      const riskFilter = page.getByRole("button", { name: /Open Risks/i });
      await riskFilter.click();

      await page.getByRole("button", { name: "Expand graph canvas" }).click();
      const graphDialog = page.getByRole("dialog", { name: "Expanded Company Graph canvas" });
      await graphDialog.waitFor({ state: "visible", timeout: 20_000 });
      const expandedGraphBox = await graphDialog.locator('[data-company-graph-canvas="graph"]').boundingBox();
      const scrollLocked = await page.evaluate(() => document.body.style.overflow === "hidden");
      const expandedMinimum = scenario.width < 640 ? Math.max(360, scenario.height - 190) : scenario.height - 120;
      if (!expandedGraphBox || expandedGraphBox.height < expandedMinimum || !scrollLocked) throw new Error(`expanded graph sizing or scroll lock failed: ${JSON.stringify({ expandedGraphBox, expandedMinimum, scrollLocked })}`);
      await page.keyboard.press("Escape");
      await graphDialog.waitFor({ state: "detached", timeout: 20_000 });
      const graphFocusRestored = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Expand graph canvas");

      await page.getByRole("button", { name: "Expand graph workspace" }).click();
      const workspaceDialog = page.getByRole("dialog", { name: "Expanded Company Graph workspace" });
      await workspaceDialog.waitFor({ state: "visible", timeout: 20_000 });
      const expandedWorkspaceBox = await workspaceDialog.locator('[data-company-graph-canvas="workspace"]').boundingBox();
      const inspectorVisible = await workspaceDialog.getByLabel("Expanded graph inspector").isVisible();
      await workspaceDialog.getByRole("button", { name: "Exit expanded Company Graph" }).click();
      await workspaceDialog.waitFor({ state: "detached", timeout: 20_000 });
      const workspaceFocusRestored = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Expand graph workspace");
      const scopePreserved = await page.getByLabel("Organization or operational-unit scope").inputValue() === scopeBefore;
      const filterPreserved = await riskFilter.getAttribute("aria-pressed") === "true";
      const workspaceMinimum = scenario.width < 640 ? 260 : scenario.height - 120;
      if (!expandedWorkspaceBox || expandedWorkspaceBox.height < workspaceMinimum || !inspectorVisible || !graphFocusRestored || !workspaceFocusRestored || !scopePreserved || !filterPreserved) {
        throw new Error(`expanded workspace state contract failed: ${JSON.stringify({ expandedWorkspaceBox, inspectorVisible, graphFocusRestored, workspaceFocusRestored, scopePreserved, filterPreserved })}`);
      }
      phase2 = { embeddedBox, expandedGraphBox, expandedWorkspaceBox, scrollLocked, inspectorVisible, graphFocusRestored, workspaceFocusRestored, scopePreserved, filterPreserved };
    }

    if (process.env.ACCEPTANCE_CHECK_PHASE3 === "1") {
      const canvas = page.locator('[data-company-graph-canvas="embedded"]');
      const canvasStyle = await canvas.evaluate(element => {
        const style = getComputedStyle(element);
        return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage };
      });
      if (/rgb\(2, 6, 23\)|rgb\(15, 23, 42\)/.test(canvasStyle.backgroundColor) || canvasStyle.backgroundImage === "none") {
        throw new Error(`Company Graph did not render the light operational canvas: ${JSON.stringify(canvasStyle)}`);
      }
      const legendButton = page.getByRole("button", { name: /Relationship legend/i }).first();
      if (await legendButton.getAttribute("aria-expanded") !== "true") await legendButton.click();
      for (const label of ["Solid slate", "Solid emerald", "Dashed blue", "Dashed violet", "Dashed cyan", "Dashed amber", "Dotted rose"]) {
        await page.getByText(label, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      }
      await page.screenshot({ path: path.join(artifacts, `${name}-phase3-graph.png`), fullPage: false });
      phase3 = { canvasStyle, governedLegendVisible: true };
    }

    if (process.env.ACCEPTANCE_CHECK_PHASE4 === "1") {
      const layoutSelect = page.getByLabel("Operational graph question and layout");
      const canvas = page.locator('[data-company-graph-canvas="embedded"]');
      const layouts = [
        ["operational_focus", "What matters now around this organization or unit?"],
        ["organizational_structure", "How is this operation organized?"],
        ["responsibilities_work", "Who owns which work?"],
        ["customers_suppliers", "Which parties exchange value with the operation?"],
        ["products_services", "How do offerings connect to enterprises and transactions?"],
        ["risks_opportunities", "What threatens or improves the operation?"],
        ["decisions_actions", "How does evidence become approved work?"],
        ["data_quality", "Where does graph truth need governed repair?"],
        ["external_disruptions", "Which external events affect internal operations?"],
      ];
      const renderedLayouts = [];
      for (const [value, question] of layouts) {
        await layoutSelect.selectOption(value);
        await page.getByText(question, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        await page.waitForFunction(expected => document.querySelector('[data-company-graph-canvas="embedded"]')?.getAttribute("data-layout-mode") === expected, value);
        const box = await canvas.boundingBox();
        if (!box || box.width < 300 || box.height < 480) throw new Error(`layout ${value} lost its usable canvas: ${JSON.stringify(box)}`);
        renderedLayouts.push(value);
      }
      await layoutSelect.selectOption("operational_focus");
      await page.screenshot({ path: path.join(artifacts, `${name}-phase4-layouts.png`), fullPage: false });
      phase4 = { renderedLayouts, canvasPreserved: true };
    }

    if (process.env.ACCEPTANCE_CHECK_PHASE5 === "1") {
      const relationshipToggle = page.getByRole("button", { name: /Relationship review/i }).first();
      if (await relationshipToggle.getAttribute("aria-expanded") !== "true") await relationshipToggle.click();
      await page.getByLabel("Relationship review filters").waitFor({ state: "visible", timeout: 20_000 });
      for (const label of ["Filter relationship state", "Filter relationship confidence", "Filter relationship age", "Sort relationship review", "Filter relationship source"]) {
        await page.getByLabel(label).waitFor({ state: "visible", timeout: 10_000 });
      }
      await page.getByRole("button", { name: "Open workspace" }).first().click();
      const relationshipWorkspace = page.getByRole("dialog", { name: "Relationship governance workspace" });
      await relationshipWorkspace.waitFor({ state: "visible", timeout: 20_000 });
      const relationshipScrollLocked = await page.evaluate(() => document.body.style.overflow === "hidden");
      if (!relationshipScrollLocked) throw new Error("relationship governance workspace did not lock background scrolling");
      await page.keyboard.press("Escape");
      await relationshipWorkspace.waitFor({ state: "detached", timeout: 20_000 });

      const qualityToggle = page.getByRole("button", { name: /Graph-quality work/i }).first();
      const qualityAvailable = await qualityToggle.count() > 0;
      if (qualityAvailable) {
        if (await qualityToggle.getAttribute("aria-expanded") !== "true") await qualityToggle.click();
        await page.getByLabel("Filter graph-quality severity").waitFor({ state: "visible", timeout: 20_000 });
        await page.getByLabel("Filter graph-quality verification").waitFor({ state: "visible", timeout: 20_000 });
        await page.getByLabel("Sort graph-quality work").waitFor({ state: "visible", timeout: 20_000 });
        const qualityOpenWorkspace = page.locator('section[aria-label="Governed graph-quality work"]').getByRole("button", { name: "Open workspace" });
        await qualityOpenWorkspace.click();
        const qualityWorkspace = page.getByRole("dialog", { name: "Graph-quality governance workspace" });
        await qualityWorkspace.waitFor({ state: "visible", timeout: 20_000 });
        await page.keyboard.press("Escape");
        await qualityWorkspace.waitFor({ state: "detached", timeout: 20_000 });
      }
      phase5 = { relationshipQueue: true, relationshipWorkspace: true, qualityQueue: qualityAvailable };
    }

    if (process.env.ACCEPTANCE_CHECK_PHASE6 === "1") {
      for (const label of ["Scope controls", "Find controls", "View, navigation, boundary and governance controls"]) {
        await page.getByLabel(label).waitFor({ state: "visible", timeout: 20_000 });
      }
      for (const label of ["Operational graph question and layout", "Accessible graph representation", "Organization or operational-unit scope"]) {
        await page.getByLabel(label).waitFor({ state: "visible", timeout: 20_000 });
      }
      const technicalLoadCopy = await page.getByText("Load next bounded page", { exact: true }).count();
      if (technicalLoadCopy) throw new Error("technical bounded-page language remains visible");
      const health = page.getByRole("button", { name: /Graph health/i });
      await health.click();
      await page.locator("#company-graph-status-detail").waitFor({ state: "visible", timeout: 20_000 });
      for (const label of ["Service:", "Scope:", "Completeness:", "Freshness:", "Source failures:", "Relationship work:", "Quality work:"]) {
        await page.getByText(label, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      }
      const inspector = page.locator("#company-graph-inspector");
      if (await inspector.isVisible()) throw new Error("empty inspector should be hidden");
      await page.getByLabel("Accessible graph representation").selectOption("records");
      const recordButton = page.locator('[aria-label="Keyboard navigable graph records"] button').first();
      if (await recordButton.count()) {
        await recordButton.click();
        await inspector.waitFor({ state: "visible", timeout: 20_000 });
        await inspector.getByText(/Outgoing relationships|Incoming relationships|Operational context|Permitted actions/i).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      }
      phase6 = { groupedControls: true, graphHealth: true, inspectorHiddenWhenEmpty: true, inspectorCoordinatesSelection: await inspector.isVisible() };
    }

    if (process.env.ACCEPTANCE_CHECK_PHASE7 === "1") {
      const root = page.locator('[data-company-graph-root="true"]');
      await root.waitFor({ state: "visible", timeout: 20_000 });
      const rootFontPx = await root.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
      if (rootFontPx < 11) throw new Error(`Company Graph typography floor is ${rootFontPx}px`);

      const health = page.getByRole("button", { name: /Graph health/i });
      if (await health.getAttribute("aria-expanded") !== "true") await health.click();
      const healthDetail = page.locator("#company-graph-status-detail");
      await healthDetail.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForFunction(() => {
        const detail = document.querySelector("#company-graph-status-detail");
        if (!detail) return false;
        const text = detail.textContent || "";
        return !/checking/i.test(text) && ["Alerts status", "Pending approvals", "Intelligence inbox", "Graph audit"].every(label => text.includes(label));
      }, null, { timeout: 25_000 });
      const capabilityStates = {};
      for (const label of ["Alerts", "Pending approvals", "Intelligence inbox", "Graph audit"]) {
        const card = healthDetail.locator("div.rounded-lg", { hasText: label }).first();
        await card.waitFor({ state: "visible", timeout: 20_000 });
        const text = (await card.innerText()).replace(/\s+/g, " ").trim();
        if (/Checking/i.test(text)) throw new Error(`${label} remained in a checking state`);
        if (!/(Available|Empty|Unauthorized|Unavailable|Degraded)/i.test(text)) {
          throw new Error(`${label} did not expose a five-state capability result: ${text}`);
        }
        capabilityStates[label] = text;
      }

      await page.getByLabel("Accessible graph representation").selectOption("records");
      const accessibleRecords = page.locator('[aria-label="Keyboard navigable graph records"]');
      await accessibleRecords.waitFor({ state: "visible", timeout: 20_000 });
      const targetSizes = await accessibleRecords.locator("button").evaluateAll(buttons => buttons.map(button => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }));
      if (targetSizes.some(size => size.height < 44 || size.width < 44)) {
        throw new Error(`accessible record target is below 44px: ${JSON.stringify(targetSizes)}`);
      }

      const firstRecord = accessibleRecords.locator("button").first();
      const hasRecord = await firstRecord.count() > 0;
      let keyboardSelection = false;
      if (hasRecord) {
        await firstRecord.focus();
        await page.keyboard.press("Enter");
        await page.locator("#company-graph-inspector").waitFor({ state: "visible", timeout: 20_000 });
        keyboardSelection = true;
      }

      await page.getByLabel("Accessible graph representation").selectOption("relationships");
      const relationshipTable = page.getByRole("table", { name: "Governed relationships" });
      await relationshipTable.waitFor({ state: "visible", timeout: 20_000 });
      await page.getByLabel("Accessible graph representation").selectOption("outline");
      await page.getByRole("region", { name: "Hierarchical neighborhood outline" }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByLabel("Accessible graph representation").selectOption("summary");
      await page.getByRole("region", { name: "Textual graph summary" }).waitFor({ state: "visible", timeout: 20_000 });
      await page.getByLabel("Accessible graph representation").selectOption("visual");

      const graphExpand = page.getByRole("button", { name: "Expand graph canvas" });
      await graphExpand.click();
      const graphDialog = page.getByRole("dialog", { name: "Expanded Company Graph canvas" });
      await graphDialog.waitFor({ state: "visible", timeout: 20_000 });
      await page.keyboard.press("Escape");
      await graphDialog.waitFor({ state: "detached", timeout: 20_000 });
      const focusRestored = await graphExpand.evaluate(element => document.activeElement === element);
      if (!focusRestored) throw new Error("Escape did not restore focus to the graph expansion control");

      phase7 = {
        rootFontPx,
        capabilityStates,
        accessibleTargetCount: targetSizes.length,
        keyboardSelection,
        equivalentRepresentations: ["records", "relationships", "outline", "summary"],
        reducedMotion: true,
        escapeAndFocusRestoration: true,
      };
    }

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
    detail = JSON.stringify({ focused, refreshedAuthenticated, url: page.url(), phase1, phase2, phase3, phase4, phase5, phase6, phase7 });
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
  environment: new URL(baseURL).hostname === "localhost" ? "local" : "staging",
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
