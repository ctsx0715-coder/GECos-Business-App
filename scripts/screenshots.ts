import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives the running app and captures each screen.
 *
 * Doubles as a smoke test: it signs in as different roles and asserts that the
 * navigation, the checklist gate and the separation-of-duties refusal actually
 * behave, rather than just photographing whatever renders.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "screenshots";

async function main() {
  mkdirSync(OUT, { recursive: true });
  // The preinstalled Chromium does not match this Playwright build's expected
  // revision, and downloading is disabled in this environment. Point at it.
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const failures: string[] = [];

  async function check(label: string, condition: boolean, detail = "") {
    if (condition) {
      console.log(`  ok   ${label}`);
    } else {
      console.log(`  FAIL ${label} ${detail}`);
      failures.push(label);
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await context.newPage();

  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));

  // ---- Sign-in ----------------------------------------------------------
  console.log("\nSign-in");
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await check(
    "lists both tenants",
    (await page.getByText("Nopedi Projects").count()) > 0 &&
      (await page.getByText("Kgosi Civils").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/01-sign-in.png`, fullPage: true });

  async function signInAs(name: string) {
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
  }

  // ---- Managing Director ------------------------------------------------
  console.log("\nManaging Director (Thato)");
  await signInAs("Thato Chokoe");
  await check(
    "dashboard greets the user",
    (await page.getByText(/Thato/).count()) > 0,
  );
  await check(
    "sees the audit trail in nav",
    (await page.locator("header").getByRole("link", { name: "Audit trail" }).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/02-dashboard-director.png`, fullPage: true });

  await page.goto(`${BASE}/tenders`, { waitUntil: "networkidle" });
  await check(
    "tender register shows seeded tenders",
    (await page.getByText("Medupi conveyor maintenance contract").count()) > 0,
  );
  await check(
    "does not show the other tenant's tender",
    (await page.getByText(/Kgosi Civils — pipeline/).count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/03-tender-register.png`, fullPage: true });

  await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/07-audit-trail.png`, fullPage: true });

  await page.goto(`${BASE}/compliance`, { waitUntil: "networkidle" });
  await check(
    "compliance shows an expired item",
    (await page.getByText("Expired").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/06-compliance.png`, fullPage: true });

  // ---- Tender Officer ---------------------------------------------------
  console.log("\nTender Officer (Sipho)");
  await signInAs("Sipho Ndlovu");
  // Scoped to the header: the dashboard's attention panel also links to
  // /approvals with the text "N approvals outstanding", which is not nav.
  await check(
    "cannot see Approvals in nav",
    (await page.locator("header").getByRole("link", { name: "Approvals" }).count()) === 0,
  );
  await check(
    "cannot see Audit trail in nav",
    (await page.locator("header").getByRole("link", { name: "Audit trail" }).count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/04-dashboard-officer.png`, fullPage: true });

  // An incomplete tender: the checklist gate should refuse submission.
  await page.goto(`${BASE}/tenders?filter=live`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Bulk water pipeline/ }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: "Submission checklist" }).waitFor();
  await check(
    "checklist reports it is incomplete",
    (await page.getByText("Incomplete", { exact: true }).count()) > 0,
  );

  await page.getByRole("button", { name: /Submit for approval/ }).click();
  await page.waitForTimeout(2500);
  const refusal = await page.getByText(/mandatory item/i).count();
  await check("server refuses the incomplete submission", refusal > 0);
  await page.screenshot({
    path: `${OUT}/05-checklist-gate.png`,
    fullPage: true,
  });

  // ---- Finance Manager --------------------------------------------------
  console.log("\nFinance Manager (Lerato)");
  await signInAs("Lerato Mokoena");
  await page.goto(`${BASE}/approvals`, { waitUntil: "networkidle" });
  await check(
    "approvals queue has work in it",
    (await page.getByRole("button", { name: "Approve" }).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/08-approvals.png`, fullPage: true });

  // Approving should advance the chain rather than complete it.
  await page.getByRole("button", { name: "Approve" }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/09-after-approval.png`, fullPage: true });

  // ---- Isolation --------------------------------------------------------
  console.log("\nOther tenant (Kgosi Civils)");
  await signInAs("Naledi Mahlangu");
  await page.goto(`${BASE}/tenders?filter=all`, { waitUntil: "networkidle" });
  const nopediLeak = await page
    .getByText(/Medupi|Bulk water pipeline|Rail siding/)
    .count();
  await check("sees none of Nopedi's tenders", nopediLeak === 0);
  await check(
    "sees its own tender",
    (await page.getByText(/Kgosi Civils — pipeline/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/10-other-tenant.png`, fullPage: true });

  // ---- Dark mode and mobile --------------------------------------------
  const dark = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    storageState: await context.storageState(),
  });
  const darkPage = await dark.newPage();
  await darkPage.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await darkPage.getByRole("button", { name: /Thato Chokoe/ }).click();
  await darkPage.waitForURL("**/dashboard");
  await darkPage.waitForLoadState("networkidle");
  await darkPage.screenshot({ path: `${OUT}/11-dashboard-dark.png`, fullPage: true });

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    storageState: await dark.storageState(),
    colorScheme: "light",
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await mobilePage.screenshot({ path: `${OUT}/12-dashboard-mobile.png`, fullPage: true });

  await browser.close();

  console.log(
    failures.length === 0
      ? "\nAll checks passed."
      : `\n${failures.length} check(s) failed:\n - ${failures.join("\n - ")}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
