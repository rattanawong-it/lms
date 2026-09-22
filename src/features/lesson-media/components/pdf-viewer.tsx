"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * M05 · FR-05.3 — แสดง PDF ด้วย pdf.js โดย render เป็น **canvas เท่านั้น**
 *
 * ไม่มี text layer โดยตั้งใจ (system-design §6.1) — ถ้ามี text layer ผู้เรียนจะเลือกและ
 * คัดลอกเนื้อหาทั้งหน้าออกไปได้ตรง ๆ ซึ่งขัดกับ M15 ทั้งโมดูล ผลที่ต้องยอมรับคือ
 * ค้นหาข้อความในเอกสารไม่ได้ และ screen reader อ่านเนื้อหาในไฟล์ไม่ได้
 *
 * ไฟล์มาจาก `/api/lesson-media/[lessonId]` (same-origin) ไม่ใช่ signed URL ข้ามโดเมน
 * จึงไม่ต้องพึ่ง CORS ของ storage และ object key ไม่หลุดออกมาถึงหน้าเว็บ
 */
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};

/**
 * pdf.js v6 วาง `destroy()` ไว้ที่ **loading task** ไม่ใช่ที่ตัวเอกสาร
 * (`PDFDocumentProxy` มีแต่ `cleanup()`) จึงต้องเก็บ task ไว้ปิดตอนออกจากหน้า
 * ถ้าเรียก `destroy()` ผิดตัว จะ throw ตอน unmount แล้วทำให้ client navigation พังทั้งหน้า
 */
type PdfLoadingTask = { promise: Promise<PdfDoc>; destroy: () => Promise<void> };

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

export function PdfCanvasViewer({ src, title }: { src: string; title: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const docRef = React.useRef<PdfDoc | null>(null);
  const taskRef = React.useRef<PdfLoadingTask | null>(null);

  const [numPages, setNumPages] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [width, setWidth] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // ความกว้างที่ใช้ได้จริง — ต้องรู้ก่อนจึงจะคำนวณ scale ให้เต็มคอลัมน์ได้
  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry!.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");
        // worker ต้องชี้ไปที่ไฟล์จริง — ปล่อยให้ bundler เป็นคนหา path ให้ (ดู CLAUDE.md §6)
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const task = pdfjs.getDocument({
          url: src,
          // ทยอยขอเฉพาะช่วงที่ต้องใช้ (route ของเรารองรับ HTTP Range) แทนการดูดทั้งไฟล์มาก่อน
          disableAutoFetch: true,
        }) as unknown as PdfLoadingTask;
        taskRef.current = task;

        const doc = await task.promise;
        if (cancelled) return;

        docRef.current = doc;
        setNumPages(doc.numPages);
        setPage(1);
      } catch {
        if (!cancelled) setError("เปิดเอกสารไม่สำเร็จ กรุณาลองโหลดหน้านี้ใหม่");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      void taskRef.current?.destroy();
      taskRef.current = null;
      docRef.current = null;
    };
  }, [src]);

  // วาดหน้าปัจจุบันใหม่ทุกครั้งที่เปลี่ยนหน้าหรือความกว้างเปลี่ยน
  React.useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || width <= 0 || numPages === 0) return;

    let task: ReturnType<PdfPage["render"]> | null = null;
    let cancelled = false;

    async function render() {
      const pdfPage = await doc!.getPage(page);
      if (cancelled) return;

      const base = pdfPage.getViewport({ scale: 1 });
      // จอความละเอียดสูงต้องวาดใหญ่กว่าขนาดที่แสดง ไม่งั้นตัวอักษรจะฟุ้ง
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (width / base.width) * dpr;
      const viewport = pdfPage.getViewport({ scale });

      const context = canvas!.getContext("2d");
      if (!context) return;

      canvas!.width = Math.floor(viewport.width);
      canvas!.height = Math.floor(viewport.height);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${Math.floor(viewport.height / dpr)}px`;

      task = pdfPage.render({ canvas: canvas!, canvasContext: context, viewport });
      try {
        await task.promise;
      } catch {
        // ถูกยกเลิกเพราะเปลี่ยนหน้าหรือปรับขนาดระหว่างวาด — ไม่ใช่ข้อผิดพลาด
      }
    }

    void render();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [page, width, numPages]);

  if (error) {
    return (
      <div
        role="alert"
        className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-10 text-center"
      >
        <TriangleAlert className="text-warning-fg size-6" />
        <p className="text-[13px] font-medium">{error}</p>
      </div>
    );
  }

  return (
    <figure className="space-y-3">
      <div
        ref={containerRef}
        className="bg-muted border-border overflow-hidden rounded-xl border"
      >
        {loading ? (
          <div className="text-muted-foreground flex aspect-[1/1.414] items-center justify-center">
            <Loader2 className="size-6 animate-spin" />
            <span className="sr-only">กำลังเปิดเอกสาร</span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            // canvas ไม่มีข้อความให้ screen reader อ่าน จึงต้องบอกด้วยชื่อบทเรียนแทน
            role="img"
            aria-label={`เอกสารของบทเรียน ${title} หน้า ${page} จาก ${numPages}`}
            className="block"
          />
        )}
      </div>

      {numPages > 1 ? (
        <figcaption className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="size-4" /> ก่อนหน้า
          </Button>
          <span className="num text-[13px]">
            หน้า {page} / {numPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
          >
            ถัดไป <ChevronRight className="size-4" />
          </Button>
        </figcaption>
      ) : null}
    </figure>
  );
}
