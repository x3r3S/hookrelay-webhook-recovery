import { expect, test } from "@playwright/test";

const fontTargets = Object.freeze([
  [".truth-chip", 10],
  [".hero p", 14],
  [".button", 11],
  [".scoreboard", 10],
  [".scoreboard strong", 13],
  [".overline", 10],
  [".event-copy strong", 12],
  [".event-copy small", 10],
  [".event-state", 10],
  [".request-line code", 11],
  [".code-window", 11],
  [".check-heading strong", 11],
  [".boundary-note", 10],
  [".signature-grid", 11],
  [".schema-list li", 11],
  [".endpoint-card small", 10],
  [".endpoint-card strong", 11],
  [".timeline strong", 11],
  [".timeline small", 10],
  [".decision-card", 11],
  [".audit-strip li small", 10]
]);

const quietContrastTargets = Object.freeze([
  ".scoreboard",
  ".event-copy small",
  ".synthetic-note",
  ".request-size",
  ".boundary-note",
  ".signature-grid dt",
  ".endpoint-card small",
  ".timeline small",
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

test("the duplicate fixture remains separately selectable from the original", async ({ page }) => {
  await page.goto("/");

  const eventCards = page.locator("#event-list .event-item");
  await expect(eventCards).toHaveCount(4);
  await expect(eventCards.nth(0)).toHaveAccessibleName("Inspect evt_order_1048, fixture");
  await expect(eventCards.nth(2)).toHaveAccessibleName("Inspect evt_order_1048, duplicate copy");
  await eventCards.nth(2).click();

  await expect(eventCards.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(eventCards.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#schema-result")).toHaveText("Duplicate");
  await expect(page.locator("#delivery-status")).toHaveText("duplicate gated");
  await expect(page.locator("#delivery-timeline")).toContainText("Duplicate gated");
});

test("manual replay turns the dead-letter fixture into a delivered state", async ({ page }) => {
  await page.goto("/");

  const eventCards = page.locator("#event-list .event-item");
  await eventCards.nth(1).click();
  await expect(page.locator("#delivery-status")).toHaveText("dry-run DLQ");

  await page.getByRole("button", { name: "Replay event" }).click();

  await expect(page.locator("#delivery-status")).toHaveText("dry run · replayed 200");
  await expect(page.locator("#delivery-timeline")).toContainText("Manual replay · 200");
  await expect(page.locator("#decision-card")).toContainText("Replay complete");
  await expect(page.locator("#decision-card")).toBeFocused();
  await expect(page.locator("#dlq-card")).toBeHidden();
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

test("source and CI evidence links remain visible and point to the public repository", async ({ page }) => {
  await page.goto("/");

  const source = page.getByRole("link", { name: "View HookRelay source repository on GitHub" });
  const ci = page.getByRole("link", { name: "View HookRelay CI runs on GitHub" });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute("href", "https://github.com/x3r3S/hookrelay-webhook-recovery");
  await expect(ci).toBeVisible();
  await expect(ci).toHaveAttribute("href", "https://github.com/x3r3S/hookrelay-webhook-recovery/actions");
});

test("operational typography and quiet text meet readable computed-style targets", async ({ page }) => {
  await page.goto("/");

  const typography = await inspectTextStyles(page, fontTargets.map(([selector]) => selector));
  for (const [selector, minimum] of fontTargets) {
    const actual = typography.find((entry) => entry.selector === selector);
    expect(actual.fontSize, `${selector} computed font-size`).toBeGreaterThanOrEqual(minimum);
  }

  const contrastEvidence = await inspectTextStyles(page, quietContrastTargets);
  for (const evidence of contrastEvidence) {
    expect(
      evidence.contrast,
      `${evidence.selector}: ${evidence.color} on ${evidence.background}`
    ).toBeGreaterThanOrEqual(4.5);
  }
});

test("keyboard navigation exposes visible focus and activates an event card", async ({ page }) => {
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
  await page.keyboard.press("Tab");
  await expect(eventCards.nth(1)).toBeFocused();

  const focusStyle = await eventCards.nth(1).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset)
    };
  });
  expect(focusStyle.outlineStyle).toBe("solid");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(focusStyle.outlineOffset).toBeLessThanOrEqual(0);

  await page.keyboard.press("Enter");
  await expect(eventCards.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#delivery-status")).toHaveText("dry-run DLQ");
});
