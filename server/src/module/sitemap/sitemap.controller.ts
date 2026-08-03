import type { Request, Response } from "express";
import { SitemapService, type SitemapSection } from "./sitemap.service.js";

const sitemapService = new SitemapService();

const SECTIONS: SitemapSection[] = ["pages", "companies", "content", "jobs"];

function sendXml(res: Response, xml: string) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(xml);
}

export class SitemapController {
  /** /sitemap.xml, the sitemap index. Static, so no DB work on this path. */
  getSitemapIndex(_req: Request, res: Response) {
    sendXml(res, sitemapService.generateIndex());
  }

  /** /sitemap-<section>.xml */
  async getSitemapSection(req: Request, res: Response) {
    const section = req.params["section"] as SitemapSection | undefined;
    if (!section || !SECTIONS.includes(section)) {
      return res.status(404).send("Unknown sitemap section");
    }
    try {
      sendXml(res, await sitemapService.generateSection(section));
      return;
    } catch (err) {
      console.error(`[Sitemap] Generation failed for section "${section}":`, err);
      return res.status(500).send("Sitemap generation failed");
    }
  }
}
