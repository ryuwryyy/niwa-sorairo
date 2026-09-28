/** サンプル案件の読み込み（コンパイル済みプロンプト版を 1 つ付けてから import する）。 */
import { makeSampleProject, SAMPLE_NAME } from "../data/sampleProject";
import { compilePrompt } from "./prompt";
import { uid, now } from "../store";

export { SAMPLE_NAME };

/** @returns {object} prompt.versions を 1 つ持つ完成済みプロジェクト */
export function buildSampleProject() {
  const p = makeSampleProject();
  const { en, ja, blocks, refIds } = compilePrompt(p, { maxRefImages: 3 });
  const v = {
    id: uid(),
    at: now(),
    source: "compiled",
    en,
    ja,
    blocks,
    refIds,
    note: "サンプル：変数から決定論的にコンパイルした初版",
  };
  return { ...p, prompt: { versions: [v], activeId: v.id } };
}

/** store の dispatch を受け取ってサンプルを読み込む */
export function loadSample(dispatch) {
  const project = buildSampleProject();
  dispatch({ type: "project/import", project });
  return project;
}

export default loadSample;
