import type { PdfTheme } from "../../roadmap/pdf/types.js";

export interface InternshipDocInput {
  theme?: PdfTheme;
  /** Full name as it should appear on the document. */
  internName: string;
  /** e.g. "Full Stack Developer Intern" */
  role: string;
  startDate: Date;
  endDate: Date;
  /** Date the document is issued. Defaults to endDate when omitted by the caller. */
  issuedAt: Date;
  /** Stable, human-readable document reference printed on the page. */
  documentId: string;
  signatory: {
    name: string;
    title: string;
    email: string;
  };
}
