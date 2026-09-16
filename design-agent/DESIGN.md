# DESIGN.md — 差配 / Sahai

> 形式は [VoltAgent/awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design) の9節構成。
> v0 / Cursor / Codex / Claude Code がそのまま食べられる形にしてある。
> 機械可読なトークンは `artifacts/design.tokens.json`（W3C DTCG 2025.10）。

## 1. Visual Theme & Atmosphere

紙の上の事務所。温かみのある生成り色の地に、熾火(おきび)の橙を一点だけ差す。
密度は中〜高。**決裁画面だけ意図的に密度を上げ、他の画面は静かにする。**

これは「速さ」を売る製品ではなく「決めること」を預かる製品なので、
勢いのある配色や動きを使わない。祝祭感を出さない。紙吹雪を出さない。

## 2. Color Palette & Roles

```css
--color-canvas: #F4F1EA;          /* アプリ背景。温かみのある紙色 */
--color-surface: #FBFAF7;         /* カード・パネル面 */
--color-surface-sunken: #EAE5DA;  /* 入力欄・沈み面 */
--color-ink-primary: #1C1A17;     /* 主要テキスト */
--color-ink-secondary: #5B554B;   /* 副次テキスト */
--color-ink-tertiary: #8A8377;    /* 補助・メタ情報 */
--color-hairline: #DED7C9;        /* 境界線 1px */
--color-ember: #C8551F;           /* 熾色。決裁・主要アクション */
--color-ember-soft: #F3E3D9;
--color-await: #A8761A;           /* 決裁待ち */
--color-await-soft: #F6EDDA;
--color-ok: #4E7A5A;              /* 承認済み・成功 */
--color-ok-soft: #E4EDE6;
--color-stop: #A33A2C;            /* 却下・不可逆・危険 */
--color-stop-soft: #F6E2DE;
```

**色は意味に固定する。** ember=人間が押す操作 / await=決裁待ち / ok=承認済み / stop=不可逆。
装飾で色を選ばない。await を「なんとなく目立たせたい」に使わない。

## 3. Typography Rules

| 役割 | 書体 | サイズ / 行送り |
|---|---|---|
| display | Shippori Mincho Medium | 32 / 44 |
| brand | Shippori Mincho Medium | 18 / 24 (字送り +1.5) |
| title | Zen Kaku Gothic New Bold | 20 / 30 |
| subtitle | Zen Kaku Gothic New Medium | 16 / 26 |
| body | Zen Kaku Gothic New Regular | 14 / 24 |
| caption | Zen Kaku Gothic New Regular | 12 / 18 |
| micro | Zen Kaku Gothic New Medium | 11 / 16 |

明朝は画面名とブランドだけ。本文に使わない。
数字の比較が主目的の箇所（実績・台帳）は Inter を許可する。

## 4. Component Stylings

- **Button** — `Kind`(Primary/Secondary/Ghost) × `Size`(Md/Sm)。
  Primary は画面に1つだけ。結果が残る操作にのみ使う。
  **却下のような対の操作は Secondary にする。** Ghost だと主ボタンの隣で押せると分からない。
- **Tag** — `Tone`(Neutral/Ember/Await/Ok/Stop)。状態か分類。装飾に使わない。
- **NavItem** — `State`(Default/Active) + Label / ShowBadge / Badge。
  現在地は Active で示す。**バッジを主役にしない。**
- **StatCell** — `Tone` + Label / Value。数値ひとつの最小単位。
- **Sidebar** — clone せずインスタンスで使い、現在地は入れ子 NavItem の State を上書きする。

## 5. Layout Principles

余白は2px基調: `2 4 6 8 10 12 14 16 20 24 28 32 40 48 64`。
**スケール外の値を書かない。** 必要になったらスケール側を見直す。

- サイドバー 232 / コンテンツ内側余白 32 / 実効コンテンツ幅 1144
- カード内側 16(縦) × 20(横)、カード間 10
- 画面は 1440×900 に収める。収まらないなら要素ではなく密度を疑う

## 6. Depth & Elevation

**影を使わない。** 面の区別は `surface` と `hairline` の1px罫だけで行う。
角丸は `xs2 / sm4 / md6 / lg8 / xl10 / 2xl16 / pill999`。
カードは xl、ボタンとタグは md 以下、バッジは pill。

## 7. Do's and Don'ts

**Do**
- 決裁の前に必ず止まる。適用ボタンは常に人間側に置く
- 通知は束ねる。件数ではなく「束」を主語にする
- 却下も承認と同じ重さで記録する
- 所要見積もりと影響範囲を一覧の時点で出す

**Don't**
- 読まずに押せる画面を作らない（差分の可読性を削らない）
- 決裁のこわさを演出で覆わない。紙吹雪・称賛・効果音を使わない
- 空状態を祝福しない。静かに事実だけ書く
- 生の16進数・生の余白値を書かない。トークンに束縛する

## 8. Responsive Behavior

デスクトップ専用（1440幅基準、最小1280）。
1280未満ではサイドバーをアイコンのみ（64px）に畳む。
決裁ビューの Before/After は 1280未満で縦積みにする。**横に潰さない** — 差分が読めなくなる。

## 9. Agent Prompt Guide

```
差配のデザインシステムで {画面名} を作って。

- artifacts/design.tokens.json のトークンだけを使う。生値を書かない
- 色は意味に固定: ember=人間の操作 / await=決裁待ち / ok=承認済み / stop=不可逆
- 影は使わない。面の区別は surface と hairline の1px罫だけ
- Primary ボタンは画面に1つ。対になる操作は Secondary
- 余白は 2px基調スケールから選ぶ
- 1440×900 に収める
- 決裁に関わる画面は情報密度を上げる。それ以外は静かに
```
