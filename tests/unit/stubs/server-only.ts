/**
 * แทนที่แพ็กเกจ `server-only` ตอนรัน unit test
 *
 * แพ็กเกจจริงตั้งใจ throw เมื่อถูก import จากฝั่ง client เพื่อกันไม่ให้โค้ดเซิร์ฟเวอร์
 * หลุดเข้า browser bundle (ดู CLAUDE.md §6) แต่ vitest รันในสภาพแวดล้อม jsdom
 * จึงถูกนับเป็น client ไปด้วย ทั้งที่กำลังทดสอบตรรกะฝั่ง server ล้วน ๆ
 */
export {};
