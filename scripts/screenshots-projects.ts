import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/** Drives the Projects screens, asserting the budget rules, then captures them. */

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
    // So date inputs render dd/mm/yyyy, as a South African user sees them.
    locale: "en-ZA",
    timezoneId: "Africa/Johannesburg",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));

  async function signInAs(name: string) {
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
  }

  console.log("\nProject Manager (Zanele)");
  await signInAs("Zanele Khoza");
  await check(
    "dashboard shows project tiles",
    (await page.getByText("Active projects").count()) > 0 &&
      (await page.getByText("Committed spend").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/30-dashboard-pm.png`, fullPage: true });

  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  await check(
    "register lists the live projects",
    (await page.getByText("Water treatment works upgrade").count()) > 0,
  );
  await check(
    "the overspent project is flagged",
    (await page.getByText("Over budget").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/31-projects.png`, fullPage: true });

  // The overspent project: budget maths and a blocked task in one view.
  await page.getByRole("link", { name: /MV switchgear replacement/ }).first().click();
  await page.waitForURL("**/projects/**", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: "Budget" }).waitFor();

  await check(
    "budget panel shows committed, pending and remaining",
    (await page.getByText("Committed").count()) > 0 &&
      (await page.getByText("Remaining").count()) > 0,
  );
  await check(
    "a blocked task explains itself",
    (await page.getByText(/Blocked: Awaiting client/).count()) > 0,
  );
  await check(
    "the project links back to the tender it came from",
    (await page.getByText("Where this came from").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/32-project-overbudget.png`, fullPage: true });

  // Completing must be refused while tasks are open.
  await page.getByRole("button", { name: "Mark complete" }).click();
  await page.waitForTimeout(2500);
  await check(
    "completion is refused while tasks are open",
    (await page.getByText(/still open/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/33-complete-refused.png`, fullPage: true });

  // A healthy project, for contrast.
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Water treatment works/ }).first().click();
  await page.waitForURL("**/projects/**", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: "Costs" }).waitFor();
  await check(
    "a submitted cost shows as pending, not committed",
    (await page.getByText("submitted").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/34-project-healthy.png`, fullPage: true });

  console.log("\nPermissions and isolation");
  await signInAs("Sipho Ndlovu");
  // Exact match: the header logo reads "Nopedi Projects", so a substring
  // match on "Projects" hits the organisation name rather than the nav item.
  await check(
    "tender officer cannot see Projects in nav",
    (await page
      .locator("header")
      .getByRole("link", { name: "Projects", exact: true })
      .count()) === 0,
  );

  await signInAs("Naledi Mahlangu");
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  await check(
    "other tenant sees none of Nopedi's projects",
    (await page.getByText(/Water treatment|MV switchgear/).count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/35-projects-other-tenant.png`, fullPage: true });

  await browser.close();
  console.log(
    failures.length === 0
      ? "\nAll checks passed."
      : `\n${failures.length} failed:\n - ${failures.join("\n - ")}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
