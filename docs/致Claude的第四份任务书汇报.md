# 致 Claude 的汇报：第四份任务书（识别收口与优化）——做了什么 / 怎么验证 / 需要你决定什么

> 基线 `213ff68` → 证据提交 `19eb927`（问题 1 实测截图）→ 实现 `8eae829`。冻结日 10-29 不变，本轮当日完成。
> 涉及文件 19 个（+884/−63），测试 **282 → 306 项**。

## 〇、一段话

你列的两个问题都属实并已修：问题 1（极速模式识别结果落在隐藏折叠区）375×667 实测坐实后，A1 用「自动展开折叠区 + 题干 scrollIntoView 居中」修复；问题 2（重复识别重复追加）改为题干非空时页面内弹层三选一（追加/覆盖/取消，不用 confirm）。实测中还**抓到你没列的第三个问题**：`.btn{display:inline-flex}` 压过 UA 的 `[hidden]{display:none}`，导致**无密钥版（线上/zip）识别按钮可见可点**——按用户拍板用全局 `[hidden]{display:none!important}` 修复（即你方案里的选项一）。A/B/C 三部分全部实现：A3 旋转 90°（纯函数 + 管线重压缩）、B1 探针三档长边对比（主应用零改动）、B2 清单补项、B3 识别埋点（载荷只有计数，CSV 13→18 列）、B4 密钥轮换说明、C 口令解锁（WebCrypto 全套规格 + CLI + 三态按钮）。306 项测试全绿，真 375 视口无头冒烟 12/12，假 key 端到端验证 encrypt-key 无泄漏。

## 一、做了什么（关键决策与偏离）

1. **A0（新问题，先于 A1/A2）**：证据见 `docs/ocr-验证-问题1-极速模式插入后.png`——同截图里无密钥版按钮赫然可见。修复 = 全局 `[hidden]{display:none!important}` + ui-ocr 内联 `style.display='none'` 双保险。**自纠**：我上一轮冒烟只验 `.hidden` 属性没验视觉（`hidden===true` 但 display 被 CSS 覆盖），属测试盲区，本轮起冒烟一律量 `getBoundingClientRect`。
2. **验收口径修正**：无头 Edge 有 ~500px 最小窗宽，`--window-size=375` 实得 504px 视口——**此前各轮「375×667 截图」实为 504 口径，如实更正**。本轮起用 `Emulation.setDeviceMetricsOverride` 强制真 375×667（A1 验收数据：题干 rect 323×88、top 289 居中可视、scrollW=375 无横向溢出）。
3. **A1**：识别成功后 `#toggle-detail.click()` 复用 ui-entry 的展开逻辑（含按钮文案切换），`scrollIntoView({block:'center',behavior:'smooth'})` 滚动定位；`applyRecognition` 暴露在 `QT.uiOcr` 上，让无头冒烟不联网也能走 A1/A2 全流程。
4. **A2**：弹层三选一（追加 / 覆盖 / 取消）；取消 = 题干一字不动；空题干不弹。额度计数在成功时已记（服务器已消耗），与用户放置选择解耦。
5. **A3**：`computeRotatedSize` 纯函数 + `rotateBlob`（canvas 顺时针 90°、白底、重走 0.72→0.5 阶梯 ≤200KB）；新拍图原地替换 blob（同一 id），已入库旧图按你指定的「删除旧图要点保存生效」同一规则：旧 id 进 removed、旋转结果作为新图顶替位置。入口在缩略图全屏查看器操作列表（与重拍/删除并列）。
6. **B1**：`compressFile` 本就支持 `opts.maxEdge`——探针加下拉零改主应用；对比判据按你写死的不动。**三档对比实验本身要用户跑**（同一批 3 张照片各档各识别一次），工具已备好。
7. **B3**：`entry_save` 载荷 +`ocrUsed/ocrClicks/ocrOkCount/ocrMsTotal/ocrChars`（clicks 含被额度拦下的点击，反映需求强度；chars 只记字数）；事件 CSV 13→18 列；`ui-ocr.metrics()/resetMetrics()`，entry-metrics 在 opened() 归零、saved() 取走——**ui-entry.js 499 行未动**。隐私兜底测试：把识别原文直接塞进 payload，白名单必须把它挡在 JSON/CSV 之外（已测）。
8. **B4**：`docs/密钥轮换说明.md`——换密钥四步、赛后（11-04 后）控制台停用、口令版三条如实限制。
9. **C**：`js/ocr-unlock.js`（encryptVault/decryptVault 纯逻辑，PBKDF2-SHA256 **200000** 次 + 16B 盐 + AES-GCM-256 + 12B IV，密文包 `{v:1,salt,iv,ct}` base64；浏览器/Node 共用 subtle，缺失时明确报错）＋ `build/encrypt-key.js`（口令走环境变量或**不回显交互输入**，绝不进 argv；写出前自查「密文包搜不到明文密钥任何 8 连续字符 + 整体 base64 形态」）＋ `js/ocr-vault.js` 占位（`QT_OCR_VAULT=null` 已提交，用户跑脚本后被真实密文覆盖并提交，线上版才有解锁入口）＋ ui-ocr 三态按钮：识别（注入 key）/ 🔑 解锁识别（有密文包且 subtle 可用）/ 隐藏（都无）。解锁后密钥存本机 `qt:ocrKey`，注入版优先，任务书 3.3 全部规格照办。

## 二、怎么验证

- **测试对账：预期 306 项 = 实际 306 项全绿**（stats 50 / storage 34 / export 34 / render 18 / mathtext 55 / image 36 / symbols 31 / ocr 25 / **rotate 9** / **ocr-unlock 14**）。
- **旧断言改动（单列，共 2 处，均在 export.test.js，均为 B3 加列的连带更新）**：
  1. 「CSV 含逗号时加引号」表头断言：13 列 → 18 列；
  2. 「CSV 的答错数由 total-correct-skipped 推出」：quiz 行尾匹配 `,5,3,1,,,,,,,` → `/,5,3,1,{12}$/`（旧事件 7+5=12 列留空）。
- **真 375×667 无头冒烟 12/12**：A0 视觉隐藏（display=none rect=0×0）、A1 自动展开且题干可见 + KaTeX 渲染 + 无横向溢出、A2 三选一覆盖/追加/取消三路全验、B3 metrics 挂点、C 占位 vault 无解锁入口、0 未捕获异常。验收截图：`docs/ocr-A1-验收-极速模式识别后题干可见.png`、`docs/ocr-A2-验收-三选一弹层.png`。
- **encrypt-key 假 key 端到端**：生成 141 字符密文 → 同口令解出原文一致 → 密文文件搜不到明文 key 与口令 → 临时文件即删。
- **行数**：新增文件最大 ocr-unlock 105；`ui-entry-photo.js` 406（400 行红线按规矩约束的是新增文件，修改文件如实报告）；`ui-entry.js` 499 未动。
- **没测的（如实）**：①rotateBlob 真机旋转效果（canvas 方向/缩略图）——图像路径未进无头冒烟，由自测清单 5.6 真机勾选；②线上 https 下 `crypto.subtle` 与真机解锁（你 3.5 列的三浏览器）——要等用户生成密文包并推送后才可测；③识别真实网络链路（沿袭缺口，待用户真 key 真机点一次）。

## 三、需要你决定 / 知晓

1. **判据 #4 额度口径**（上轮遗留）：真实通用包 1,986,977 tokens → 600 张最坏口径 68% 超出 50% 线、实际试用方案 3–9% 安全。已在 `docs/识别尝试记录.md` 如实双口径记录，等你定：维持「按实际口径评估」还是按字面改判。
2. **B1 三档对比**由用户执行（10-27 冻结前），结果决定主应用长边是否改 1600/1920。
3. **C 部分上线前用户步骤**：`node build/encrypt-key.js <key文件>`（自设 ≥16 位随机口令，我不经手）→ 提交覆盖后的 `js/ocr-vault.js` → 推送 → 按你 3.5 清单真机验证解锁。口令私下发同学，不进任何文件。
4. **v1.3 tag**：建议等真机矩阵（含解锁与旋转）过审再打；10-27 晚冻结线不变。

## 四、时间表

10-24 ✅ A/B/C 实现与验证（本轮）；10-25~26 用户真机（识别端到端 + 解锁 + 旋转）与 B1 三档实验；10-27 晚冻结、视情打 v1.3；10-29 起只修 bug；11-03 院赛。
