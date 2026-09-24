# カンヌ受賞作データセット と 思考フレーム ライブラリ — リサーチ記録

> 生成物: `studio/src/data/cannes.json`（67件）/ `studio/src/data/frameworks.json`（20フレーム）
> 調査日: 2026-09-18 ／ 調査担当: リサーチ担当のエージェント
> 対象年: 1995 / 1999 / 2005 / 2008–2026（2020年はフェスティバル中止のため存在しない）

---

## 1. 検証の方法と使用した情報源

### 1.1 方針

- **1件ずつ「年・部門・受賞等級・ブランド・エージェンシー・国」の6項目を独立に確認した。** 記憶だけで書いた項目は1つも残していない。
- 確認できなかった項目がある案件は、推測で埋めずに**データセットから削除**した（削除したものは §1.4）。
- ネットワーク環境の制約により `WebFetch`（ページ全文取得）は組織のエグレスポリシーで遮断されていたため、**`WebSearch` による複数ソースの突き合わせ**を主たる検証手段とした。1つの要約しか根拠がないものは採用していない。
- 同一案件について**2つ以上の独立系媒体で年・部門が一致すること**を採用条件にした。1媒体しか出てこない場合は、その媒体が一次に近いか（Cannes Lions 公式、受賞エージェンシー／ブランドの自社発表、大手業界紙）で判断した。

### 1.2 主に参照した情報源

| 種別 | 具体例 |
|---|---|
| 主催者・一次 | canneslions.com のデイリー受賞発表、lovethework.com のエントリーページ |
| 受賞者の自社発表 | honda（Sound of Honda）、dentsu（Cannes Lions 受賞リリース）、ogilvy、akqa、fcb、vml、grey |
| 業界紙（英） | Ad Age, Adweek, Campaign UK/US/Asia/Middle East, Creative Review, Contagious, LBBOnline, shots, The Drum, Creative Salon, Mumbrella, AdNews, Campaign Brief |
| 業界紙（その他） | adobo Magazine（アジア）、Lürzer's Archive、marketingdirecto（スペイン語）、reasonwhy.es |
| 年次まとめ | Contagious「Cannes Lions: Titanium at 20」、Adweek「Cannes Archive: Film and Press Grand Prix Winners Since 2000」、AdForum の年別ショーケース |

### 1.3 スキーマ上の注意（データを読む側への申し送り）

- **部門名は現行の呼称に正規化している。** 2010年代前半までの `Press Lions` は現行の `Print & Publishing Lions` に、`Promo & Activation` 系は該当なしとして除外した。つまり `lion` は「現在のどの部門に相当するか」であり、受賞当時の正式名称とは異なる場合がある。
- **Titanium Grand Prix は `award: "Grand Prix"` + `lion: "Titanium Lions"` で表現している。** `award: "Titanium"` は使っていない。
- 複数部門で Grand Prix を獲った作品（Fearless Girl、Palau Pledge、Dumb Ways to Die、Courage is Beautiful、Caption With Intention など）は**1レコードにまとめ**、代表的な1部門を `lion` に入れ、他部門の受賞は `whyJa` に記述した。
- `promptSeeds` は**技法・原理の記述のみ**で、ブランド名・キャンペーン名・作家名を一切含まない（§4）。
- 1990年代について: **Outdoor 部門に Grand Prix が設けられたのは 2002年から**であることを確認したため、1990年代は Film Lions の Gold 2件（Levi's "Drugstore" 1995、Guinness "Surfer" 1999）のみを収録している。1995年は審査委員長 Frank Lowe の判断により Film の Grand Prix が授与されなかった年であることも併せて確認した。

### 1.4 確認できず削除した候補（採用しなかったもの）

| 候補 | 削除理由 |
|---|---|
| IKEA "Pee Ad"（2018） | One Show / D&AD / Guldägget 等の受賞は確認できたが、**Cannes Lions での受賞が確認できなかった**ため削除。 |
| Coinbase "Your Way Out"（2026） | Film Craft Grand Prix とする記述と Digital Craft Grand Prix とする記述が食い違い、部門を確定できなかったため削除。 |
| Viatris "Make Love Last – Bedroom"（2024） | Outdoor とする記述と Pharma とする記述が混在し、部門を確定できず削除。 |
| Paris 2024 開会式（Outdoor GP） | 2024年とする記述と2025年とする記述が混在し、年を確定できず削除。 |
| Energizer "Don't Let Their Toys Die"（2008 Press GP） | 単一ソースのみ。裏が取れず削除。 |
| Cannes 2010 Outdoor GP（Andes / Saatchi & Saatchi Argentina） | エージェンシーは確認できたがキャンペーン名を確定できず削除。 |
| Cannes 2015 Product Design GP（Lucky Iron Fish）、2017 Product Design GP | `lion` の許容値に Product Design が無く、Design Lions と同一視できないため削除。 |
| Cannes 2005–2007 の Press / Outdoor Grand Prix | 検索で一次情報に到達できず、年ごとの受賞作を確定できなかったため収録を見送った（2005年は Film GP の Honda "Grrr" のみ収録）。 |
| 2017 Design Lions GP | 検索結果が 2023年の ADLaM と取り違えた回答を返したため、誤情報と判断して不採用。ADLaM は **2023年 Design GP** として収録した。 |

### 1.5 データセットの内訳（67件）

- 部門: Print & Publishing 18 / Outdoor 17 / Design 13 / Titanium 7 / Industry Craft 6 / Film 3 / Film Craft 1 / PR 1 / Direct 1
- 等級: Grand Prix 63 / Gold 4
- 日本（`country: "Japan"`）: 3件 — Sound of Honda / Ayrton Senna 1989（2014 Titanium GP・電通）、My Japan Railway（2023 Industry Craft GP・電通）、Dear Difference（2026 Design Gold および Industry Craft Gold・電通）
- 年の重心: 2005–2026 に 65件（全体の約97％）。1990年代は2件（1995・1999）

---

## 2. カンヌ受賞作から抽出できるビジュアル原理 10箇条

**1. 一図一義 — 1枚に意味は1つだけ置く。**
足すのではなく、耐えられるまで削る。削った結果として残った1点が主張になる。
例: Heinz「Look Familiar?」（2026 Print GP）/ Coca-Cola「Recycle Me」（2024 Print GP）

**2. 既存の様式を壊さずに中身だけ入れ替える。**
新聞・法典・公文書・商品写真の「形式」を保つほど、中身の異常さが際立つ。様式は信頼の担保として機能する。
例: AnNahar「Newspapers Inside The Newspaper Edition」（2023 Print GP）/ Burger King「The Moldy Whopper」（2021 Outdoor GP）

**3. ブランド資産は作り替えず、読み替える。**
ロゴ・色・形はそのままに、周囲の文脈だけを変えて別の意味を生む。認知が壊れる手前で止めるのが技術。
例: Coca-Cola「Coke Hands」（2012 Outdoor GP）/ McDonald's「Follow the Arches」（2018 Outdoor GP）

**4. 媒体そのものを版面にする。**
掲出面を買うのではなく、すでにそこにある物（芝、歩道、パッケージ、店舗什器）を面として使う。スケールと文脈が表現になる。
例: Mercado Livre「Field Barcode」（2026 Outdoor GP）/ PENNY「Price Packs」（2025 Print GP）

**5. 不在で語る — 欠落は最も強い図である。**
情報を載せないこと、見せないことが、読者の補完を呼び込み最大の像を結ぶ。
例: An-Nahar「The Blank Edition」（2019 Print GP）/ Budweiser「Tagwords」（2018 Print GP）

**6. 色は面積で決める。1色を主役にし、他は地に落とす。**
彩度ではなく占有率が視線を決める。強調色は画面の1割以下、置く場所は1か所に限る。
例: Magnum「Find Your Summer」（2024 Outdoor GP）/ KitKat「Phone Break」（2025 Outdoor GP）

**7. 素材そのものを論拠にする。**
何で作られているかが証拠になるとき、説明コピーは不要になる。素材選択が論証である。
例: The Zimbabwean「Fight the Regime」（2009 Outdoor GP）/ Sheba「Hope Reef」（2022 Industry Craft GP）

**8. 並置で語る — 比較は説明に勝る。**
2つを並べ、差だけを見せる。読者が差を見つけた瞬間に理解が完了するので、結論を書かなくてよい。
例: Dove「Real Beauty Sketches」（2013 Titanium GP）/ Burger King「McWhopper」（2016 Print GP）

**9. フォーマットを固定し、中身を無限に変える。**
大量展開でブランドが崩れないのは、絵が似ているからではなく規律（余白幅・文字位置・比率）が同じだから。
例: British Airways「A British Original」（2023 Outdoor GP）/ Apple「Shot on iPhone」（2021 Design GP）

**10. 手の痕跡を残す — 完璧さより「人が作った証拠」。**
CG と生成画像が前提の時代に、素材の揺らぎ・塗りムラ・折り目が信頼と情緒を運ぶ。
例: Apple「Apple TV Rebrand」（2026 Design GP）/ De'Longhi「Tiny Coffee Shops」（2026 Industry Craft GP）

> 補助線: いずれの原理も「何を足すか」ではなく **「何を許さないか」** を決めている。
> プロンプトに落とすときは、肯定形の指示より先に「画面に入れないもの」を1つ決めると、生成のブレが最も減る。

---

## 3. 各フレームの採用理由と接続先

`feeds` は、そのフレームの回答が流れ込む先のキー。`aiInstruction` は LLM が回答を合成するときの規則。

### consult（課題を言語にする）

**課題ツリー / Issue Tree** → `brief.problem`, `brief.insight`
依頼文は多くの場合「作るもの」の形で来るが、フローの最初に必要なのは「解く問い」である。
MECE で枝分かれさせることで、**何を今回は扱わないか**を明示的に捨てられる。
捨てた枝を記録することが後工程の言い訳を防ぐ。
選んだ枝がそのまま `brief.problem` の主語になる。

**仮説思考 / Hypothesis-Driven** → `brief.hypothesis`, `brief.insight`, `critique.criteria`
情報が揃うまで待つとキービジュアルは永遠に始まらない。先に断言して、反証条件を決める。
反証条件をそのまま批評基準に流すのがこのフレームの肝で、
「この絵は仮説が外れていても成立してしまわないか」を後で検査できる。
外れていても成立する絵は、何も言っていない絵である。

**So what / Why so** → `brief.insight`, `brief.problem`
観察は集まったのに一文にならない、という詰まりを縦の論理で抜く。
上へ2回「だから何？」をかけると主張になり、下へ「なぜそう言える？」で根拠に着地する。
ここで出る一文が、後段のビジュアル・メタファーの入力になる。
根拠が2つ未満なら断定を弱める、という規則を `aiInstruction` に入れている。

**1行ブリーフ（Get–To–By）** → `brief.audience`, `brief.problem`, `critique.criteria`
制作に渡す直前の締め。1文が書けないうちは絵を作らない、という関門として置いている。
Get を属性ではなく「いまどう思っている人か」で書かせるので `brief.audience` の質が上がる。
By は表現ではなく仕掛けを書かせ、成功条件を数値で残す。
その数値が `critique.criteria` の1行になる。

**リバースブリーフ / Reverse Brief** → `brief.problem`, `brief.audience`
依頼を自分の言葉で書き直して返す工程。ズレが出た箇所が本当の論点になる。
暗黙の前提（「キービジュアルで決まる」等）を表に出すのが目的で、
AI に前提を解決させず、**問いのまま人間に返す**よう `aiInstruction` で縛っている。
このフレームだけは答えを出さないことが正しい出力。

### design-thinking（広げる／絞るを制御する）

**ダブルダイヤモンド / Double Diamond** → `brief.problem`, `direction.mood`
いま広げる時間なのか決める時間なのかを、チームと AI の双方に宣言させる。
発散フェーズでは複数案を保持し、収束フェーズで初めて1つに落とす。
AI が勝手に収束しないための制御弁として、フロー全体に1回挟む。
次フェーズへの移行条件を書かせることで、無限の発散も防ぐ。

**共感→定義→発想 / Empathize–Define–Ideate** → `brief.audience`, `brief.insight`, `direction.mood`
議論が自社都合に寄ったときに、主語を「特定の一人」に戻す装置。
POV 文（〈人〉は〈ニーズ〉を必要としている。なぜなら〈驚き〉だから）が
`brief.insight` の型として最も扱いやすいので、この形で書かせている。
`direction.mood` はその人について使われた情緒語からのみ導く。

**How Might We** → `brief.problem`, `direction.composition`
問題文を「どうすれば〜できるか」に変え、広い／中／狭いの3段階で幅を調整する。
幅が広すぎると案が散り、狭すぎると解が1つしか出ない。
意図的な制約（追加コストゼロ、媒体1つ等）を問いに織り込ませるのがこのフローでの使い方。
制約はそのまま構図の条件に落ちる。

**クレイジー8 / Crazy 8s** → `direction.composition`, `direction.mood`
最初に浮かんだ案を捨てさせるための時間制限。目的は良い案ではなく量。
重要なのは採用案そのものではなく、**その案が効いている「原理」を言語化させる**ところ。
原理だけが `direction.composition` に流れるので、後から別題材にも再利用できる。
やりすぎの2案を残すのは、後で戻るため。

**SCAMPER** → `direction.composition`, `direction.palette`, `direction.mood`
1案から変化形を機械的に量産する。7つの操作から1つを選ばせ、操作名を記録する。
「影だけにする」「画面外に出す」といった結果を、
ブランド固有ではなく**再利用可能な技法の文**として書かせるのが接続の条件。
バリエーション生成ステージ（複数案の同時生成）で最も使う。

### art-thinking（正解のない側へ出る）

**灯台の問い / Lighthouse Question** → `brief.hypothesis`, `direction.mood`, `direction.palette`
既知のAから既知のBへ行く課題解決では、カテゴリの定型に収束する。
Whitaker の言う「B地点を発明する」側に一度出るために、二択で答えられない問いを置く。
このフレームだけは、**カテゴリ慣習の逆を提案せよ**と `aiInstruction` で明示している。
捨ててよい小さな実験を1つ書かせ、失敗のコストを先に下げる。

**初心・異化 / Beginner's Mind, Ostranenie** → `direction.composition`, `direction.mood`
題材が日常的すぎて既視感が出るときの解毒剤。名前を使わずに物を描写させる。
シクロフスキーの異化が言う通り、見慣れを剥がすこと自体が芸術の機能である。
出力は「普段見ない角度・距離・状態」なので、そのままカメラ指示になる。
定番のヒーローアングルへ戻さない、という禁止をルールに含めている。

### art-direction（言葉を画面の指示に変える）

**ビッグアイデア → ビジュアル・メタファー → クラフト** → `direction.mood`, `direction.composition`, `direction.palette`, `critique.criteria`
ブリーフから画面へ渡る唯一の橋。順番を守らないと「きれいだが何も言っていない絵」になる。
アイデアを言葉で1行 → 見える物1つ → 技法3つ、の三層を厳密に保持する。
「ブランドとコピーを消しても比喩が読めるか」を批評基準に必ず1行足す。
コピーがないと成立しない比喩は、比喩を作り直す。

**カンヌの審査レンズ / Idea・Execution・Impact** → `critique.criteria`
身内の好みではなく外部基準で見るための物差し。
Design Lions ではアイデア40％・実行40％・結果20％のように**部門ごとに配分が公開されている**ため、
配分は固定値ではなく部門依存であることを明記した上で使う。
最も低い軸を1つだけ選び、次の修正を1点に絞るのが再生成ループの効率を決める。

**トーン・オブ・ボイス スライダー** → `brief.tone`, `direction.mood`, `direction.typography`
「かっこいい」の定義がバラバラな問題を、形容詞ではなく軸上の数値で解く。
格式・体温・ユーモア・情報密度の4軸を数値で残すので、後から再導出できる。
格式と密度は書体（ウェイト・字間・大小文字・文字量）へ、
体温とユーモアは光と演出へ、という配線を `aiInstruction` で固定している。

**60-30-10 ＋ ゲシュタルト** → `direction.palette`, `direction.composition`
色の失敗はほぼ「面積配分の失敗」なので、色相の議論の前に占有率を決める。
強調色は1割以下・1か所だけ、という制約が視線の順番を一意にする。
図地・近接・類同などの原理を1つ選ばせ、3点の視線経路として構図に流す。
強調色が2か所以上に出たら1か所に減らす、という自動修正を規則に入れている。

**構図の文法 / Composition Grammar** → `direction.composition`, `direction.typography`
「いい感じの構図で」を、再現可能な数値指示に変換するためのフレーム。
下敷き（三分割・黄金比・対角線など）／主題の位置と占有率／余白の用途／階層1-3位、を書かせる。
余白は名前付きの「見出しゾーン」として `direction.typography` に引き渡すので、
文字は生成画像に焼き込まず Figma で載せるという方針と接続する。
「絶対に入れないもの」を必ず1つ決め、ネガティブ指示として持ち越す。

**ブランド・アーキタイプ（12類型）** → `brief.tone`, `direction.mood`, `direction.typography`
ブランドの人格が曖昧だと、ビジュアルの可否判断が人によってぶれる。
Mark & Pearson の12原型から1つ選び、**実際の行動**を根拠として挙げさせる。
影（行きすぎたときの嫌われ方）をガードレールとして必ず残し、
「絶対にやらない表現」を1つ決めて強い否定制約として持ち越す。

**ムードボード → トーンワード → ビジュアルシステム** → `direction.mood`, `direction.palette`, `direction.typography`, `direction.composition`
参照を集めて終わりにせず、各参照に役割（構図／色／光／質感／書体／空気）と原理を付ける。
原理は「なぜ効いているか」の一文であり、**模倣の指示ではない**。
参照ごとに画素を生成に渡すか（自前画像のみ可）を明示させ、権利の線をデータ構造に持たせる。
原理のみの参照については「画像は渡していない」と出力に明記させる。

### critique（判断を収束させる）

**シックス・シンキング・ハット** → `critique.criteria`, `direction.composition`
「なんとなく良くない」で止まる批評を、事実・直感・リスク・価値・代案・進行に分解する。
赤（直感）と黒（リスク）を混ぜないことが最大の効用で、
好き嫌いを論点に昇格させない／リスクを感想として流さない、の両方を防ぐ。
青で次の一手を1つだけ決め、**他の変数を固定する**ことで再生成の比較可能性を保つ。

---

## 4. 法務・倫理上の取り扱い

このデータセットと、これを使うワークショップ機能には以下の制約がある。実装時に必ず守ること。

### 4.1 保存するもの / しないもの

- `cannes.json` に含まれるのは**メタデータ（年・部門・等級・ブランド・エージェンシー・国・タイトル）と、言語化された原理・解説・検索クエリ・参照URL**のみである。
- **受賞作の画像・動画・音声は一切保存・再ホストしない。** リポジトリにも CDN にも置かない。
- 画像は `imageSearchQuery` を使って**実行時に外部検索へ遷移させるだけ**とし、取得した画像をサーバやストレージに保存しない。サムネイルのキャッシュも行わない。
- 参照URLは**出典表示のためのリンク**であり、内容の転載ではない。

### 4.2 プロンプトに関する禁止事項

- `promptSeeds` は**技法・原理の記述のみ**とし、ブランド名・キャンペーン名・エージェンシー名・写真家名・監督名・存命作家の名前を含めない。既存の全レコードでこれを満たしていることを機械チェックで確認済み（ASCII・小文字タグ・固有名詞除外）。
- 生成プロンプトに **「〈特定のキャンペーン〉のように」「〈ブランド〉のロゴを入れて」「〈商標〉風に」** といった指示を組み立てさせない。UI 側でもこれらの文字列を組み込まないこと。
- ロゴ・商標・実在の商品パッケージ・実在人物の肖像を再現させる指示を生成しない。文字やロゴは生成画像に焼き込まず、後段（Figma）で正規のアセットとして載せる方針を既定とする。
- 参照画像の画素を生成モデルに渡してよいのは**利用者が権利を持つ自前画像のみ**。Pinterest・画像検索・ストック検索から得た画像は**原理テキストに変換してからのみ**プロンプトに反映する（`moodboard-to-visual-system` フレームの `rights` ステップがこの判断を強制する）。

### 4.3 出典表示とリスペクト

- 受賞作を UI に表示する際は、**必ず年・部門・ブランド・エージェンシーを併記**し、`refUrl` へのリンクを添える。作者名の記載がある場合はそれも尊重する。
- 本データセットは「学習と発想の起点」であり、模倣の指示書ではない。UI の文言でもその位置づけを明示すること。
- 誤りを見つけた場合は推測で直さず、§1.1 と同じ手順（複数ソース突き合わせ）で確認してから修正し、確認できなければ該当レコードを削除する。
