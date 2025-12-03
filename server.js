const express = require("express");
const { chromium } = require("playwright");
const PQueue = require("p-queue");

const app = express();
app.use(express.json());

const queue = new PQueue({ concurrency: 2 }); // DO NOT RAISE ON FREE TIER

async function scrapeSite(url) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    // Prevent heavy assets
    await page.route("**/*", route => {
      const t = route.request().resourceType();
      if (["image", "media", "font"].includes(t)) route.abort();
      else route.continue();
    });

    await page.setExtraHTTPHeaders({
      "User-Agent": "Mozilla/5.0 ContactScraper"
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    const { text, links } = await page.evaluate(() => ({
      text: document.body.innerText || "",
      links: Array.from(document.querySelectorAll("a")).map(a => a.href)
    }));

    const emails = [
      ...new Set(
        text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g) || []
      )
    ];

    const phones = [
      ...new Set(
        text.match(/(\+?\d[\d\s\-()]{7,}\d)/g) || []
      )
    ];

    const socials = [
      ...new Set(
        links.filter(l =>
          /(facebook|instagram|linkedin|twitter|x|tiktok)\.com/i.test(l)
        )
      )
    ];

    return {
      success: true,
      emails,
      phones,
      socials
    };
  } catch (err) {
    return {
      success: false,
      emails: [],
      phones: [],
      socials: []
    };
  } finally {
    await browser.close(); // NON-NEGOTIABLE
  }
}

app.post("/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url)
    return res.status(400).json({ error: "Missing url" });

  try {
    const result = await queue.add(() => scrapeSite(url));
    res.json(result);
  } catch {
    res.status(500).json({
      success: false,
      emails: [],
      phones: [],
      socials: []
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Scraper API running on port ${PORT}`)
);
