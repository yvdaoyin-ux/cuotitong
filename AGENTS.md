# 错题通 · 项目硬规矩（`Desktop\挑战杯\03-错题通\`）

> 项目级 `AGENTS.md`，**优先级高于桌面 `REASONIX.md` 和 `挑战杯\AGENTS.md`**。
> 任何 AI 工具（Reasonix / ZCode / WorkBuddy）在本目录开工前，先读本文件 + `PROJECT_STATE.md`。

---

## 一、当前状态（2026-10-24 实测，非文档估算）

| 项 | 值 |
|---|---|
| 仓库 | `github.com/yvdaoyin-ux/cuotitong`，HEAD `9036b8c`（v1.1），0 未提交；回滚点 tag `backup-20261024-before-phase3` |
| 线上 | https://yvdaoyin-ux.github.io/cuotitong/ **已同步 v1.1**（curl 200 + 线上可拉到 symbols.js 实测） |
| 测试 | **252 项全绿**（`node --test tests/*.test.js`：stats 50 / storage 34 / export 33 / render 18 / mathtext 55 / image 36 / symbols 26） |
| 阶段 | 第二份任务书**全部四阶段完成**（1 输入基础设施 / 2 公式工具栏 / 3 拍照存图 / 4 埋点·基准·文档·发布），tag `v1.1` |

**参赛作品全名**：错题通——基于贝叶斯估计与遗忘曲线的薄弱点诊断与智能组卷系统

**下一件事**：①真机补测三格「未测」（Android/iOS/微信）②发单文件收真实反馈（埋点已就位）③等用户给问卷链接。**D7 后只修 bug 不加功能**；选做 G/H/I 需用户确认。

## 二、开工前必读（按顺序）

1. **`PROJECT_STATE.md`** —— 当前状态、已完成功能、数据结构、坑表（最该先读）
2. **`docs/阶段3完成汇报.md`** —— 阶段 3 做了什么、怎么验证、对任务书的 6 处调整、待决问题
3. **`docs/阶段1完成汇报.md`** —— 阶段 1 做了什么、怎么验证、Claude 的四处更正与裁定
4. **`docs/致Claude的核验请求.md`** —— 7 处偏离任务书的裁定记录
5. 桌面 `progress/CURRENT.md` —— 全局状态（含其他项目）

## 三、三条不可违反的铁律

1. **文档会腐坏，代码不会**：动手前用命令实测（`git log -1`、`node --test tests/*.test.js`、`grep -c 'src="http' dist/*.html`），别信文档里的数字。
2. **收尾必写文件**（不是只在聊天里说）：
   - 改 `REASONIX.md`（桌面）的「零、当前快照」8 行
   - 改桌面 `progress/CURRENT.md` 对应段
   - 给桌面 `progress/LOG.md` 追加一行 `YYYY-MM-DD | 项目 | 做了什么 | 怎么验证的`
   - 本文件 `AGENTS.md` 只有动了规矩/结构才改
3. **不写"应该没问题"**；不确定就标「未验证」。**密钥不落盘**。

## 四、阶段 3（拍照存图）的关键约束（已完成，保留供阶段 4 参考）

- ~~极速模式下照片是首选路径~~ ✅ 已实现（`ui-entry-photo.js`，拍完原位缩略图，点按重拍/删除）。
- ~~「保存并继续」之后照片清空~~ ✅ 已实现。
- **真机矩阵（Android Chrome / iOS Safari / 微信内置浏览器 / 单文件 html）仍是 3 格「未测」，不允许猜**，阶段 4 前需真机补测。
- 压缩逻辑（长边 ≤1280px、JPEG 0.72→0.5）、`ImageStore` 内存实现、降级测试 ✅ 均按任务书第 3 节实现（6 处适度调整见 `docs/阶段3完成汇报.md` 第三节）。
- **数据只增不改**：`schemaVersion` 已是 3，字段 `source`/`entryMode`/`imageIds` 已就位；图片存 IndexedDB（`qt-images`），**不放 localStorage**。✅
- 新增文件每个 ≤400 行（本次最大 340）；阶段 2 的工具栏将来写在 `ui-toolbar.js`，`ui-entry.js` 保持 ≤500 行（当前 499）。
- 界面文字 ≥14px、可点区域 ≥40px。✅（新增 CSS 已遵守）

## 五、环境坑（跨会话已踩过）

- **PowerShell 有 GBK 乱码** → 一律用 bash。
- **用户目录含单引号** `C:\Users\fa'r` → 路径一律双引号包好。
- **git push 直连偶发超时**（curl 能通但 git 连不上）→ 用 `HTTPS_PROXY=http://127.0.0.1:7890 git push`（单条命令内临时，用完回直连，**不写持久配置**）。
- **无头 Edge `--print-to-pdf` 必须加 `--user-data-dir`**，页数读 PDF `/Count`。
- **`file://` 下不能用 ES6 module**（CORS 拦）→ 本项目用经典脚本 + `window.QT` 命名空间，加载顺序靠 `index.html` 里的 `<script>` 顺序。
- **浏览器 `file://` 测试要加 `?v=时间戳` 绕过缓存**，否则改了代码页面还是旧的。

## 六、验证命令

```bash
cd "C:/Users/fa'r/Desktop/挑战杯/03-错题通"

# 全部测试（无需 npm install）
node --test tests/stats.test.js tests/storage.test.js tests/export.test.js tests/render.test.js tests/mathtext.test.js

# 语法检查
for f in js/*.js; do node --check "$f" || echo "FAIL $f"; done

# 打包（改完代码必须重新打包，发同学的文件在 dist/）
node build/make-dist.js

# 单文件外部引用必须为 0
grep -c 'src="http\|href="http' dist/错题通-单文件.html

# Unicode 兼容性实测
node tools/unicode-compat.js
```

## 七、文件结构速览

```
03-错题通/
├── index.html          单页入口（经典脚本，不用 module）
├── css/app.css         样式（含 @media print、录题预览区）
├── js/
│   ├── util.js         renderRichText（委托 mathtext）
│   ├── mathtext.js     公式规范化/渲染/√转换（纯函数）
│   ├── config.js       FEEDBACK_URL 等
│   ├── data.js         4 科知识点 + 错因
│   ├── storage.js      localStorage + schema v3 迁移
│   ├── sample-data.js  示例数据（isSample）
│   ├── stats.js        三个统计模型（纯函数）
│   ├── export-usage.js 匿名导出（白名单）
│   └── ui-*.js         各页面（entry 是录题页，刚改过）
├── lib/                KaTeX + ECharts + 20 woff2 字体
├── tests/              5 个测试文件，186 项
├── tools/              unicode-compat.js 等
├── build/              make-dist.js、set-feedback.js
├── dist/               ★ 交付物（单文件 html + 离线 zip）
└── docs/               算法/系统设计/用户手册/测试报告/分发/汇报
```
