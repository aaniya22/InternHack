import type { JobContext } from "../../lib/types";
import { GenericAdapter } from "./generic";

function text(selectors: string[]) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return "";
}

export class WellfoundAdapter extends GenericAdapter {
  siteType = "WELLFOUND" as const;

  detect() {
    if (!/wellfound\.com|angel\.co/i.test(location.hostname)) return false;
    // Job posting, company job list, or the application form itself.
    return (
      /\/jobs\/|\/company\/[^/]+\/jobs|\/l\/|\/apply/i.test(location.pathname) ||
      Boolean(document.querySelector("[data-test='JobDetail'], [data-test='JobApplicationForm'], form[action*='apply']"))
    );
  }

  extractJobContext(): JobContext {
    const base = super.extractJobContext();
    const role = text(["[data-test='JobDetail'] h1", "h1", "h2"]) || base.role;
    const company =
      text([
        "[data-test='StartupHeader'] h1",
        "[data-test='JobDetail'] a[href*='/company/']",
        "a[href*='/company/']",
      ]) || base.company;
    const description =
      text(["[data-test='JobDescription']", "#job-description", "main section"]) || base.jobDescription || "";

    return {
      ...base,
      role,
      company,
      jobDescription: description || null,
      siteType: this.siteType,
    };
  }
}
