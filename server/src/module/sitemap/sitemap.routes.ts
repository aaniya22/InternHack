import { Router } from "express";
import { SitemapController } from "./sitemap.controller.js";

const sitemapController = new SitemapController();
export const sitemapRouter = Router();

sitemapRouter.get("/sitemap.xml", (req, res) => sitemapController.getSitemapIndex(req, res));

// sitemap-pages.xml, sitemap-companies.xml, sitemap-content.xml, sitemap-jobs.xml.
// sitemap-learn.xml is deliberately absent: it is a static file emitted by the
// client build and served from the www project.
sitemapRouter.get("/sitemap-:section.xml", (req, res) =>
  sitemapController.getSitemapSection(req, res),
);
