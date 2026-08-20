import { expect, test } from "@playwright/test";

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

test("the page stays inside desktop and compact viewports", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth
    }));

    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test("source and CI evidence links remain visible and point to the public repository", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const source = page.getByRole("link", { name: "View HookRelay source repository on GitHub" });
    const ci = page.getByRole("link", { name: "View HookRelay CI runs on GitHub" });
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute("href", "https://github.com/x3r3S/hookrelay-webhook-recovery");
    await expect(ci).toBeVisible();
    await expect(ci).toHaveAttribute("href", "https://github.com/x3r3S/hookrelay-webhook-recovery/actions");
  }
});
