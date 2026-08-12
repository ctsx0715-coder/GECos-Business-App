import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives every creation path in the system.
 *
 * The point is not that the forms render — it is that a person with no seed
 * script can put their own data in, and that the same validation the services
 * enforce shows up against the right field when they get it wrong.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "screenshots";
const stamp = Date.now().toString().slice(-6);

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

  async function fill(label: string, value: string) {
    await page.getByLabel(new RegExp(`^${label}`, "i")).first().fill(value);
  }

  // ---- Customer ----------------------------------------------------------
  console.log("\nCustomer");
  await signInAs("Bongani Sithole");
  await page.goto(`${BASE}/crm/customers`, { waitUntil: "networkidle" });
  await check(
    "register offers a New customer button",
    (await page.getByRole("link", { name: "New customer" }).count()) > 0,
  );
  await page.getByRole("link", { name: "New customer" }).click();
  await page.waitForURL("**/customers/new", { timeout: 20_000 });
  await page.getByRole("heading", { name: "Customer details" }).waitFor();
  await page.screenshot({ path: `${OUT}/40-new-customer.png`, fullPage: true });

  // Duplicate names are refused by the service, and the message should surface.
  await fill("Name", "City of Tshwane");
  await page.getByRole("button", { name: "Create customer" }).click();
  await page.waitForTimeout(2500);
  await check(
    "a duplicate customer name is refused with the service's message",
    (await page.getByText(/already exists/).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/41-duplicate-refused.png`, fullPage: true });

  const customerName = `Umgeni Water ${stamp}`;
  await fill("Name", customerName);
  await fill("City", "Pietermaritzburg");
  await page.getByRole("button", { name: "Create customer" }).click();
  await page.waitForURL((url) => /\/crm\/customers\/[0-9a-f-]{36}$/.test(url.pathname), {
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle");
  await check(
    "creating a customer lands on its page",
    (await page.getByRole("heading", { name: customerName }).count()) > 0,
  );

  // ---- Contact, inline on the customer -----------------------------------
  await page.getByRole("button", { name: "+ Add contact" }).click();
  await page.getByPlaceholder("First name").fill("Thandi");
  await page.getByPlaceholder("Last name").fill("Mthembu");
  await page.getByPlaceholder("Job title").fill("Procurement Officer");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.waitForTimeout(2500);
  await check(
    "a contact can be added inline",
    (await page.getByText("Thandi Mthembu").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/42-customer-with-contact.png`, fullPage: true });

  // ---- Lead --------------------------------------------------------------
  console.log("\nLead");
  await page.goto(`${BASE}/crm/leads/new`, { waitUntil: "networkidle" });
  await fill("Company", `Sedibeng Water ${stamp}`);
  await fill("Contact name", "Kagiso Molefe");
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.waitForURL("**/crm/leads", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await check(
    "a new lead appears in the inbox",
    (await page.getByText(`Sedibeng Water ${stamp}`).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/43-new-lead.png`, fullPage: true });

  // ---- Tender ------------------------------------------------------------
  console.log("\nTender");
  await signInAs("Sipho Ndlovu");
  await page.goto(`${BASE}/tenders`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "New tender" }).click();
  await page.waitForURL("**/tenders/new", { timeout: 20_000 });
  await page.getByRole("heading", { name: "Tender details" }).waitFor();

  // A past closing date must be refused, against the field.
  await fill("Title", `Pipeline upgrade ${stamp}`);
  await fill("Closing date", "2020-01-01");
  await page.getByRole("button", { name: "Create tender" }).click();
  await page.waitForTimeout(2500);
  await check(
    "a closing date in the past is refused",
    (await page.getByText(/closing date has passed/i).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/44-tender-validation.png`, fullPage: true });

  const future = new Date(Date.now() + 45 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await fill("Closing date", future);
  await page.getByRole("button", { name: "Create tender" }).click();
  await page.waitForURL((url) => /\/tenders\/[0-9a-f-]{36}$/.test(url.pathname), {
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle");
  await check(
    "a new tender is created with its checklist already seeded",
    (await page.getByText("Submission checklist").count()) > 0 &&
      (await page.getByText("CSD registration report").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/45-tender-created.png`, fullPage: true });

  // ---- Project from a won tender -----------------------------------------
  console.log("\nProject from a won tender");
  await signInAs("Zanele Khoza");
  await page.goto(`${BASE}/projects/new`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Project details" }).waitFor();
  await check(
    "the form offers starting from a won tender",
    (await page.getByText("From a won tender").count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/46-new-project.png`, fullPage: true });

  const tenderSelect = page.getByLabel(/^Won tender/i);
  const options = await tenderSelect.locator("option").count();
  await check("won tenders without a project are listed", options > 1);

  if (options > 1) {
    await tenderSelect.selectOption({ index: 1 });
    await page.getByLabel(/^Budget/i).fill("2500000");
    await page.getByRole("button", { name: "Start project" }).click();
    await page.waitForURL((url) => /\/projects\/[0-9a-f-]{36}$/.test(url.pathname), {
      timeout: 20_000,
    });
    await page.waitForLoadState("networkidle");
    await check(
      "the project carries its link back to the tender",
      (await page.getByText("Where this came from").count()) > 0,
    );
    await check(
      "the budget entered on the form is in place",
      (await page.getByText(/R2\.5m/).count()) > 0,
    );
    await page.screenshot({
      path: `${OUT}/47-project-from-tender.png`,
      fullPage: true,
    });
  }

  // ---- Permission gate ---------------------------------------------------
  console.log("\nPermissions");
  await signInAs("Anele Dlamini");
  await page.goto(`${BASE}/tenders/new`, { waitUntil: "networkidle" });
  await check(
    "someone without create permission is redirected away from the form",
    !page.url().includes("/tenders/new"),
  );

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
