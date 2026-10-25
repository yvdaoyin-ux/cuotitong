# PROJECT_STATE —— 错题通

> **参赛作品全名**：错题通——基于贝叶斯平滑与遗忘曲线的错题诊断与智能组卷系统
>
> **每个阶段开始前先读本文件，结束后更新它。** 这是跨会话的长期记忆，不依赖对话上下文。
> 最后更新：2026-10-25 深夜（**第五份任务书全部完成**：关口1+U0+U1+U2+U3+P2，318 项测试全绿，界面全新装，报告素材 F1-F9 齐；F7/F10 待用户数据；10-29 冻结）

---

## 第五份任务书 · 关口 1（A 收尾 + P1）已完成（2026-10-25，提交 `9b98223`）

| 交付 | 状态 | 验证 |
|---|---|---|
| A1 判据 #4 Claude 裁定落档（不改判据原文；DAILY_LIMIT **30→15** 补救；「三亿」以控制台为准不猜测） | ✅ | docs/识别尝试记录.md 裁定段；ocr.test.js 边界 14/15 断言 |
| A2 `tools/ocr-cer.js`（Levenshtein 码点级、空白先去、$ 保留；refLen 0 特例定义） | ✅ | 10 项测试；**CER 数值待用户提供两份文本后计算，不代填** |
| A3 旋转编排拆 `js/photo-rotate.js`（5 钩子最小访问面），ui-entry-photo 406→**400 行** | ✅ | 11 套件 316=316 全绿，行为零改动 |
| P1 `docs/申报书_B3填写稿.md` | ✅ | 与 docx **11 栏逐项核对一致**（含限字数）；9 栏字数 0 超限（197/200、198/200 贴线）；全称采用底稿新版、与档案旧名不一致**待用户定** |
| P1 `tools/count-chars.js`（去空白按码点计，超限退出码 1） | ✅ | 输出「栏目/字数/上限/合格」表 |
| P1 `docs/申报书_待用户确认清单.md`（11 项） | ✅ | 全称/分类/获奖/专利/试用/CER/文献核对/额度/三档对比/推荐人/最终测试数 |
| P1 参考副本 `Desktop/申报书_B3_已填写_参考版.docx` | ✅ | python-docx 生成，**11 处填充**（B3 十栏 + C 表整栏，以【填写参考】段追加）；**原件未动**；提交前删「【填写参考】」字样 |

**旧断言改动（本轮 3 处，均在 ocr.test.js，DAILY_LIMIT 30→15 连带）**：①空状态 remaining 30→15；②边界 29/30→14/15；③`DAILY_LIMIT===30`→`===15`。
**后续关口（同日全部完成）**：
- **U0**：选择器清单（67id/22data/7class→复验 68/22/7）+ before 六页截图 + 18 枚图标草案（`1d7f990`）；
- **U1**：设计令牌（暖灰纸底+靛蓝 #3A47B8，覆盖层策略）+ SVG 图标精灵 18 枚 + 标签栏（指示条/毛玻璃）+ 主页改版（品牌头/36px 主角卡/三磁贴/轻统计）；contrast-check 11 组达标（ok/warn 调深 #177A50/#9C5A00）；四宽度溢出 0（`bd4fe3a`）；
- **U2**：录题页三段徽标+照片磁贴+chip 对勾；错题本卡片改版（错因色点 --c1..c5 + 图标按钮）；工具栏统一 40×40；emoji 清零 24 处（`541551f`）；
- **U3**：诊断页掌握度排行主图（HTML/CSS 条形+95% 区间浅带+三档色+数据不足斜纹）+ 结论药丸 + 雷达折叠（标签 5 字/半径 56%——裁切修复，8 标签全显示）+ ECharts 主题 'qt'；组卷规则卡+吸顶进度条+大块自评按钮；设置四分组（`8fd8eec`）；
- **P2**：`docs/report-figures/` F1 结构 SVG / F2 遗忘曲线 / F3 Beta 收敛 / F4 占比确定性验证 / F5 权重-频次 / F6 基准 / F8 外观图×7 / F9 测试表 + index.md（性质声明：F2-F5 为模型性质与确定性验证，非实验结论）；`docs/研究报告_骨架.md` 六节（`f6fe6e4`）。
- **测试对账**：306→316→318 全绿（+ui-icons 12）；旧断言 0 改动（选择器只增未减）。

## 第四份任务书（识别收口与优化）已完成（2026-10-24 当日，提交 `19eb927`+`8eae829`）

| 交付 | 状态 | 验证 |
|---|---|---|
| A0 全局 `[hidden]!important`（修 `.btn` display 覆盖 → 无密钥版识别按钮可见可点的真 bug） | ✅ | 真 375 视口冒烟：display=none rect=0×0；实测证据 `docs/ocr-验证-问题1-*.png` |
| A1 识别成功自动展开折叠区 + scrollIntoView 居中（极速模式识别结果曾不可见——Claude 问题 1 属实已修） | ✅ | 冒烟：panel 展开、stem rect 323×88 top 289、KaTeX 渲染；截图 `docs/ocr-A1-验收-*.png` |
| A2 题干非空页面内弹层三选一（追加/覆盖/取消，Claude 问题 2 已修；空题干直接填） | ✅ | 冒烟三路全验（覆盖替换/追加换行/取消不动）；截图 `docs/ocr-A2-验收-*.png` |
| A3 缩略图旋转 90°（computeRotatedSize 纯函数 + rotateBlob 重走压缩阶梯；旧图按删除规则顶替） | ✅ | 9 项纯函数测试；**canvas 真机旋转未测**（自测清单 5.6） |
| B1 探针长边 1280/1600/1920 下拉（compressFile 原生支持 maxEdge，主应用零改动） | ✅ | 探针可跑；**三档对比实验待用户**（判据：错误减半且 tokens≤+50% 才改主应用） |
| B2 清单 +5.5 识别可见可改 / 5.6 旋转 | ✅ | 已写入 |
| B3 识别埋点：entry_save +5 字段（ocrUsed/ocrClicks/ocrOkCount/ocrMsTotal/ocrChars），CSV 13→18 列 | ✅ | 白名单兜底测试：识别原文塞进 payload 必被挡在 JSON/CSV 外 |
| B4 docs/密钥轮换说明.md（换密钥四步 + 赛后停用 + 口令版限制） | ✅ | 已写入 |
| C 口令解锁：ocr-unlock.js（PBKDF2 200000+AES-GCM-256，14 测试）+ ocr-vault 占位 + encrypt-key.js（口令不进 argv，写出前查泄漏）+ ui-ocr 三态按钮 | ✅ | 假 key 端到端往返 + 无泄漏验证；**线上 https 真机解锁未测**（待用户生成密文包部署） |

**测试 306 项全绿**（+rotate 9 / +ocr-unlock 14 / +export 1）；旧断言改动 2 处（单列于 `docs/致Claude的第四份任务书汇报.md`）。**验收口径更正**：无头 Edge 最小窗宽 ~500px，此前「375×667 截图」实为 504 口径；本轮起 CDP Emulation 强制真 375。**待用户**：真 key 真机点识别、生成密文包（encrypt-key.js）、B1 三档实验、真机矩阵。汇报：`docs/致Claude的第四份任务书汇报.md`。

## OCR 验证 + C4 最小集成已完成（2026-10-24 当日）

**验证结论（详见 `docs/识别尝试记录.md`）：Go**——CORS 通过（curl 预检+正式响应放行 file://，用户探针直连成功）；印刷体 **5/5「可直接用」**（判据 4/5）；中位耗时 **982ms**（判据 ≤8s）；600 张 ≈135 万 tokens ≤ 额度 50%（用户口述「几千万」）。接口事实：**file 必须是 data URL**（纯 base64 一律 HTTP 400）；鉴权**裸 key 无 Bearer** 实测可用；公式返回 `$…$`/`$$…$$` 与主应用 mathtext 直接兼容。手写组 1/1 可直接用，4 张待测（不卡集成）。

| 交付 | 状态 | 验证 |
|---|---|---|
| js/ocr.js（纯逻辑：buildRequestBody 强制 data URL / parseResponseText / quotaCheck+quotaRecord / friendlyError） | ✅ | 25 项测试：401 error body 透出、BAD_JSON、30/30 边界、跨天重置、quotaRecord 不可变性 |
| js/ui-ocr.js（按钮 / 同意门 / 额度读写 / 30s 超时 / 降级提示 / 结果**只追加**进题干） | ✅ | 无头 Edge 冒烟 7/7：按钮露出与隐藏、无照片降级提示、额度 30/30 拦截、全程无 JS 异常 |
| ui-entry-photo 接线（btn-ocr 槽位 + getBlobForOcr：先新拍池后已入库旧图） | ✅ | 冒烟覆盖；ui-entry.js 499 行未动 |
| make-dist.js `--ocr-key-file <文件>`（密钥只注入本地单文件；zip/线上/仓库恒为 null） | ✅ | 假 key 注入生效；无 key 构建槽位保持 null；dist/ 在 .gitignore |
| index.html 注入槽 `window.QT_OCR_KEY = null` | ✅ | 仓库版按钮自动隐藏（冒烟第 6 项实测） |

**安全模型**：密钥只在用户本地构建的单文件里（拿到文件的人可见，混淆不算安全）——专用账号、不充值、只用赠送额度；额度护栏 = **每设备每天 30 次「成功」识别**（失败不计数）；同意门 = 首次点击明确告知照片上传智谱；最坏情况额度用光自动降级纯拍照存图。
**验证边界（诚实）**：应用内真实网络调用未在冒烟中覆盖（同形 fetch 已由探针实测证明可用）——**待用户拿真 key 构建后真机点一次**。
**未验证点闭环**：探针首次「两种写法都失败」＝用户当时 API key 贴错（已确认，与方案无关）。

## v1.2（第三份任务书 A 部分）+ B/C 部分已完成

| 交付 | 状态 | 验证 |
|---|---|---|
| A1 列表缩略图整宽 contain + 「共 N 张」角标 | ✅ | 375×667 截图：横 3000×2000 / 竖 2000×3000 四边完整可见 |
| A2 工具栏两行 117px≤120（⏭/↶ 入分组行、最近使用变虚拟标签）+ 防遮挡 | ✅ | 375×400 截图：题干底边 218 < 工具栏顶 227；**防遮挡 = body 等高 padding + 聚焦/键盘 resize 时显式 scrollBy 校正**（scrollIntoView nearest 不感知 fixed 已实测弃用；跟滚强拉回副作用已修） |
| A3 「添加」按钮 nowrap + min-width 64px | ✅ | 截图 + 实测 w=64 h=44 单行 |
| A4 insertAt 字母命令自动补空格 | ✅ | symbols 26→31；**顺序坑：必须先补空格再包 $**（否则正则匹配不上）；基准须手打 70→69，录入效率说明已更新 |
| A5 发布 v1.2 | ✅ | 257 项测试对账（33+36+55+18+50+34+31）；打包 1903 KB 外部引用 0；push `7db0215` + tag `v1.2`；线上 css 已是新代码（curl 实测）；桌面旧副本改名 `错题通-v1.1-备份.html`，新版就位 |
| B1 真机自测清单 / B2 试用方案（拉丁方+CSV 模板） | ✅ | docs/，待用户发给同学 |
| C1 OCR 探针 tools/ocr-probe.html（独立单页不进 dist）+ docs/识别尝试记录.md（判据写死、表格留空） | ✅ | 仓库搜密钥自查干净；**C2/C3 等用户提供密钥与 10 张照片** |

**测试总数：257 项全部通过**（stats 50 / storage 34 / export 33 / render 18 / mathtext 55 / image 36 / symbols 31）。

## 阶段 2 + 阶段 4（公式工具栏 / 埋点·基准·文档·发布）已完成

| 交付 | 状态 | 验证 |
|---|---|---|
| js/symbols.js（94 符号 6 分组 + insertAt 纯函数） | ✅ | 26 项测试，**94 个符号逐个 KaTeX 渲染** |
| js/ui-toolbar.js（面板/最近使用/visualViewport 跟随/撤销/防收键盘） | ✅ | 浏览器实测：出现/焦点/预览同步/切换分组 |
| 保存前残留 ▮ 确认 + 复制为新题（阶段 1 遗留项补齐） | ✅ | 浏览器实测 confirm 拦截与放行、copyFrom 带科目知识点清内容 |
| js/entry-metrics.js（entry_open/entry_save，载荷只有计数无文本） | ✅ | 浏览器实测载荷 8 字段；4 项隐私测试 |
| tools/keystroke-benchmark.js（真实模拟） | ✅ | 5 题全过：手打 278 键 vs 工具栏 24 点击+70 字符+6 光标移动 |
| **基准脚本抓到 2 个 insertAt 真 bug**（多占位符光标偏移、auto-$ 后光标在公式外） | ✅ 已修 | 回归测试锁定 |
| 四份文档（录入效率说明/系统设计输入子系统/用户手册/测试报告增补） | ✅ | 见 docs/ |
| 打包 1898 KB 外部引用 0 + **push `9036b8c` + tag `v1.1` 已上线** | ✅ | curl 200 且线上可拉到 symbols.js |

**测试总数：252 项全部通过**（stats 50 / storage 34 / export 33 / render 18 / mathtext 55 / image 36 / symbols 26）。

## 阶段 3（拍照存图）已完成

| 交付 | 状态 | 验证 |
|---|---|---|
| js/image-pipeline.js（纯函数压缩：长边≤1280、JPEG 0.72→0.61→0.5） | ✅ | 15 项测试；浏览器实测 2000×1500→1280×960 |
| js/image-store.js（ImageStore：内存实现 + IndexedDB `qt-images`，存 Blob） | ✅ | 16 项测试（含降级模拟 5 项）；实测 store=indexeddb |
| js/image-view.js（全屏查看器双指缩放 / 缩略图注水 / objectURL 生命周期） | ✅ | 浏览器实测打开/关闭/注水 |
| js/ui-entry-photo.js（拍照卡：原位缩略图、重拍/删除、保存并继续清空、降级提示） | ✅ | 14 项流程实测（375×667） |
| 列表/组卷/打印页显示图片；空题干显示来源行 | ✅ | 实测第 6/7/10 项 |
| 设置页占用统计 + 含图片备份（base64，>20MB 确认）+ 导入识别 + 清空连带 | ✅ | 实测第 11–13 项；4 项隐私测试 |
| file:// 单文件冒烟（无头 Edge --headless=new + CDP） | ✅ | store=indexeddb｜blobOk=true｜dims=1280x960 |
| 重新打包 + 外部引用 0 | ✅ | 单文件 1866 KB / zip 752 KB |

**真机矩阵**：Android Chrome / iOS Safari / 微信内置浏览器 **未测**（如实标注，见 docs/阶段3完成汇报.md）。

## 阶段 1（录题效率专项）已完成

| 交付 | 状态 | 验证 |
|---|---|---|
| 配额 bug 修复（floor + 每级+1 + relaxLevel） | ✅ | n=3..20 实测全合规，独立提交 `efa6520` |
| schemaVersion 升到 3（source/entryMode/imageIds） | ✅ | 9 项迁移测试，幂等 |
| js/mathtext.js（splitMath/normalizeMath/isInsideMath/renderRich + convertSqrt） | ✅ | 55 项测试 |
| 录题页：极速模式 + 实时预览 + 三项全空拦截 | ✅ | 浏览器实测 |
| Unicode 兼容性实测脚本 tools/unicode-compat.js | ✅ | 72 无警告 + 3 有警告但渲染一致（∅√′） |
| 重新打包 + 外部引用 0 | ✅ | 单文件 1816 KB / zip 733 KB |

**测试总数：222 项全部通过**（stats 50 + storage 34 + export 29 + render 18 + mathtext 55 + image 36）。

## 一、现在能做什么（已完成）

| 功能 | 状态 | 验证方式 |
|---|---|---|
| 知识点体系（4 科共 71 个章节级知识点） | ✅ | `node tests/storage.test.js` |
| 错题录入 / 编辑 / 删除 | ✅ | 浏览器实测，刷新后数据仍在 |
| 错题列表：按科目 / 知识点 / 错因筛选 | ✅ | 浏览器实测筛选生效 |
| 薄弱点诊断：贝叶斯掌握度 + 95% 区间 | ✅ | 与手算逐项吻合（偏差 < 1e-9） |
| 诊断图表：雷达图 / 错因饼图 / 科目柱状图 | ✅ | 三张 canvas 均已绘制 |
| 智能组卷：按薄弱度加权抽题 | ✅ | 抽出不重复、知识点配额生效 |
| 在线作答 + 自评 + 回写掌握度 | ✅ | 交卷后掌握度变化与手算一致 |
| 今日复习：按遗忘曲线挑到期题 | ✅ | 3 天前的题被挑出，答对后自动退出 |
| 备份导出 / 导入 JSON | ✅ | 导出再导入可完整还原 |
| **打印友好页（存 PDF）** | ✅ | 无头 Edge 实际打印出 2 页 PDF |
| **匿名使用数据导出（JSON / CSV）** | ✅ | 29 项测试，含 8 项隐私专项 |
| **示例数据一键载入 / 清除** | ✅ | 带历史作答，能驱动完整演示 |
| **单文件 html + 离线 zip** | ✅ | `file://` 下实测两个产物均可完整使用 |
| 本地化 KaTeX（公式）+ ECharts（图表） | ✅ | 无 CDN 依赖，`file://` 直接打开可用 |

**测试总数：222 项全部通过**（stats 50 + storage 34 + export 29 + render 18 + mathtext 55 + image 36；「阶段 3」一节有明细）。

## 二、交付物（可直接发同学）

```
03-错题通/dist/
├── 错题通-单文件.html   1917 KB  ← 无密钥版（识别按钮隐藏，2026-10-24 重建）
└── 错题通-离线版.zip     773 KB  ← 解压后打开 index.html（51 文件）

带 OCR 的单文件（密钥只在本地产物，不进 git）：
node build/make-dist.js --ocr-key-file <key文件路径>
```

桌面副本：`Desktop/错题通.html` = 最新构建（2026-10-24 213ff68 重打包，无密钥 → 识别按钮隐藏，功能与 v1.2 相同）；更早的 v1.2 桌面副本已被用户移走/删除（桌面现仅存 `错题通-v1.1-备份.html`）。

重新生成：`cd 03-错题通 && node build/make-dist.js`

**发同学的话术**见 `docs/分发说明.md`。

## 三、还没做（D7）

| 待办 | 说明 |
|---|---|
| 静态部署（GitHub Pages / Vercel） | 需要用户名/仓库名，**待用户决定** |
| 反馈问卷链接 | `js/config.js` 的 `FEEDBACK_URL` 留空，**待用户提供链接** |
| 真实试用与反馈收集 | 需要同学实际用一周 |
| 界面细节打磨 | 按试用反馈再定 |

> ⚠️ D7 之后**只修 bug 不加功能**（任务书第 4 节）。

## 四、文件结构

```
03-错题通/
├── index.html              单页入口（经典脚本，不用 module）
├── css/app.css             全站样式 + @media print
├── build/make-dist.js      打包脚本（单文件 + zip；--ocr-key-file 注入密钥，仅 Node 内置模块）
├── js/                     21 个模块
│   ├── util.js             工具 + QT 命名空间 + renderRichText（公式渲染）
│   ├── config.js           FEEDBACK_URL 等可配置项
│   ├── data.js             4 科知识点、5 种错因、v1 旧数据对照
│   ├── storage.js          localStorage + 数据模型 + 迁移 + snapshot()
│   ├── sample-data.js      12 道示例题（带历史作答时间线）
│   ├── stats.js            三个统计模型（纯函数）
│   ├── export-usage.js     匿名数据导出（白名单，隐私边界）
│   ├── mathtext.js         splitMath/normalizeMath/renderRich（公式渲染纯函数）
│   ├── symbols.js          公式工具栏数据表 + insertAt（阶段 2）
│   ├── ocr.js              OCR 纯逻辑（data URL 请求体/响应解析/额度护栏，C4）
│   ├── ui-ocr.js           识别按钮/同意门/降级（C4，密钥来自 window.QT_OCR_KEY）
│   ├── image-pipeline.js   压缩纯函数 + 浏览器压缩（阶段 3）
│   ├── image-store.js      ImageStore 内存/IndexedDB 实现 + 孤儿清理（阶段 3）
│   ├── image-view.js       全屏查看器 + 缩略图注水 + objectURL 管理（阶段 3）
│   ├── ui-entry-photo.js   录题页拍照卡（阶段 3）
│   ├── ui-home.js          主页 / 今日复习 / 空库引导
│   ├── ui-entry.js         录题 / 编辑（499 行，硬上限 500）
│   ├── ui-list.js          错题本 + 筛选（含缩略图）
│   ├── ui-diag.js          诊断 + ECharts（按需加载）
│   ├── ui-quiz.js          组卷 setup/paper/result（paper 含图片）
│   ├── ui-settings.js      备份（含图片开关）/ 导出 / 示例 / 反馈
│   ├── ui-print.js         打印页（含图片）
│   └── app.js              路由 + 标签栏 + 页面生命周期 + 图片库初始化
├── lib/                    KaTeX + ECharts + 20 个 woff2 字体（1.6 MB）
├── tests/                  8 个测试文件，282 项
├── dist/                   ★ 交付物（单文件 html + 离线 zip）
└── docs/                   算法说明 / 系统设计 / 用户手册 / 测试报告 / 分发说明
```

## 五、关键数据结构

存一个 key：`qt:db`。`schemaVersion` 当前为 **2**。

```js
{
  schemaVersion: 2,
  createdAt: "ISO 字符串",

  kps: [{ id, subject, name, builtin: false }],   // 仅用户自建

  mistakes: [{
    id, subject, kpIds: [], stem, myAnswer, correctAnswer, reason,
    createdAt, updatedAt,
    isSample: true        // 仅示例数据有；导出时据此排除
  }],

  answers: [{            // 掌握度与遗忘曲线的唯一真源
    id, mistakeId, kpIds: [], correct,
    kind,                // intake | quiz | review
    note: "本次写的解法", at,
    isSample: true       // 示例题的作答，导出时排除
  }],

  events: [{ id, type, at, payload }]           // 使用记录
}
```

**三条不可动摇的设计约束**：

1. **掌握度、稳定度、复习优先级一律不落盘**，每次由 `answers` 实时计算。
   若另存一份，删除错题或改知识点后必然不一致，且无法回滚。
2. **录题即答错**：`addMistake` 同时写入一条 `kind:'intake', correct:false` 的事件。
   删除错题时按 `mistakeId` 连带删除，用户才能纠正误录。
3. **`load()` 返回内部活引用**（写入会就地修改），要比较「改前/改后」必须用 `storage.snapshot()`。

## 六、与任务书的偏离（共 7 处）

| # | 任务书原文 | 实际做法 | 理由 |
|---|---|---|---|
| 1 | 用 ES6 模块 | 经典脚本 + `window.QT` 命名空间 | `file://` 下浏览器以 CORS 拒绝加载 module，会直接毁掉「微信发 zip 打开」 |
| 2 | 数据结构里给「掌握度」一份存储 | 只存事件流，掌握度实时派生 | 双写必然不一致；删除错题后无法回滚 |
| 3 | 三科（高数/线代/概率） | 四科（数分/高代/概率/高数） | 用户本专业用华师大《数学分析》+ 北大《高等代数》；同学多为非数学专业，只给数分/高代会让他们无从下手 |
| 4 | 错因五个标签 | 保持一致 | — |
| 5 | 掌握度样本少显示「数据不足」 | 诊断页/主页遵守；**结果页显示数值 + 标「仅供参考」** | 刚做完一轮完全看不到数字会以为是 bug |
| 6 | 知识点每科 15–25 个 | 22 / 16 / 21 / 12 | 按教材章目录；高代把「多项式」拆 4 节（占比高、错法差异大） |
| 7 | 示例数据「仅用于展示与测试」 | 额外做**导出时强制排除** + 示例角标 + 一键清除 | 否则报告里的「应用情况」会掺进我编的数字，属于造假 |

## 七、已知问题与坑

| 坑 | 现象 | 处理 |
|---|---|---|
| **`esc()` 先于公式渲染** | `$x>0$` 变成 `x&gt;0`，KaTeX 不认 HTML 实体 → 整个公式退化成源码，页面显示 `y=x^{x}\ (x&gt;0)` | 改为「原文抽取公式 → 转义文本 → 填回渲染结果」；`tests/render.test.js` 锁死 |
| `QT.pages` 未初始化 | 各 `ui-*.js` 在 `app.js` 前执行，`QT.pages.home = ...` 报 undefined | 在 `util.js` 里提前建好 |
| `normalize()` 兜底版本号 | v1 数据被当成最新，迁移被跳过，科目停在废弃的 `calc` | 缺版本号一律按 0 处理 |
| 迁移只处理错题 | 自建知识点仍指向旧科目，任何下拉框都选不到 | 知识点的 `subject` 也走映射 |
| 旧知识点多对一 | 「洛必达法则」「泰勒公式」都映射到同一章，同题出现重复知识点 | 迁移后按 id 去重 |
| 首页与复习队列口径不一 | 「说有 3 个待复习、点进去是空的」 | 「待复习」只认 `buildReviewQueue` |
| `stats.js` 引用 `QT.storage` | 破坏纯函数约定，Node 测试被迫加载存储层 | 改为返回 `kpIds`，名称由 UI 解析 |
| 示例数据只有录入事件 | 诊断页全「数据不足」、雷达图画不出来，演示价值为零 | 示例题带 `history` 时间线，载入后 10 个知识点达标 |
| 首页空库只给「记录第一道错题」 | 同学打开不知道该点哪，也不知道有示例 | 空库首页加「先载入示例数据看看」按钮 |
| `load()` 返回活引用 | 持有快照后写入，快照跟着变（因此误判过一次） | 新增 `snapshot()` 深拷贝 |
| 中文路径 + 单引号影响无头 Edge | `--print-to-pdf` 报告写成功但文件不存在 | 复制到纯 ASCII 路径再跑 |
| 浏览器缓存 HTML | 改了 `index.html` 加脚本，页面仍加载旧的 | 用 `?v=N` 查询参数绕过 |
| 单文件里 `</script>` 提前闭合 | 内联 JS 若有该字符串会截断 | 打包时转义为 `<\/script` |
| **`openKeyCursor` 的 key 语义** | 在对象存储上开游标 key=主键，在索引上 key=索引键 | 阶段 3 `listQidPairs` 第一版 qid 全 undefined（孤儿清理会误删全部），必须走 `qid` 索引 |
| **Windows 无头 Edge stdout 被丢弃** | `--dump-dom > 文件` 得到 0 字节（GUI 子系统） | 走 CDP：`--remote-debugging-port` + Node 内置 WebSocket 读 `Runtime.evaluate` |
| **无头 Edge 旧模式丢 URL** | `--headless` 打开的是 Edge 同步欢迎页，不是命令行里的 file:// | 必须用 `--headless=new`（与 `--user-data-dir` 叠加使用） |
| **git 身份未配置** | commit 报 `unable to auto-detect email` | 仓库 local 配置 `user.name=Reasonix / user.email=noreply@local`（与历史提交一致） |

## 八、下一步（OCR 已 Go 并集成，按时间表推进）

1. **10-24**：✅ OCR 验证 Go + C4 集成（见上节）。
2. **10-25**：用户 ①`node build/make-dist.js --ocr-key-file <key文件>` 出识别版单文件，**真机点一次「识别文字」**确认端到端 ②补 4 张手写照片（探针即可）③发同学试用（发 v1.2 还是识别版自定；识别版含密钥，安全模型见 `docs/识别尝试记录.md` 第五节）。
3. **10-25 ~ 10-26**：真机矩阵 3 格补测（Android Chrome / iOS Safari / 微信内置浏览器），含识别按钮。
4. **10-27 晚**：OCR 时间盒冻结；真机过审则打 tag `v1.3`。
5. **10-29 起功能冻结，只修 bug**。选做 G/H/I 已裁定不做。
