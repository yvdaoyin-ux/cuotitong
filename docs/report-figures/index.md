# 研究报告图表素材索引（F1–F10）

> 第五份任务书 3.7。每图附来源与生成命令。**性质声明**：F2/F3/F4/F5 为「模型性质演示与确定性脚本验证」，不是实验结论；F7/F10 只能来自用户实测。

| 编号 | 内容 | 文件 | 来源 / 生成命令 |
|---|---|---|---|
| **F1** | 系统结构图（输入→规范化→存储→统计模型→诊断/组卷/复习） | `F1-architecture.svg` | 手绘 SVG（依据 `docs/系统设计说明.md`） |
| **F2** | 遗忘曲线 R(t)=e^(−t/S)，S∈{1,3,7,14} 天 | `F2-forgetting-curve.svg/.csv` | `node tools/report-figures.js`（公式计算，性质演示） |
| **F3** | 全答对时 Beta 后验均值与 95% 可信区间（n=0…20，标 minSamples=5） | `F3-beta-posterior.svg/.csv` | 同上（不完全贝塔函数分位数，二分 80 次；性质演示） |
| **F4** | 组卷单一知识点最大占比 vs 40% 名义上限（n=3…20，固定种子 200 次/档） | `F4-quiz-share.svg/.csv` | 同上（种子 20261025+n；确定性脚本验证） |
| **F5** | 权重 w=0.2…0.95 的知识点被抽中频次（10000 轮 × 4 题，固定种子） | `F5-weight-vs-picked.svg/.csv` | 同上（轮盘无放回，与 stats.js 同口径） |
| **F6** | 录入按键次数：手打 LaTeX vs 工具栏（5 题） | `F6-benchmark.txt` | `node tools/keystroke-benchmark.js > docs/report-figures/F6-benchmark.txt` |
| **F7** | 识别结果：逐张耗时、tokens、CER | **待用户数据** | 重测后：`node tools/ocr-cer.js 识别N.txt 修正N.txt`，结果填 `docs/识别尝试记录.md` |
| **F8** | 界面外观图 ×7（主页/极速录题/带照片/公式工具栏/诊断/组卷/设置） | `F8-*.png` | 无头 Edge + Emulation 375×740@2x（示例数据下截取，含「示例」角标）；生成脚本 `tools/u1/u2/u3-screenshots.js` |
| **F9** | 自动化测试汇总表 | `F9-tests.txt` | `for f in tests/*.test.js; do node "$f"; done`（11 套件 318 项，2026-10-25 实测；冻结日需重测） |
| **F10** | 试用数据：录入耗时对比 | **只能由用户提供** | 同学「导出使用数据 JSON」回收后生成；没有就不放进报告 |

F1：见 `F1-architecture.svg`。

## 提示

- 报告正文引用图表时，F2/F3 务必写「模型性质」而非「实验证明」；F4/F5 可写「确定性脚本验证」；
- F6 的口径（手打=每字符 1 键+LaTeX 符号每处再 +1）在 `docs/录入效率说明.md` 有完整说明，报告中照搬该口径；
- 试用数据回收后：F10 由 ZCode 生成，同时把人数/结论填进申报书第 5 栏【待补】。
