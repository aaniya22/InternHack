import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1200 });
await page.goto("http://localhost:5199/preview-charts.html", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 4000));
const out = await page.evaluate(() => {
  const styles = (sel, n = 2) =>
    Array.from(document.querySelectorAll(sel)).slice(0, n).map((e) => {
      const s = getComputedStyle(e);
      return { fill: s.fill, opacity: s.opacity, fillOpacity: s.fillOpacity, stroke: s.stroke, visibility: s.visibility, clip: s.clipPath, display: s.display };
    });
  const clips = Array.from(document.querySelectorAll("clipPath rect")).slice(0, 4).map((r) => ({
    w: r.getAttribute("width"), h: r.getAttribute("height"), x: r.getAttribute("x"), y: r.getAttribute("y"),
  }));
  return {
    bar: styles(".recharts-bar-rectangle path"),
    scatter: styles(".recharts-scatter-symbol path"),
    radar: styles(".recharts-radar-polygon path"),
    line: styles(".recharts-line-curve"),
    barGroup: styles(".recharts-bar", 1),
    clips,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
