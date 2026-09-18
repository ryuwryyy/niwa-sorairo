import fs from "node:fs";
import path from "node:path";

/**
 * 再開可能なチェックポイント。
 * コンテナが落ちても、途中の画面から再開できることがこのエージェントの前提条件。
 * 「必ずゴールに到達する」を実現する土台がこれ。
 */
export class State {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { startedAt: new Date().toISOString(), runs: 0, screens: {}, log: [], questions: [] };
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  screen(id) {
    this.data.screens[id] ??= {
      id,
      status: "pending",      // pending | building | verifying | passed | escalated
      attempts: 0,
      nodeId: null,
      mockupPath: null,
      lastScores: null,
      history: []
    };
    return this.data.screens[id];
  }

  note(event, detail) {
    this.data.log.push({ at: new Date().toISOString(), event, detail });
    if (this.data.log.length > 500) this.data.log.splice(0, this.data.log.length - 500);
    this.save();
  }

  ask(screenId, question, context) {
    this.data.questions.push({ at: new Date().toISOString(), screenId, question, context, answered: null });
    this.save();
  }

  /** ゴール達成判定 — 全画面が passed であること。 */
  isComplete(screenIds) {
    return screenIds.every(id => this.data.screens[id]?.status === "passed");
  }

  summary(screenIds) {
    return screenIds.map(id => {
      const s = this.data.screens[id];
      return { id, status: s?.status ?? "pending", attempts: s?.attempts ?? 0, scores: s?.lastScores ?? null };
    });
  }
}
