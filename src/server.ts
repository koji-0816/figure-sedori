import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchYahooAuction } from "./scraper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3004;

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/search", async (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  if (!keyword) {
    res.status(400).json({ error: "keyword is required" });
    return;
  }

  try {
    const items = await searchYahooAuction(keyword);
    res.json({ keyword, count: items.length, items });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "ヤフオクの検索に失敗しました" });
  }
});

app.listen(PORT, () => {
  console.log(`figure-sedori prototype running at http://localhost:${PORT}`);
});
