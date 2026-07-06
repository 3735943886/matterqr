import { test, expect } from "@playwright/test";

// Each Playwright test gets an isolated browser context, so IndexedDB starts
// empty — no manual cleanup needed (and none that survives a reload).

async function open(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__matterqrReady === true);
}

async function registerViaManual(page, code, model) {
  await page.locator("#btn-scan").click();
  const manual = page.getByPlaceholder(/페어링 코드/);
  await expect(manual).toBeVisible();
  await manual.fill(code);
  await page.getByRole("button", { name: "확인" }).click();
  // New-device modal opens
  await expect(page.getByText("신규 등록")).toBeVisible();
  if (model) await page.getByPlaceholder(/Philips Hue/).fill(model);
  await page.getByRole("button", { name: "저장" }).click();
  // Wait for the save to commit (modal closes only after put + reload).
  await expect(page.getByText("신규 등록")).toBeHidden();
}

test("loads without fatal errors and shows the empty state", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator("#btn-scan")).toBeVisible();
  await expect(page.locator("#empty")).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("register a device via manual pairing code", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Hue A19");
  const list = page.locator("#device-list");
  await expect(list.getByText("Hue A19")).toBeVisible();
  await expect(list.getByText("PIN")).toBeVisible(); // manual-code badge
});

test("re-entering the same code warns duplicate and opens edit", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Hue A19");

  // Scan the same code again → duplicate branch → edit modal
  await page.locator("#btn-scan").click();
  await page.getByPlaceholder(/페어링 코드/).fill("34970112332");
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.getByText("디바이스 편집")).toBeVisible();
  // model preserved from the first registration
  await expect(page.getByPlaceholder(/Philips Hue/)).toHaveValue("Hue A19");
});

test("QR form of the same device dedups to one record", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Hue A19");
  // The QR encodes the same passcode → identity collision → edit, not a 2nd row
  await page.locator("#btn-scan").click();
  await page.getByPlaceholder(/페어링 코드/).fill("MT:Y.K9042C00KA0648G00");
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.getByText("디바이스 편집")).toBeVisible();
  await page.getByRole("button", { name: "취소" }).click();
  await expect(page.locator("#device-list > *")).toHaveCount(1);
});

test("persists across reload (IndexedDB)", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Hue A19");
  await page.reload();
  await expect(page.locator("#device-list").getByText("Hue A19")).toBeVisible();
});
