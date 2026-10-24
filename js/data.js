/**
 * data.js —— 静态数据：科目、预置知识点、错因标签
 *
 * 说明：
 * - 这里只放「不会因用户操作而变」的数据。用户自建的知识点存在 localStorage。
 * - 知识点 id 由「科目 + 章节序号」生成，**序号一旦发布就不要调整**，
 *   否则已有错题会指向不存在的知识点。改名字请只改 name。
 * - 科目覆盖两套教材体系：
 *   ① 数学类专业：华师大《数学分析》+ 北大《高等代数》（用户本专业用书）
 *   ② 非数学类专业：同济《高等数学》+ 浙大《概率论与数理统计》
 *   任务书原定「三科」，此处扩为四科：用户要把链接发给同学试用，
 *   同学多数不是数学专业，只给数分/高代会让工具对他们无法使用。
 *   成本仅是一个数组，不影响任何界面结构。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  /** 科目：id 稳定，name 可改。 */
  var SUBJECTS = [
    { id: 'matan', name: '数学分析' },
    { id: 'alglinalg', name: '高等代数' },
    { id: 'prob', name: '概率论与数理统计' },
    { id: 'gaoshu', name: '高等数学' }
  ];

  /**
   * 预置知识点（章节级）。
   * 前两科按用户本专业教材目录编排；后两科按国内最通用的教材编排。
   */
  var PRESET_KPS = {
    // 华师大《数学分析》（第五版，上、下册）章目录
    matan: [
      '实数集与函数',
      '数列极限',
      '函数极限',
      '函数的连续性',
      '导数和微分',
      '微分中值定理及其应用',
      '实数的完备性',
      '不定积分',
      '定积分',
      '定积分的应用',
      '反常积分',
      '数项级数',
      '函数列与函数项级数',
      '幂级数',
      '傅里叶级数',
      '多元函数的极限与连续',
      '多元函数微分学',
      '隐函数定理及其应用',
      '含参量积分',
      '曲线积分',
      '重积分',
      '曲面积分'
    ],

    // 北大数学系前代数小组《高等代数》（第五版）：章目录 + 多项式一章细分
    // 多项式在试卷里占比高、错法差异大，合在一章会让诊断失去分辨力，故拆成 4 个
    alglinalg: [
      '整除与最大公因式',
      '因式分解定理',
      '重因式与多项式函数',
      '有理系数多项式',
      '行列式',
      '线性方程组',
      '矩阵运算',
      '矩阵的秩与逆矩阵',
      '分块矩阵',
      '二次型与合同变换',
      '正定二次型',
      '线性空间',
      '线性变换',
      '特征值与特征向量',
      '对角化与若尔当标准形',
      '欧几里得空间'
    ],

    // 浙大《概率论与数理统计》（第四版）
    prob: [
      '随机事件与概率',
      '等可能概型',
      '条件概率',
      '全概率公式与贝叶斯公式',
      '事件的独立性',
      '随机变量',
      '离散型分布',
      '连续型分布',
      '分布函数',
      '二维随机变量',
      '边缘分布与条件分布',
      '随机变量函数的分布',
      '数学期望',
      '方差与标准差',
      '协方差与相关系数',
      '大数定律',
      '中心极限定理',
      '样本与抽样分布',
      '参数估计',
      '假设检验',
      '方差分析与回归'
    ],

    // 同济《高等数学》（第七版）
    gaoshu: [
      '函数与极限',
      '导数与微分',
      '微分中值定理与导数应用',
      '不定积分',
      '定积分',
      '定积分的应用',
      '微分方程',
      '向量代数与空间解析几何',
      '多元函数微分法及其应用',
      '重积分',
      '曲线积分与曲面积分',
      '无穷级数'
    ]
  };

  /**
   * 错因标签。id 用于统计，name 用于显示。
   * 顺序即界面显示顺序，改动会影响统计口径的可读性，尽量不要增删。
   */
  var REASONS = [
    { id: 'concept', name: '概念不清' },
    { id: 'calc', name: '计算失误' },
    { id: 'formula', name: '公式记错' },
    { id: 'reading', name: '审题错误' },
    { id: 'method', name: '思路不会' }
  ];

  /**
   * v1 → v2 迁移用的旧知识点名表。
   * v1 只有三科（calc/linalg/prob），其中 linalg 的 16 个名字里
   * 「向量组的线性相关性」等在 v2 的 alglinalg 中没有同名项，故映射表只列能对上的。
   * 迁移策略见 storage.js：先按名字找新体系里的同名知识点，找不到就保留原 id。
   */
  var LEGACY_KPS = {
    calc: [
      '函数与极限', '无穷小与连续', '导数与微分', '微分中值定理', '洛必达法则',
      '泰勒公式', '不定积分', '定积分', '定积分的应用', '反常积分', '微分方程',
      '向量代数与空间解析几何', '多元函数微分学', '多元函数极值', '二重积分',
      '三重积分', '曲线积分', '曲面积分', '无穷级数', '傅里叶级数'
    ],
    linalg: [
      '行列式', '矩阵运算', '逆矩阵', '分块矩阵', '矩阵的秩', '初等变换',
      '向量组的线性相关性', '向量空间', '线性方程组解的结构', '特征值与特征向量',
      '相似矩阵与对角化', '实对称矩阵', '二次型', '正定二次型', '施密特正交化', '内积与正交性'
    ],
    prob: [
      '随机事件与概率', '条件概率', '全概率公式', '贝叶斯公式', '事件的独立性',
      '随机变量及其分布', '分布函数', '离散型随机变量', '连续型随机变量', '常见分布',
      '二维随机变量', '边缘分布', '条件分布', '随机变量函数的分布', '数学期望',
      '方差与标准差', '协方差与相关系数', '大数定律', '中心极限定理', '样本与统计量',
      '参数估计', '假设检验'
    ]
  };

  /** 旧科目 id → 新科目 id。linalg 归入高等代数，calc 归入高等数学。 */
  var LEGACY_SUBJECT_MAP = {
    calc: 'gaoshu',
    linalg: 'alglinalg',
    prob: 'prob'
  };

  /** 把预置知识点展开成 {id, subject, name, builtin} 列表。 */
  function presetKnowledgePoints() {
    var out = [];
    SUBJECTS.forEach(function (s) {
      (PRESET_KPS[s.id] || []).forEach(function (name, i) {
        out.push({
          id: 'kp_' + s.id + '_' + i,
          subject: s.id,
          name: name,
          builtin: true
        });
      });
    });
    return out;
  }

  /** 科目 id → 名称；未知科目返回 id 本身，避免界面出现 undefined。 */
  function subjectName(id) {
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (SUBJECTS[i].id === id) return SUBJECTS[i].name;
    }
    return id || '未分类';
  }

  /** 错因 id → 名称。 */
  function reasonName(id) {
    for (var i = 0; i < REASONS.length; i++) {
      if (REASONS[i].id === id) return REASONS[i].name;
    }
    return '未标注';
  }

  /** 按 (科目, 名字) 找预置知识点，供迁移使用。 */
  function findPreset(subject, name) {
    var list = presetKnowledgePoints();
    for (var i = 0; i < list.length; i++) {
      if (list[i].subject === subject && list[i].name === name) return list[i];
    }
    return null;
  }

  QT.data = {
    SUBJECTS: SUBJECTS,
    REASONS: REASONS,
    LEGACY_KPS: LEGACY_KPS,
    LEGACY_SUBJECT_MAP: LEGACY_SUBJECT_MAP,
    presetKnowledgePoints: presetKnowledgePoints,
    subjectName: subjectName,
    reasonName: reasonName,
    findPreset: findPreset
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
