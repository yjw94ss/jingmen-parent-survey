/**
 * 数据访问层
 *
 * 两种模式：
 *  1. 已接入云端数据库 → 提交直接入库，家长无需任何操作
 *  2. 未接入（当前状态）→ 家长提交后生��一段「结果码/结果文件」发给你，
 *     你在后台粘贴或上传，后台导入后自动汇总统计
 *
 * 配置来源：Cloud 配置对象（publicConfig），字段与 publicConfig 一一对应。
 */
window.CloudStore = (function () {
  'use strict';

  const S = window.SURVEY;

  // ---- Cloud 配置（由云服务开通后拿到的 publicConfig 写入）----
  // endpoint / publishableKey 必填；oauthRelayBaseUrl 供将来可能加的微信扫码登录用。
  const config = {
    enabled: true,
    endpoint: 'https://parent-survey-54870.app.workbuddy.host',
    publishableKey: 'wbpk_pYngnP01LSk9VBiskZFeuU_d5L3rqe8ADIR8WAbdHfJcKfSTB7KE45r',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    resourceId: 'wbcs_toRn9KpoF6d06LPNrn03tj'
  };

  const LS_KEY = 'jm_survey_collected';   // 后台已收集到的答卷
  const LS_DONE = 'jm_survey_submitted';  // 家长端提交标记

  let memoryRows = [];
  let client = null;
  let initPromise = null;

  function isReady() {
    return !!(config.enabled && config.endpoint && config.publishableKey);
  }

  async function getClient() {
    if (!isReady()) throw new Error('NOT_READY');
    if (client) return client;
    if (!initPromise) {
      initPromise = new Promise((resolve, reject) => {
        if (typeof window.WorkBuddyCloud === 'undefined') {
          reject(new Error('SDK_MISSING'));
          return;
        }
        try {
          client = window.WorkBuddyCloud.createWorkBuddyCloud({
            endpoint: config.endpoint,
            oauthRelayBaseUrl: config.oauthRelayBaseUrl,
            publishableKey: config.publishableKey
          });
          resolve(client);
        } catch (e) {
          reject(e);
        }
      });
    }
    return initPromise;
  }

  function toRow(answers) {
    const row = {};
    Object.keys(S.COLUMNS).forEach(qid => {
      const col = S.COLUMNS[qid];
      const q = S.QUESTIONS.find(x => x.id === qid);
      const v = answers[qid];
      row[col] = q.type === 'multi'
        ? (Array.isArray(v) ? v.join('｜') : '')
        : (typeof v === 'string' ? v : '');
    });
    return row;
  }

  function fromRow(row) {
    const answers = {};
    S.QUESTIONS.forEach(q => {
      const raw = row[S.COLUMNS[q.id]];
      answers[q.id] = q.type === 'multi'
        ? String(raw || '').split('｜').filter(Boolean)
        : String(raw || '');
    });
    return answers;
  }

  /** 保存一份答卷（云端模式直写入库） */
  async function submit(answers) {
    const row = toRow(answers);
    if (isReady()) {
      const cloud = await getClient();
      const { data, error } = await cloud.database.from(S.TABLE).insert(row).select();
      if (error) throw error;
      return { ok: true, persisted: true, row: (data && data[0]) || row };
    }
    const local = Object.assign(
      { id: nextLocalId(), created_at: new Date().toISOString() }, row);
    markSubmitted();
    return { ok: true, persisted: false, row: local };
  }

  function nextLocalId() {
    const t = Date.now();
    return t;
  }

  function markSubmitted() {
    try { localStorage.setItem(LS_DONE, new Date().toISOString()); } catch (e) {}
  }

  function hasSubmitted() {
    try { return !!localStorage.getItem(LS_DONE); } catch (e) { return false; }
  }

  // ---------- 家长端：把一份答卷导出成可发给对方的文本 / 文件 ----------

  /** 单份答卷的可复制文本（含编号，家长微信直接发给你） */
  function toShareText(row) {
    const no = String(row.id || '').slice(-6);
    const lines = ['【荆门儿童AI创意体验·家长需求调研】问卷编号：' + no];
    S.QUESTIONS.forEach(q => {
      const v = String(row[S.COLUMNS[q.id]] || '').trim();
      if (!v) return;
      lines.push(q.no + ' ' + q.label + '：' + v.split('｜').join('、'));
    });
    lines.push('提交时间：' + formatTime(row.created_at));
    return lines.join('\n');
  }

  /** 多份答卷的 JSON（后台可批量导入） */
  function toJSON(rows) {
    return JSON.stringify(rows, null, 2);
  }

  /** 后台导入：接受「单份文本」「JSON 数组」「JSON 对象」 */
  function parseImport(text) {
    const t = String(text || '').trim();
    if (!t) return { ok: false, error: '内容为空' };

    // 1) JSON 数组或对象
    if (t[0] === '[' || t[0] === '{') {
      try {
        const data = JSON.parse(t);
        const arr = Array.isArray(data) ? data : [data];
        const rows = arr.filter(r => r && typeof r === 'object').map(normalizeImported);
        if (!rows.length) return { ok: false, error: 'JSON 里没有可识别的答卷' };
        return { ok: true, rows, mode: 'json' };
      } catch (e) {
        return { ok: false, error: 'JSON 格式有误：' + e.message };
      }
    }

    // 2) 家长复制的文本（可能一次粘多份，用空行分段）
    const blocks = t.split(/\n\s*\n(?=【荆门儿童AI创意体验)/).filter(b => b.trim());
    const rows = blocks.map(parseShareText).filter(Boolean);
    if (!rows.length) return { ok: false, error: '没有识别到答卷，请确认粘贴的是家长发回的结果内容' };
    return { ok: true, rows, mode: 'text' };
  }

  function parseShareText(block) {
    const lines = String(block).split('\n').map(l => l.trim()).filter(Boolean);
    const row = {};
    let no = '', time = '';
    lines.forEach(l => {
      if (l.startsWith('【')) {
        const m = l.match(/问卷编号：(\S+)/);
        if (m) no = m[1];
        return;
      }
      if (l.startsWith('提交时间：')) { time = l.replace('提交时间：', '').trim(); return; }
      const qi = l.match(/^(\d{2})\s(.+?)：(.+)$/);
      if (!qi) return;
      const q = S.QUESTIONS.find(x => x.no === qi[1]);
      if (!q) return;
      const col = S.COLUMNS[q.id];
      row[col] = q.type === 'multi'
        ? qi[3].split(/[、|｜]/).map(s => s.trim()).filter(Boolean).join('｜')
        : qi[3];
    });
    const filled = Object.keys(row).length;
    if (!filled) return null;
    return normalizeImported(Object.assign(row, {
      id: no || String(Date.now()),
      created_at: time
    }));
  }

  function normalizeImported(r) {
    const out = {};
    Object.keys(S.COLUMNS).forEach(qid => {
      const col = S.COLUMNS[qid];
      out[col] = r[col] === undefined || r[col] === null ? '' : String(r[col]);
    });
    if (!r.created_at) out.created_at = new Date().toISOString();
    else if (!/^\d{4}-\d{2}-\d{2}/.test(String(r.created_at))) {
      // "2026-10-08 09:30" → 补成可解析格式
      out.created_at = String(r.created_at).replace(' ', 'T') + ':00';
    } else {
      out.created_at = String(r.created_at);
    }
    if (r.id !== undefined) out.id = r.id;
    return out;
  }

  // ---------- 后台：本地收集箱（localStorage） ----------

  function loadCollected() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveCollected(rows) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 后台导入答卷，按问卷编号+内容去重 */
  function importRows(newRows) {
    const cur = loadCollected();
    const keys = new Set(cur.map(r => rowKey(r)));
    let added = 0, dup = 0;
    newRows.forEach(r => {
      const k = rowKey(r);
      if (keys.has(k)) { dup++; return; }
      keys.add(k);
      cur.push(r);
      added++;
    });
    if (added && !saveCollected(cur)) {
      return { ok: false, error: '浏览器存储空间不足，导入失败' };
    }
    return { ok: true, added, dup, total: cur.length };
  }

  function rowKey(r) {
    return S.QUESTIONS.map(q => r[S.COLUMNS[q.id]] || '').join('|');
  }

  function clearCollected() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    memoryRows = [];
  }

  /** 后台读取全部答卷：云端模式读数据库，否则读本地收集箱 */
  async function listAll() {
    if (isReady()) {
      const cloud = await getClient();
      const { data, error } = await cloud.database
        .from(S.TABLE).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return { rows: data || [], persisted: true };
    }
    return { rows: loadCollected(), persisted: false };
  }

  /** 删除单条 */
  async function remove(id) {
    if (isReady()) {
      const cloud = await getClient();
      const { data, error } = await cloud.database.from(S.TABLE).delete().eq('id', id).select();
      if (error) throw error;
      return (data || []).length > 0;
    }
    const cur = loadCollected();
    const left = cur.filter(r => String(r.id) !== String(id));
    saveCollected(left);
    return left.length < cur.length;
  }

  function clearMemory() { memoryRows = []; }

  /** 导出 CSV（带 BOM，Excel/WPS 双击打开不乱码） */
  function toCSV(rows) {
    const headers = ['问卷编号'].concat(
      S.QUESTIONS.map(q => q.no + ' ' + q.label), ['提交时间']);
    const esc = v => {
      const s = v === undefined || v === null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(esc).join(',')];
    rows.forEach((r, i) => {
      const cells = [r.id || (i + 1)];
      S.QUESTIONS.forEach(q => {
        const v = r[S.COLUMNS[q.id]];
        cells.push(q.type === 'multi'
          ? String(v || '').split('｜').filter(Boolean).join(' | ')
          : (v || ''));
      });
      cells.push(formatTime(r.created_at));
      lines.push(cells.map(esc).join(','));
    });
    return '\ufeff' + lines.join('\r\n');
  }

  function formatTime(v) {
    if (!v) return '';
    const d = new Date(String(v).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(v);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  return {
    config, isReady, submit, hasSubmitted,
    toShareText, toJSON, parseImport,
    listAll, importRows, remove, clearMemory, clearCollected, loadCollected,
    toCSV, toRow, fromRow, formatTime
  };
})();