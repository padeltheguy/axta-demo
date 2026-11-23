import { linesFromItems, parseMomoCsv, parseMomoText, type RawTx, type TextItem } from "@/domain/movements";

/** Texte d'un PDF, page par page, reconstruit en lignes (pdf.js chargé à la demande). */
export async function pdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  if (doc.numPages > 200) throw new Error("PDF trop long (plus de 200 pages) : découpe le relevé par période.");
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items: TextItem[] = (tc.items as { str?: string; transform?: number[]; width?: number }[])
      .filter((i) => typeof i.str === "string" && i.transform)
      .map((i) => ({ str: i.str!, x: i.transform![4], y: i.transform![5], w: i.width ?? 0 }));
    out.push(...linesFromItems(items));
  }
  return out.join("\n");
}

/** Lit un relevé MoMo (PDF officiel ou CSV axta) et renvoie les transactions brutes. */
export async function readStatement(f: File): Promise<RawTx[]> {
  if (/\.csv$/i.test(f.name) || f.type === "text/csv") return parseMomoCsv(await f.text());
  if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) throw new Error("Choisis le relevé MoMo en PDF, ou un CSV exporté par axta.");
  if (f.size > 20 * 1024 * 1024) throw new Error("PDF trop lourd (plus de 20 Mo).");
  const txt = await pdfText(await f.arrayBuffer());
  const tx = parseMomoText(txt);
  if (!tx.length) throw new Error("Aucune transaction reconnue. Ce relevé n'a peut-être pas le format MTN MoMo : ajoute ces opérations à la main dans Mouvements.");
  return tx;
}
