import { useState } from "react";
import Listening from "./views/Listening";
import Interview from "./views/Interview";

const TABS = [
  { id: "listening", label: "ソーシャルリスニング", view: Listening },
  { id: "interview", label: "インタビュー整理", view: Interview },
];

export default function App() {
  const [tab, setTab] = useState(() => (location.hash === "#interview" ? "interview" : "listening"));
  const pick = (id) => { setTab(id); history.replaceState(null, "", `#${id}`); };

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>聴く<small>Jevで仕分けるデザインリサーチ</small></h1>
          <p>SNSの声とインタビューの発言を、決めた問いに沿って一瞬で仕分ける。文章は書かせず、判断だけをJevに任せる。</p>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => pick(t.id)}>{t.label}</button>
        ))}
      </nav>

      {/* 両方マウントしたまま切り替え、タブを移っても結果を失わない */}
      {TABS.map(({ id, view: View }) => (
        <div key={id} role="tabpanel" hidden={tab !== id}><View /></div>
      ))}

      <footer className="note">
        判定は TypeSafe AI の Jev(System One モデル)。投稿や発言の本文は判定のために TypeSafe AI へ送信されます。
        個人情報を含む議事録は、社内規程を確認のうえ匿名化してから入れてください。
      </footer>
    </div>
  );
}
