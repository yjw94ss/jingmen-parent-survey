/**
 * 数据访问层 —— 家长端写入 + 后台读取/导出
 *
 * 配置来源：Cloud 配置对象（publicConfig）。
 * environment 字段填写云服务开通后拿到的 publicConfig 三件套，
 * 缺失时页面会明确提示「尚未接入云端」，不会假装保存成功。
 */
window.CloudStore = (function () {
  'use strict';

  const S = window.SURVEY;

  // ---- Cloud 配置（开通后由工具写入；保持与 publicConfig 字段一致）----
  const config = {
    enabled: false,
    endpoint: '',
    publishableKey: '',
    oauthRelayBaseUrl: '',
    resourceId: ''
  };

  // ---- 内存态：未接入云端时只保留在当前页面，不跨刷新 ----
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
      if (q.type === 'multi') {
        row[col] = Array.isArray(v) ? v.join('｜') : '';
      } else {
        row[col] = typeof v === 'string' ? v : '';
      }
    });
    return row;
  }

  function fromRow(row) {
    const answers = {};
    S.QUESTIONS.forEach(q => {
      const raw = row[S.COLUMNS[q.id]];
      if (q.type === 'multi') {
        answers[q.id] = String(raw || '').split('｜').filter(Boolean);
      } else {
        answers[q.id] = String(raw || '');
      }
    });
    return answers;
  }

  /** 保存一份答卷 */
  async function submit(answers) {
    const row = toRow(answers);
    if (isReady()) {
      const cloud = await getClient();
      const { data, error } = await cloud.database
        .from(S.TABLE)
        .insert(row)
        .select();
      if (error) throw error;
      return { ok: true, persisted: true, row: (data && data[0]) || row };
    }
    // 未接入云端：仅本地内存，明确标记未持久化
    const local = Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, row);
    memoryRows.unshift(local);
    return { ok: true, persisted: false, row: local };
  }

  /** 读取全部答卷（后台用） */
  async function listAll() {
    if (isReady()) {
      const cloud = await getClient();
      const { data, error } = await cloud.database
        .from(S.TABLE)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { rows: data || [], persisted: true };
    }
    return { rows: memoryRows.slice(), persisted: false };
  }

  /** 删除单条（后台用） */
  async function remove(id) {
    if (isReady()) {
      const cloud = await getClient();
      const { data, error } = await cloud.database
        .from(S.TABLE)
        .delete()
        .eq('id', id)
        .select();
      if (error) throw error;
      return (data || []).length > 0;
    }
    const before = memoryRows.length;
    memoryRows = memoryRows.filter(r => String(r.id) !== String(id));
    return memoryRows.length < before;
  }

  /** 清空本地内存数据（仅未接云端时有效） */
  function clearMemory() {
    memoryRows = [];
  }

  /** 导出 CSV（带 BOM，Excel/WPS 直接双击打开不乱码） */
  function toCSV(rows) {
    const headers = ['问卷编号'].concat(
      S.QUESTIONS.map(q => q.no + ' ' + q.label),
      ['提交时间']
    );
    const esc = v => {
      const s = v === undefined || v === null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(esc).join(',')];
    rows.forEach((r, i) => {
      const cells = [i + 1];
      S.QUESTIONS.forEach(q => {
        const col = S.COLUMNS[q.id];
        if (q.type === 'multi') {
          cells.push(String(r[col] || '').split('｜').filter(Boolean).join(' | '));
        } else {
          cells.push(r[col] || '');
        }
      });
      cells.push(formatTime(r.created_at));
      lines.push(cells.map(esc).join(','));
    });
    return '\ufeff' + lines.join('\r\n');
  }

  function formatTime(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  return {
    config,
    isReady,
    submit,
    listAll,
    remove,
    clearMemory,
    toCSV,
    toRow,
    fromRow,
    formatTime
  };
})();