/** ข้อมูล base64 จาก server → ดาวน์โหลดเป็นไฟล์ในเบราว์เซอร์ */
export function saveBase64(file: { filename: string; mime: string; base64: string }) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  a.click();
  URL.revokeObjectURL(url);
}
