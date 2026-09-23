/* eslint-disable jsx-a11y/alt-text -- <Image> ของ react-pdf วาดลง PDF ไม่ใช่ <img> ของ HTML และไม่มี prop alt */
import "server-only";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { CertificateModel, ModelLine } from "@/features/certificates/lib/model";

/**
 * M10 · FR-10.1 / FR-10.3 — เรนเดอร์ใบประกาศ A4 แนวนอนด้วย `@react-pdf/renderer` (ผล spike ขั้น 0)
 *
 * - ฟอนต์ Anuphan แบบ static TTF ใน repo (`assets/fonts/anuphan`, OFL) — ตัว render ฝั่ง server ใช้ `next/font` ไม่ได้
 * - วาดเฉพาะค่าจาก `CertificateModel` ซึ่งผ่าน `pdfText()` มาแล้วทุกสตริง
 * - ปิด hyphenation ของ react-pdf (มันเติม "-" ทุกจุดตัด) แล้ววางคำละกล่องใน flex-wrap แทน
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts", "anuphan");
let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Anuphan",
    fonts: [
      { src: path.join(FONT_DIR, "Anuphan-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Anuphan-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const INK = "#1f2937";
const ACCENT = "#9a3412";
const MUTED = "#6b7280";

const styles = StyleSheet.create({
  page: { fontFamily: "Anuphan", color: INK, padding: 28, backgroundColor: "#fffdf8" },
  frame: {
    flex: 1,
    borderWidth: 3,
    borderColor: ACCENT,
    padding: 6,
  },
  inner: {
    flex: 1,
    borderWidth: 1,
    borderColor: ACCENT,
    paddingVertical: 28,
    paddingHorizontal: 56,
    alignItems: "center",
  },
  logo: { height: 64, objectFit: "contain", marginBottom: 10 },
  heading: { fontSize: 34, fontWeight: 700, color: ACCENT, marginBottom: 14 },
  content: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: "100%", marginBottom: 6 },
  word: { fontSize: 15, lineHeight: 1.6 },
  wordEmphasized: { fontSize: 26, fontWeight: 700, lineHeight: 1.5 },
  footer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  verify: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  qr: { width: 72, height: 72 },
  small: { fontSize: 9, color: MUTED },
  code: { fontSize: 11, fontWeight: 700 },
  signer: { alignItems: "center", width: 220 },
  signature: { height: 44, objectFit: "contain", marginBottom: 2 },
  signLine: { width: "100%", borderTopWidth: 1, borderColor: INK, marginBottom: 4 },
  signerName: { fontSize: 13, fontWeight: 700 },
  signerTitle: { fontSize: 11, color: MUTED },
});

function Line({ line }: { line: ModelLine }) {
  return (
    <View style={styles.line}>
      {line.runs.map((run, i) => (
        <Text key={i} style={line.emphasized ? styles.wordEmphasized : styles.word}>
          {run.text}
        </Text>
      ))}
    </View>
  );
}

export type CertificateImages = { logo: Buffer | null; signature: Buffer | null };

function CertificateDocument({ model, images, qr }: { model: CertificateModel; images: CertificateImages; qr: string }) {
  return (
    <Document title={model.heading} author="Krirk LMS" creator="Krirk LMS" producer="Krirk LMS">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.frame}>
          <View style={styles.inner}>
            {images.logo ? <Image src={images.logo} style={styles.logo} /> : null}
            <Text style={styles.heading}>{model.heading}</Text>
            <View style={styles.content}>
              {model.lines.map((line, i) => (
                <Line key={i} line={line} />
              ))}
            </View>

            <View style={styles.footer}>
              <View style={styles.verify}>
                <Image src={qr} style={styles.qr} />
                <View>
                  <Text style={styles.code}>{model.code}</Text>
                  <Text style={styles.small}>{model.verifyLabel}</Text>
                </View>
              </View>
              {model.signerName || images.signature ? (
                <View style={styles.signer}>
                  {images.signature ? <Image src={images.signature} style={styles.signature} /> : null}
                  <View style={styles.signLine} />
                  {model.signerName ? <Text style={styles.signerName}>{model.signerName}</Text> : null}
                  {model.signerTitle ? <Text style={styles.signerTitle}>{model.signerTitle}</Text> : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(model: CertificateModel, images: CertificateImages): Promise<Buffer> {
  registerFonts();
  const qr = await QRCode.toDataURL(model.verifyUrl, { margin: 1, width: 288, errorCorrectionLevel: "M" });
  return renderToBuffer(<CertificateDocument model={model} images={images} qr={qr} />);
}
