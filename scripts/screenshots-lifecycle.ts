import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives the lifecycle preview and the reporting screens.
 *
 * Same job as the other screenshot scripts: photograph the screens, but assert
 * something on each one first, so a page that renders an empty shell fails
 * here rather than in front of a client.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "screenshots/lifecycle";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const failures: string[] = [];

  function check(label: string, condition: boolean, detail = "") {
    if (condition) console.log(`  ok   ${label}`);
    else {
      console.log(`  FAIL ${label} ${detail}`);
      failures.push(label);
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));

  // Sign in as the Managing Director, who can see every module.
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: new RegExp(process.env.DEMO_USER ?? "Managing Director") })
    .first()
    .click();
  await page.waitForURL("**/dashboard", { timeout: 20_000 });

  const screens: Array<[string, string, RegExp]> = [
    ["lifecycle", "/preview", /Tender lifecycle/],
    ["readiness", "/preview/readiness", /Tender readiness/],
    ["discovery", "/preview/discovery", /Tender discovery/],
    ["qualification", "/preview/qualification", /Qualification & bid decision/],
    ["bid-workspace", "/preview/bid-workspace", /Bid workspace/],
    ["pricing", "/preview/pricing", /Pricing/],
    ["submission", "/preview/submission", /Submission & evaluation/],
    ["intelligence", "/preview/intelligence", /Tender intelligence/],
    ["reports", "/reports", /Bid book performance/],
  ];

  for (const [name, path, heading] of screens) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    const body = (await page.textContent("body")) ?? "";
    check(`${path} renders`, heading.test(body));
    check(`${path} has no error boundary`, !/Application error|Unhandled/i.test(body));
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  }

  // The tender report, reached the way a user reaches it.
  await page.goto(`${BASE}/tenders?filter=all`);
  await page.locator("table a").first().click();
  await page.waitForURL(/\/tenders\/[0-9a-f-]+$/);
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await page.waitForURL(/\/report$/);
  await page.waitForLoadState("networkidle");
  const tenderReport = (await page.textContent("body")) ?? "";
  check("tender report renders", /Tender report/.test(tenderReport));
  check(
    "tender report shows lifecycle position",
    /Lifecycle position/.test(tenderReport),
  );
  check(
    "tender report shows track record",
    /Track record with this buyer/.test(tenderReport),
  );
  await page.screenshot({ path: `${OUT}/tender-report.png`, fullPage: true });

  // The opportunity report, likewise.
  await page.goto(`${BASE}/crm/pipeline`);
  // "New opportunity" is also an /crm/opportunities/ link — skip it.
  await page
    .locator("a[href^='/crm/opportunities/']:not([href$='/new'])")
    .first()
    .click();
  await page.waitForURL(/\/crm\/opportunities\/[0-9a-f-]+$/);
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await page.waitForURL(/\/report$/);
  await page.waitForLoadState("networkidle");
  const dealReport = (await page.textContent("body")) ?? "";
  check("opportunity report renders", /Opportunity report/.test(dealReport));
  check("opportunity report shows weighting", /Weighted/.test(dealReport));
  await page.screenshot({ path: `${OUT}/opportunity-report.png`, fullPage: true });

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`\nAll checks passed. Screenshots in ${OUT}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
