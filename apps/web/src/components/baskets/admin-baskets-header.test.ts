import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminBasketsHeaderRow } from "./admin-baskets-header";

describe("AdminBasketsHeaderRow", () => {
  it("renders info triggers for all table-like header labels", () => {
    const html = renderToStaticMarkup(createElement(AdminBasketsHeaderRow));

    for (const label of ["Name", "TVL", "Assets", "Perp", "Blend", "Address"]) {
      expect(html).toContain(`Show info for ${label}`);
    }
  });
});
