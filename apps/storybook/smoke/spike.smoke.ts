import { expect, test } from "@playwright/test";

for (const n of [1, 2, 3]) {
  test(`spike page ${n} shows a numeric p95 within 30 s`, async ({ page }) => {
    await page.goto(`/spike/${n}?probe=1`);
    const p95 = page.getByTestId("probe-p95");
    await expect(p95).toBeVisible({ timeout: 30_000 });
    const value = Number(await p95.getAttribute("data-value"));
    expect(Number.isFinite(value) && value > 0, `p95 data-value ${value}`).toBe(true);
    // A hidden or empty run is not a measurement.
    await expect(page.getByTestId("probe-overlay-state")).toHaveAttribute("data-valid", "true");
    console.info(`page ${n}: p95 ${value} ms (smoke only, not a device result)`);
  });
}
