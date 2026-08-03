import PDFDocument from "pdfkit";
import type { InternshipDocInput } from "./types.js";
import { getColors, DARK_COLORS } from "../../roadmap/pdf/utils/colors.js";
import { A4_WIDTH, A4_HEIGHT, MARGIN, fmtDate } from "../../roadmap/pdf/utils/layout.js";
import { logoBuffer, signatureBuffer } from "./assets.js";

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * Body of the letter. Gender-neutral throughout (they/them), since intern
 * pronouns are not collected.
 */
function letterParagraphs(input: InternshipDocInput): string[] {
  const first = firstNameOf(input.internName);
  const term = `${fmtDate(input.startDate)} to ${fmtDate(input.endDate)}`;

  return [
    `It is my pleasure to recommend ${input.internName}, who served as a ${input.role} at InternHack from ${term}. `
      + `I am the ${input.signatory.title} of InternHack and worked with ${first} directly for the duration of the internship, `
      + `reviewing their work and their day to day output.`,

    `${first} was trusted with real, user facing responsibilities rather than side projects. They took features from a rough problem `
      + `statement through to a working result in the hands of our users, worked comfortably across both ends of the product, and `
      + `handled the unglamorous parts of shipping (testing, review, and follow up) without being asked twice.`,

    `What stood out most was ownership. ${first} asked the right questions early rather than guessing, flagged problems while they `
      + `were still small, and followed up on the details that are easy to skip. They came up to speed on an unfamiliar codebase `
      + `quickly, respected the conventions already in place instead of working around them, and responded to feedback thoughtfully. `
      + `Communication was clear and consistent, which made them straightforward to work with remotely.`,

    `${first} is a capable engineer with the habits that matter early in a career: curiosity, follow through, and a willingness to be `
      + `corrected. I have no hesitation in recommending them for software engineering roles or for further study. Any team that brings `
      + `them on will get someone who learns fast and finishes what they start.`,

    `Please feel free to contact me at ${input.signatory.email} if you would like to discuss this recommendation further.`,
  ];
}

/**
 * Letter of Recommendation (A4 portrait) on an InternHack letterhead.
 */
export async function generateLorPdf(input: InternshipDocInput): Promise<Buffer> {
  const colors = getColors(input.theme);

  return new Promise((resolve, reject) => {
    const W = A4_WIDTH;
    const H = A4_HEIGHT;
    const contentW = W - MARGIN * 2;

    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Letter of Recommendation – ${input.internName}`,
        Author: "InternHack",
        Subject: `Letter of recommendation for ${input.internName}`,
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

    // Letterhead: logo left, wordmark and contact line beside it
    doc.rect(0, 0, W, 6).fill(colors.accent);

    const logo = logoBuffer();
    const logoSize = 42;
    const textX = logo ? MARGIN + logoSize + 14 : MARGIN;
    if (logo) {
      doc.image(logo, MARGIN, 40, { width: logoSize, height: logoSize });
    }
    doc.fillColor(colors.ink).fontSize(19).font("Helvetica-Bold");
    doc.text("INTERNHACK", textX, 46, { characterSpacing: 2.5, lineBreak: false });
    doc.fillColor(colors.faint).fontSize(9).font("Helvetica");
    doc.text(`internhack.xyz  ·  ${input.signatory.email}`, textX, 68, { lineBreak: false });
    doc.rect(MARGIN, 94, contentW, 0.5).fill(colors.faintest);

    // Date and reference
    doc.fillColor(colors.mute).fontSize(10).font("Helvetica");
    doc.text(fmtDate(input.issuedAt), MARGIN, 106, { width: contentW, lineBreak: false });
    doc.fillColor(colors.faint).fontSize(8);
    doc.text(`REF · ${input.documentId}`, MARGIN, 107, {
      width: contentW,
      align: "right",
      characterSpacing: 1,
      lineBreak: false,
    });

    // Title
    doc.fillColor(colors.ink).fontSize(17).font("Helvetica-Bold");
    doc.text("Letter of Recommendation", MARGIN, 138, { width: contentW });
    doc.rect(MARGIN, 162, 40, 2).fill(colors.accent);

    // Salutation
    doc.fillColor(colors.ink).fontSize(11).font("Helvetica-Bold");
    doc.text("To Whom It May Concern,", MARGIN, 184, { width: contentW });

    // Body
    doc.y = 208;
    doc.fillColor(colors.body).fontSize(10.5).font("Helvetica");
    for (const para of letterParagraphs(input)) {
      doc.text(para, MARGIN, doc.y, {
        width: contentW,
        align: "justify",
        lineGap: 3.2,
      });
      doc.moveDown(0.9);
    }

    // Closing
    doc.moveDown(0.6);
    doc.fillColor(colors.body).fontSize(10.5).font("Helvetica");
    doc.text("Sincerely,", MARGIN, doc.y, { width: contentW });

    const signature = signatureBuffer();
    const sigY = doc.y + (signature ? 56 : 34);
    if (signature) {
      doc.image(signature, MARGIN, sigY - 54, { fit: [150, 50], valign: "bottom" });
    }
    doc.rect(MARGIN, sigY, 170, 0.5).fill(colors.faintest);
    doc.fillColor(colors.ink).fontSize(11).font("Helvetica-Bold");
    doc.text(input.signatory.name, MARGIN, sigY + 8, { width: contentW });
    doc.fillColor(colors.mute).fontSize(9.5).font("Helvetica");
    doc.text(`${input.signatory.title}, InternHack`, MARGIN, doc.y, { width: contentW });
    doc.fillColor(colors.faint).fontSize(9);
    doc.text(input.signatory.email, MARGIN, doc.y, { width: contentW });

    // Footer. Drawn without a `width` option on purpose: passing one engages
    // pdfkit's line wrapper, which appends a blank page for text positioned
    // below the bottom margin. Right edge is placed by measuring instead.
    const footerY = H - MARGIN + 4;
    doc.rect(MARGIN, footerY, contentW, 0.5).fill(colors.faintest);
    doc.fillColor(colors.faint).fontSize(7.5).font("Helvetica");

    const footerOpts = { characterSpacing: 1.2, lineBreak: false } as const;
    doc.text("INTERNHACK · LETTER OF RECOMMENDATION", MARGIN, footerY + 8, footerOpts);
    const idWidth = doc.widthOfString(input.documentId, footerOpts);
    doc.text(input.documentId, W - MARGIN - idWidth, footerY + 8, footerOpts);

    doc.end();
  });
}
