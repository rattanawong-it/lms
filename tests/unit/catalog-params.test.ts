import { describe, expect, it } from "vitest";
import { CATALOG_PAGE_SIZE, parseCatalogParams } from "@/features/catalog/schemas";

describe("parseCatalogParams (FR-03.2)", () => {
  it("ใช้ค่าตั้งต้นเมื่อไม่มี query string", () => {
    expect(parseCatalogParams({})).toEqual({
      q: undefined,
      category: undefined,
      departmentId: undefined,
      level: undefined,
      sort: "newest",
      page: 1,
    });
  });

  it("อ่านตัวกรองและการเรียงที่ส่งมา", () => {
    const params = parseCatalogParams({
      q: "  การตลาด  ",
      category: "business",
      departmentId: "dept-1",
      level: "ปานกลาง",
      sort: "rating",
      page: "3",
    });
    expect(params).toMatchObject({
      q: "การตลาด",
      category: "business",
      departmentId: "dept-1",
      level: "ปานกลาง",
      sort: "rating",
      page: 3,
    });
  });

  it('ตีค่า "all" เป็นไม่กรอง', () => {
    const params = parseCatalogParams({ category: "all", departmentId: "all", level: "all" });
    expect(params.category).toBeUndefined();
    expect(params.departmentId).toBeUndefined();
    expect(params.level).toBeUndefined();
  });

  it("URL ที่ผู้ใช้แก้เองไม่ทำให้หน้าพัง — ค่าที่ไม่รู้จักกลับไปเป็นค่าตั้งต้น", () => {
    const params = parseCatalogParams({ sort: "; DROP TABLE", page: "-5" });
    expect(params.sort).toBe("newest");
    expect(params.page).toBe(1);

    expect(parseCatalogParams({ page: "abc" }).page).toBe(1);
    expect(parseCatalogParams({ page: "99999" }).page).toBe(1);
  });

  it("รับเฉพาะค่าแรกเมื่อ query ซ้ำกันหลายค่า", () => {
    const params = parseCatalogParams({ q: ["หนึ่ง", "สอง"], sort: ["popular", "rating"] });
    expect(params.q).toBe("หนึ่ง");
    expect(params.sort).toBe("popular");
  });

  it("คำค้นว่างถือว่าไม่ได้ค้น", () => {
    expect(parseCatalogParams({ q: "   " }).q).toBeUndefined();
  });

  it("ขนาดหน้าเป็นค่าคงที่เดียวที่ใช้ร่วมกันทั้ง query และ UI", () => {
    expect(CATALOG_PAGE_SIZE).toBeGreaterThan(0);
  });
});
