import { test, expect } from "@playwright/test";

// Each Playwright test gets an isolated browser context, so IndexedDB starts
// empty — no manual cleanup needed (and none that survives a reload).

async function open(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__matterqrReady === true);
}

async function registerViaManual(page, code, model) {
  await page.locator("#btn-scan").click();
  const manual = page.getByPlaceholder(/pairing code/i);
  await expect(manual).toBeVisible();
  await manual.fill(code);
  await page.getByRole("button", { name: "Look up" }).click();
  // New-device modal opens
  await expect(page.getByText("Register device")).toBeVisible();
  if (model) await page.getByPlaceholder(/Philips Hue/).fill(model);
  await page.getByRole("button", { name: "Save" }).click();
  // Wait for the save to commit (modal closes only after put + reload).
  await expect(page.getByText("Register device")).toBeHidden();
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
  await page.getByPlaceholder(/pairing code/i).fill("34970112332");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("Device details")).toBeVisible();
  // model preserved from the first registration
  await expect(page.getByPlaceholder(/Philips Hue/)).toHaveValue("Hue A19");
});

test("QR form of the same device dedups to one record", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Hue A19");
  // The QR encodes the same passcode → identity collision → edit, not a 2nd row
  await page.locator("#btn-scan").click();
  await page.getByPlaceholder(/pairing code/i).fill("MT:Y.K9042C00KA0648G00");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("Device details")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#device-list > *")).toHaveCount(1);
});

test("device screen shows a generated QR for a scanned Matter code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  // Register from the QR (MT:) form — only real Matter codes render a QR; a
  // manual numeric code deliberately shows none (it can't be rebuilt into one).
  await registerViaManual(page, "MT:Y.K9042C00KA0648G00", "Hue A19");
  // Open the device from the list
  await page.locator("#device-list > *").first().click();
  await expect(page.getByText("Device details")).toBeVisible();
  const qr = page.getByRole("img", { name: "QR" }).first();
  await expect(qr).toBeVisible();
  // The numeric manual pairing code is derived from the QR and shown 4-3-4.
  await expect(page.getByText("3497-011-2332")).toBeVisible();
  // Tapping it copies the plain digits to the clipboard.
  await page.getByRole("button", { name: "Copy pairing code" }).click();
  await expect(page.getByText("Pairing code copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("34970112332");
  // tapping it opens the enlarged view
  await qr.click();
  await expect(page.getByText("QR code")).toBeVisible();
});

test("manual-code device shows no QR (would misrepresent the real one)", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Hue A19");
  await page.locator("#device-list > *").first().click();
  await expect(page.getByText("Device details")).toBeVisible();
  // The numeric code is still shown, but no regenerated QR.
  await expect(page.getByText("34970112332")).toBeVisible();
  await expect(page.getByRole("img", { name: "QR" })).toHaveCount(0);
});

test("sort reorders by name and groups by location", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Zebra");
  await registerViaManual(page, "11111111111", "Apple");
  await registerViaManual(page, "22222222222", "Mango");

  const titles = () => page.locator("#device-list .truncate.font-semibold").allTextContents();
  // Default = recently updated → the newest (Mango) is first.
  expect((await titles())[0]).toBe("Mango");

  // Name → alphabetical.
  await page.locator("#btn-sort").click();
  await page.getByRole("button", { name: /^Name/ }).click();
  await expect.poll(titles).toEqual(["Apple", "Mango", "Zebra"]);

  // Location → grouped list with a section header (all here are unassigned).
  await page.locator("#btn-sort").click();
  await page.getByRole("button", { name: /^Location/ }).click();
  await expect(page.locator("#device-list .uppercase").filter({ hasText: "Unassigned" })).toBeVisible();
});

test("edit: Save is gated on changes and closing with edits warns", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Hue A19");
  await page.locator("#device-list > *").first().click();
  await expect(page.getByText("Device details")).toBeVisible();

  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled(); // nothing changed yet

  await page.getByPlaceholder(/Philips Hue/).fill("Hue A19 v2");
  await expect(save).toBeEnabled();

  // Cancelling with unsaved edits asks to confirm; "No" keeps the modal open.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Discard unsaved changes?")).toBeVisible();
  await page.getByRole("button", { name: "No", exact: true }).click();
  await expect(page.getByText("Device details")).toBeVisible();

  // Saving persists and closes without a discard prompt.
  await save.click();
  await expect(page.getByText("Device details")).toBeHidden();
  await expect(page.locator("#device-list").getByText("Hue A19 v2")).toBeVisible();
});

test("changing language re-renders the open settings modal", async ({ page }) => {
  await open(page);
  await page.locator("#btn-settings").click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  // Switch to Korean from within the still-open modal.
  await page.getByRole("combobox").selectOption("ko");
  // The modal itself updates without needing to be reopened.
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
});

test("persists across reload (IndexedDB)", async ({ page }) => {
  await open(page);
  await registerViaManual(page, "34970112332", "Hue A19");
  await page.reload();
  await expect(page.locator("#device-list").getByText("Hue A19")).toBeVisible();
});
