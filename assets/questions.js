/**
 * 问卷题目定义 —— 严格对应《荆门儿童AI创意体验｜家长需求调研表》打印版
 * 家长填写页与管理后台共用这一份定义，保证统计口径一致。
 */
window.SURVEY = (function () {
  'use strict';

  const SECTIONS = [
    { id: 's1', title: '一、孩子与家庭情况' },
    { id: 's2', title: '二、学习需求与关注点' },
    { id: 's3', title: '三、体验形式与付费意愿' },
    { id: 's4', title: '四、开放建议' }
  ];

  // type: single 单选 | multi 多选（max 限制最多可选几项） | text 开放题
  const QUESTIONS = [
    {
      id: 'q01', section: 's1', no: '01', type: 'single',
      label: '孩子年龄',
      options: ['3–4岁', '5–6岁', '7–8岁', '9–10岁', '11–12岁', '其他']
    },
    {
      id: 'q02', section: 's1', no: '02', type: 'single',
      label: '家庭主要居住区域',
      options: ['东宝城区', '掇刀城区', '漳河新区', '钟祥', '京山', '沙洋', '其他']
    },
    {
      id: 'q03', section: 's1', no: '03', type: 'single',
      label: '孩子目前接触AI的程度',
      options: ['经常使用', '偶尔体验', '听说过但未体验', '不了解']
    },
    {
      id: 'q04', section: 's1', no: '04', type: 'multi',
      label: '孩子正在参加哪些课外活动？',
      options: ['绘画/手工', '体育/舞蹈', '阅读/语言', '编程/机器人', '托管/自习', '暂无', '其他']
    },
    {
      id: 'q05', section: 's2', no: '05', type: 'multi', max: 3,
      label: '最希望孩子提升哪些能力？',
      suffix: '（最多选3项）',
      options: ['创造力', '表达与沟通', '逻辑思维', '主动探索', '专注与耐心', '合作能力', '数字素养']
    },
    {
      id: 'q06', section: 's2', no: '06', type: 'multi', max: 2,
      label: '最感兴趣的AI创意体验内容是？',
      suffix: '（最多选2项）',
      options: ['原创故事/绘本', '设计3D角色', '制作互动游戏', 'AI语音故事', '动手制作+AI创作', '亲子共创']
    },
    {
      id: 'q07', section: 's2', no: '07', type: 'multi', max: 3,
      label: '您最大的顾虑是什么？',
      suffix: '（最多选3项）',
      options: ['屏幕时间过长', '隐私安全', '过度娱乐化', '效果不明显', '费用偏高', '年龄不适合', '师资质量']
    },
    {
      id: 'q08', section: 's2', no: '08', type: 'multi', max: 2,
      label: '什么成果最能让您认为体验有价值？',
      suffix: '（最多选2项）',
      options: ['带回原创作品', '孩子能讲述创作过程', '老师反馈成长观察', '孩子主动继续探索', '亲子共同完成作品']
    },
    {
      id: 'q09', section: 's3', no: '09', type: 'single',
      label: '如果有一次合适的体验活动，您的态度是？',
      options: ['愿参加免费体验', '可接受19.9元体验', '想先看介绍', '暂不考虑']
    },
    {
      id: 'q10', section: 's3', no: '10', type: 'single',
      label: '45–60分钟单次体验，您可接受的价格是？',
      options: ['39元及以下', '40–69元', '70–99元', '100–149元', '150元及以上', '暂不付费']
    },
    {
      id: 'q11', section: 's3', no: '11', type: 'single',
      label: '您更愿意哪种参与频率？',
      options: ['每周1次', '每两周1次', '每月1次', '寒暑假集中体验', '仅偶尔参加']
    },
    {
      id: 'q12', section: 's3', no: '12', type: 'single',
      label: '您希望活动在哪个区域开展？',
      options: ['东宝城区', '掇刀城区', '漳河新区/西山林语周边', '学校附近', '地点不限']
    },
    {
      id: 'q13', section: 's3', no: '13', type: 'single',
      label: '体验满意后，您会考虑购买系列课程或活动吗？',
      options: ['考虑4次体验包', '考虑8次体验包', '只愿单次购买', '暂不确定', '不会购买']
    },
    {
      id: 'q14', section: 's4', no: '14', type: 'text',
      label: '您最想让孩子创作什么？还有哪些建议？',
      placeholder: '例如：想让孩子做一本会自己讲故事的小绘本……（选填，可以不写）'
    }
  ];

  // 数据库列名（与云端表结构一一对应）
  const COLUMNS = {
    q01: 'child_age',
    q02: 'living_area',
    q03: 'ai_exposure',
    q04: 'current_activities',
    q05: 'want_ability',
    q06: 'interest_content',
    q07: 'main_concern',
    q08: 'value_judge',
    q09: 'attitude',
    q10: 'price_accept',
    q11: 'join_frequency',
    q12: 'hope_place',
    q13: 'series_intent',
    q14: 'open_suggestion'
  };

  // 多选题在库里用全角竖线分隔，导出时保持一致
  const MULTI_IDS = QUESTIONS.filter(q => q.type === 'multi').map(q => q.id);
  const SINGLE_IDS = QUESTIONS.filter(q => q.type === 'single').map(q => q.id);
  const REQUIRED_IDS = QUESTIONS.filter(q => q.type !== 'text').map(q => q.id);

  const TABLE = 'survey_responses';

  return { SECTIONS, QUESTIONS, COLUMNS, MULTI_IDS, SINGLE_IDS, REQUIRED_IDS, TABLE };
})();