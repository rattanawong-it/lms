import "server-only";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReceiptModel } from "@/features/commerce/lib/receipt-model";

/**
 * M18 · FR-18.2 — เรนเดอร์ใบเสร็จรับเงิน A4 แนวตั้ง (ใช้ฟอนต์และวิธีตัดคำเดียวกับใบประกาศ M10)
 * วาดเฉพาะค่าจาก `ReceiptModel` ซึ่งผ่าน `pdfText()` มาแล้วทุกสตริง · สร้างใหม่ทุกครั้งที่ดาวน์โหลด (ไม่เก็บไฟล์)
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
const MUTED = "#6b7280";
const LINE = "#d1d5db";

const styles = StyleSheet.create({
  page: { fontFamily: "Anuphan", color: INK, fontSize: 11, paddingVertical: 48, paddingHorizontal: 52 },
  header: { flexDirection: "row", justifyContent: "space-between", gap: 24, marginBottom: 28 },
  seller: { flex: 1 },
  sellerName: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  words: { flexDirection: "row", flexWrap: "wrap" },
  muted: { color: MUTED },
  titleBox: { width: 260, alignItems: "flex-end" },
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 8 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginBottom: 2 },
  metaLabel: { color: MUTED, width: 60, textAlign: "right" },
  metaValue: { fontWeight: 700, maxWidth: 200 },
  section: { marginBottom: 20 },
  label: { color: MUTED, fontSize: 10, marginBottom: 3 },
  table: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: LINE },
  tableHead: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderColor: LINE },
  tableRow: { flexDirection: "row", paddingVertical: 8 },
  colItem: { flex: 1, paddingRight: 12 },
  colAmount: { width: 120, textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 260 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  strong: { fontWeight: 700, fontSize: 13 },
  amountText: { marginTop: 6, textAlign: "right", color: MUTED },
  bold: { fontWeight: 700 },
  small: { color: MUTED, fontSize: 9 },
  footnote: { position: "absolute", bottom: 40, left: 52, right: 52, borderTopWidth: 1, borderColor: LINE, paddingTop: 8 },
});

type WordStyle = "sellerName" | "muted" | "bold" | "strong" | "small";

function Words({ words, variant }: { words: string[]; variant?: WordStyle }) {
  const style = variant ? styles[variant] : undefined;
  return (
    <View style={styles.words}>
      {words.map((w, i) => (
        <Text key={i} style={style}>
          {w}
        </Text>
      ))}
    </View>
  );
}

function ReceiptDocument({ model }: { model: ReceiptModel }) {
  return (
    <Document title={model.heading} author="Krirk LMS" creator="Krirk LMS" producer="Krirk LMS">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.seller}>
            <Words words={model.seller.name} variant="sellerName" />
            {model.seller.lines.map((line, i) => (
              <Words key={i} words={line} variant="muted" />
            ))}
          </View>
          <View style={styles.titleBox}>
            <Text style={styles.heading}>{model.heading}</Text>
            {model.meta.map((m) => (
              <View key={m.label} style={styles.metaRow}>
                <Text style={styles.metaLabel}>{m.label}</Text>
                <Text style={styles.metaValue}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{model.labels.buyer}</Text>
          <Words words={model.buyer.name} variant="bold" />
          <Text style={styles.muted}>{model.buyer.email}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.colItem, styles.muted]}>{model.labels.item}</Text>
            <Text style={[styles.colAmount, styles.muted]}>{model.labels.amount}</Text>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.colItem}>
              <Words words={model.item.title} />
            </View>
            <Text style={styles.colAmount}>{model.item.amount}</Text>
          </View>
        </View>

        <View style={styles.totals}>
          {model.totals.map((t, i) => (
            <View key={i} style={styles.totalRow}>
              <Words words={t.label} variant={t.strong ? "strong" : undefined} />
              <Text style={t.strong ? styles.strong : undefined}>{t.value}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.amountText}>{model.amountText}</Text>

        <View style={styles.footnote} fixed>
          <Words words={model.footnote} variant="small" />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(model: ReceiptModel): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReceiptDocument model={model} />);
}
