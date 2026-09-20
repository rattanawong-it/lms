/** แปลรหัส error ของ Better Auth เป็นข้อความภาษาไทย */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  INVALID_EMAIL: "รูปแบบอีเมลไม่ถูกต้อง",
  INVALID_PASSWORD: "รหัสผ่านไม่ถูกต้อง",
  EMAIL_NOT_VERIFIED: "ยังไม่ได้ยืนยันอีเมล กรุณาตรวจกล่องจดหมายแล้วกดลิงก์ยืนยันก่อนเข้าสู่ระบบ",
  USER_ALREADY_EXISTS: "อีเมลนี้ถูกใช้สมัครไว้แล้ว",
  USER_NOT_FOUND: "ไม่พบบัญชีผู้ใช้นี้",
  PASSWORD_TOO_SHORT: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร",
  PASSWORD_TOO_LONG: "รหัสผ่านยาวเกินกำหนด",
  INVALID_TOKEN: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่",
  TOKEN_EXPIRED: "ลิงก์หมดอายุแล้ว กรุณาขอลิงก์ใหม่",
  BANNED_USER: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบของคณะ",
  SESSION_EXPIRED: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  FAILED_TO_CREATE_USER: "สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};

export function authErrorMessage(error?: { code?: string; message?: string; status?: number }) {
  if (!error) return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
  if (error.status === 429) {
    return "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ (ระบบจำกัด 5 ครั้งต่อ 15 นาที)";
  }
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  return error.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}
