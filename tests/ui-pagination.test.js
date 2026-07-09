import { describe, it, expect } from "vitest";
import { paginate, paginationControls } from "@nihongo-study/ui";

function items(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `item-${i + 1}` }));
}

describe("paginate", () => {
  it("slices the requested page", () => {
    const result = paginate(items(25), 2, 10);
    expect(result.pageItems.map(item => item.id)).toEqual([
      "item-11", "item-12", "item-13", "item-14", "item-15",
      "item-16", "item-17", "item-18", "item-19", "item-20"
    ]);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(2);
    expect(result.totalItems).toBe(25);
  });

  it("returns page 1 with all items when everything fits on one page", () => {
    const result = paginate(items(5), 1, 10);
    expect(result.pageItems).toHaveLength(5);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
  });

  it("falls back to page 1 when the requested page is out of range (e.g. data shrank)", () => {
    const result = paginate(items(12), 5, 10);
    expect(result.page).toBe(1);
    expect(result.pageItems.map(item => item.id)).toEqual(items(10).map(item => item.id));
  });

  it("handles an empty list without throwing", () => {
    const result = paginate([], 3, 10);
    expect(result.pageItems).toEqual([]);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
    expect(result.totalItems).toBe(0);
  });
});

describe("paginationControls", () => {
  it("renders nothing when there's only one page", () => {
    expect(paginationControls({ page: 1, totalPages: 1, pageName: "words" })).toBe("");
    expect(paginationControls({ page: 1, totalPages: 0, pageName: "words" })).toBe("");
  });

  it("renders prev/next controls with the current page indicator when there's more than one page", () => {
    const html = paginationControls({ page: 2, totalPages: 4, pageName: "kanji" });
    expect(html).toContain('data-page-name="kanji"');
    expect(html).toContain('data-page-nav="prev"');
    expect(html).toContain('data-page-nav="next"');
    expect(html).toContain("2 / 4");
    expect(html).not.toContain("disabled");
  });

  it("disables prev on the first page and next on the last page", () => {
    const first = paginationControls({ page: 1, totalPages: 3, pageName: "words" });
    expect(first).toMatch(/data-page-nav="prev"[^>]*disabled/);
    expect(first).not.toMatch(/data-page-nav="next"[^>]*disabled/);

    const last = paginationControls({ page: 3, totalPages: 3, pageName: "words" });
    expect(last).toMatch(/data-page-nav="next"[^>]*disabled/);
    expect(last).not.toMatch(/data-page-nav="prev"[^>]*disabled/);
  });
});
