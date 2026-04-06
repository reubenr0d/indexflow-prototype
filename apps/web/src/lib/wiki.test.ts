import { describe, expect, it } from "vitest";
import { DOCS_PAGES, DOCS_SLUGS } from "./wiki";
import { DOCS_START_PATHS } from "@/components/docs/docs-home-client";

describe("wiki docs registry", () => {
  it("keeps DOCS_SLUGS and DOCS_PAGES in sync", () => {
    const slugs = new Set(DOCS_SLUGS);
    const pageKeys = Object.keys(DOCS_PAGES);

    for (const slug of DOCS_SLUGS) {
      expect(DOCS_PAGES[slug]).toBeDefined();
    }

    for (const key of pageKeys) {
      expect(slugs.has(key as (typeof DOCS_SLUGS)[number])).toBe(true);
    }
  });

  it("ensures docs home start-path slugs resolve", () => {
    for (const path of DOCS_START_PATHS) {
      for (const slug of path.slugs) {
        expect(DOCS_PAGES[slug]).toBeDefined();
      }
    }
  });

  it("enforces non-empty structured docs sections", () => {
    for (const page of Object.values(DOCS_PAGES)) {
      if (page.formulas) {
        for (const formula of page.formulas) {
          expect(formula.name.trim().length).toBeGreaterThan(0);
          expect(formula.expression.trim().length).toBeGreaterThan(0);
          expect(formula.notes.trim().length).toBeGreaterThan(0);
        }
      }

      if (page.unitsGlossary) {
        for (const unit of page.unitsGlossary) {
          expect(unit.term.trim().length).toBeGreaterThan(0);
          expect(unit.value.trim().length).toBeGreaterThan(0);
          expect(unit.notes.trim().length).toBeGreaterThan(0);
        }
      }

      if (page.interactionMatrix) {
        for (const row of page.interactionMatrix) {
          expect(row.contract.trim().length).toBeGreaterThan(0);
          expect(row.fn.trim().length).toBeGreaterThan(0);
          expect(row.caller.trim().length).toBeGreaterThan(0);
          expect(row.inputs.length).toBeGreaterThan(0);
          expect(row.preconditions.length).toBeGreaterThan(0);
          expect(row.stateDeltas.length).toBeGreaterThan(0);
          expect(row.failureRisks.length).toBeGreaterThan(0);
          expect(row.postTxChecks.length).toBeGreaterThan(0);
        }
      }

      if (page.preflightChecklist) {
        expect(page.preflightChecklist.length).toBeGreaterThan(0);
      }

      if (page.postflightChecklist) {
        expect(page.postflightChecklist.length).toBeGreaterThan(0);
      }
    }
  });
});
