import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives the CRM screens and asserts the behaviour that matters, then captures
 * each one. Like the tender suite, this is a smoke test that happens to
 * produce pictures rather than the other way round.
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
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));

  async function signInAs(name: string) {
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
  }

  console.log("\nSales Manager (Bongani)");
  await signInAs("Bongani Sithole");
  await check(
    "dashboard shows the sales pipeline tile",
    (await page.getByText("Sales pipeline").count()) > 0,
  );
  await check(
    "dashboard shows a weighted forecast",
    (await page.getByText("Weighted forecast").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/20-dashboard-sales.png`, fullPage: true });

  await page.goto(`${BASE}/crm/pipeline`, { waitUntil: "networkidle" });
  await check(
    "pipeline board has all three open stages",
    (await page.getByRole("heading", { name: "Qualified" }).count()) > 0 &&
      (await page.getByRole("heading", { name: "Proposal" }).count()) > 0 &&
      (await page.getByRole("heading", { name: "Negotiation" }).count()) > 0,
  );
  await check(
    "closed deals are absent from the board",
    (await page.getByText("Cornubia earthworks package").count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/21-pipeline.png`, fullPage: true });

  // A deal linked to a tender proves the two modules share one thread.
  await page.getByRole("link", { name: /Conveyor maintenance/ }).first().click();
  await page.waitForURL("**/crm/opportunities/**", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: "Deal" }).waitFor();
  await check(
    "opportunity shows its linked tender",
    (await page.getByText("Linked tender").count()) > 0 &&
      (await page.getByText("Medupi conveyor maintenance").count()) > 0,
  );
  await check(
    "opportunity shows a weighted value",
    (await page.getByText("Weighted").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/22-opportunity.png`, fullPage: true });

  console.log("\nLeads and conversion");
  await page.goto(`${BASE}/crm/leads`, { waitUntil: "networkidle" });
  await check(
    "lead inbox lists unworked enquiries",
    (await page.getByText("Rand Water").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/23-leads.png`, fullPage: true });

  // Convert the qualified lead. Its history should follow it to the deal.
  // Addressed by reference: filtering divs by text matches the page wrapper
  // too, which silently converts whichever lead happens to render first.
  const randWaterLead = page.locator("#lead-LD-2026-0001");
  await randWaterLead.getByRole("button", { name: "Convert" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/24-convert-form.png`, fullPage: true });

  await page.getByRole("button", { name: "Create opportunity" }).click();
  await page.waitForTimeout(3000);

  await page.goto(`${BASE}/crm/leads?status=converted`, {
    waitUntil: "networkidle",
  });
  await check(
    "the lead is now marked converted",
    (await page.getByText(/Converted to/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/25-lead-converted.png`, fullPage: true });

  await page.goto(`${BASE}/crm/customers`, { waitUntil: "networkidle" });
  await check(
    "converting created the customer record",
    (await page.getByRole("link", { name: "Rand Water" }).count()) > 0,
  );
  await check(
    "existing tender customers are here too, not duplicated",
    (await page.getByRole("link", { name: "City of Tshwane" }).count()) === 1,
  );
  await page.screenshot({ path: `${OUT}/26-customers.png`, fullPage: true });

  // The customer page is the argument for the shared model: one record
  // carrying contacts, deals and tenders.
  await page.getByRole("link", { name: "City of Tshwane" }).first().click();
  await page.waitForURL("**/crm/customers/**", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: "Contacts" }).waitFor();
  await check(
    "customer shows opportunities and tenders together",
    (await page.getByRole("heading", { name: "Opportunities" }).count()) > 0 &&
      (await page.getByRole("heading", { name: "Tenders" }).count()) > 0,
  );
  await check(
    "customer shows its contacts",
    (await page.getByText("Palesa Mokwena").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/27-customer-detail.png`, fullPage: true });

  console.log("\nPermissions");
  await signInAs("Sipho Ndlovu");
  await check(
    "tender officer sees Pipeline but not Leads",
    (await page.locator("header").getByRole("link", { name: "Pipeline" }).count()) > 0 &&
      (await page.locator("header").getByRole("link", { name: "Leads" }).count()) === 0,
  );

  console.log("\nIsolation");
  await signInAs("Marius Venter");
  await page.goto(`${BASE}/crm/pipeline`, { waitUntil: "networkidle" });
  await check(
    "other tenant sees none of Nopedi's deals",
    (await page.getByText(/Conveyor maintenance|Framework agreement/).count()) === 0,
  );
  await page.goto(`${BASE}/crm/customers`, { waitUntil: "networkidle" });
  await check(
    "other tenant sees none of Nopedi's customers",
    (await page.getByText("City of Tshwane").count()) === 0,
  );
  await page.screenshot({ path: `${OUT}/28-crm-other-tenant.png`, fullPage: true });

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
