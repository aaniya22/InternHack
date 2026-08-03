import PDFDocument from "pdfkit";
import type { InternshipDocInput } from "./types.js";
import { getColors, DARK_COLORS } from "../../roadmap/pdf/utils/colors.js";
import { MARGIN, fmtDate } from "../../roadmap/pdf/utils/layout.js";
import { logoBuffer, signatureBuffer } from "./assets.js";

/**
 * Certificate of Internship (A4 landscape). Visually matches the roadmap
 * completion certificate: black band, lime accent rules, Helvetica.
 */
export async function generateInternshipCertificatePdf(
  input: InternshipDocInput,
): Promise<Buffer> {
  const colors = getColors(input.theme);

  return new Promise((resolve, reject) => {
    const W = 841.89; // A4 landscape width
    const H = 595.28; // A4 landscape height
    const cx = W / 2;
    const contentW = W - MARGIN * 2;

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Certificate of Internship – ${input.internName}`,
        Author: "InternHack",
        Subject: `${input.role} internship certificate`,
      },
    });

    if (input.theme === "dark") {
      doc.save();
      doc.rect(0, 0, W, H).fill(DARK_COLORS.pageBg);
      doc.restore();
    }

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Outer border
    doc.rect(24, 24, W - 48, H - 48).lineWidth(3).stroke(colors.accent);
    doc.rect(32, 32, W - 64, H - 64).lineWidth(1).stroke(colors.accentSoft);

    // Masthead: black band inset inside the frame, holding logo + wordmark
    doc.rect(33, 33, W - 66, 62).fill(colors.coverBand);

    const logo = logoBuffer();
    const wordmark = "INTERNHACK";
    const wordmarkSpacing = 3;
    doc.font("Helvetica-Bold").fontSize(13);
    const wordmarkW = doc.widthOfString(wordmark, { characterSpacing: wordmarkSpacing });
    const logoSize = logo ? 26 : 0;
    const logoGap = logo ? 11 : 0;
    const groupX = cx - (logoSize + logoGap + wordmarkW) / 2;

    if (logo) {
      doc.image(logo, groupX, 43, { width: logoSize, height: logoSize });
    }
    doc.fillColor(colors.accentSoft);
    doc.text(wordmark, groupX + logoSize + logoGap, 50, {
      characterSpacing: wordmarkSpacing,
      lineBreak: false,
    });

    doc.fillColor("#ffffff").fontSize(9).font("Helvetica");
    doc.text("internhack.xyz  ·  Certificate of Internship", MARGIN, 76, {
      width: contentW,
      align: "center",
    });

    // Title
    doc.fillColor(colors.ink).fontSize(32).font("Helvetica-Bold");
    doc.text("Certificate of Internship", MARGIN, 114, {
      width: contentW,
      align: "center",
    });

    // Accent rule
    doc.rect(cx - 60, 158, 120, 2).fill(colors.accent);

    doc.fillColor(colors.mute).fontSize(11).font("Helvetica");
    doc.text("This is to certify that", MARGIN, 178, {
      width: contentW,
      align: "center",
    });

    // Intern name
    doc.fillColor(colors.ink).fontSize(28).font("Helvetica-Bold");
    doc.text(input.internName, MARGIN, 199, {
      width: contentW,
      align: "center",
    });

    const nameWidth = Math.min(doc.widthOfString(input.internName) + 40, 420);
    doc.rect(cx - nameWidth / 2, 236, nameWidth, 1).fill(colors.accent);

    doc.fillColor(colors.mute).fontSize(11).font("Helvetica");
    doc.text("has successfully completed an internship at InternHack in the role of", MARGIN, 251, {
      width: contentW,
      align: "center",
    });

    // Role
    doc.fillColor(colors.accent).fontSize(19).font("Helvetica-Bold");
    doc.text(input.role, MARGIN, 273, {
      width: contentW,
      align: "center",
    });

    // Term
    doc.fillColor(colors.body).fontSize(12).font("Helvetica");
    doc.text(`from ${fmtDate(input.startDate)} to ${fmtDate(input.endDate)}`, MARGIN, 302, {
      width: contentW,
      align: "center",
    });

    // Summary paragraph
    doc.fillColor(colors.mute).fontSize(10).font("Helvetica");
    doc.text(
      "During this term they contributed to the design, development, and release of production features across the "
        + "frontend and backend of the InternHack platform, and carried out all assigned responsibilities with diligence.",
      cx - 300,
      330,
      { width: 600, align: "center", lineGap: 2 },
    );

    // Signature block
    const SIG_LINE_Y = 462;
    const signature = signatureBuffer();
    if (signature) {
      const sigW = 150;
      const sigH = 52;
      doc.image(signature, cx - sigW / 2, SIG_LINE_Y - sigH - 2, {
        fit: [sigW, sigH],
        align: "center",
        valign: "bottom",
      });
    }
    doc.rect(cx - 90, SIG_LINE_Y, 180, 0.5).fill(colors.faintest);
    doc.fillColor(colors.ink).fontSize(11).font("Helvetica-Bold");
    doc.text(input.signatory.name, MARGIN, SIG_LINE_Y + 8, { width: contentW, align: "center" });
    doc.fillColor(colors.faint).fontSize(9).font("Helvetica");
    doc.text(input.signatory.title, MARGIN, SIG_LINE_Y + 23, { width: contentW, align: "center" });

    // Footer: reference id (left) and issue date (right)
    doc.rect(MARGIN + 12, 522, contentW - 24, 0.5).fill(colors.faintest);
    doc.fillColor(colors.faint).fontSize(8).font("Helvetica");
    doc.text(`CERTIFICATE ID · ${input.documentId}`, MARGIN + 12, 532, {
      width: contentW - 24,
      characterSpacing: 1,
      lineBreak: false,
    });
    doc.text(`ISSUED ${fmtDate(input.issuedAt).toUpperCase()}`, MARGIN + 12, 532, {
      width: contentW - 24,
      align: "right",
      characterSpacing: 1,
      lineBreak: false,
    });

    doc.end();
  });
}
