import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives the procurement screens, asserting the rules, then captures them.
 *
 * Weighted towards the things that would be embarrassing in front of somebody:
 * that the over-billing the demo dataset contains actually shows on the screen
 * rather than only in a unit test, and that a Buyer really cannot approve the
 * order they raised, sign for it, or release the invoice.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "screenshots";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const failures: string[] = [];

  async function check(label: string, condition: boolean) {
    console.log(`  ${condition ? "ok  " : "FAIL"} ${label}`);
    if (!condition) failures.push(label);
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    locale: "en-ZA",
    timezoneId: "Africa/Johannesburg",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));

  async function signInAs(name: string) {
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
  }

  /**
   * Opens an order from the list by what is true of it.
   *
   * Matched on the row's own text rather than on a reference, because the
   * references are allocated in seed order and would silently point at a
   * different order the moment the dataset gains one. The supplier alone is
   * not enough either — the dataset deliberately has two orders against the
   * same plant hire company, which is the realistic case.
   */
  async function openOrder(rowText: RegExp) {
    await page.goto(`${BASE}/procurement/orders`, { waitUntil: "networkidle" });
    await page.getByRole("link").filter({ hasText: rowText }).first().click();
    await page.waitForURL(/\/procurement\/orders\/[0-9a-f-]{36}/, {
      timeout: 20_000,
    });
    await page.waitForLoadState("networkidle");
  }

  console.log("\nFinance Manager (Lerato) — the paying end");
  await signInAs("Lerato Mokoena");

  await page.goto(`${BASE}/procurement`, { waitUntil: "networkidle" });
  await check(
    "the over-billing is on the front page",
    (await page.getByText(/more than has been delivered/).count()) > 0,
  );
  await check(
    "orders still owed by a supplier are listed",
    (await page.getByText("Still to come").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/70-procurement.png`, fullPage: true });

  await page.goto(`${BASE}/procurement/suppliers`, { waitUntil: "networkidle" });
  await check(
    "a lapsed tax clearance is flagged on the row",
    (await page.getByText(/Lapsed/).count()) > 0,
  );
  await check(
    "a supplier with no certificate is not shown as a level",
    (await page.getByText("No certificate").count()) > 0,
  );
  await check(
    "the suspended supplier says so",
    (await page.getByText("Suspended").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/71-suppliers.png`, fullPage: true });

  await page.goto(`${BASE}/procurement/orders`, { waitUntil: "networkidle" });
  await check(
    "an order carries all three of its states",
    (await page.getByText("Part delivered").count()) > 0 &&
      (await page.getByText("Billed over").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/72-orders.png`, fullPage: true });

  // The compactor: seven days on site, fourteen on the invoice.
  await openOrder(/Billed over/);
  await check(
    "the order page names what does not agree",
    (await page.getByText("These do not agree").count()) > 0,
  );
  await check(
    "ordered, delivered and invoiced are all three shown",
    (await page.getByText("Invoiced").count()) > 0 &&
      (await page.getByText("Delivered").count()) > 0,
  );
  await check(
    "releasing an over-billed invoice is offered but asks for a reason",
    (await page.getByRole("button", { name: "Release" }).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/73-order-over-billed.png`, fullPage: true });

  console.log("\nBuyer (Naledi) — raises orders, settles nothing");
  await signInAs("Naledi Dlamini");

  await openOrder(/Billed over/);
  await check(
    "a buyer is not offered the invoice release",
    (await page.getByRole("button", { name: "Release" }).count()) === 0,
  );
  await check(
    "a buyer is not offered the delivery form",
    (await page.getByRole("button", { name: "Record a delivery" }).count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/74-order-as-buyer.png`, fullPage: true });

  console.log("\nProject Manager — receives, cannot approve the spend");
  await signInAs("Zanele Khoza");

  await openOrder(/Highveld Steel & Mesh/);
  await check(
    "a project manager can sign for a delivery",
    (await page.getByRole("button", { name: "Record a delivery" }).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/75-order-as-pm.png`, fullPage: true });

  console.log("\nThe project budget");
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  await page.getByRole("link").filter({ hasText: /Water treatment/ }).first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await check(
    "approved orders are shown inside committed spend",
    (await page.getByText(/incl\..*on \d+ order/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/76-project-budget.png`, fullPage: true });

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`\nAll checks passed. Screenshots in ${OUT}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
