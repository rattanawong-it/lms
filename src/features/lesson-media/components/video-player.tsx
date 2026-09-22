"use client";

import * as React from "react";
import { Loader2, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestLessonVideoUrl } from "@/features/lesson-media/actions";
import { saveProgress } from "@/features/enrollment/actions";
import { PROGRESS_SAVE_INTERVAL_SEC } from "@/features/enrollment/lib/progress";
import { formatDuration } from "@/lib/dates";

/**
 * M05 · FR-05.2 — ตัวเล่นวิดีโอที่อัปโหลดเข้าระบบ
 *
 * ใช้ `<video>` ของเบราว์เซอร์ตรง ๆ (D-04: MP4 ไฟล์เดียว + HTTP range) ไม่มีไลบรารีเสริม
 *
 * **URL ถูกขอตอนผู้เรียนกดเล่นเท่านั้น** ไม่ได้ฝังมากับหน้า เพราะ
 * - signed URL มีอายุ 5 นาที (FR-15.7) ถ้าฝังมากับหน้า คนที่เปิดค้างไว้แล้วค่อยกดเล่นจะเจอลิงก์ตาย
 * - ลิงก์จะไปติดอยู่ใน RSC payload ที่ router ฝั่ง client เก็บแคชไว้
 * - บทเรียนที่ไม่มีใครเปิดดูก็ไม่ต้องออกลิงก์ทิ้งไว้เปล่า ๆ
 *
 * ความคืบหน้าถูกส่งทุก 15 วินาทีระหว่างเล่น, ตอนหยุด, ตอนจบ และตอนออกจากหน้า
 * การตัดสินว่า "ดูครบ 90% แล้ว" ทำฝั่ง server ใน `saveProgress()` ไม่ใช่ที่นี่
 */
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/** ขอ URL ใหม่ก่อนหมดอายุจริงเท่านี้วินาที เผื่อเวลาเครือข่ายและนาฬิกาที่ไม่ตรงกัน */
const RENEW_MARGIN_SEC = 60;

/** จำนวนครั้งที่ยอมโหลดซ้ำเมื่อ `<video>` แจ้ง error ก่อนจะยอมแพ้และบอกผู้เรียน */
const MAX_RELOAD_RETRIES = 2;

type Issued = { url: string; issuedAtMs: number; expiresInSec: number };

export function VideoPlayer({
  lessonId,
  durationSec,
  canSaveProgress,
  protectionActive = false,
}: {
  lessonId: string;
  durationSec: number | null;
  /** false เมื่อผู้ดูเป็นผู้สอน/ผู้ดูแลที่ไม่ได้ลงทะเบียน — ดูได้แต่ไม่บันทึก */
  canSaveProgress: boolean;
  /** เปิดการป้องกันอยู่ → ซ่อนปุ่มเต็มจอของตัวเล่น ให้ใช้ปุ่มของ `<ProtectedViewer>` แทน
   *  เพราะ fullscreen ที่ `<video>` จะพาวิดีโอหลุดออกไปจากลายน้ำที่ครอบอยู่ (§6.2) */
  protectionActive?: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const issuedRef = React.useRef<Issued | null>(null);
  const lastSentRef = React.useRef(0);
  const startAtRef = React.useRef(0);
  const retriesRef = React.useRef(0);

  const [src, setSrc] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);

  /**
   * คืน URL ที่ใช้ได้ — ขอใหม่เมื่อยังไม่เคยขอ หรือของเดิมใกล้หมดอายุ
   * เรียกทั้งตอนกดเล่นครั้งแรก ตอนเล่นต่อหลังหยุดนาน และตอน `<video>` แจ้ง error
   */
  const ensureFreshUrl = React.useCallback(
    async (force = false): Promise<string | null> => {
      const current = issuedRef.current;
      const ageSec = current ? (Date.now() - current.issuedAtMs) / 1000 : Infinity;

      if (!force && current && ageSec < current.expiresInSec - RENEW_MARGIN_SEC) {
        return current.url;
      }

      const result = await requestLessonVideoUrl(lessonId);
      if (!result.ok) {
        setError(result.message);
        return null;
      }

      issuedRef.current = {
        url: result.url,
        issuedAtMs: Date.now(),
        expiresInSec: result.expiresInSec,
      };
      startAtRef.current = result.startAtSec;
      setError(null);
      setSrc(result.url);
      return result.url;
    },
    [lessonId],
  );

  /** ส่งตำแหน่งล่าสุดขึ้น server — ข้ามถ้าตำแหน่งแทบไม่ขยับจากครั้งก่อน */
  const send = React.useCallback(
    (positionSec: number, { force = false } = {}) => {
      if (!canSaveProgress) return;
      const rounded = Math.floor(positionSec);
      if (!force && Math.abs(rounded - lastSentRef.current) < 1) return;
      lastSentRef.current = rounded;
      void saveProgress({ lessonId, positionSec: rounded });
    },
    [canSaveProgress, lessonId],
  );

  // บันทึกความคืบหน้าเป็นระยะระหว่างที่เล่นอยู่จริงเท่านั้น
  React.useEffect(() => {
    if (!canSaveProgress) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && !video.ended) send(video.currentTime);
    }, PROGRESS_SAVE_INTERVAL_SEC * 1000);

    // ปิดแท็บ/สลับแอปกลางคัน — เก็บตำแหน่งสุดท้ายให้ทัน
    const flush = () => {
      const video = videoRef.current;
      if (video && video.currentTime > 0) send(video.currentTime, { force: true });
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [canSaveProgress, send]);

  async function start() {
    setStarting(true);
    retriesRef.current = 0;
    await ensureFreshUrl(true);
    setStarting(false);
  }

  async function handlePlay() {
    const video = videoRef.current;
    if (!video) return;

    // หยุดไว้นานจนลิงก์ใกล้หมดอายุแล้วค่อยกดเล่นต่อ — สลับไปใช้ลิงก์ใหม่โดยคงตำแหน่งเดิม
    const fresh = await ensureFreshUrl();
    if (fresh && fresh !== video.src) {
      const resumeAt = video.currentTime;
      video.src = fresh;
      video.currentTime = resumeAt;
      void video.play();
    }
  }

  /**
   * สาเหตุที่พบบ่อยที่สุดคือลิงก์หมดอายุระหว่างที่หน้าเปิดค้างไว้ — ขอใหม่แล้วเล่นต่อ
   *
   * จำกัดจำนวนครั้งไว้ เพราะถ้าไฟล์เสียจริง `<video>` จะยิง `error` ทุกครั้งที่เราใส่ src ใหม่
   * กลายเป็นวนขอ signed URL ไม่รู้จบจนชนโควตาของผู้ใช้เอง
   */
  async function handleError() {
    const video = videoRef.current;
    if (!video) return;

    if (retriesRef.current >= MAX_RELOAD_RETRIES) {
      setError("เล่นวิดีโอนี้ไม่ได้ กรุณาแจ้งผู้สอนหรือลองใหม่ภายหลัง");
      return;
    }
    retriesRef.current += 1;

    const resumeAt = video.currentTime;
    const fresh = await ensureFreshUrl(true);
    if (!fresh) return;
    video.src = fresh;
    video.currentTime = resumeAt;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="bg-card border-border flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border px-6 text-center"
      >
        <TriangleAlert className="text-warning-fg size-6" />
        <p className="text-[13px] font-medium">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void start()}>
          ลองใหม่
        </Button>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="bg-foreground/90 flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl">
        <Button size="lg" onClick={() => void start()} disabled={starting}>
          {starting ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
          {starting ? "กำลังเตรียมวิดีโอ" : "เล่นวิดีโอ"}
        </Button>
        {durationSec ? (
          <p className="num text-[12px] text-white/70">ความยาว {formatDuration(durationSec)}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay
        playsInline
        preload="metadata"
        // FR-15.7 — ไม่มีปุ่มดาวน์โหลด และไม่ให้หลุดไปเล่นในหน้าต่างลอยที่ลายน้ำตามไปไม่ถึง
        controlsList={`nodownload noplaybackrate${protectionActive ? " nofullscreen" : ""}`}
        disablePictureInPicture
        className="bg-foreground aspect-video w-full rounded-xl"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          video.playbackRate = speed;
          // FR-06.4 — เริ่มที่ตำแหน่งเดิม เว้นตอนที่ดูไปเกือบสุดแล้ว จะได้ไม่เด้งไปจบทันที
          const startAt = startAtRef.current;
          if (startAt > 0 && startAt < video.duration - 5) video.currentTime = startAt;
        }}
        onPlay={() => void handlePlay()}
        onPause={(event) => send(event.currentTarget.currentTime, { force: true })}
        onEnded={(event) => send(event.currentTarget.currentTime, { force: true })}
        onError={() => void handleError()}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[12px]">ความเร็ว</span>
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={speed === value}
              onClick={() => {
                setSpeed(value);
                if (videoRef.current) videoRef.current.playbackRate = value;
              }}
              className={
                speed === value
                  ? "bg-accent text-accent-foreground num min-h-[32px] rounded-md px-2 text-[12px] font-medium"
                  : "text-fg-3 hover:bg-muted num min-h-[32px] rounded-md px-2 text-[12px]"
              }
            >
              {value}×
            </button>
          ))}
        </div>

        <span className="text-muted-foreground text-[11.5px]">
          {canSaveProgress ? "ดูถึง 90% ถือว่าเรียนจบบทนี้" : "ไม่บันทึกความคืบหน้าในโหมดนี้"}
        </span>
      </div>
    </div>
  );
}
