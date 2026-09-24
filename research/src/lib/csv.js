/** RFC 4180 のCSVを配列に(ダブルクォート内の改行・カンマ・"" に対応) */
export function parseCSV(text) {
  const src = String(text).replace(/^﻿/, "");
  const delim = (src.split("\n")[0].match(/\t/g) || []).length > (src.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const GUESS = {
  text: /^(text|full_text|tweet|body|content|caption|comment|message|本文|内容|投稿|コメント|テキスト)$/i,
  date: /(date|created|time|日時|日付|投稿日)/i,
  url: /(url|link|permalink|リンク)/i,
  author: /(user|author|screen_name|username|handle|名前|アカウント|ユーザー)/i,
  likes: /(like|favorite|fav|いいね)/i,
};

/** 見出し行から列の役割を推測する */
export function guessColumns(header) {
  const pick = (re) => header.findIndex((h) => re.test(h.trim()));
  let text = pick(GUESS.text);
  if (text < 0) text = header.findIndex((h) => /text|本文|投稿|comment|caption/i.test(h));
  return { text, date: pick(GUESS.date), url: pick(GUESS.url), author: pick(GUESS.author), likes: pick(GUESS.likes) };
}

/** 貼り付けテキストを投稿に分ける: 空行があれば空行区切り、なければ1行1投稿 */
export function splitPosts(text) {
  const t = String(text).trim();
  if (!t) return [];
  const parts = /\n\s*\n/.test(t) ? t.split(/\n\s*\n+/) : t.split(/\n/);
  return parts.map((p) => p.trim()).filter((p) => p.length >= 4);
}

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCSV = (header, rows) =>
  "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");

export function download(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
