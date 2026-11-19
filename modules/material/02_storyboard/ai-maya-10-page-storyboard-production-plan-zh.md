# 《Pip and the Forest Map》十頁分層分鏡規格

> 本文件是插畫、分層與逐格微動畫的前期設計稿，暫不產出圖片。製作說明以中文撰寫；實際出現在書中的標題與故事文字使用英文。

## 1. 故事定位

- 適讀年齡：5 歲，適合親子共讀。
- 核心概念：AI 很會從大量資料中找出圖案；但「找到有趣的圖案」不等於「第一次發現」。研究還需要查舊資料、比較地圖、詢問專家與在地社群，必要時進行實地調查。
- 故事語氣：好奇、溫暖、鼓勵改正。Pip 不是犯錯的壞角色；他願意停下來查證，最後學會更準確地說明結果。
- 新聞轉譯：保留 lidar、AI agents、official register、2025 study、rediscovery、verification 等重點，但不使用過多數字與術語。
- 文化表現：不把馬雅文化描述成「消失的神祕文明」或寶藏。馬雅社群延續至今；在地知識是應被尊重的資訊來源。

## 2. 角色配置

角色造型沿用 `storybook_main/00_storybook_design/`：

- **Pip**：`character-board-00-robot.png`。藍綠色 AI 小機器人，負責掃描大地圖、找圖案，也是主要情緒角色。
- **Lulu**：`character-board-07-rabbit-v1.png`。兔子小記者，代替孩子問「真的嗎？」與「還要查什麼？」
- **Mira**：`character-board-08-moth-v1.png`。飛蛾研究員，帶來 lidar 地圖，說明光如何穿過葉縫。
- **Tula**：`character-board-10-tortoise-v1.png`。烏龜考古學家，熟悉舊研究、地圖與查證方法。
- **Local guide**：如需出現，使用現代日常服裝的新角色，避免古裝、羽毛頭飾或泛化的「部落」符號；角色功能是代表「傾聽在地知識」，不宣稱新聞中的特定地點已由某位居民確認。

## 3. 全書視覺與版面規格

- 畫面比例：橫式 16:9，建議原始尺寸 **1672 × 941 px**，與 `storybook-en-fullbleed.html` 參考一致。
- 插畫風格：完整的手繪繪本插畫；溫暖剪紙拼貼感、可見紙纖維、圓潤造型、柔和紙張陰影。
- 色彩：森林綠、藍綠、土黃、珊瑚紅、奶油白；重要線索使用暖金色，不使用危險警報般的紅光。
- 插畫占上方約 72–76%；下方約 24–28% 為奶油色文字區。
- 插畫與文字區之間不用筆直分隔線。以地圖紙邊、桌緣、書頁、草地、樹根或小路形成自然起伏的邊界。
- 每頁即使所有動畫停止，仍必須是一張構圖完整、有前中後景的插畫。
- 故事文字由介面另外排版，不畫進背景；地圖上的幾何線索可畫在圖中，但避免細小、需要閱讀的標籤。
- 文字安全區：左右各留 8%，下方留 3%；主要英文文字最多約 28–34 個單字。

## 4. 分層與動畫共通規格

### 圖層順序

每頁由後到前至少包含：

1. `background.png`：天空、遠景、室內空間、固定家具與不動的地面。
2. `midground-*.png`：主地圖、書桌、書架或大型場景物件。
3. `character-*-idle.png`：每位可動角色獨立透明 PNG。
4. `prop-*-idle.png`：可點擊物件獨立透明 PNG。
5. `effect-*-idle.png`：光點、標記或其他可疊加效果。
6. `foreground.png`：近景葉片、草叢、紙角等遮擋層，同時形成文字區的不規則上緣。

背景必須補畫被角色或可動物件遮住的區域，確保角色移動時不露出空洞。

### 動畫原則

- 基準播放速度：**5 fps**（每格約 0.2 秒），可在 4–8 fps 間微調。
- 自己動的角色：每頁 1–3 個；每個動作 3–5 張透明 PNG，正播後倒播，循環間隔 2–6 秒。
- 點擊會動的物件：每頁 1–3 個；每個動作 4–8 張透明 PNG，通常播放一次。
- 保留逐格手繪線條與紙材輪廓的細微變化，但角色腳底或物件基準點不可跳位。
- 角色同時有待機與點擊動作時，點擊後先暫停待機，播放完再恢復。
- 可保持狀態的互動（開抽屜、打開書、完成更正）需另存 `*-open.png`、`*-on.png` 或 `*-complete.png`；再次點擊時反向播放。
- 每組 animation frame 必須使用相同畫布尺寸、相同 anchor 與透明留白。

---

## 第 1 頁｜A Forest Full of Clues

### 本頁英文故事文字

> Pip, Lulu, and Mira looked at a giant map of a forest in Mexico.  
> “What stories might be hiding under all those leaves?” asked Lulu.

### 完整畫面

森林研究小屋的窗戶大開，午後陽光照進來。三位角色圍著一張向下方展開的大森林地圖：Mira 在左側指向墨西哥森林，Lulu 趴近地圖，Pip 在右側準備掃描。窗外只看見濃密樹冠與遠山，不先揭露完整遺址。地圖波浪狀紙邊、桌緣與兩片前景葉子形成下方文字區的自然邊界。

### 圖層

1. `background.png`：天空、遠方森林、小屋牆面、窗框、固定書架與地板。
2. `midground-table.png`：固定桌面與地圖下方陰影。
3. `prop-forest-map-idle.png`：不含光效的大森林地圖。
4. `character-mira-idle.png`、`character-lulu-idle.png`、`character-pip-idle.png`：三位角色分層。
5. `foreground.png`：近處葉片、桌緣與地圖紙角。

### 角色自己動

- **Pip 眨眼**：`pip-blink-01..03.png`，睜眼 → 半閉 → 閉眼；再倒播回睜眼。5 fps，每 4–6 秒一次。
- **Mira 觸角輕晃**：`mira-antennae-01..04.png`，左傾 → 中間 → 右傾 → 中間；循環間隔約 3 秒。

### 點擊會動

- **點森林地圖**：`forest-map-glow-01..06.png`，金色光點從左到右掃過樹冠，最後淡出；疊加效果，播放一次。
- **點 Pip**：`pip-wave-01..05.png`，抬手 → 小幅揮兩次 → 放回身側；以完整角色 sprite 替換 idle。

---

## 第 2 頁｜Tiny Beams, Big Map

### 本頁英文故事文字

> Lidar sends tiny beams of light toward the ground.  
> Some light slips between the leaves and helps make a bumpy 3-D map.

### 完整畫面

畫面像把森林側面切開：上方有小型測量飛機，中層是厚厚的樹冠，下方是高低起伏的地面。幾顆光點穿過葉縫、碰到地面又回到上方。Mira 在左側解說；Pip 與 Lulu 站在右側木平台觀察。起伏地形與草叢延伸成下方留白的不規則邊緣。

### 圖層

1. `background.png`：天空、遠山、固定樹幹與基礎地形。
2. `midground-canopy.png`：主要樹冠，不含可動葉縫。
3. `prop-survey-plane-idle.png`、`prop-lidar-beams-idle.png`、`prop-terrain-map-flat.png`。
4. `character-mira-idle.png`、`character-lulu-idle.png`、`character-pip-idle.png`。
5. `foreground.png`：近景葉片、平台下緣與地面紙層。

### 角色自己動

- **Pip 頭部追光**：`pip-look-01..04.png`，頭從上方慢慢轉向地面再回中間；正播倒播，約 1.4 秒。
- **Lulu 耳朵輕彈**：`lulu-ear-flick-01..03.png`，右耳向外彎一下再回正；每 4–5 秒一次。

### 點擊會動

- **點飛機**：`survey-plane-scan-01..06.png`，飛機微微前進，同時一排光點逐格向下發出。
- **點一顆光點**：`beam-bounce-01..05.png`，光點落下 → 穿過葉縫 → 碰地 → 回彈 → 消失；播放一次。
- **點平面地圖**：`terrain-rise-01..05.png`，紙片逐格疊高，從平面變成三層 3-D 地形；停在 `prop-terrain-map-raised.png`，再次點擊反向播放。

---

## 第 3 頁｜Shapes Under the Trees

### 本頁英文故事文字

> Pip and many AI helpers searched the huge map.  
> They spotted shapes like a plaza, platforms, buildings, and a pyramid-shaped mound.

### 完整畫面

Pip 站在一張大型藍綠色 lidar 地形圖前；周圍漂浮許多小紙窗，代表 48 個 AI agents，但畫面只需呈現「很多」，不用讓孩子數。地圖清楚放入四種形狀：空曠方形、長條高台、小方形建築輪廓、階梯狀土丘。Lulu 用手指沿著輪廓看，Mira 在旁記錄。重疊資料卡與地圖紙邊形成文字區上緣。

### 圖層

1. `background.png`：研究室、固定書架、窗戶與告示板。
2. `prop-lidar-map-idle.png`：不含高亮的地形圖。
3. `prop-ai-helper-cluster-idle.png`：多個小紙窗群組。
4. `character-pip-idle.png`、`character-lulu-idle.png`、`character-mira-idle.png`。
5. `effect-shape-hints-idle.png`：極淡的四種輪廓。
6. `foreground.png`：資料卡、地圖紙邊、兩片葉子。

### 角色自己動

- **Pip 天線搜尋**：`pip-antenna-scan-01..04.png`，燈向左 → 中間亮起 → 向右 → 回中間；每 3 秒一次。
- **Lulu 手指移動**：`lulu-trace-01..04.png`，指尖沿一小段地圖輪廓滑動後回原位；正播倒播。
- **小 AI 視窗閃爍**：`ai-helpers-twinkle-01..04.png`，不同視窗錯開亮一下；循環間隔約 2 秒。

### 點擊會動

- **點 plaza**：`plaza-highlight-01..04.png`，方形輪廓逐邊出現，再柔和亮一次。
- **點 platforms/buildings**：`structures-highlight-01..05.png`，長條與小方塊依序微微凸起，最後回到靜止提示。
- **點 mound**：`mound-highlight-01..05.png`，三層紙片向上堆疊成金字塔形土丘，停在完成狀態。

---

## 第 4 頁｜Was It Brand-New?

### 本頁英文故事文字

> “We found a brand-new place!” beeped Pip.  
> Lulu tilted her head. “Maybe. What should we check first?”

### 完整畫面

Pip 在左側興奮地抬起一腳；中央地圖上方浮著一顆「NEW?」概念的大紙問號，但不要放需要閱讀的英文標籤。Lulu 在右側歪頭、舉起一根手指，Mira 停下筆開始思考。問號、地圖紙片與葉子圍出一個柔軟的思考雲，銜接下方留白。

### 圖層

1. `background.png`：森林研究站、固定家具與窗外樹冠。
2. `prop-map-idle.png`。
3. `character-pip-excited-idle.png`、`character-lulu-question-idle.png`、`character-mira-thinking-idle.png`。
4. `prop-question-mark-idle.png`。
5. `foreground.png`：地圖紙片與近景葉子。

### 角色自己動

- **Pip 開心上下晃**：`pip-happy-bob-01..04.png`，身體上移少量 → 回中 → 下沉少量 → 回中；每輪後停 2 秒。
- **Mira 慢慢眨眼**：`mira-blink-01..03.png`，思考式眨眼；每 5–6 秒一次。

### 點擊會動

- **點 Lulu**：`lulu-head-tilt-01..04.png`，頭與耳朵再向一側傾斜，眉毛抬起，再回原位。
- **點大問號**：`question-bounce-01..05.png`，問號縮小 → 彈起 → 左右晃 → 落回原處，旁邊出現兩個小光點。

---

## 第 5 頁｜The Empty Drawer

### 本頁英文故事文字

> The place was missing from one official list.  
> Tula said, “Missing here does not mean missing everywhere. Let’s keep checking!”

### 完整畫面

Tula 抱著一本綠色舊研究書從右側加入。中央是木製資料卡櫃，Pip、Lulu 與 Mira 圍著其中一格抽屜。打開時可以看見裡面沒有這個地點的卡片，但相鄰抽屜仍放著其他卡片，避免孩子理解成「整個資料庫是空的」。櫃腳、捲起的名單與盆栽形成下方留白邊界。

### 圖層

1. `background.png`：半戶外資料室、固定書架、遠方森林與資料櫃本體。
2. `prop-drawer-closed.png`、`prop-neighbor-cards-idle.png`。
3. `character-tula-idle.png`、`character-pip-thinking-idle.png`、`character-lulu-looking-idle.png`、`character-mira-idle.png`。
4. `foreground.png`：捲紙、櫃腳與盆栽葉片。

### 角色自己動

- **Tula 眨眼點頭**：`tula-nod-01..04.png`，眼睛半閉 → 頭微低 → 回正 → 睜眼；每 4 秒一次。
- **Pip 思考燈呼吸**：`pip-thinking-light-01..03.png`，胸口燈暗 → 亮 → 暗；2 秒一輪。

### 點擊會動

- **點抽屜**：`drawer-opening-01..05.png`，關閉 → 拉出一半 → 完全打開；停在 `prop-drawer-open.png`。再次點擊反向播放關閉。
- **點相鄰資料卡**：`neighbor-cards-hop-01..04.png`，兩張卡依序跳起少量再落下，表示這份名單有其他紀錄。
- **點 Tula 的書**：`tula-book-glow-01..04.png`，封面邊緣亮起、書稍微抬高，提示下一頁要查舊研究。

---

## 第 6 頁｜A Map From Before

### 本頁英文故事文字

> Tula opened an earlier study. “Look!” she said.  
> The same place was already shown on a map made by other researchers.

### 完整畫面

圖拉在木桌上攤開一本大研究書。左頁是 2025 年研究中的早期 lidar 地圖，旁邊擺著 Pip 這次查看的新地圖。兩張圖上的廣場與土丘位置、方向和形狀明顯對應，讓孩子可以玩「找一樣」。Lulu 指著兩張圖，Pip 驚訝地靠近。書頁和地圖的波浪紙邊形成文字區上緣；畫面不必畫 DOI 或小字論文資訊。

### 圖層

1. `background.png`：溫暖資料室、書架、窗戶與森林光線。
2. `midground-table.png`。
3. `prop-old-study-book-idle.png`、`prop-new-map-idle.png`。
4. `character-tula-idle.png`、`character-lulu-pointing-idle.png`、`character-pip-surprised-idle.png`。
5. `foreground.png`：書頁邊、紙角、放大鏡與桌上小物。

### 角色自己動

- **Pip 驚訝眨眼**：`pip-surprise-blink-01..03.png`，大眼 → 閉眼 → 大眼；每 4–5 秒一次。
- **Tula 指尖輕點**：`tula-point-tap-01..04.png`，手指抬起 → 點一下舊地圖 → 回原位；間隔 3 秒。
- **書頁角微動**：`page-corner-flutter-01..04.png`，紙角翹起少量再落下；正播倒播。

### 點擊會動

- **點舊地圖**：`old-map-marker-01..05.png`，暖金色圓圈逐格包住舊地圖上的地點並保持。
- **點新地圖**：`new-map-marker-01..05.png`，藍色圓圈標出同一形狀；若舊地圖已標記，兩圈同時輕閃一次。
- **點 Lulu**：`lulu-compare-01..05.png`，手指從舊地圖移向新地圖，最後點一下頭。

---

## 第 7 頁｜Found Again

### 本頁英文故事文字

> “I was not the first to find it,” said Pip.  
> “I found it again!” Changing the claim made the story more true.

### 完整畫面

Pip 站在中央，把代表「第一次發現」的星形紙牌收起，換成代表「再次找到」的環形箭頭紙牌。Lulu 微笑，Mira 輕放一隻手在 Pip 肩旁，Tula 比出大拇指。後方釘著兩張相符的地圖，讓更正有清楚證據。兩張地圖紙角形成淺 V 字邊緣，接到下方留白。

### 圖層

1. `background.png`：資料室與後方兩張固定地圖。
2. `character-pip-honest-idle.png`、`character-lulu-support-idle.png`、`character-mira-support-idle.png`、`character-tula-support-idle.png`。
3. `prop-first-discovery-star.png`、`prop-rediscovery-arrow-hidden.png`。
4. `foreground.png`：地圖紙角、桌緣與少量葉子。

### 角色自己動

- **Pip 身體放鬆**：`pip-breathe-01..03.png`，肩膀微高 → 放低 → 回中；每 3 秒一次。
- **Mira 觸角鼓勵式晃動**：`mira-antennae-01..03.png`，兩根觸角向外開一點再回來。

### 點擊會動

- **點星形紙牌**：`claim-correct-01..06.png`，星星折起 → 翻面 → 展開成環形箭頭；停在 `prop-rediscovery-arrow-complete.png`，不可自動復原。
- **點 Pip**：`pip-honest-bow-01..05.png`，閉眼 → 輕輕低頭 → 抬頭 → 安心微笑。
- **點 Tula**：`tula-thumbs-up-01..04.png`，手臂逐格抬起、比讚，眼鏡閃過一點柔光後回 idle。

---

## 第 8 頁｜One List Is Not Everything

### 本頁英文故事文字

> A place can be missing from one list and still be in an old study.  
> People who live nearby may know it, too. Good researchers listen widely.

### 完整畫面

中央是三片大型紙拼圖：資料抽屜、舊研究地圖、說話與傾聽圖案。Pip 與 Lulu 扶住兩側拼圖，Mira 幫忙對齊；Tula 在旁聽一位穿現代服裝的 local guide 說話。三片拼圖拼合後形成一張更完整但仍留有空間的地圖，表示不同來源可以互補，而不是其中一種永遠正確。拼圖下緣、小路與灌木形成文字區上緣。

### 圖層

1. `background.png`：森林邊的現代社區工作站、遠方小路與樹冠。
2. `prop-official-list-piece.png`、`prop-old-study-piece.png`、`prop-local-knowledge-piece.png`。
3. `character-pip-holding-idle.png`、`character-lulu-holding-idle.png`、`character-mira-aligning-idle.png`、`character-tula-listening-idle.png`、`character-local-guide-idle.png`。
4. `foreground.png`：灌木、小路與拼圖下緣。

### 角色自己動

- **Local guide 手掌輕動**：`local-guide-hand-01..03.png`，手掌向外 → 回中 → 向地圖；每 3 秒一次。
- **Tula 專心點頭**：`tula-listen-nod-01..04.png`，慢慢低頭再回正；每輪後停 2 秒。

### 點擊會動

- **點官方名單拼圖**：`list-piece-check-01..04.png`，小抽屜打開，顯示缺少一張卡的位置，再關起來。
- **點舊研究拼圖**：`study-piece-open-01..05.png`，小書逐格打開，裡面出現相同地圖輪廓，停在打開狀態。
- **點在地知識拼圖**：`knowledge-piece-listen-01..05.png`，三個無文字的對話點飄向耳朵圖案，耳朵周圍亮起暖光。

---

## 第 9 頁｜Check, Ask, and Visit

### 本頁英文故事文字

> Finding a pattern is only the beginning.  
> Researchers read old work, compare maps, ask experts and local people, and sometimes visit the place.

### 完整畫面

一條彎曲的紙做小路經過五站：打開的書、兩張比較地圖、專家對談、傾聽在地居民、拿筆記本在現場觀察。四位主角一起從左向右前進。實地場景只畫觀察、拍照與記錄，不畫挖寶，也不暗示孩子可以自行進入遺址。起伏草地與小路形成下方留白邊界。

### 圖層

1. `background.png`：寬廣森林、遠山與五站底座。
2. `prop-verification-trail-idle.png`：彎曲小路與五塊未亮踏腳石。
3. `prop-station-icons-idle.png`：書、地圖、專家、傾聽與現場記錄圖示。
4. `character-team-walking-idle.png`：四位主角的團體姿勢。
5. `foreground.png`：近景草叢、石頭與小路邊緣。

### 角色自己動

- **小隊原地踏步**：`team-walk-idle-01..04.png`，左右腳交替少量抬起，身體上下位移不超過角色高度 2%；4 fps。
- **Pip 回頭確認隊友**：`pip-look-back-01..04.png`，頭向後轉 → 停一下 → 回前方；每 5 秒一次。
- **前景草輕晃**：`grass-sway-01..03.png`，左右微移；循環間隔 2 秒。

### 點擊會動

- **點五站小路**：`stations-sequence-01..06.png`，五站依序亮起並微微抬高，最後全部保持柔光。
- **點小隊**：`team-step-forward-01..06.png`，四人沿小路向前走一小步後停住；下一次點擊可再前進一小段，但不可走出畫面。
- **點現場筆記本**：`notebook-open-01..05.png`，封面打開，露出簡單的樹、地形線與勾勾，不放小字。

---

## 第 10 頁｜Tools and Teamwork

### 本頁英文故事文字

> AI can search a huge map and spot useful clues.  
> People bring questions, experience, and careful checking. Together, they can learn more wisely.

### 完整畫面

夕陽照著森林空地。Pip 拿 lidar 地圖，Lulu 拿問題筆記本，Mira 拿測量工具，Tula 拿舊研究；local guide 指向通往森林的小路。所有角色圍著中央共同地圖，形成合作的圓形構圖。幾隻螢火蟲從鬆散問號排列成柔和勾形。地圖紙邊、蕨葉與弧形地面自然接到下方文字區。

### 圖層

1. `background.png`：夕陽天空、森林空地、遠景樹冠與小路。
2. `prop-shared-map-idle.png`。
3. `character-pip-proud-idle.png`、`character-lulu-proud-idle.png`、`character-mira-proud-idle.png`、`character-tula-proud-idle.png`、`character-local-guide-idle.png`。
4. `effect-fireflies-idle.png`。
5. `foreground.png`：蕨葉、地圖紙邊與弧形草地。

### 角色自己動

- **Pip 天線呼吸光**：`pip-antenna-glow-01..03.png`，暗 → 亮 → 暗；2 秒一輪。
- **全隊細微待機**：`team-breathe-01..04.png`，各角色只做不完全同步的小幅呼吸與眨眼；5 fps，每輪後停 3 秒。
- **螢火蟲變形**：`fireflies-loop-01..06.png`，鬆散問號 → 中間過渡 → 柔和勾形；停 2 秒後倒播。

### 點擊會動

- **點共同地圖**：`shared-map-clues-01..06.png`，依序出現 lidar 光點、舊地圖圓圈、傾聽圖案與現場筆記勾號；最後全部保留。
- **點小隊**：`team-celebrate-01..06.png`，Pip 揮手、Lulu 耳朵抬起、Mira 觸角張開、Tula 點頭、guide 輕揮手；動作錯開一格，保持手繪節奏。
- **點螢火蟲**：`fireflies-star-01..05.png`，螢火蟲聚成暖色小星星，閃一下後散回原位。

---

## 5. 建議素材資料夾結構

每頁使用獨立資料夾；下列以第 5 頁為完整範例，其餘頁面依分鏡中的檔名製作：

```text
ai-maya-storybook-assets/
  page-01/
    background.png
    midground-table.png
    prop-forest-map-idle.png
    character-mira-idle.png
    character-lulu-idle.png
    character-pip-idle.png
    foreground.png
    pip-blink-01.png
    pip-blink-02.png
    pip-blink-03.png
    forest-map-glow-01.png
    ...
  page-05/
    background.png
    prop-drawer-closed.png
    prop-drawer-open.png
    prop-neighbor-cards-idle.png
    character-tula-idle.png
    character-pip-thinking-idle.png
    character-lulu-looking-idle.png
    character-mira-idle.png
    foreground.png
    tula-nod-01.png
    tula-nod-02.png
    tula-nod-03.png
    tula-nod-04.png
    pip-thinking-light-01.png
    pip-thinking-light-02.png
    pip-thinking-light-03.png
    drawer-opening-01.png
    drawer-opening-02.png
    drawer-opening-03.png
    drawer-opening-04.png
    drawer-opening-05.png
    neighbor-cards-hop-01.png
    neighbor-cards-hop-02.png
    neighbor-cards-hop-03.png
    neighbor-cards-hop-04.png
    tula-book-glow-01.png
    tula-book-glow-02.png
    tula-book-glow-03.png
    tula-book-glow-04.png
    manifest.md
  page-06/
    ...
  page-10/
    ...
```

每頁另放一份 `manifest.md`，記錄：

- 素材名稱與用途。
- 畫布尺寸與 anchor 位置。
- 是「替換 idle」還是「疊加 effect」。
- 動畫幀序、fps、是否倒播、是否停在最後狀態。
- 點擊區域與角色／物件的堆疊順序。

## 6. 製作與驗收清單

- [ ] 每頁停止動畫時仍像一張完整手繪繪本插畫。
- [ ] 每頁有 1–3 個角色／環境自己動，以及 1–3 個點擊會動的物件。
- [ ] 每個逐格動作使用 3–8 張透明 PNG，沒有輸出整頁 MP4。
- [ ] 背景已補齊角色與可動物件後方的景物。
- [ ] 所有動畫格尺寸、位置與 anchor 一致，播放時不跳位。
- [ ] 下方文字區充足，邊界由場景自然形成而非硬直線。
- [ ] 英文句子適合朗讀，字數與詞彙量符合 5 歲兒童。
- [ ] 第 4–7 頁清楚區分「偵測圖案」與「查證是否首次發現」。
- [ ] 沒有把官方名單當成唯一知識來源，也沒有把「在地可能知道」寫成已證實事實。
- [ ] 沒有將馬雅文化描寫成消失、神祕或等待被外來者發現的文明。
- [ ] 最後一頁同時肯定 AI 的資料處理能力與人類專業、查證、同儕檢視及傾聽的價值。
