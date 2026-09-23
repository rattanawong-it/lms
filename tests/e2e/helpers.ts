/**
 * ตัวช่วยร่วมของชุด e2e — ไฟล์นี้ต้องไม่ประกาศ test ใด ๆ
 */

/**
 * หน้าห้องผู้สอนที่กรองด้วยชื่อคอร์สแล้ว
 * DB ทดสอบสะสมคอร์สเพิ่มทุกครั้งที่รันเทสต์ — ถ้าเปิด /teach เฉย ๆ รายการยาวขึ้นเรื่อย ๆ จนโหลดช้าและหาลิงก์ไม่ทัน
 */
export function teachSearch(title: string): string {
  return `/teach?q=${encodeURIComponent(title)}`;
}
