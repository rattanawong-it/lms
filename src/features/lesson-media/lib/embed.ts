/**
 * M05 · FR-05.2 — แปลงลิงก์ YouTube/Vimeo ที่ผู้สอนกรอก ให้เป็น URL สำหรับฝัง
 *
 * pure function ไม่มี `server-only` เพราะทั้งหน้าฝั่ง server และตัวเล่นฝั่ง client ใช้
 * โดเมนปลายทางที่คืนออกไปต้องตรงกับ `frame-src` ใน CSP (`next.config.ts` / `proxy.ts`)
 * — เพิ่มปลายทางใหม่ที่นี่เมื่อไร ต้องไปเพิ่มใน CSP ด้วยเสมอ
 */

/** โดเมนที่ `toEmbedUrl()` คืนออกไปได้ — ใช้ประกาศ CSP frame-src ให้ตรงกันจุดเดียว */
export const EMBED_ORIGINS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com"];

/** รหัสวิดีโอ YouTube เป็นชุดอักขระปลอดภัย 11 ตัว — กันค่าแปลก ๆ ที่หลุดมาจาก URL */
const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d+$/;

function youtubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return YOUTUBE_ID.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID.test(v)) return v;

    // /embed/<id> และ /shorts/<id>
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "embed" || parts[0] === "shorts")) {
      return YOUTUBE_ID.test(parts[1]!) ? parts[1]! : null;
    }
  }

  return null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  // vimeo.com/123456789 · vimeo.com/channels/staffpicks/123456789 · player.vimeo.com/video/123456789
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts.at(-1);
  return last && VIMEO_ID.test(last) ? last : null;
}

/**
 * คืน URL สำหรับ `<iframe src>` หรือ `null` ถ้าลิงก์ไม่ใช่ YouTube/Vimeo ที่รู้จัก
 *
 * ใช้โดเมน `youtube-nocookie.com` เพื่อไม่ให้ YouTube ตั้งคุกกี้ติดตามผู้เรียน (PDPA)
 * และปิดวิดีโอแนะนำท้ายคลิป (`rel=0`) ไม่ให้พาผู้เรียนออกนอกบทเรียน
 */
export function toEmbedUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const yt = youtubeId(url);
  if (yt) {
    return `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1&playsinline=1`;
  }

  const vimeo = vimeoId(url);
  if (vimeo) {
    return `https://player.vimeo.com/video/${vimeo}?dnt=1&title=0&byline=0&portrait=0`;
  }

  return null;
}

/** FR-05.5 — ปุ่มเข้าห้องเรียนสดเปิดก่อนเวลาเริ่ม 15 นาที */
export const LIVE_OPEN_BEFORE_MIN = 15;

export type LiveWindow = "before" | "open" | "ended";

/**
 * คาบเรียนสดอยู่ในช่วงไหนของเวลา ณ ตอนนี้
 * ไม่มีเวลาสิ้นสุดให้ถือว่ายังเปิดอยู่ — ผู้สอนอาจสอนยาวกว่าที่ประกาศไว้
 */
export function liveWindow(
  startAt: Date | null,
  endAt: Date | null,
  now: Date = new Date(),
): LiveWindow {
  if (!startAt) return "open";
  if (endAt && now > endAt) return "ended";
  const opensAt = new Date(startAt.getTime() - LIVE_OPEN_BEFORE_MIN * 60 * 1000);
  return now >= opensAt ? "open" : "before";
}
