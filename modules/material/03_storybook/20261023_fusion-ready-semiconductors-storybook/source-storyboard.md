# *Pip and the Tiny Power Helpers*

十頁英文互動繪本分鏡與分層素材規格

## 0. 專案定位

- **讀者年齡：** 5 歲
- **書中文字：** English
- **頁數：** 10 頁
- **畫面比例：** 3:2 landscape
- **視覺風格：** 完整的手繪紙張拼貼繪本；圓潤、溫暖、可見紙纖維與手工剪貼邊緣。
- **核心概念：** 未來的 fusion reactor 不只需要產生 plasma 的核心，也可能需要 special computer chips、power electronics、sensors、radio-frequency equipment、cooling systems 與 maintenance robots 等許多「小幫手」。
- **事實界線：** 新聞描述的是一份 letter of intent 與 proposed research award。它不表示全部款項已收到或花完，也不表示 commercial fusion electricity 已經成功。
- **新聞風險標示：** Yellow。研究方向合理，但成果與對實際 fusion plant 的貢獻仍是未來問題。

## 1. 指定角色

只使用 `storybook_main/00_storybook_design` 中的角色設計：

- **Pip — AI robot**：`character-board-00-robot.png`
  - 青綠色圓角身體、奶油色臉、黃色手掌與天線球、藍色耳部與鞋子。
  - 個性好奇、願意幫忙；不把 Pip 描寫成真正的 fusion 專家。
- **Dot — rabbit child**：`character-board-07-rabbit-v1.png`
  - 奶油色毛、粉紅耳內、紅色上衣、淺色短褲、棕色鞋。
  - 代表五歲讀者，用問題推動故事。
- **Fenn — frog engineer**：`character-board-09-frog-v1.png`
  - 黃綠色皮膚、大圓眼鏡、莓紅背心、奶油色上衣、深綠短褲。
  - 溫和、可靠，負責把工程概念說得簡單，也主動說明「還不知道」。

不得重新設計角色配色或比例。所有人物保持同一種剪紙拼貼質感。

## 2. 全書版面規格

- **最終版面與互動參考：** `storybook_main/ai-maya-storyboard/storybook-en-fullbleed.html`
- 上方約 **72–76%** 為主要插畫；下方約 **24–28%** 保留給英文標題與內文。
- 下方留白是插畫的一部分，以桌緣、地板、電纜、紙帶、草丘或撕紙邊形成自然起伏；不能用筆直水平線硬切。
- 英文文字由程式排版，不烘焙進圖片。
- 每頁看起來必須是一張完整場景，而不是角色與物件貼在空白畫布上。
- 科學設備採「兒童科學館模型」的想像式設計，不假裝精確重現真實 reactor，也不出現爆炸、可怕高溫或危險操作。
- 畫面不放公司標誌、政府標誌、新聞網站標誌、金額文字、水印或可讀 UI 小字。

## 3. 動畫與素材共通規格

### 動畫節奏

- 逐格動畫：**6 fps 建議值**，允許 4–8 fps。
- 自動循環：3–4 格，慢速來回播放；各動作錯開啟動時間。
- 點擊動作：4–6 格；播放一次後回 idle，或保留 open / on 狀態供第二次點擊倒播。
- 刻意保留逐格跳動與紙片邊緣的細微變化，不做骨架補間、鏡頭縮放或整頁平移。

### 每頁共通 layer 順序

1. `background.png`：遠景、牆面、地面、固定大型設備、下方不規則文字留白。
2. `midground.png`：會遮住角色腳部或互動物件後方的固定桌面、欄杆、設備邊框；不需要時可省略。
3. 固定角色 body 與自動循環透明 PNG。
4. 可點擊角色／物件與逐格透明 PNG。
5. `foreground.png`：桌緣、電纜、植物、紙張撕邊等前景遮罩；不需要時可省略。
6. HTML 英文標題與內文。

### 命名規則

- 每頁資料夾：`page-01/` 至 `page-10/`。
- 靜止：`<name>-idle.png` 或 `<name>-body.png`
- 自動循環：`<name>-loop-01.png`、`<name>-loop-02.png`……
- 點擊動作：`<name>-action-01.png`、`<name>-action-02.png`……
- 開關物件：`<name>-off.png`、`<name>-turning-on-01.png`……`<name>-on.png`
- 開闔物件：`<name>-closed.png`、`<name>-opening-01.png`……`<name>-open.png`
- 所有角色、活動部位與互動物件使用透明背景 PNG；背景與固定前景使用 PNG。

---

## Page 01 — The Sun’s Bright Secret

### English text

**The Sun’s Bright Secret**

Inside the Sun, tiny pieces join together. This is called fusion, and it releases lots of energy.

### 完整畫面

溫暖的紙藝天文館。巨大圓形窗外是一顆明亮但不擬人化的太陽。Fenn 在桌上展示透明圓球模型：兩個小紙光點正靠近，合成一個較亮的光點。Dot 站在矮凳上專心看，Pip 在旁邊記錄。桌面、彎曲星圖與一條金色紙帶自然向下展開成奶油色文字區。

### Background / fixed layers

- `background.png`：天文館、圓窗、太陽、牆上星圖、地板、下方文字留白。
- `midground.png`：展示桌固定部分、透明圓球外框。
- `foreground.png`：桌面前緣與金色紙帶撕邊。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **Dot 眨眼、耳朵微微抬起**：`dot-face-loop-01.png`～`03.png`。
2. **Pip 天線左右小幅晃動**：`pip-antenna-loop-01.png`～`04.png`。
3. **兩個小光點慢慢靠近再分開**：`fusion-dots-loop-01.png`～`04.png`；只表示概念，不畫爆炸。

### 點擊互動（3）

1. **點太陽**：外圈光芒逐格亮起再回復；`sun-idle.png`、`sun-action-01.png`～`04.png`。
2. **點透明模型**：兩點合成一個亮點並出現柔和光圈；`fusion-model-idle.png`、`fusion-model-action-01.png`～`05.png`。
3. **點 Fenn**：Fenn 指向模型，再把手放回身旁；`fenn-point-action-01.png`～`05.png`。

---

## Page 02 — Fusion on Earth?

### English text

**Fusion on Earth?**

Scientists are trying to make controlled fusion on Earth. It is a very hard job.

### 完整畫面

三人走進明亮的兒童科學館實驗室。中央是一座未啟動的圓環形 fusion experiment 模型，周圍有大型磁鐵、粗電纜與冷卻管。Fenn 打開安全觀察區的門，Dot 驚訝地望向圓環，Pip 抬頭掃描。圓形平台與電纜的弧線形成下方文字留白邊界。

### Background / fixed layers

- `background.png`：實驗室、未啟動圓環設備、遠處控制室、文字留白。
- `midground.png`：安全欄杆、固定冷卻管與平台。
- `foreground.png`：近景粗電纜與地板撕紙邊。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **Pip 眼睛左右掃視**：`pip-eyes-loop-01.png`～`04.png`。
2. **Dot 耳朵慢慢向上抬再放鬆**：`dot-ears-loop-01.png`～`04.png`。
3. **遠處三盞狀態燈依序柔和閃動**：`status-lights-loop-01.png`～`04.png`；不表示設備已成功運轉。

### 點擊互動（3）

1. **點安全門**：門逐格打開；再次點擊倒播關上。`safety-door-closed.png`、`safety-door-opening-01.png`～`03.png`、`safety-door-open.png`。
2. **點圓環模型**：環上三個紙片箭頭依序亮起，顯示「這是研究模型」；`reactor-model-idle.png`、`reactor-model-action-01.png`～`05.png`。
3. **點 Dot**：Dot 張開雙手露出驚訝表情，再回 idle；`dot-wow-action-01.png`～`05.png`。

---

## Page 03 — A Machine Needs a Team

### English text

**A Machine Needs a Team**

A fusion machine needs many helpers—not just the hot center.

### 完整畫面

Fenn 在圓環模型旁鋪開一張巨大的「parts garden」。磁鐵、冷卻管、感測器、電力箱、機器手臂和材料樣本像六片大拼圖圍住中央圓環。Dot 正拿起一片感測器拼圖，Pip 托著一片小晶片拼圖。拼圖下緣不規則地延伸成文字區。

### Background / fixed layers

- `background.png`：實驗室另一側、中央圓環輪廓、地面與文字留白。
- `midground.png`：固定的大型拼圖底板。
- `foreground.png`：最前方兩片拼圖邊緣。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **Fenn 眨眼，眼鏡閃過小亮點**：`fenn-face-loop-01.png`～`04.png`。
2. **冷卻管內三顆藍色泡泡緩慢移動**：`cooling-bubbles-loop-01.png`～`04.png`。
3. **小機器手臂左右輕擺**：`robot-arm-loop-01.png`～`04.png`。

### 點擊互動（3）

1. **點磁鐵拼圖**：兩塊磁鐵靠近，彩色磁力線展開；`magnet-piece-idle.png`、`magnet-piece-action-01.png`～`05.png`。
2. **點感測器拼圖**：三個感測點依序亮起；`sensor-piece-idle.png`、`sensor-piece-action-01.png`～`04.png`。
3. **點 Pip 手上的晶片拼圖**：Pip 把拼圖舉高，再放回胸前；`pip-chip-action-01.png`～`05.png`。

---

## Page 04 — Tiny Chips, Big Jobs

### English text

**Tiny Chips, Big Jobs**

Special chips can help control powerful electricity carefully and precisely.

### 完整畫面

溫暖的工程工作桌特寫。Fenn 用放大鏡展示一枚紙拼貼晶片；晶片上的金色線路像小道路，連到三個簡化圖示：控制旋鈕、感測器與機器手。Dot 趴在桌邊觀察，Pip 用一根黃色手指沿著線路比劃。桌面、放大鏡把手與柔軟電纜形成下方文字區邊緣。

### Background / fixed layers

- `background.png`：工程角落、工具牆、工作桌後景、文字留白。
- `midground.png`：桌板、放大鏡固定框、晶片底座。
- `foreground.png`：桌面前緣與垂下的紙電纜。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **Dot 慢慢眨眼**：`dot-eyes-loop-01.png`～`03.png`。
2. **Pip 胸口燈柔和呼吸亮滅**：`pip-light-loop-01.png`～`04.png`。
3. **晶片金色線路依序微亮**：`chip-traces-loop-01.png`～`04.png`。

### 點擊互動（3）

1. **點放大鏡**：鏡片從晶片左側滑到右側再回位；`magnifier-idle.png`、`magnifier-action-01.png`～`05.png`。
2. **點晶片**：三條線路依序連到三個幫手圖示；`chip-idle.png`、`chip-action-01.png`～`06.png`。
3. **點控制旋鈕**：旋鈕轉一小格，旁邊燈從灰色變綠色；再次點擊復原。`control-knob-off.png`、`control-knob-turning-on-01.png`～`03.png`、`control-knob-on.png`。

---

## Page 05 — Guiding Big Electricity

### English text

**Guiding Big Electricity**

Power electronics guide and change large amounts of electricity so machines get what they need.

### 完整畫面

把 electricity 畫成一條明亮但安全的金色紙帶河流。河流先進入 Fenn 的控制箱，再分成粗細不同、方向清楚的三條紙帶，分別前往磁鐵、感測器與機器手。Dot 轉動一個大型兒童安全旋鈕，Pip 看著能量路徑。紙帶河的弧線直接形成下方留白。

### Background / fixed layers

- `background.png`：抽象工程花園、三個目的設備、地面與文字留白。
- `midground.png`：控制箱外殼與固定導線槽。
- `foreground.png`：最前方彎曲金色紙帶。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **金色能量紙片沿路徑一格一格前進**：`power-flow-loop-01.png`～`04.png`。
2. **Pip 天線球輕輕上下彈**：`pip-antenna-loop-01.png`～`04.png`。
3. **Fenn 的手指在三條路徑之間慢慢移動**：`fenn-hand-loop-01.png`～`04.png`。

### 點擊互動（3）

1. **點總開關**：能量紙帶從暗到亮；再次點擊倒播關閉。`main-switch-off.png`、`main-switch-turning-on-01.png`～`03.png`、`main-switch-on.png`。
2. **點分流閘門**：金色紙帶從一條分成三條；`power-gate-idle.png`、`power-gate-action-01.png`～`05.png`。
3. **點 Dot**：Dot 小心轉動旋鈕一格，抬頭確認 Fenn，再回 idle；`dot-knob-action-01.png`～`06.png`。

---

## Page 06 — Waves Warm the Plasma

### English text

**Waves Warm the Plasma**

Radio waves may help warm plasma—the super-hot gas inside a fusion experiment.

### 完整畫面

透明安全展示罩內是一圈紫藍色撕紙緞帶，代表 plasma；它不是火焰，也不接觸角色。罩外的 radio-frequency 裝置送出一圈圈柔和紙波紋。Fenn 用三張圖卡依序解釋「waves → energy → warmer plasma」，Pip 與 Dot 從安全線後觀看。展示罩底座的弧邊構成文字區。

### Background / fixed layers

- `background.png`：安全展示室、圓形展示罩、遠處控制台、文字留白。
- `midground.png`：展示罩外框、安全欄杆與 RF 裝置底座。
- `foreground.png`：展示台前緣與安全線紙帶。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **plasma 紙帶緩慢起伏**：`plasma-loop-01.png`～`04.png`。
2. **三圈 radio waves 依序向外移動**：`radio-waves-loop-01.png`～`04.png`。
3. **Dot 耳朵輕輕左右晃**：`dot-ears-loop-01.png`～`04.png`。

### 點擊互動（3）

1. **點 RF 裝置**：裝置亮起，三圈波紋逐格前進；再次點擊回到 off。`rf-device-off.png`、`rf-device-turning-on-01.png`～`04.png`、`rf-device-on.png`。
2. **點 plasma 展示罩**：紫藍紙帶亮度稍微增加，再回 idle；`plasma-idle.png`、`plasma-action-01.png`～`05.png`。
3. **點 Fenn 的三張圖卡**：圖卡依序翻開；`wave-cards-closed.png`、`wave-cards-opening-01.png`～`04.png`、`wave-cards-open.png`。

---

## Page 07 — Eyes and Helping Hands

### English text

**Eyes and Helping Hands**

Sensors watch the machine. Robots can help in places that are too hot for people.

### 完整畫面

角色都站在安全觀察窗後。窗內的小型維修機器手臂正把一顆鬆開的紙螺帽放回位置；三個 sensor 以藍、綠、金色紙燈讀取不同狀態。Pip 模仿機器手，Dot 指向 sensor，Fenn 拿著沒有文字的圖表。窗框與控制台向下形成文字留白。

### Background / fixed layers

- `background.png`：觀察室、厚玻璃窗、遠端設備區、文字留白。
- `midground.png`：窗框、控制台固定部分。
- `foreground.png`：控制台前緣與一小段垂下電纜。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **三個 sensor 燈依序呼吸亮滅**：`sensors-loop-01.png`～`04.png`。
2. **維修機器手臂輕微調整角度**：`maintenance-arm-loop-01.png`～`04.png`。
3. **Pip 模仿手臂，小手上下晃**：`pip-hand-loop-01.png`～`04.png`。

### 點擊互動（3）

1. **點 sensor**：掃描線從上往下通過機器，再顯示三顆綠點；`sensor-scan-idle.png`、`sensor-scan-action-01.png`～`06.png`。
2. **點維修機器手**：夾起紙螺帽、轉半圈、放回；`maintenance-arm-idle.png`、`maintenance-arm-action-01.png`～`06.png`。
3. **點觀察窗的小雨刷**：雨刷擦過一小片霧氣；再次點擊回原位。`window-wiper-left.png`、`window-wiper-action-01.png`～`04.png`、`window-wiper-right.png`。

---

## Page 08 — A Plan for More Research

### English text

**A Plan for More Research**

A company and the government wrote a plan to study these special electronics.

### 完整畫面

Fenn 在長桌上攤開一份大型研究藍圖。藍圖上只有圖示：晶片、電力箱、radio waves、sensor 與 robot arm；不放可讀小字。桌面兩側各有一枚不同顏色的無標誌手印章，象徵雙方的 letter of intent。Dot 拿著鉛筆，Pip 指向尚未完成的空白步驟。畫面明確是「規劃中」，不是頒獎或慶功。

### Background / fixed layers

- `background.png`：工程辦公室、書架、遠處未完成工作台、文字留白。
- `midground.png`：長桌與藍圖底層。
- `foreground.png`：藍圖前方捲曲紙邊。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **藍圖紙角輕輕掀動**：`blueprint-corner-loop-01.png`～`03.png`。
2. **Dot 手中的鉛筆上下微動**：`dot-pencil-loop-01.png`～`04.png`。
3. **Pip 的眼睛在已畫圖示與空白格之間移動**：`pip-eyes-loop-01.png`～`04.png`。

### 點擊互動（3）

1. **點藍圖**：五個研究圖示依序亮起，空白結果格仍保持問號；`blueprint-idle.png`、`blueprint-action-01.png`～`06.png`。
2. **點兩枚手印章**：左右印章各落下一次，中央出現握手圖示；`agreement-stamps-idle.png`、`agreement-stamps-action-01.png`～`05.png`。
3. **點空白步驟**：問號卡翻起再放下，仍然是問號；`unknown-card-idle.png`、`unknown-card-action-01.png`～`04.png`。

---

## Page 09 — A Plan Is Not a Finish Line

### English text

**A Plan Is Not a Finish Line**

The money is proposed, not all received or spent. Fusion electricity is not ready yet.

### 完整畫面

明亮的紙藝研究道路從 plan 圖示起點出發，途中有多個空白檢查站：build、test、check、try again 都只用圖像表示，不放文字。遠方的小鎮燈光與研究模型之間，電線仍保留一段清楚的未接通空隙。Fenn 指著起點，Dot 望向還很遠的路，Pip 誠實攤手。整體充滿耐心，不陰暗、不失敗感。

### Background / fixed layers

- `background.png`：研究花園、彎曲道路、遠方小鎮與未接通電線、文字留白。
- `midground.png`：四個固定檢查站底座。
- `foreground.png`：道路前緣草葉與撕紙邊。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **起點小旗輕晃**：`start-flag-loop-01.png`～`03.png`。
2. **遠方問號旗緩慢擺動**：`question-flag-loop-01.png`～`03.png`。
3. **Fenn 的空白檢查板紙角微翹**：`clipboard-corner-loop-01.png`～`03.png`。

### 點擊互動（3）

1. **點研究道路**：只有第一個檢查站亮起，後面仍保持空白；`research-path-idle.png`、`research-path-action-01.png`～`05.png`。
2. **點未接通電線**：兩端各閃一下，但中間不自動接上；`power-gap-idle.png`、`power-gap-action-01.png`～`04.png`。
3. **點 Pip**：Pip 先思考，再攤開雙手表示「not yet」；`pip-not-yet-action-01.png`～`05.png`。

---

## Page 10 — Every Helper Matters

### English text

**Every Helper Matters**

Big ideas need many careful helpers. Ask, build, test, and check—one step at a time.

### 完整畫面

三人把一面大型圓形 research wall 拼好：中央是尚未完成的 fusion experiment 圖示，周圍環繞晶片、power electronics、radio waves、sensor、robot arm、磁鐵與冷卻管。最後一塊不是終點獎章，而是一個帶問號的 next test 拼圖。Dot 與 Fenn 合作放入拼圖，Pip 在旁邊高興揮手。圓形壁畫下緣、工具桌與彩色電纜自然展開成文字區。

### Background / fixed layers

- `background.png`：明亮工程教室、research wall 底圖、窗外清晨、文字留白。
- `midground.png`：壁畫固定拼圖框與工具桌。
- `foreground.png`：工具桌前緣、彩色電纜與紙屑。

### Character layers

- `pip-body.png`
- `dot-body.png`
- `fenn-body.png`

### 自動微動畫（3）

1. **Pip 揮手**：`pip-wave-loop-01.png`～`04.png`。
2. **Dot 與 Fenn 同時眨眼，但錯開時間**：`dot-eyes-loop-01.png`～`03.png`、`fenn-eyes-loop-01.png`～`03.png`。
3. **七個幫手圖示依序出現微光**：`helper-icons-loop-01.png`～`04.png`。

### 點擊互動（3）

1. **點晶片圖示**：金色線路亮起並連向 power box；`chip-icon-idle.png`、`chip-icon-action-01.png`～`04.png`。
2. **點 robot arm 圖示**：小手臂揮手，再回 idle；`robot-icon-idle.png`、`robot-icon-action-01.png`～`04.png`。
3. **點 next-test 拼圖**：Dot 與 Fenn 一起把它放進空格，問號柔和亮起；再次點擊可取下。`next-test-piece-out.png`、`next-test-piece-action-01.png`～`05.png`、`next-test-piece-in.png`。

---

## 4. 建議資料夾結構

```text
fusion-ready-semiconductors-storybook/
├── storyboard-source.md
├── page-01/
│   ├── background.png
│   ├── midground.png
│   ├── foreground.png
│   ├── pip-body.png
│   ├── dot-body.png
│   ├── fenn-body.png
│   ├── dot-face-loop-01.png
│   ├── ...
│   └── fusion-model-action-05.png
├── page-02/
│   └── ...
└── page-10/
    └── ...
```

## 5. 全書事實與兒童安全檢查

- 不把 letter of intent 寫成已完成的 grant 或已花費的 85 million dollars。
- 不把「可能用於未來 fusion systems」寫成已經證實可用於商業發電廠。
- 不說這個 project 已產生 fusion electricity。
- `may help`、`scientists are trying`、`proposed`、`not ready yet` 等語句保留新聞的不確定性。
- `semiconductor` 以「special chip / tiny electronic helper」說明；不要求五歲讀者理解材料物理。
- `power electronics` 以「guide and change large amounts of electricity」說明。
- `radio-frequency heating` 以「radio waves may help warm plasma」說明，不把 plasma 畫成可觸碰的火焰。
- 角色始終在安全觀察區操作模型；不鼓勵兒童接觸高電壓、高溫或實驗設備。
