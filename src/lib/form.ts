"use client";

import type { FormEvent } from "react";

/**
 * ส่งฟอร์มไปยัง Server Action โดย **ไม่ให้ React ล้างค่าที่ผู้ใช้กรอกไว้**
 *
 * `<form action={fn}>` ของ React 19 จะสั่ง reset ฟอร์มให้อัตโนมัติเมื่อ action จบ
 * ซึ่งเหมาะกับฟอร์มที่ส่งแล้วจบ แต่ของเราคืนผลเป็น `ActionResult` และให้ผู้ใช้แก้ต่อ
 * เมื่อข้อมูลไม่ผ่าน — ค่าที่พิมพ์ไว้ทั้งหมดจึงหายไปพร้อมกับข้อความบอกว่าผิดตรงไหน
 * (เจ็บที่สุดกับฟอร์มบทเรียนที่มีบทความยาว ๆ)
 *
 * รับ FormData ชุดเดียวกับที่ action prop จะได้รับ จึงเปลี่ยนมาใช้แทนกันได้ตรง ๆ
 */
export function submitForm(handler: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handler(new FormData(event.currentTarget));
  };
}
