-- M18 · S6 (CHANGELOG #38) — ราคาติดลบต้องเข้า DB ไม่ได้ · Prisma ประกาศ CHECK ใน schema ไม่ได้ จึงเขียนเอง
ALTER TABLE "Course" ADD CONSTRAINT "Course_price_check" CHECK ("price" IS NULL OR "price" >= 0);
