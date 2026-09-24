/** ตัดรายการเป็นชุด ๆ ละ `size` ตัว — แยกออกมาเพื่อให้ unit test ได้และให้ทุกช่องทางใช้ร่วม */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
