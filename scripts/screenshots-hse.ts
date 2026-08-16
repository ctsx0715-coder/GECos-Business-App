import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives the safety screens, asserting the rules, then captures them.
 *
 * Weighted towards the two things that would be embarrassing to get wrong in
 * front of somebody: that the statutory deadlines actually appear on the
 * screen rather than only in a unit test, and that a Safety Officer really
 * cannot close an incident they investigated.
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
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));

  /**
   * Opens an incident from the register by what it says happened.
   *
   * By description rather than by reference, because the references are
   * allocated in seed order and would silently point at a different incident
   * the moment the dataset gains one.
   */
  async function openIncident(description: RegExp) {
    await page.goto(`${BASE}/hse/incidents`, { waitUntil: "networkidle" });
    await page
      .getByRole("row")
      .filter({ hasText: description })
      .getByRole("link")
      .first()
      .click();
    // A soft navigation, so networkidle can resolve before the route changes.
    await page.waitForURL(/\/hse\/incidents\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
  }

  async function signInAs(name: string) {
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
  }

  console.log("\nSafety Officer (Mandla)");
  await signInAs("Mandla Ngcobo");

  await page.goto(`${BASE}/hse`, { waitUntil: "networkidle" });
  await check(
    "the record is measured against real hours",
    (await page.getByText(/hours actually worked/).count()) > 0,
  );
  await check(
    "a rate on thin hours says it cannot be compared",
    (await page.getByText(/Too few hours to compare/).count()) > 0,
  );
  await check(
    "filings owed are listed",
    (await page.getByText("Compensation Fund").count()) > 0,
  );
  await check(
    "the unanswered question is surfaced",
    (await page.getByText(/How many days will they be off work/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/60-safety-dashboard.png`, fullPage: true });

  await page.goto(`${BASE}/hse/incidents`, { waitUntil: "networkidle" });
  await check(
    "near misses sit in the same register as the rest",
    (await page.getByText("Near miss").count()) > 0 &&
      (await page.getByText("Lost time").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/61-incident-register.png`, fullPage: true });

  // The back injury: eighteen days off, so both duties, one of them filed.
  await openIncident(/Lower back injury lifting a pump casing/);
  await check(
    "both duties are shown on the incident",
    (await page.getByText("Department of Employment and Labour").count()) > 0 &&
      (await page.getByText("Compensation Fund").count()) > 0,
  );
  await check(
    "the form and the section are named",
    (await page.getByText(/WCL\.1/).count()) > 0,
  );
  await check(
    "the filing already made is marked as such",
    (await page.getByText("filed").first().isVisible()),
  );
  await page.screenshot({ path: `${OUT}/62-incident-both-duties.png`, fullPage: true });

  await check(
    "a Safety Officer is not offered the close button",
    (await page.getByRole("button", { name: /Close this incident/ }).count()) === 0,
  );

  console.log("\nProject Manager (Zanele)");
  await signInAs("Zanele Khoza");

  // The fall: two open corrective actions, so it must refuse to close.
  await openIncident(/Fell roughly two metres/);
  await check(
    "the close button is disabled while actions are open",
    await page.getByRole("button", { name: /Close this incident/ }).isDisabled(),
  );
  await check(
    "and it says why before you press it",
    (await page.getByText(/still open/).count()) > 0,
  );
  await check(
    "the hierarchy of control is on each action",
    (await page.getByText("Engineer out").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/63-cannot-close.png`, fullPage: true });

  console.log("\nEmployee (Anele)");
  await signInAs("Anele Dlamini");
  await page.goto(`${BASE}/hse/incidents/new`, { waitUntil: "networkidle" });
  await check(
    "anybody can reach the report form",
    (await page.getByText("Report an incident").count()) > 0,
  );
  await check(
    "the kinds carry their definitions",
    (await page.getByText(/Treated from the site box/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/64-report-form.png`, fullPage: true });

  await page.goto(`${BASE}/hse/incidents`, { waitUntil: "networkidle" });
  await check(
    "but not the register",
    !page.url().includes("/hse/incidents"),
  );

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
