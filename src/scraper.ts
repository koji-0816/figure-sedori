import * as cheerio from "cheerio";

export interface AuctionItem {
  auctionId: string;
  title: string;
  image: string;
  url: string;
  price: number;
  isFreeShipping: boolean;
  postage: number | null;
  postageText: string;
  bidCount: number | null;
  remainingText: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function parsePostage(postageText: string): number | null {
  const match = postageText.replace(/,/g, "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function searchYahooAuction(keyword: string): Promise<AuctionItem[]> {
  const url = `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Yahoo Auction fetch failed: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const items: AuctionItem[] = [];

  $("li.Product").each((_, el) => {
    const card = $(el);
    const link = card.find("a.Product__imageLink").first();
    if (link.length === 0) return;

    const auctionId = link.attr("data-auction-id") ?? "";
    const title = link.attr("data-auction-title") ?? "";
    const image = link.attr("data-auction-img") ?? "";
    const href = link.attr("href") ?? "";
    const price = Number(link.attr("data-auction-price") ?? "0");
    const isFreeShipping = (link.attr("data-auction-isfreeshipping") ?? "") !== "";

    const postageTextRaw = card.find("p.Product__postage").first().text().trim();
    const postageText = isFreeShipping ? "送料無料" : postageTextRaw;
    const postage = isFreeShipping ? 0 : parsePostage(postageTextRaw);

    const bidText = card.find("dd.Product__bid").first().text().trim();
    const bidCount = bidText ? Number(bidText) : null;

    const remainingText = card.find("dd.Product__time").first().text().trim();

    if (!auctionId || !title) return;

    items.push({
      auctionId,
      title,
      image,
      url: href,
      price,
      isFreeShipping,
      postage,
      postageText,
      bidCount,
      remainingText,
    });
  });

  return items;
}
