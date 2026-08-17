import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives the stock screens, asserting the rules, then captures them.
 *
 * Weighted towards the two things that would be embarrassing in front of
 * somebody: that the impossible balance the demo dataset contains actually
 * shows on the screen rather than only in a unit test, and that the storeman
 * who issues material really cannot write it off or sign off his own count.
 *
 * The separation is checked from both sides. Asserting only that the storeman
 * lacks a button proves nothing on its own — the button might be missing for
 * everybody, and a screen with no write-off form at all would pass. So each
 * one is checked absent as the storeman and present as the finance manager.
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
   * Opens an item from the register by name rather than by reference.
   *
   * References are allocated in seed order and would silently point at a
   * different item the moment the dataset gains one.
   */
  async function openItem(name: RegExp) {
    await page.goto(`${BASE}/inventory/items`, { waitUntil: "networkidle" });
    await page.getByRole("link").filter({ hasText: name }).first().click();
    await page.waitForURL(/\/inventory\/items\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
  }

  console.log("\nStoreman (Thabo) — moves stock, corrects nothing");
  await signInAs("Thabo Maseko");

  await page.goto(`${BASE}/inventory`, { waitUntil: "networkidle" });
  await check(
    "the impossible balance leads the front page",
    (await page.getByText(/never recorded/).count()) > 0,
  );
  await check(
    "what needs buying is listed with a quantity to order",
    (await page.getByText(/^Order \d/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/80-inventory.png`, fullPage: true });

  await page.goto(`${BASE}/inventory/items`, { waitUntil: "networkidle" });
  await check(
    "an item nobody set a level for is not reported as healthy",
    (await page.getByText("No level set").count()) > 0,
  );
  await check(
    "running low and none on hand are told apart",
    (await page.getByText("Running low").count()) > 0 &&
      (await page.getByText("None on hand").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/81-register.png`, fullPage: true });

  // The hard hats: thirty in and forty-two out.
  await openItem(/Hard hat/);
  await check(
    "the item page says a delivery was never recorded",
    (await page.getByText(/something was delivered and never recorded/).count()) > 0,
  );
  await check(
    "a storeman is offered the issue form",
    (await page.getByRole("button", { name: "Issue out" }).count()) > 0,
  );
  await check(
    "a storeman is not offered the write-off",
    (await page.getByRole("button", { name: "Correct or write off" }).count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/82-item-negative.png`, fullPage: true });

  // Reinforcing: part of it delivered against a real purchase order.
  await openItem(/Y12 reinforcing/);
  await check(
    "a delivery that put itself away is traceable back to its order",
    (await page.getByText("Delivered in").count()) > 0 &&
      (await page.getByText(/^PO-/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/83-item-from-order.png`, fullPage: true });

  await page.goto(`${BASE}/inventory/counts`, { waitUntil: "networkidle" });
  await check(
    "a count handed in is waiting on somebody",
    (await page.getByText("Awaiting acceptance").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/84-counts.png`, fullPage: true });

  await page.getByRole("link").filter({ hasText: /Awaiting acceptance/ }).first().click();
  await page.waitForURL(/\/inventory\/counts\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await check(
    "the counter is told the decision is not theirs",
    (await page.getByText(/Deliberately not the person who handed it in/).count()) > 0,
  );
  await check(
    "the counter is not offered the acceptance",
    (await page.getByRole("button", { name: /Accept it into the ledger/ }).count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/85-count-as-storeman.png`, fullPage: true });

  console.log("\nFinance Manager (Lerato) — accepts the variance, holds no store");
  await signInAs("Lerato Mokoena");

  await page.goto(`${BASE}/inventory/counts`, { waitUntil: "networkidle" });
  await page.getByRole("link").filter({ hasText: /Awaiting acceptance/ }).first().click();
  await page.waitForURL(/\/inventory\/counts\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await check(
    "the shortfall and the surplus are shown apart, not netted off",
    (await page.getByText("Short").count()) > 0 &&
      (await page.getByText("Over").count()) > 0,
  );
  await check(
    "somebody other than the counter is offered the acceptance",
    (await page.getByRole("button", { name: /Accept it into the ledger/ }).count()) > 0,
  );
  await check(
    "accepting a shortfall asks what happened to it",
    (await page.getByText("What happened to it").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/86-count-variance.png`, fullPage: true });

  await openItem(/Hard hat/);
  await check(
    "the write-off is offered to somebody who moves no stock",
    (await page.getByRole("button", { name: "Correct or write off" }).count()) > 0,
  );
  await check(
    "and the issue form is not",
    (await page.getByRole("button", { name: "Issue out" }).count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/87-item-as-finance.png`, fullPage: true });

  console.log("\nThe stores");
  await page.goto(`${BASE}/inventory/stores`, { waitUntil: "networkidle" });
  await check(
    "exactly one store is where deliveries land",
    (await page.getByText("Deliveries land here").count()) === 1,
  );
  await page.screenshot({ path: `${OUT}/88-stores.png`, fullPage: true });

  /*
   * The project budget, read as a project manager rather than as finance.
   *
   * Not a detail: the finance manager holds no project permission at all, so
   * /projects redirects her to the dashboard. The person who needs to know
   * what a site has drawn out of the stores is the person running the site.
   */
  console.log("\nProject Manager (Zanele) — what the site has drawn");
  await signInAs("Zanele Khoza");

  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  await page.getByRole("link").filter({ hasText: /Water treatment/ }).first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await check(
    "stock drawn from the stores is shown next to the budget, not inside it",
    (await page.getByText("Drawn from the stores").count()) > 0 &&
      (await page.getByText(/Not added to committed/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/89-project-drawn.png`, fullPage: true });

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
