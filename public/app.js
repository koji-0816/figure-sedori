const keywordInput = document.getElementById("keyword");
const searchBtn = document.getElementById("searchBtn");
const statusEl = document.getElementById("status");
const resultArea = document.getElementById("resultArea");
const rowTemplate = document.getElementById("rowTemplate");
const candidateTemplate = document.getElementById("candidateTemplate");

const yen = (n) => `${Math.round(n).toLocaleString("ja-JP")}円`;

function buildTable(items) {
  resultArea.innerHTML = "";

  if (items.length === 0) {
    resultArea.innerHTML = "<p class='note'>該当する商品が見つかりませんでした。</p>";
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>画像</th>
        <th>商品名</th>
        <th>現在価格</th>
        <th>送料</th>
        <th>残り時間</th>
        <th>AI確認</th>
        <th>買取価格（手入力）</th>
        <th>見込価格</th>
        <th>判定</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  for (const item of items) {
    const row = rowTemplate.content.cloneNode(true);
    const tr = row.querySelector("tr");

    row.querySelector(".thumb").src = item.image;
    row.querySelector(".thumb").alt = item.title;

    const titleLink = row.querySelector(".titleLink");
    titleLink.href = item.url;
    titleLink.textContent = item.title;

    row.querySelector(".col-price").textContent = yen(item.price);

    const postageCell = row.querySelector(".col-postage");
    if (item.isFreeShipping) {
      postageCell.textContent = "送料無料";
    } else if (item.postage != null) {
      postageCell.textContent = yen(item.postage);
    } else {
      postageCell.textContent = "要確認";
      postageCell.classList.add("warn");
    }

    row.querySelector(".col-time").textContent = item.remainingText || "-";

    const buybackInput = row.querySelector(".buybackInput");
    const estimateCell = row.querySelector(".col-estimate");
    const judgeCell = row.querySelector(".col-judge");

    const postageForCalc = item.postage ?? 0;

    const recalc = () => {
      const buyback = Number(buybackInput.value);
      if (!buyback || buyback <= 0) {
        estimateCell.textContent = "-";
        judgeCell.textContent = "-";
        judgeCell.className = "col-judge";
        return;
      }
      const estimate = buyback / 1.2 - postageForCalc;
      const profit = estimate - item.price;

      estimateCell.textContent = yen(estimate);

      if (profit > 0) {
        judgeCell.textContent = `◎ 利益見込 ${yen(profit)}`;
        judgeCell.className = "col-judge profit";
        tr.classList.add("profit-row");
      } else {
        judgeCell.textContent = `△ 利益なし (${yen(profit)})`;
        judgeCell.className = "col-judge no-profit";
        tr.classList.remove("profit-row");
      }
    };

    buybackInput.addEventListener("input", recalc);

    const aiBtn = row.querySelector(".aiBtn");
    const aiRow = row.querySelector(".aiRow");
    const aiResultCell = row.querySelector(".aiResult");

    aiBtn.addEventListener("click", () => runIdentify(item, aiBtn, aiRow, aiResultCell));

    tbody.appendChild(row);
  }

  resultArea.appendChild(table);
}

function renderCandidateCard(candidate) {
  const card = candidateTemplate.content.cloneNode(true);
  card.querySelector(".candidateLabel").textContent = candidate.label || "商品候補";
  card.querySelector(".c-work").textContent = candidate.work || "-";
  card.querySelector(".c-character").textContent = candidate.character || "-";
  card.querySelector(".c-maker").textContent = candidate.maker || "-";
  card.querySelector(".c-series").textContent = candidate.series || "-";
  card.querySelector(".c-grade").textContent = candidate.grade || "-";
  card.querySelector(".c-keyword").textContent = candidate.keyword || "-";
  card.querySelector(".c-confidence").textContent = candidate.confidence || "-";
  card.querySelector(".c-caveats").textContent = candidate.caveats || "-";
  return card;
}

async function runIdentify(item, aiBtn, aiRow, aiResultCell) {
  aiBtn.disabled = true;
  aiBtn.textContent = "解析中…";
  aiRow.hidden = false;
  aiResultCell.innerHTML = "<p class='note'>AIが画像を確認しています…</p>";

  try {
    const res = await fetch("/api/identify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageUrl: item.image, title: item.title }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "識別に失敗しました");
    }

    aiResultCell.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "candidateWrapper";
    for (const candidate of data.items || []) {
      wrapper.appendChild(renderCandidateCard(candidate));
    }
    if (data.unclear) {
      const unclearEl = document.createElement("p");
      unclearEl.className = "note warn";
      unclearEl.textContent = `不明: ${data.unclear}`;
      wrapper.appendChild(unclearEl);
    }
    aiResultCell.appendChild(wrapper);
  } catch (err) {
    aiResultCell.innerHTML = `<p class="note warn">${err.message}</p>`;
  } finally {
    aiBtn.disabled = false;
    aiBtn.textContent = "AI確認";
  }
}

async function runSearch() {
  const keyword = keywordInput.value.trim();
  if (!keyword) return;

  statusEl.textContent = "検索中…";
  searchBtn.disabled = true;

  try {
    const res = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "検索に失敗しました");
    }
    statusEl.textContent = `${data.count}件`;
    buildTable(data.items);
  } catch (err) {
    statusEl.textContent = "";
    resultArea.innerHTML = `<p class="note warn">${err.message}</p>`;
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener("click", runSearch);
keywordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});
