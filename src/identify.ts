const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

const IMAGE_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://auctions.yahoo.co.jp/",
};

export interface Candidate {
  label: string;
  work?: string;
  character?: string;
  maker?: string;
  series?: string;
  grade?: string;
  keyword: string;
  confidence: string;
  caveats?: string;
}

export interface IdentifyResult {
  items: Candidate[];
  unclear?: string;
}

const REPORT_TOOL = {
  name: "report_candidates",
  description:
    "ヤフオク商品画像から識別したフィギュアの候補情報を報告する。まとめ売りの場合は複数体に分けて報告する。",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "1体目 / 2体目 / 商品候補 など、まとめ売りでなければ「商品候補」",
            },
            work: { type: "string", description: "作品名" },
            character: { type: "string", description: "キャラ名" },
            maker: { type: "string", description: "メーカー（バンプレスト、グッドスマイルカンパニー等）" },
            series: {
              type: "string",
              description: "シリーズ（ねんどろいど、figma、S.H.Figuarts、POP UP PARADE、DXF、Q posket 等）",
            },
            grade: { type: "string", description: "一番くじの賞（A賞等）やバージョン表記" },
            keyword: {
              type: "string",
              description: "トレーダー買取価格検索に人が手入力する用の検索キーワード文字列",
            },
            confidence: { type: "string", description: "確度。例: 高（90%程度）/ 中 / 低" },
            caveats: {
              type: "string",
              description:
                "要確認ポイント。箱なし・似たポーズ違い・リペイント疑い・海外版/偽造品疑い・まとめ売りで一部隠れている・画像が荒い、等の理由を具体的に",
            },
          },
          required: ["label", "keyword", "confidence"],
        },
      },
      unclear: {
        type: "string",
        description: "識別できなかった対象があればその説明。なければ空文字",
      },
    },
    required: ["items"],
  },
};

async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(imageUrl, { headers: IMAGE_FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`画像の取得に失敗しました: ${res.status}`);
  }
  const mediaType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { data: buffer.toString("base64"), mediaType };
}

export async function identifyFigure(imageUrl: string, title: string): Promise<IdentifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません");
  }

  const { data, mediaType } = await fetchImageAsBase64(imageUrl);

  const prompt = `以下はヤフオク出品商品の画像とタイトルです。フィギュアの商品候補を識別してください。

タイトル: ${title}

まとめ売り（複数体が写っている）の場合は1体目・2体目...と分けて報告し、判別できない対象は unclear に書いてください。
箱なし・似たポーズ違いが多いキャラクター・リペイント疑い・海外版/偽造品疑い・画像が荒い、などで確度が下がる場合は confidence を下げ、caveats に具体的な理由を書いてください。
型番を断定できる情報が画像内にない限り、型番そのものは無理に書かず、work/character/maker/series/grade と検索用キーワードの提示を優先してください。

重要な制約:
- items配列は最大4件までとする。画像に写っている、または明確に区別できる対象が4体を超える場合は、代表的なものだけ報告し、残りは unclear に「他◯点は個別識別困難」のようにまとめること。
- 内容が空・不明な項目を水増しして出力しないこと。identifyできる情報が全くない場合は items を1件のみとし、confidence を「低」、caveats に理由を書くこと。
- 同じ内容の項目を繰り返し出力しないこと。`;

  const body = {
    model: MODEL,
    max_tokens: 1500,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "report_candidates" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: prompt },
        ],
      },
    ],
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API呼び出しに失敗しました: ${res.status} ${text}`);
  }

  const json = await res.json();
  const toolUse = (json.content ?? []).find((block: any) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("識別結果を取得できませんでした");
  }

  const result = toolUse.input as IdentifyResult;
  const MAX_ITEMS = 6;

  const isMeaningful = (c: Candidate) =>
    Boolean(c.keyword?.trim() || c.work?.trim() || c.character?.trim() || c.series?.trim());

  const items = (result.items ?? []).filter(isMeaningful).slice(0, MAX_ITEMS);
  const truncatedNote =
    (result.items ?? []).length > MAX_ITEMS
      ? `候補が${(result.items ?? []).length}件検出されたため上位${MAX_ITEMS}件のみ表示しています。`
      : "";

  return {
    items,
    unclear: [result.unclear, truncatedNote].filter(Boolean).join(" "),
  };
}
