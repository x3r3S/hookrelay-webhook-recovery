import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const fontTargets = Object.freeze([
  [".truth-chip", 9],
  [".hero p", 13],
  [".button", 12],
  [".scoreboard small", 10],
  [".scoreboard strong", 20],
  [".overline", 10],
  [".panel-heading h2", 15],
  [".event-copy strong", 11],
  [".event-copy small", 10],
  [".event-state", 8],
  [".request-line code", 10],
  [".code-window", 10],
  [".check-heading strong", 11],
  [".boundary-note", 9],
  [".signature-grid", 9],
  [".schema-list li", 9],
  [".endpoint-card strong", 10],
  [".timeline strong", 10],
  [".timeline small", 9],
  [".decision-card", 9]
]);

const primaryContrastTargets = Object.freeze([
  ".hero p",
  ".event-copy small",
  ".synthetic-note small",
  ".boundary-note",
  ".signature-grid dt",
  ".schema-list li",
  ".request-line code",
  ".timeline small",
  ".decision-card strong"
]);

const secondaryContrastTargets = Object.freeze([
  ".truth-chip",
  ".endpoint-card small",
  ".decision-card",
  ".audit-strip li small"
]);

const inspectTextStyles = (page, targets) => page.evaluate((requestedTargets) => {
  const parseColor = (value) => {
    const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
  };
  const composite = (top, bottom) => {
    const alpha = top.a + bottom.a * (1 - top.a);
    if (!alpha) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
      a: alpha
    };
  };
  const effectiveBackground = (element) => {
    const layers = [];
    for (let current = element; current; current = current.parentElement) {
      const layer = parseColor(getComputedStyle(current).backgroundColor);
      if (layer.a > 0) layers.push(layer);
    }
    return layers.reverse().reduce((background, layer) => composite(layer, background), { r: 255, g: 255, b: 255, a: 1 });
  };
  const luminance = ({ r, g, b }) => {
    const [red, green, blue] = [r, g, b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const contrast = (foreground, background) => {
    const renderedForeground = composite(foreground, background);
    const light = Math.max(luminance(renderedForeground), luminance(background));
    const dark = Math.min(luminance(renderedForeground), luminance(background));
    return (light + 0.05) / (dark + 0.05);
  };

  return requestedTargets.map((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing typography target: ${selector}`);
    const style = getComputedStyle(element);
    const foreground = parseColor(style.color);
    const background = effectiveBackground(element);
    return {
      selector,
      fontSize: Number.parseFloat(style.fontSize),
      color: style.color,
      background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
      contrast: contrast(foreground, background)
    };
  });
}, targets);

test("events keep unique fixture keys and the duplicate remains separately selectable", async ({ page }) => {
  await page.goto("/");

  const eventCards = page.locator("#event-list .event-item");
  await expect(eventCards).toHaveCount(4);
  expect(await eventCards.evaluateAll((cards) => cards.map((card) => card.dataset.eventKey))).toEqual([
    "order-1048",
    "invoice-772",
    "order-1048-copy",
    "profile-91"
  ]);
  await expect(eventCards.nth(0)).toHaveAccessibleName("Inspect evt_order_1048, captured event");
  await expect(eventCards.nth(2)).toHaveAccessibleName("Inspect evt_order_1048, duplicate copy");
  await expect(eventCards.nth(1)).toHaveClass(/is-selected/);

  await eventCards.nth(2).click();

  await expect(eventCards.nth(2)).toHaveClass(/is-selected/);
  await expect(eventCards.nth(0)).not.toHaveClass(/is-selected/);
  await expect(page.locator("#schema-result")).toHaveText("Duplicate");
  await expect(page.locator("#delivery-status")).toHaveText("Duplicate");
  await expect(page.locator("#delivery-timeline")).toContainText("Duplicate gated");
});

test("manual replay updates the failed delivery and the downloaded local-only evidence", async ({ page }) => {
  await page.goto("/");

  const eventCards = page.locator("#event-list .event-item");
  await expect(eventCards.nth(1)).toHaveClass(/is-selected/);
  await expect(page.locator("#delivery-status")).toHaveText("Needs replay");
  await expect(page.locator("#delivery-timeline")).toContainText("Attempt 4 · 500");
  await expect(page.getByRole("button", { name: "Replay event" })).toBeVisible();

  await page.getByRole("button", { name: "Replay event" }).click();

  await expect(page.locator("#delivery-status")).toHaveText("Delivered · sandbox");
  await expect(page.locator("#delivery-timeline")).toContainText("Manual replay · 200");
  await expect(page.locator("#decision-card")).toContainText("Replay complete");
  await expect(page.locator("#decision-card")).toBeFocused();
  await expect(page.locator("#audit-entries")).toContainText("operator replay · 200 · local simulation");
  await expect(page.locator("#dlq-card")).toBeHidden();
  await expect(eventCards.nth(1).locator(".event-state")).toHaveText("Delivered");

  const auditDownloadStarted = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export audit JSON" }).click();
  const auditDownload = await auditDownloadStarted;
  const report = JSON.parse(await readFile(await auditDownload.path(), "utf8"));

  expect({
    provenance: report.provenance,
    externalActions: report.externalActions,
    processed: report.processed,
    accepted: report.accepted,
    duplicates: report.duplicates,
    rejected: report.rejected
  }).toEqual({
    provenance: "personal_demo",
    externalActions: false,
    processed: 4,
    accepted: 2,
    duplicates: 1,
    rejected: 1
  });
  expect(report.audit).toHaveLength(4);
  expect(report.audit.every(({ action }) => action === "INGEST")).toBe(true);
  expect(report.operatorAudit).toEqual([
    expect.objectContaining({ eventId: "evt_invoice_772", action: "OPERATOR_REPLAY", actor: "local_operator", boundary: "browser_local_simulation", externalAction: false, outcome: "200", decision: "simulated_delivered" })
  ]);
  expect(report.deliveries["invoice-772"]).toEqual(expect.objectContaining({
    status: "delivered",
    replayed: true,
    replay: { outcome: "200", success: true }
  }));

  await page.getByRole("button", { name: "Reset replay" }).click();
  await expect(page.locator("#delivery-status")).toHaveText("Needs replay");
  await expect(page.getByRole("button", { name: "Replay event" })).toBeVisible();
});

test("a tampered request is rejected before queueing and cannot be replayed", async ({ page }) => {
  await page.goto("/");

  const rejectedEvent = page.locator('[data-event-key="profile-91"]');
  await rejectedEvent.click();

  await expect(rejectedEvent).toHaveClass(/is-selected/);
  await expect(page.locator("#signature-result")).toHaveText("Failed");
  await expect(page.locator("#delivery-status")).toHaveText("Rejected");
  await expect(page.locator("#delivery-timeline")).toContainText("Digest rejected");
  await expect(page.locator("#delivery-timeline")).toContainText("Stopped before delivery");
  await expect(page.locator("#decision-card")).toContainText("Rejected before queue");
  await expect(page.locator("#dlq-card")).toBeHidden();
  await expect(page.getByRole("button", { name: "Replay event" })).toBeHidden();
});

test("the sandbox boundary is explicit and the page requests no external resources", async ({ page }) => {
  const nonLocalRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.hostname !== "127.0.0.1") nonLocalRequests.push(url.href);
  });

  await page.goto("/");

  await expect(page.locator("body")).toHaveAttribute("data-demo", "true");
  await expect(page.locator(".truth-chip")).toContainText("Local replay · no network");
  await expect(page.locator(".synthetic-note")).toContainText("Sandbox capture");
  await expect(page.locator(".synthetic-note")).toContainText("browser session");
  await expect(page.locator(".lock")).toHaveText("sandbox");
  await expect(page.locator(".audit-boundary")).toHaveText("Read-only audit");

  const externalResources = await page.evaluate(() => performance.getEntriesByType("resource")
    .map(({ name }) => name)
    .filter((name) => new URL(name).origin !== location.origin));
  expect(externalResources).toEqual([]);
  expect(nonLocalRequests).toEqual([]);
});

test("the page stays inside the configured viewport", async ({ page }, testInfo) => {
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth
  }));
  const expectedViewport = testInfo.project.name === "chromium-mobile-390"
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 };

  expect({ width: dimensions.width, height: dimensions.height }).toEqual(expectedViewport);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.width);

  await page.screenshot({
    path: testInfo.outputPath(`hookrelay-${testInfo.project.name}.png`),
    fullPage: false,
    animations: "disabled"
  });
});

test("operational text, contrast and control sizes stay within the redesigned baseline", async ({ page }) => {
  await page.goto("/");

  const typography = await inspectTextStyles(page, fontTargets.map(([selector]) => selector));
  for (const [selector, minimum] of fontTargets) {
    const actual = typography.find((entry) => entry.selector === selector);
    expect(actual.fontSize, `${selector} computed font-size`).toBeGreaterThanOrEqual(minimum);
  }

  const primaryContrast = await inspectTextStyles(page, primaryContrastTargets);
  for (const evidence of primaryContrast) {
    expect(
      evidence.contrast,
      `${evidence.selector}: ${evidence.color} on ${evidence.background}`
    ).toBeGreaterThanOrEqual(4.5);
  }

  const secondaryContrast = await inspectTextStyles(page, secondaryContrastTargets);
  for (const evidence of secondaryContrast) {
    expect(
      evidence.contrast,
      `${evidence.selector}: ${evidence.color} on ${evidence.background}`
    ).toBeGreaterThanOrEqual(3);
  }

  const controls = await page.evaluate(() => [
    ["primary action", document.querySelector("#export-audit")],
    ["event row", document.querySelector(".event-item")],
    ["copy action", document.querySelector("#copy-payload")],
    ["navigation item", document.querySelector(".rail-link.is-active")]
  ].map(([label, element]) => ({ label, height: element.getBoundingClientRect().height })));
  expect(controls).toEqual([
    { label: "primary action", height: expect.any(Number) },
    { label: "event row", height: expect.any(Number) },
    { label: "copy action", height: expect.any(Number) },
    { label: "navigation item", height: expect.any(Number) }
  ]);
  expect(controls[0].height).toBeGreaterThanOrEqual(38);
  expect(controls[1].height).toBeGreaterThanOrEqual(70);
  expect(controls[2].height).toBeGreaterThanOrEqual(31);
  expect(controls[3].height).toBeGreaterThanOrEqual(36);
});

test("keyboard navigation exposes focus and activates a delivery without a pointer", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.locator(".skip-link");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  let eventReached = false;
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    eventReached = await page.evaluate(() => document.activeElement?.matches("#event-list .event-item") ?? false);
    if (eventReached) break;
  }
  expect(eventReached, "event stream is reachable by Tab").toBe(true);

  const eventCards = page.locator("#event-list .event-item");
  await expect(eventCards.nth(0)).toBeFocused();
  const focusStyle = await eventCards.nth(0).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor
    };
  });
  expect(focusStyle.outlineStyle).toBe("solid");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(focusStyle.outlineColor).not.toBe("rgba(0, 0, 0, 0)");

  await page.keyboard.press("Tab");
  await expect(eventCards.nth(1)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(eventCards.nth(2)).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(eventCards.nth(2)).toHaveClass(/is-selected/);
  await expect(eventCards.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(eventCards.nth(2)).toBeFocused();
  await expect(page.locator("#delivery-status")).toHaveText("Duplicate");
  await expect(page.locator("#delivery-timeline")).toContainText("Duplicate gated");
});

test("source and CI links are visible and point to the published repository", async ({ page }) => {
  await page.goto("/");
  for (const [name, href] of [
    ["View HookRelay source repository on GitHub", "https://github.com/x3r3S/hookrelay-webhook-recovery"],
    ["View HookRelay CI runs on GitHub", "https://github.com/x3r3S/hookrelay-webhook-recovery/actions"]
  ]) {
    const link = page.getByRole("link", { name });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);
  }
});
