// インタビュー議事録を「分類できる単位の発言」に切り分ける。
// 対応する書式:
//   田中：本文 / Q: 本文 / [00:12:03] 田中: 本文   … 行頭に話者
//   田中 00:12:03(改行)本文                       … Zoom / Teams の文字起こし
//   話者なしの段落                                 … 空行で区切る

const MAX_CHARS = 220;
const MIN_CHARS = 6;

const INTERVIEWER = /^(q|i|interviewer|moderator|インタビュアー|インタビューア|聞き手|司会|モデレーター|ファシリテーター)\d*$/i;

const TIME = String.raw`\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?`;
const inlineSpeaker = new RegExp(String.raw`^\s*(?:${TIME}\s*)?([^\s:：「」()（）]{1,20})\s*[:：]\s*(.*)$`);
const headerSpeaker = new RegExp(String.raw`^\s*([^\s:：「」]{1,20}(?:\s[^\s:：「」]{1,20})?)\s+${TIME}\s*$`);

// 「朝10:30に…」「https://…」のような本文中のコロンを話者と取り違えない
const isSpeakerName = (s, rest = "") =>
  !/^\d+$/.test(s) && !/^https?$/i.test(s) && !rest.startsWith("//") && !(/\d$/.test(s) && /^\d/.test(rest));

/** 長すぎる発言を文末で区切る */
function splitLong(text) {
  if (text.length <= MAX_CHARS) return [text];
  const sentences = text.match(/[^。！？!?]+[。！？!?」』]*/g) || [text];
  const out = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && (buf + s).length > MAX_CHARS) { out.push(buf); buf = ""; }
    buf += s;
    while (buf.length > MAX_CHARS * 1.5) { out.push(buf.slice(0, MAX_CHARS)); buf = buf.slice(MAX_CHARS); }
  }
  if (buf) out.push(buf);
  return out;
}

export function segmentTranscript(raw) {
  const blocks = [];
  let cur = null;
  const flush = () => { if (cur && cur.text.trim()) blocks.push(cur); cur = null; };

  for (const line of String(raw).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) { if (cur) { const sp = cur.speaker; flush(); cur = { speaker: sp, text: "" }; } continue; }

    const header = t.match(headerSpeaker);
    if (header && isSpeakerName(header[1])) { flush(); cur = { speaker: header[1], text: "" }; continue; }

    const inline = t.match(inlineSpeaker);
    if (inline && isSpeakerName(inline[1], inline[2])) {
      flush();
      cur = { speaker: inline[1], text: inline[2] };
      continue;
    }
    if (!cur) cur = { speaker: null, text: "" };
    cur.text += (cur.text ? "\n" : "") + t;
  }
  flush();

  const segments = [];
  for (const b of blocks) {
    for (const piece of splitLong(b.text.replace(/\n+/g, " ").trim())) {
      const text = piece.trim();
      if (text.length < MIN_CHARS) continue;
      segments.push({ id: `s${segments.length + 1}`, index: segments.length, speaker: b.speaker, text });
    }
  }
  return segments;
}

/** 話者ごとの発言数と、聞き手らしいかどうか */
export function speakersOf(segments) {
  const map = new Map();
  for (const s of segments) {
    const k = s.speaker ?? "(話者なし)";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map].map(([name, count]) => ({ name, count, interviewer: INTERVIEWER.test(name) }));
}
