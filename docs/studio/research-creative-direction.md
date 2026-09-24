# 企画・クリエイティブディレクション手法ライブラリ — リサーチ記録

> 生成物: `studio/src/data/craft.json`
> 調査日: 2026-09-18 ／ 調査担当: Opus 5（リサーチ）
> 目的: **専門教育を受けていない人が、一流のプランナー／CD／AD がやっていることを順番どおりに実行できる**ようにする。
> 方針: 著作物の文章は引用せず、**原理を自分の言葉に置き換えて**構造化した。固有の文言・作品名・キャッチコピーは `craft.json` に一切入れていない（`exampleJa` は全て架空の作例で、「（架空の例）」と明記）。

---

## 1. 情報源と、検証できたこと／蒸留したこと

### 1.1 検証の方法

- `WebFetch`（ページ全文取得）は **canneslions.com / ipa.co.uk / lbbonline.com がエグレスポリシーで遮断**されていたため、`WebSearch` の結果を**複数ソースで突き合わせる**方法を主とした。
- 数値（審査比率・段数・配分比）は **2 件以上の独立した記述が一致した場合のみ**採用し、一致しなかったものは「蒸留」扱いにして本文で明示した。
- 書籍（Jon Steel / Adam Morgan / Dave Trott / Paul Arden / D&AD / 佐藤可士和 / 小霜和也）は**原文を参照していない**。公開されている要約・書誌・出版社ページから**主張の骨格のみ**を取り、文章は一切転記していない。

### 1.2 検証できた事実（数値・構造）

| 項目 | 確認できた内容 | 出典 |
|---|---|---|
| Cannes 審査の三分法 | Print & Publishing / Outdoor / Film / Innovation は「the idea / the execution / the impact」の3点で審査、と部門ページに明記 | [Print & Publishing](https://www.canneslions.com/awards/lions/print-publishing/what-you-need-to-know) |
| Design Lions の比率 | **40% idea / 40% execution / 20% results** | [Design Lions](https://www.canneslions.com/awards/lions/design/what-you-need-to-know) |
| Creative Effectiveness の比率 | **25% idea / 25% strategy / 50% impact and results** | [Creative Effectiveness Lions](https://www.canneslions.com/awards/lions/creative-effectiveness/what-you-need-to-know) |
| Creative Strategy の比率 | **30% 課題解釈 / 30% インサイト・breakthrough / 20% アイデア / 20% 結果** | [Creative Strategy Lions](https://www.canneslions.com/awards/lions/creative-strategy/what-you-need-to-know) |
| Entertainment の比率 | 30% idea / 20% strategy & insight / 30% craft & execution / 20% results | [Entertainment Lions](https://www.canneslions.com/awards/lions/entertainment/what-you-need-to-know) |
| Direct の比率 | 30% idea / 20% strategy / 20% execution / 30% impact and results | [Direct Lions](https://www.canneslions.com/awards/lions/direct/what-you-need-to-know) |
| 審査の運用 | 審査員は応募者が書いた説明文を判断の基礎として参照し続ける | [How Judging Works](https://www.canneslions.com/awards/awards-support/how-judging-works) |
| 応募指針 | 「量ではなく明快さ」「文化的文脈とインサイトを説明せよ」 | [Awards Entry Guide](https://www.canneslions.com/awards/awards-support/awards-entry-guide) |
| Creative Effectiveness Ladder | 6段。Cannes Lions × WARC。**James Hurman with Peter Field『The Effectiveness Code』(2020)**。2011–2019 の **4,863 件**（Cannes 1,031 / WARC 3,616 / IPA 216）の分析 | [WARC](https://www.warc.com/en/case-studies/creative-effectiveness-ladder) / [白書PDF](https://www.mm.be/userfiles/media/The%20effectiveness%20code.pdf) |
| Ladder Level 5 / 6 の定義 | L5 = 四半期・キャンペーン期間を超えた利益を伴う成長（12か月目標を立てて年末に測る）。L6 = **3年以上、同じ戦略・同じクリエイティブのまま**伸ばし続ける | [WARC Level 6](https://www.warc.com/creative/creative-effectiveness-ladder/level-6) |
| Get–To–By の出自 | **2004–05年の BBDO ニューヨーク**（Martyn Straw）。Ogilvy の戦略教育の影響下だが **BBH 発ではない** | [Origin of GET/WHO/TO/BY](https://medium.com/@baiba.matisone/origin-of-the-get-who-to-by-model-0ed51eafd65d) / [Kickframe](https://kickframetoolbox.com/get-who-to-by) |
| Droga5 の探索面 | **Four Cs = company / category / consumer / culture** | [Droga5 Strategy](https://droga5.com/people/strategy/) / [Wharton 対談](https://knowledge.wharton.upenn.edu/article/colm-murphy-droga5-interview/) |
| Eating the Big Fish | チャレンジャーの **8 credos**、うち **#2 が build a lighthouse identity**、#5 が sacrifice | [eatbigfish](https://www.eatbigfish.com/thinking/eating-the-big-fish) |
| Binet & Field | IPA Databank **約1,000件**、**60:40**（ブランド構築:刈り取り）、感情主導が長期の利益成長と結びつく | [Growth Method](https://growthmethod.com/long-and-short/) |
| Byron Sharp | mental availability / physical availability / **distinctive brand assets は一貫して長く使うほど強い記憶の手がかりになる** | [Zappi](https://learn.zappi.io/en_US/audience-and-sample/principles-of-how-brands-grow-by-byron-sharp) |
| 博報堂「生活者発想」 | **1981年提唱**。人を消費者・データではなく、**矛盾や葛藤を抱えた生活者**として全方位から理解する。もとは広告制作を支える技術として構想 | [フィロソフィー](https://www.hakuhodo.co.jp/about/dna/philosophy/) / [The H Magazine](https://www.hakuhodo.co.jp/magazine/65314/) |
| 日本のクリエイティブブリーフ項目列 | 目的／目標／ターゲット／ターゲットインサイト／戦略ベネフィット／RTB／メインメッセージ | [電通デジタル](https://www.dentsudigital.co.jp/knowledge-charge/articles/0915-marketing-framework) |
| ブリーフの定義 | 「何を・なぜ・誰に・どのように」を言語化し、制作者との認識のズレを最小化する設計図 | [宣伝会議](https://www.sendenkaigi.com/marketing/media/sendenkaigi/003537/) |
| 佐藤可士和「超整理術」 | 仕事の整理は **状況把握 → 視点導入 → 課題設定** の3段 | [flier 要約](https://www.flierinc.com/summary/3227) |
| 小霜和也 | コピーは売るのではなく**言葉で商品の価値を上げる**仕事。**タグラインは価値が最大化される「定義付け」に特化したコピー** | [1book.co.jp](http://www.1book.co.jp/005803.html) |
| D&AD The Copy Book | **1995年刊**、David Abbott / Dan Wieden / Neil French ら **53名**。共通原理は明快さ・簡潔さ・受け手理解・物語性 | [TASCHEN](https://www.taschen.com/en/books/graphic-design/43914/d-and-ad-the-copy-book) |
| Paul Arden | 「正しいことは間違い（既知の焼き直しになる）」「ラフの方がアイデアが伝わる」「賞賛でなく批判を求めよ」「悪いブリーフなど無い」 | [Alex Murrell 要約](https://www.alexmurrell.co.uk/summaries/paul-arden-its-not-how-good-you-are-its-how-good-you-want-to-be) |
| Dave Trott | 「症状ではなく本当の問題を見る」「ブリーフに答える前にブリーフを疑う」「push ではなく pull」 | [Alex Murrell 要約](https://www.alexmurrell.co.uk/summaries/dave-trott-predatory-thinking) |
| Jon Steel | プランニングの目的は「本当に人に届く広告をつくること」。調査は単純さ・常識・創造性で行い、生活者を受け手でなく共犯者にする | [Blinkist](https://www.blinkist.com/en/books/truth-lies-and-advertising-en) |
| 3秒ルール / thumb-stop | OOH は約3秒で意味が通る必要（**経験則であり厳密な計測値ではない**と出典自身が明記）。要素が競合する版面は前注意的処理が働かず無視される。thumb-stop は最初の1フレームで価値が分かることが条件 | [Wildish & Co.](https://www.wildishandco.co.uk/blog/billboard-advertising-psychology-3-second-rule) / [Marpipe](https://www.marpipe.com/ad-glossary/thumbstop) |

### 1.3 蒸留（＝原理は確からしいが、数値や名称を一次で確定できなかったもの）

| 項目 | 状態 | どう扱ったか |
|---|---|---|
| **`cannesLens.criteria` の 40/30/30** | **未検証**。Print & Publishing / Outdoor / Film は「idea / execution / impact の3点」とだけ公開し、**比率を公開していない**。40/40/20（Design）・25/25/50（Effectiveness）・30/20/20/30（Direct）など部門ごとに大きく異なる | 本アプリは KV 一枚を扱うので、**アイデアをやや重くした部門横断の平均値として 40/30/30 を採用**。`sources` の note に「比率は本ファイル独自の蒸留」と明記した。**この3数値は引用してはならない** |
| **Droga5 の「cultural tension」** | 公式に定義された固有フレーム名としては**確認できなかった**。Four Cs に culture が含まれることと、制作物の説明文で "cultural tension" が運用語として使われることは確認 | `insightSources.cultural_tension` として採用し、由来は Four Cs に帰属させた |
| **W+K / Nike の「human truth × brand truth」** | この2語の対として W+K が公式に定義した文書は**確認できなかった**。brand truth という語が Nike 文脈で使われる記述はある | `methods.three_truths` を「実務で語られる考え方」と明記し、検証可能な product truth を加えた3点交差として再構成した |
| **Ladder Level 4 の日本語名** | 英語名は WARC 表記で **"Brand Buildup"**（依頼文の "brand building" と微差）。Level 1–4 の説明は要約経由で、白書原文の定義文は未参照 | 英語表記は WARC に合わせ `Brand buildup` とし、日本語は「ブランドの積み上げ」とした |
| **`tensionPairs` の8つの型** | 特定の出典に帰属する型ではない。生活者発想（矛盾を抱えた生活者）と、態度と行動の乖離という一般的なプランニング作法からの**合成** | 出典を持たせず、テンプレート（穴埋め式）としてのみ提供 |
| **`ideaTests` の weight（2 or 3）** | 完全に本アプリ独自。どの出典にも配点は存在しない | 「本当か」「一つに絞れているか」「自分たちのものか」の3つだけを 3、他を 2 とした。**落とす理由になる3項目**という設計意図 |
| **`kvGrammar` の12文法・`adChecklist` の17項目** | 個々の原理（視覚階層・余白・比喩・シリーズ思考）は広く共有されているが、この分類自体は本アプリの整理 | 出典を持たせず、`descJa` / `fixJa` に判断根拠を書いた |
| **`taglineDirections` の10型** | 型の分類は本アプリの整理。`reframe`（言い換え）だけは小霜和也の「定義付けとしてのタグライン」に由来を明記 | 全ての `exampleJa` を架空の作例とし、実在コピーは1つも入れていない |

---

## 2. 「一流の企画はどう作られるか」10 箇条

各条は **① 仕組み（なぜ効くのか）／② このアプリでの具体的な使い方** の2段で書く。②は非専門家がその場で実行できる手順に落としてある。

### 第1条 — 課題を疑ってから解く

**① 仕組み。** 依頼文に書かれている課題は、ほぼ必ず「症状」である。「認知が足りない」は症状で、原因は別にある。Cannes の Creative Strategy 部門が**課題の解釈に 30% を配点している**のは、課題の立て方そのものが創造行為だからだ。Dave Trott の「ブリーフに答える前にブリーフを疑う」も同じことを言っている。原因を取り違えると、実行がどれだけ良くても効かない。

**② このアプリでは。** 課題ステージで、依頼文をそのまま書いたあと `methods.predatory_thinking` を開く。「それは症状ではないか」を**3回**繰り返して原因を3階層まで掘る。3階層目に出てきた文が最初の依頼文と違っていたら、そこで一度止まって「どちらを解くか」を決める。決めた文だけを `brief.problem` に入れる。

### 第2条 — 人の真実から始め、商品の話から始めない

**① 仕組み。** 博報堂の生活者発想が1981年から言っているのは、人を「消費者」という購買の断面で見ないということだ。矛盾や葛藤を抱えた生活の側から見ると、商品説明では絶対に出てこない入口が見つかる。Jon Steel のプランニング論も、調査の目的は数字を集めることではなく**人の側から検証できる真実に触れること**だとしている。

**② このアプリでは。** `insightSources.human_truth` の3つの問いに答える。答えた文から**ブランド名と商品名を物理的に削除**して、まだ文として成り立つか確認する。成り立たなければ、それはベネフィットであってインサイトではないので書き直す。成り立ったものだけを `brief.insight` に入れる。

### 第3条 — 緊張を一文にする

**① 仕組み。** インサイトは、そのままでは素材にすぎない。「〜したいのに、〜してしまう」という**綱引きの形**にした瞬間に、そこに入っていく余地が生まれる。緊張のない事実には、広告がやることが無い。Droga5 が company / category / consumer と並べて culture を独立させているのも、ほどけていない緊張が会話を生むからだ。

**② このアプリでは。** `tensionPairs` の8つの型に、第2条で作った文を**順番に全部流し込む**。8回書いてみて、いちばん自分が気まずくなるものを選ぶ。気まずさは、まだ誰も言っていないことの目印である。

### 第4条 — 言うことは、一つに絞る

**① 仕組み。** クリエイティブブリーフの中心にあるのは single-minded proposition、つまり「一つだけ言う」という制約だ。佐藤可士和の整理術が「状況把握 → 視点導入 → 課題設定」の末に**本質を一言にする**のも同じ要請。2つ言うと、受け手はどちらも覚えない。絞れていないアイデアは、制作の後半で必ず弱いほうへ崩れる。

**② このアプリでは。** `methods.creative_brief` の手順に従い、`brief.promise` に**1文だけ**書く。2つ書きたくなったら、片方を必ず RTB（reason to believe）の欄に落とす。書いたあと `ideaTests.single_minded` で「と、」「かつ」が残っていないかを機械的に検査する。

### 第5条 — 三つの真実が交わる一点を探す

**① 仕組み。** 人間の真実だけだと、誰が言っても同じ話になる。ブランドの真実だけだと、独りよがりになる。商品の真実だけだと、ただの仕様説明になる。3つが同時に成り立つ一点だけが、**正直で・他社に取られず・反論されない**アイデアになる。3つのうち1つでも無理に曲げた箇所が、将来の炎上点になる。

**② このアプリでは。** `methods.three_truths` を使い、3本の文を横に並べる。交点が見つからないときに**アイデアをひねってはいけない**。3つのうちどれが弱いかを特定して、`insightSources` のその項目の調査に戻る。これが最も守られない原則で、最も効く原則でもある。

### 第6条 — カテゴリーの常識を棚卸ししてから「新しさ」を主張する

**① 仕組み。** Paul Arden の「正しいことは間違い」は、正しさが既知の情報に基づく以上、正しさを追うと独創の反対に行き着くという指摘だ。新しさは**絶対値では測れず**、そのカテゴリーの常識という物差しに対してしか測れない。常識を書き出していない人は、自分が常識をなぞっていることに気づけない。

**② このアプリでは。** 参照ステージに入る前に `insightSources.category_convention` の問いに答え、同業の広告に共通する被写体・構図・色・言い回しを**6つ以上**書き出す。その後 `ideaTests.new` で「この6つのうち、どれを破っているか」を答える。1つも破っていないなら、まだ案ではない。

### 第7条 — 立場を宣言し、やらないことを決める

**① 仕組み。** Adam Morgan の lighthouse identity は、「灯台は船を探しに行かない」という比喩だ。相手に合わせて説明しにいくのではなく、自分が何者かを高く強く出して見つけてもらう。そして 8 credos に sacrifice が含まれているとおり、**やらないことを決めない立場は灯台にならない**。全方位に良い顔をする案は、誰の記憶にも残らない。

**② このアプリでは。** `methods.lighthouse_identity` で、1位（またはカテゴリー全体）が言えないことを3つ挙げ、事実に支えられている1つを立場の宣言として `brief.lighthouse` に書く。同時に「やらないこと」を3つ決め、`direction.mustAvoid` に入れる。ここで決めた禁止が、後の生成ステージで判断を速くする。

### 第8条 — アイデアは、実行の前に落とす

**① 仕組み。** 実行の精度でアイデアの弱さは埋まらない。逆は成り立つ（強いアイデアはラフでも伝わる）。Paul Arden が「ラフの方がアイデアが伝わる／仕上げると相手は実行の話を始める」と言うのはこのためだ。弱い案を美しく作り込む時間が、企画でいちばん多い浪費になる。

**② このアプリでは。** 方向ステージに進む前に、案を3本作って `ideaTests` の10項目で採点する。**合計点で選ばない。** weight=3 の3項目（`true` / `single_minded` / `ownable`）が満点でないものは、他が何点でも落とす。落とした2本について「なぜ落としたか」を1行ずつ書き残す。これが次の企画の資産になる。

### 第9条 — 見られる場所の現実から、絵を決める

**① 仕組み。** 同じアイデアでも、3秒で通り過ぎる OOH と、止まって読む紙面では正解の形が違う。OOH の3秒ルールも、フィードの thumb-stop も、「最初の一瞬で意味が立たないものは存在しないのと同じ」という一つの事実の別名だ。要素が競合する版面は、脳の前注意的な処理が働かず、**判断される前に無視される**。

**② このアプリでは。** `insightSources.context_truth` で、誰が・どこで・どんな姿勢で・何秒見るかを先に確定してから `direction` の変数を決める。生成後は `methods.one_frame_test` の手順で、画像を親指の爪ほどに縮小し、3秒だけ見せて「何の話だったか」を人に言ってもらう。言えなければ、要素を1つずつ消す。

### 第10条 — 1枚ではなく、型を作る

**① 仕組み。** Creative Effectiveness Ladder の最上段（Enduring Icon）は、**3年以上、同じ戦略・同じクリエイティブのまま**伸ばし続けたものに与えられる。つまり上段は「作り変えないこと」で到達する。Byron Sharp の distinctive assets も、資産は一貫して長く使うほど強い記憶の手がかりになると言う。Binet & Field の 60:40 の「長い側」も同じ方向を向いている。1点物の名作と、システムになるアイデアは別物だ。

**② このアプリでは。** `kvGrammar.series_system` を読み、**固定要素（構図・光・文字位置・色）と可変要素（被写体・言葉）を紙に書き出す**。書き出せないなら、それはまだ型になっていない。`adChecklist.series_extensibility` で「2枚目が作れるか」を毎回検査し、`methods.long_and_short` で3年固定する識別資産を一覧にして `direction` に固定する。

---

## 3. デコンテの型 — 受賞作を分解して読むための9段

受賞作を「すごい」で終わらせず、**自分の案件に移植できる形に分解する**ための共通フォーマット。9段を上から順に埋める。埋まらない段があること自体が発見になる（たいてい「跳躍」か「結果」が埋まらない）。

| # | 段 | 埋めるもの | 埋まらないときの意味 |
|---|---|---|---|
| 1 | **課題** | 事業として何が妨げられていたか。症状ではなく原因のほうを書く | 症状しか書けない＝その作品は課題設定が弱いか、公開情報が足りない |
| 2 | **人間の真実** | ブランド名を消しても成り立つ、人の行動・感情の事実 | 埋まらない＝商品都合の企画。効くのは短期だけ |
| 3 | **ブランドの真実** | 競合が同じことを言ったら嘘になる、そのブランド固有の事実 | 埋まらない＝誰がやっても同じ。真似されて終わる |
| 4 | **緊張** | 2 と 3 のあいだ、または 2 の内部にある綱引きを一文で | 埋まらない＝面白いが動かない企画 |
| 5 | **コアアイデア** | 緊張に対する答えを、商品説明ではない一文で | 一文にできない＝それは施策の束であってアイデアではない |
| 6 | **跳躍** | アイデアから実行に移るときに起きた飛躍。何を思いついたから普通でなくなったか | **ここが最重要**。埋まらない＝ただの正論の可視化 |
| 7 | **実行** | 具体的な形。媒体・素材・構図・言葉・座組 | — |
| 8 | **接点** | どこで・いつ・誰が・何秒。なぜその場所でなければならなかったか | 埋まらない＝どこでもいい企画。記憶に残らない |
| 9 | **結果** | 何がどれだけ動いたか。Ladder の第何段まで登ったか | 1〜3段止まりか、4段以上かで学ぶべきことが変わる |

### 3.1 受賞作をこの型で読む手順

1. **結果（9段目）から先に読む。** Ladder の何段目かを先に確定させる。話題化止まり（L1）なのか、3年続いた象徴（L6）なのかで、その作品から学べることは全く違う。L1 の作品から長期の作り方は学べない。
2. **次に跳躍（6段目）を探す。** 「このアイデアは分かる。しかし、なぜこの形になったのか？」と問う。この問いの答えが跳躍で、**受賞作とそうでないものを分ける唯一の段**であることが多い。跳躍が見つからない作品は、たいてい 1〜5 段が異常に強い（真実の発見そのものが跳躍）。
3. **上から埋め直して、因果が通るか確認する。** 1→9 を逆に読み上げて、各段が上の段から**必然として**出ているかを見る。どこかで飛んでいたら、そこに公開されていない判断があった、ということ。そこが盗むべき場所。
4. **自分の案件に移植するのは 6 段目だけ。** 実行（7）や接点（8）をそのまま持ってくると模倣になる。**跳躍の「型」**（例：不在を見せた／縮尺をずらした／数字を物量にした）だけを取り出し、`kvGrammar` のどの文法に対応するかを特定して、自分の緊張に当て直す。
5. **Cannes の三分法で採点してみる。** `cannesLens.criteria` の3問（アイデア40／実行30／効果30）に自分で点をつけ、**なぜその点なのかを一文で書く**。これを10本もやると、自分の案を見る目の解像度が変わる。

> このアプリには `studio/src/data/cannes.json`（67件の受賞作データ）があるので、参照ステージで選んだ作品をこの9段で書き起こす練習ができる。

---

## 4. CD の5つの判断

クリエイティブディレクターが実際に下しているのは、次の5つの判断だけである。制作物への「好き・嫌い」は判断ではない。`craft.json` の `cdQuestions` は、この5つを stage 別の具体的な問いに展開したもの。

### 判断1 — 何を言うか（single-minded proposition）

言うことは**1つ**。2つ言いたくなったら、片方を捨てるか RTB に落とす。この判断を先送りすると、以降の全ての工程で「両方入れる」方向へ崩れていく。
**判断の材料**: `brief.promise` / `ideaTests.single_minded` / `methods.creative_brief`
**却下の合図**: 説明に「と、」「かつ」「あわせて」が出てくる。

### 判断2 — 誰に言うか（状況で書かれた対象）

属性（30代女性）ではなく**状況**（帰宅が21時を回る日が週3日ある人）で書けているか。状況で書けていれば、その人が広告に出会う瞬間まで自動的に決まる。
**判断の材料**: `insightSources.context_truth` / `methods.get_to_by` の GET と WHO
**却下の合図**: 対象の説明が属性の羅列で、その人の一日が想像できない。

### 判断3 — なぜ信じられるか（RTB）

主張を支える、第三者が確かめられる事実。ここが空だと、どんなに良いコピーも「気分」に落ちる。**アイデアのはしごを上に登るときは、必ず第1段（商品の事実）を錘として持って上がる。**
**判断の材料**: `insightSources.product_truth` / `insightSources.brand_truth` / `methods.idea_ladder`
**却下の合図**: RTB が全て形容詞（「こだわりの」「上質な」）でできている。

### 判断4 — どう新しいか（カテゴリー常識との差）

新しさは絶対値ではなく、そのカテゴリーの常識との差でしか測れない。**何を破っているかを名指しできること**が条件。
**判断の材料**: `insightSources.category_convention` / `ideaTests.new` / `ideaTests.brave`
**却下の合図**: 「良い」とは言えるが「この業界の何を破ったか」が言えない。

### 判断5 — どう見えるか（一枚の形）

言うことが決まり、対象が決まり、根拠があり、新しくても、**それが一枚の絵として立たなければ存在しない**。3秒・親指サイズ・実際の設置場所という条件で検査する。ここで初めて AD の領域に渡す。
**判断の材料**: `kvGrammar` / `methods.one_frame_test` / `adChecklist`
**却下の合図**: 選んだ構図・色・書体の理由を、アイデアの言葉で説明できない。

> **5つの順番が重要。** 5 から始めると（いきなり絵を探すと）、必ず既視感のある綺麗なものに着地する。1→5 の順に固定する。

---

## 5. AD への引き継ぎ — KV 文法から、構図・文字・色へ

CD の判断5（どう見えるか）が決まった瞬間に、アートディレクションが始まる。引き継ぎは**言葉ではなく、文法の指定**で行う。

### 5.1 引き継ぎの1行

```
コアアイデア 1文 ＋ kvGrammar の id 1つ ＋ 接点（場所・秒数・比率）
```

この3点が揃えば、構図・文字・色は**ほぼ自動的に決まる**。逆に、この3点が揃わないまま「かっこよく」と言うのが、最も事故を起こす引き継ぎである。

### 5.2 文法 → 構図

| 選んだ KV 文法 | 構図の帰結 |
|---|---|
| `single_object_hero` / `absence_negative` | 主役1つ、余白を三辺に非対称に。視線の落下点を1つに固定 |
| `before_after` / `juxtaposition` | 画面を分割。**両側の条件（光・高さ・距離）を完全に揃える**ことが意味の前提 |
| `visual_metaphor` / `scale_shift` | 一読で成立させる。比較対象を入れるか入れないかを先に決める |
| `product_as_landscape` / `data_as_image` | 地平線・俯瞰など、縮尺の手がかりを1つだけ置く |
| `human_moment` | 視線の抜ける方向に余白。カメラを意識させない |
| `demonstration` | 仕組みが見える画角。手や小道具で動作を隠さない |
| `typographic_statement` | 構図＝組版。文字そのものが面と重心を作る |
| `series_system` | **固定枠を最初の1枚で決め、以後動かさない**。動かした瞬間にシリーズではなくなる |

検査は `adChecklist` の `composition` 4項目（`one_frame` / `focal_point` / `negative_space` / `eye_path`）で行う。

### 5.3 文法 → 文字

- 各 `kvGrammar` の **`typographyJa` が、その文法に対する見出しの置き方の指針**になっている。これを先に読んでから組む。
- 共通則は3つ。**階層は3段以内**（中間サイズを作らない）、**改行は意味の切れ目で手で決める**、**日本語は約物を詰め、欧文を和文より 5〜10% 大きく**。
- 最終検査は「想定距離・想定秒数で読めるか」。読めないときは**級数を上げる前に文字を削る**。文字数を削るほうがほぼ常に効く。
- 検査項目: `adChecklist.type_hierarchy` / `legibility_at_distance` / `ja_typesetting`

### 5.4 文法 → 色

- 色は**アイデアの中心語から引く**。冷たい／古い／急ぐ／許す、といった語から色相・彩度・明度を決める。「きれいだから」しか理由が言えない色は、無彩色に戻して1色だけ足す。
- 意味を持つ色は**3役まで**（主1・従1・差し色1）。役が決まらない色は落とす。彩度の高い色は1つだけ。
- 分離は色相差ではなく**明度差**で作る。グレースケールに変換して、文字が背景から分離して見えるかを必ず確認する。
- ここで決めた色は、第10条のとおり**3年固定する識別資産の候補**でもある。1回のKVのために選ばない。
- 検査項目: `adChecklist.color_meaning` / `palette_discipline` / `contrast_accessibility`

### 5.5 引き渡し後の批評

生成物が出てきたら、感想ではなく `adChecklist` の17項目で機械的に検査する。各項目には **`fixJa`（ダメなときの直し方）** が入っているので、「良くない」で止まらず必ず次の一手に変換する。順番は `composition` → `typography` → `color` → `craft` → `brand` → `media`。**構図が壊れているまま色を直しても意味がない。**

---

## 6. `craft.json` の各セクションと、アプリのステージの対応

アプリのステージは `studio/src/store.jsx` の `STAGES`（`project` 案件 / `consult` 課題 / `refs` 参照 / `direction` 方向 / `prompt` プロンプト / `generate` 生成 / `handoff` Figma）。本ライブラリでいう「企画 stage」は **`consult`（課題）** に相当する。

| セクション | 件数 | 使うステージ | 使い方 |
|---|---|---|---|
| `insightSources` | 6 | **企画（`consult`）** | 6つの源それぞれの `questionsJa` をワークショップの質問として出す。`promptEn` を AI に渡してインサイト案を生成させ、`brief.insight` の候補にする |
| `tensionPairs` | 8 | **企画（`consult`）** | `templateJa` を穴埋めフォームとして提示。8型すべてに流し込ませ、1つ選ばせる。選んだ文が `brief.problem` と `brief.insight` を橋渡しする |
| `ideaTests` | 10 | **企画（`consult`）** | コアアイデア候補3本に対する採点 UI。`weight` で重み付けするが、**weight=3 の3項目は足切り**として扱う（合計点ではなく足切りで選ばせる） |
| `cannesLens` | 3基準 + 6段 | **企画（`consult`）／参照（`refs`）** | `criteria` は自案の自己採点に。`ladder` は目標設定（「今回は何段目を狙うか」）と、`refs` で選んだ受賞作の段位判定に使う |
| `methods` | 10 | **企画（`consult`）** | `frameworks.json` と同じくワークショップとして実行。`stepsJa` をステップ UI に、`outputsJa` を `brief.*` への書き戻し対象にする |
| `cdQuestions` | 16 | **企画（`consult`）／全ステージの点検** | `stage` フィールドで出し分ける。`brief` `insight` `idea` は `consult`、`craft` は `direction`／`generate`、`presentation` は `handoff` で出す |
| `kvGrammar` | 12 | **方向（`direction`）／プロンプト（`prompt`）** | `direction` で文法を1つ選ばせ、`promptSeedEn` を `prompt` の構図ブロックに注入。`typographyJa` は `direction.typography` の指針として表示。`whenJa` は選択の補助 |
| `taglineDirections` | 10 | **方向（`direction`）／プロンプト（`prompt`）** | `templateJa` からタグライン案を量産させる。`direction.typography.copy` に入る文言の生成源。`exampleJa` は全て架空なのでそのまま UI に出せる |
| `adChecklist` | 17 | **生成の批評（`generate`）** | 生成物に対するチェックリスト UI。`category` 順（composition → typography → color → craft → brand → media）に並べ、未達項目には `fixJa` を次アクションとして提示 |
| `sources` | 31 | 全ステージ | 出典表示。特に `cannesLens` を使う画面では、40/30/30 が本アプリ独自の蒸留値であることを併記すること |

### 6.1 実装時の注意

- **`cannesLens.criteria` の 40/30/30 を「カンヌの公式比率」として UI に表示してはいけない。** 公式に比率を出している部門は Design（40/40/20）等であり、KV に近い Print & Publishing は比率を公開していない。「本アプリの評価軸」と明記する。
- `ideaTests` の `weight` は**合計点を出すためのものではない**。合計点で選ぶと、無難な案が勝ってしまう（`brave` が低くても他で稼げるため）。weight=3 の3項目を足切りにする実装にすること。
- `kvGrammar.promptSeedEn` には**ブランド名・作家名・作品名を一切含めていない**。技法と原理の記述だけなので、そのまま画像生成プロンプトに連結してよい（`cannes.json` の `promptSeeds` と同じ方針）。
- `taglineDirections.exampleJa` は全て「（架空の例）」付きの創作。実在コピーではないので、UI にそのまま出しても問題ない。ただし**ユーザーがそれをそのまま採用しないよう**、型の説明であることを示す。

---

## 7. まとめ — 非専門家が辿る一本道

```
企画（consult）
  1. 課題を疑う          → methods.predatory_thinking
  2. 6つの源から掘る      → insightSources ×6
  3. 緊張を一文に         → tensionPairs ×8 に全部流す
  4. 三つの真実を交差     → methods.three_truths
  5. 案を3本、足切りで選ぶ → ideaTests（weight=3 の3項目）
  6. 骨格に整える         → methods.kikakusho_skeleton / creative_brief / get_to_by
  7. 何段目を狙うか宣言   → cannesLens.ladder

方向・プロンプト（direction / prompt）
  8. KV 文法を1つ選ぶ     → kvGrammar（→ 構図・文字・色が決まる）
  9. タグラインの型を選ぶ → taglineDirections

生成の批評（generate）
 10. 3秒／親指で検査      → methods.one_frame_test
 11. 17項目で直す         → adChecklist（fixJa まで実行）
 12. 2枚目が作れるか       → kvGrammar.series_system / methods.long_and_short
```

各段で迷ったら `cdQuestions` の該当 stage の問いを読む。**答えられない問いがある段は、次に進んではいけない。**
