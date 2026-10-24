# PROJECT_STATE —— 错题通

> **参赛作品全名**：错题通——基于贝叶斯估计与遗忘曲线的薄弱点诊断与智能组卷系统
>
> **每个阶段开始前先读本文件，结束后更新它。** 这是跨会话的长期记忆，不依赖对话上下文。
> 最后更新：2026-10-24（**v1.2 发布（Claude 第三份任务书 A 部分）+ B/C 部分就绪，等用户实测 OCR**）

---

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
├── 错题通-单文件.html   1903 KB  ← 单个文件，双击/微信直接打开（v1.2，2026-10-24 实测）
└── 错题通-离线版.zip     766 KB  ← 解压后打开 index.html（49 文件）
```

桌面副本：`Desktop/错题通.html` 已是 v1.2；旧版留作 `Desktop/错题通-v1.1-备份.html`。

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
├── build/make-dist.js      打包脚本（单文件 + zip，仅用 Node 内置模块）
├── js/                     19 个模块
│   ├── util.js             工具 + QT 命名空间 + renderRichText（公式渲染）
│   ├── config.js           FEEDBACK_URL 等可配置项
│   ├── data.js             4 科知识点、5 种错因、v1 旧数据对照
│   ├── storage.js          localStorage + 数据模型 + 迁移 + snapshot()
│   ├── sample-data.js      12 道示例题（带历史作答时间线）
│   ├── stats.js            三个统计模型（纯函数）
│   ├── export-usage.js     匿名数据导出（白名单，隐私边界）
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
├── tests/                  6 个测试文件，222 项
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

## 八、下一步（v1.2 已发布，按第三份任务书时间表）

1. **今天（10-24）**：✅ A/B/C 就绪，v1.2 上线。
2. **10-25 起**：用户把 `Desktop/错题通.html`（v1.2）发同学开始试用（**试用不等 OCR**），附 `docs/真机自测清单.md` 勾选卡。
3. **10-25 ~ 10-26**：C1–C3 OCR 验证——**需要用户提供：智谱 API Key + 10 张真实错题照片（5 印刷 5 手写）**；探针 `tools/ocr-probe.html` 本地打开即测；判据已写死在 `docs/识别尝试记录.md`。
4. **10-27 ~ 10-28**：仅当 Go 才做 C4 集成；No-Go 则整理记录回试用修 bug。时间盒 10-27 晚冻结。
5. **10-29 起功能冻结，只修 bug**。选做 G/H/I 已裁定不做。
