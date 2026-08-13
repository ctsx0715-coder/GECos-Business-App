import { describe, expect, it } from "vitest";
import {
  BID_SCORECARD,
  COMPLIANCE_MATRIX,
  boqTotalCents,
  pricingBuildUp,
  scoreBand,
  scorecardTotal,
} from "./demo-data";
import { LIFECYCLE, SUPPORTING_LAYERS, lifecycleCounts } from "./lifecycle";

/**
 * The preview is demonstration data, but its arithmetic is shown to a client
 * as if it were a working screen — so the parts that add up are tested. A
 * scorecard whose weights do not sum to 100, or a bill of quantities that does
 * not reconcile to the price beside it, is the first thing anyone spots.
 */

describe("bid/no-bid scorecard", () => {
  it("has weights summing to 100", () => {
    const total = BID_SCORECARD.reduce((sum, row) => sum + row.weight, 0);
    expect(total).toBe(100);
  });

  it("scores every criterion out of ten", () => {
    for (const row of BID_SCORECARD) {
      expect(row.score).toBeGreaterThanOrEqual(0);
      expect(row.score).toBeLessThanOrEqual(10);
    }
  });

  it("produces a total inside the band it is placed in", () => {
    const total = scorecardTotal();
    const band = scoreBand(total);

    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(100);
    expect(total).toBeGreaterThanOrEqual(band.min);
  });

  it("bands a perfect and a hopeless score correctly", () => {
    expect(scoreBand(100).label).toBe("Pursue");
    expect(scoreBand(60).label).toBe("Management review");
    expect(scoreBand(10).label).toBe("No bid");
  });
});

describe("pricing build-up", () => {
  it("adds overhead, contingency and margin in that order", () => {
    const build = pricingBuildUp();

    expect(build.cost).toBe(build.direct + build.overhead + build.contingency);
    expect(build.exVat).toBe(build.cost + build.margin);
    expect(build.inclVat).toBe(build.exVat + build.vat);
  });

  it("charges VAT at 15% of the price excluding VAT", () => {
    const build = pricingBuildUp();
    expect(build.vat).toBe((build.exVat * 15n) / 100n);
  });

  it("reports a gross margin consistent with the money", () => {
    const build = pricingBuildUp();
    const computed = (Number(build.margin) / Number(build.exVat)) * 100;
    expect(build.grossMarginPercent).toBeCloseTo(computed, 1);
  });
});

describe("bill of quantities", () => {
  it("reconciles to the tender price within rate rounding", () => {
    const boq = boqTotalCents();
    const { exVat } = pricingBuildUp();
    const difference = boq > exVat ? boq - exVat : exVat - boq;

    // Under R50 000 on a R28m bid: rate rounding, not a pricing error.
    expect(Number(difference)).toBeLessThan(5_000_000);
  });
});

describe("compliance matrix", () => {
  it("is not submittable while a mandatory line is open", () => {
    const openMandatory = COMPLIANCE_MATRIX.filter(
      (row) => row.mandatory && row.status !== "complete",
    );

    // The preview deliberately shows a bid that cannot yet be submitted —
    // a screen where everything is green demonstrates nothing.
    expect(openMandatory.length).toBeGreaterThan(0);
  });
});

describe("lifecycle map", () => {
  it("numbers the chain sequentially from one", () => {
    expect(LIFECYCLE.map((stage) => stage.step)).toEqual(
      LIFECYCLE.map((_, index) => index + 1),
    );
  });

  it("gives every stage a unique key", () => {
    const keys = [...LIFECYCLE, ...SUPPORTING_LAYERS].map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names a dependency for everything marked coming soon", () => {
    // "Coming soon" with no reason reads as an excuse. The map must say what
    // the stage is waiting on.
    for (const stage of [...LIFECYCLE, ...SUPPORTING_LAYERS]) {
      if (stage.state === "soon") {
        expect(stage.dependsOn, `${stage.key} has no stated dependency`).toBeTruthy();
      }
    }
  });

  it("gives every live or partly-live stage somewhere to go", () => {
    for (const stage of [...LIFECYCLE, ...SUPPORTING_LAYERS]) {
      if (stage.state === "live" || stage.state === "partial") {
        expect(stage.href, `${stage.key} claims to be built but links nowhere`)
          .toBeTruthy();
      }
    }
  });

  it("counts every stage exactly once", () => {
    const counts = lifecycleCounts();
    expect(counts.live + counts.partial + counts.preview + counts.soon).toBe(
      counts.total,
    );
    expect(counts.total).toBe(LIFECYCLE.length + SUPPORTING_LAYERS.length);
  });
});
