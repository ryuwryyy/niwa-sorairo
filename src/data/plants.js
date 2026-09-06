// 手入れ暦の対象樹種。prune は剪定適期の月
export const PLANTS = [
  { id: "aodamo", name: "アオダモ", sci: "Fraxinus lanuginosa", type: "落葉高木", prune: [12,1,2], how: "落葉期に込み枝・逆さ枝を付け根から抜く。自然樹形が命なので切り戻しは避け、幹の流れを読む「透かし」に徹する。", water: "根付けば降雨任せ。夏の極端な乾燥時のみ朝夕。", summer: "西日で葉焼けしやすい。株元マルチングで根を守る。" },
  { id: "momiji", name: "イロハモミジ", sci: "Acer palmatum", type: "落葉高木", prune: [11,12,1], how: "落葉直後〜1月に。太枝は樹液が動く前に処理。徒長枝と内向き枝を抜き、枝先は「手で折れる細さ」を目安に。", water: "乾燥に弱い。夏は株元の乾きを見て朝に。", summer: "剪定厳禁の時期。葉焼け防止に夕方の葉水が効く。" },
  { id: "soyogo", name: "ソヨゴ", sci: "Ilex pedunculosa", type: "常緑高木", prune: [3,6,7], how: "成長が遅いので最小限。混み合った小枝を間引く程度。刈り込まず、枝ごと抜いて風を通す。", water: "植え付け2年目以降はほぼ不要。", summer: "6〜7月の軽い透かしは適期。実付き枝は残す。" },
  { id: "yamaboushi", name: "常緑ヤマボウシ", sci: "Cornus hongkongensis", type: "常緑高木", prune: [2,3], how: "花芽は前年枝の先端。強剪定すると翌年咲かない。花後すぐか2〜3月に不要枝のみ。", water: "乾燥気味を好む。過湿注意。", summer: "花後の徒長枝だけ軽く整理してよい。" },
  { id: "himeshara", name: "ヒメシャラ", sci: "Stewartia monadelpha", type: "落葉高木", prune: [11,12,1,2], how: "剪定を嫌う樹。枯れ枝と明らかな交差枝のみ。切り口は小さく、癒合剤を。", water: "浅根で乾燥に極端に弱い。夏は毎朝確認。", summer: "株元に下草か厚めのマルチを。幹の西日焼けにも注意。" },
  { id: "olive", name: "オリーブ", sci: "Olea europaea", type: "常緑中木", prune: [2,3], how: "2〜3月に強剪定可。内向き枝を抜き、光が幹まで届く「盃状」に。夏は徒長枝を随時。", water: "乾燥に強い。水はけ最優先。", summer: "徒長枝のつまみ取りだけ。実を太らせる時期。" },
  { id: "lemon", name: "レモン", sci: "Citrus limon", type: "常緑中木", prune: [3,4], how: "3〜4月、芽吹き前に混み枝を整理。トゲ枝と内向き枝を優先して抜く。強剪定は隔年で。", water: "鉢なら表土が乾いたらたっぷり。夏は毎日。", summer: "アゲハの幼虫チェックを週2回。摘果は7月に。" },
  { id: "blueberry", name: "ブルーベリー", sci: "Vaccinium spp.", type: "落葉低木", prune: [12,1,2], how: "落葉期に4〜5年経った古枝を株元から更新。細く弱い枝を抜き、太く若い主軸を残す。", water: "浅根で乾燥に弱い。ピートモス系の用土を切らさない。", summer: "収穫期。防鳥ネットと朝の水やりを欠かさない。" },
  { id: "feijoa", name: "フェイジョア", sci: "Feijoa sellowiana", type: "常緑中木", prune: [3,4], how: "3〜4月に。放任でまとまるが、内部の細枝を抜くと花付きと風通しが上がる。", water: "根付けばほぼ不要。", summer: "6〜7月の花は食用可。実のため受粉樹を意識。" },
  { id: "mahonia", name: "マホニア・コンフューサ", sci: "Mahonia confusa", type: "常緑低木", prune: [4,5], how: "花後の4〜5月に古い茎を株元で更新。切った位置から吹くので高さ調整がしやすい。", water: "半日陰で乾燥にも耐える。手間いらず。", summer: "特に作業なし。葉色が悪ければ薄い液肥を。" },
  { id: "moss", name: "苔(スギゴケ・ハイゴケ)", sci: "Polytrichum / Hypnum", type: "地被", prune: [], how: "剪定は不要。伸びすぎたスギゴケは秋に軽く刈ると新芽が揃う。", water: "朝夕の霧状灌水。日中の水やりは蒸れの原因。", summer: "最大の山場。遮光ネットと朝の灌水で乗り切る。落葉・雑草はピンセットで。" },
  { id: "shida", name: "シダ類(ベニシダ等)", sci: "Dryopteris erythrosora", type: "下草", prune: [3], how: "早春に古葉を株元で切り、新芽(ゼンマイ状)を出迎える。", water: "乾いたら株元に。葉水も好む。", summer: "半日陰なら放任可。葉先が茶色くなれば乾燥のサイン。" },
];
