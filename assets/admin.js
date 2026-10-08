/**
 * 管理后台
 * - 口令进入（口令可在 admin.html 里改 PW，或用 ?k= 参数临时传）
 * - 分布统计 / 交叉分析 / 开放建议 / 全部答卷 / 使用说明
 * - 导出 CSV 与 Excel
 */
(function () {
  'use strict';

  const S = window.SURVEY;
  const store = window.CloudStore;

  // 后台口令：可在 admin.html 的 <body> 上加 data-pw="你的口令" 覆盖
  const PW = document.body.dataset.pw || 'jingmen2026';

  let rows = [];
  let persisted = false;

  const $ = id => document.getElementById(id);

  // ---------- 口令 ----------
  function gateOk() {
    if (sessionStorage.getItem('pw_ok') === '1') return true;
    const urlKey = new URLSearchParams(location.search).get('k');
    if (urlKey && urlKey === PW) {
      sessionStorage.setItem('pw_ok', '1');
      return true;
    }
    return false;
  }

  function tryEnter() {
    const v = $('pwd').value;
    if (v === PW) {
      sessionStorage.setItem('pw_ok', '1');
      enter();
    } else {
      const e = $('gateErr');
      e.textContent = '口令不正确。';
      e.classList.remove('hidden');
    }
  }

  $('gateBtn').addEventListener('click', tryEnter);
  $('pwd').addEventListener('keydown', e => {
    if (e.key === 'Enter') tryEnter();
  });

  $('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem('pw_ok');
    location.href = 'admin.html';
  });

  function enter() {
    $('gate').classList.add('hidden');
    $('dash').classList.remove('hidden');
    load();
  }

  // ---------- Tab 切换 ----------
  const PANELS = {
    import: 'panel-import',
    dist: 'panel-dist',
    cross: 'panel-cross',
    open: 'panel-open',
    list: 'panel-list',
    guide: 'panel-guide'
  };

  $('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const key = btn.dataset.tab;
    if (!PANELS[key]) return;
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t === btn));
    Object.keys(PANELS).forEach(k =>
      $(PANELS[k]).classList.toggle('hidden', k !== key));
  });

  // ---------- 载入 ----------
  async function load() {
    try {
      const res = await store.listAll();
      rows = res.rows || [];
      persisted = res.persisted;
      renderAll();
    } catch (e) {
      rows = [];
      persisted = false;
      renderAll();
      alert('读取数据失败：' + (e && e.message ? e.message : '未知错误'));
    }
  }
  $('btnReload').addEventListener('click', load);

  // ---------- 渲染总览 ----------
  function renderAll() {
    $('totalNum').textContent = rows.length;

    const st = $('storeState');
    st.className = 'store-state ' + (persisted ? 'cloud' : 'local');
    st.textContent = persisted
      ? '● 已连接云端数据库：家长提交即入库，这里实时显示'
      : '● 本地收集箱：数据保存在这台电脑的浏览器里。换电脑或清缓存前请先导出备份。';

    const empty = $('emptyTip');
    if (!rows.length) {
      empty.textContent = '还没有收到答卷。切换到「导入答卷」页，把家长发回的结果文字粘进来即可开始统计。';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
    }

    renderImport();
    renderDist();
    renderCross();
    renderOpen();
    renderList();
    renderGuide();
  }

  // ---------- 导入面板 ----------
  function renderImport() {
    const panel = $('panel-import');
    panel.innerHTML =
      '<h3 class="imp-title">把家长发回的结果导入这里</h3>' +
      '<ol class="imp-steps">' +
      '<li>家长在填写页提交后，会得到一段以「【荆门儿童AI创意体验·家长需求调研】」开头的结果文字。</li>' +
      '<li>让家长用微信把这段文字发给你。可以一次粘贴多份（中间空一行）。</li>' +
      '<li>把收到的内容粘贴到下面，点「导入」。重复内容会自动跳过。</li>' +
      '</ol>' +
      '<textarea id="impText" rows="7" placeholder="在此粘贴家长发回的结果文字…"></textarea>' +
      '<div class="imp-btns">' +
      '<button class="ghost" id="btnParse">导入</button>' +
      '<button class="ghost" id="btnFile">从 txt / json 文件导入</button>' +
      '<input type="file" id="impFile" accept=".txt,.json" class="hidden">' +
      '<button class="ghost" id="btnClear">清空全部数据</button>' +
      '</div>' +
      '<div id="impMsg" class="imp-msg"></div>';

    $('btnParse').addEventListener('click', () => doImport($('impText').value));

    $('btnFile').addEventListener('click', () => $('impFile').click());
    $('impFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        $('impText').value = String(reader.result || '');
        doImport($('impText').value);
      };
      reader.onerror = () => msg('读取文件失败，请改用粘贴方式。', true);
      reader.readAsText(f, 'utf-8');
    });

    $('btnClear').addEventListener('click', async () => {
      if (!rows.length) return msg('当前没有数据。', true);
      if (!confirm('确定清空全部 ' + rows.length + ' 份答卷吗？此操作不可恢复，建议先导出备份。')) return;
      for (const r of rows.slice()) {
        try { await store.remove(r.id); } catch (e) {}
      }
      msg('已清空。');
      load();
    });
  }

  function msg(text, isErr) {
    const el = $('impMsg');
    if (!el) return;
    el.textContent = text;
    el.className = 'imp-msg' + (isErr ? ' err' : ' ok');
  }

  function doImport(text) {
    const res = store.parseImport(text);
    if (!res.ok) return msg('导入失败：' + res.error, true);
    const out = store.importRows(res.rows);
    if (!out.ok) return msg('导入失败：' + out.error, true);
    if (out.added === 0) {
      msg('没有新增（' + out.dup + ' 份重复已跳过）。当前共 ' + out.total + ' 份。', true);
      return;
    }
    // load() 会重渲染导入面板，提示需在重渲染后重新挂上
    msg('成功导入 ' + out.added + ' 份' +
      (out.dup ? '（跳过 ' + out.dup + ' 份重复）' : '') +
      '，当前共 ' + out.total + ' 份。');
    $('impText').value = '';
    load().then(() => {
      msg('成功导入 ' + out.added + ' 份' +
        (out.dup ? '（跳过 ' + out.dup + ' 份重复）' : '') +
        '，当前共 ' + out.total + ' 份。');
    });
  }

  // ---------- 分布统计 ----------
  function countBy(qid) {
    const col = S.COLUMNS[qid];
    const map = {};
    rows.forEach(r => {
      const raw = r[col];
      if (raw === undefined || raw === null || raw === '') return;
      String(raw).split('｜').filter(Boolean).forEach(v => {
        map[v] = (map[v] || 0) + 1;
      });
    });
    return map;
  }

  function renderDist() {
    const panel = $('panel-dist');
    panel.innerHTML = '';
    S.QUESTIONS.filter(q => q.type !== 'text').forEach(q => {
      const map = countBy(q.id);
      const max = Math.max(1, ...Object.values(map));
      const group = document.createElement('div');
      group.className = 'dist-group';

      const h = document.createElement('h3');
      h.innerHTML = '<span class="qno-tag">' + q.no + '</span>' +
        '<span>' + q.label + (q.suffix || '') + '</span>';
      group.appendChild(h);

      const box = document.createElement('div');
      box.className = 'dist-rows';
      q.options.forEach(opt => {
        const n = map[opt] || 0;
        const pct = rows.length ? (n / rows.length * 100) : 0;
        const row = document.createElement('div');
        row.className = 'drow';
        row.innerHTML =
          '<div class="dlabel">' + opt + '</div>' +
          '<div class="dtrack"><i class="dfill" style="width:' + (n / max * 100) + '%"></i></div>' +
          '<div class="dnum"><b>' + n + '</b> ' + pct.toFixed(0) + '%</div>';
        box.appendChild(row);
      });
      group.appendChild(box);
      panel.appendChild(group);
    });
  }

  // ---------- 交叉分析 ----------
  function renderCross() {
    const panel = $('panel-cross');
    panel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'cross-head';
    head.innerHTML = '<label for="crossDim">分析维度</label>' +
      '<select id="crossDim">' + S.QUESTIONS.filter(q => q.type !== 'text')
        .map(q => '<option value="' + q.id + '">' + q.no + ' ' + q.label + '</option>').join('') +
      '</select><span style="color:var(--text-3);font-size:12.5px">按所选维度看各选项的人数分布</span>';
    panel.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = 'cross-table-wrap';
    wrap.innerHTML = '<table class="cross"><thead></thead><tbody></tbody></table>';
    panel.appendChild(wrap);

    const draw = () => {
      const qid = $('crossDim').value;
      const q = S.QUESTIONS.find(x => x.id === qid);
      const map = countBy(qid);
      const thead = wrap.querySelector('thead');
      const tbody = wrap.querySelector('tbody');

      thead.innerHTML = '<tr><th>' + q.no + ' ' + q.label + '</th><th>人数</th><th>占比</th></tr>';
      tbody.innerHTML = '';
      q.options.forEach(opt => {
        const n = map[opt] || 0;
        const pct = rows.length ? (n / rows.length * 100) : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + opt + '</td><td class="num">' + n +
          '</td><td class="num">' + pct.toFixed(1) + '%</td>';
        tbody.appendChild(tr);
      });
    };

    head.querySelector('#crossDim').addEventListener('change', draw);
    draw();
  }

  // ---------- 开放建议 ----------
  function renderOpen() {
    const panel = $('panel-open');
    panel.innerHTML = '';
    const col = S.COLUMNS.q14;
    const items = rows.filter(r => String(r[col] || '').trim());

    if (!items.length) {
      panel.innerHTML = '<p style="color:var(--text-3);font-size:13.5px">还没有家长填写开放建议。</p>';
      return;
    }
    items.forEach(r => {
      const box = document.createElement('div');
      box.className = 'idea';
      const age = r[S.COLUMNS.q01] || '未填';
      const area = r[S.COLUMNS.q02] || '未填';
      box.innerHTML =
        '<div class="idea-meta"><span>孩子年龄：' + age + '</span>' +
        '<span>居住区域：' + area + '</span>' +
        '<span>' + (store.formatTime(r.created_at) || '') + '</span></div>' +
        '<div class="idea-body">' + escapeHtml(String(r[col])) + '</div>';
      panel.appendChild(box);
    });
  }

  // ---------- 全部答卷 ----------
  function renderList() {
    const panel = $('panel-list');
    panel.innerHTML = '';
    if (!rows.length) {
      panel.innerHTML = '<p style="color:var(--text-3);font-size:13.5px">暂无数据。</p>';
      return;
    }
    rows.forEach((r, idx) => {
      const box = document.createElement('div');
      box.className = 'row-item';

      const top = document.createElement('div');
      top.className = 'row-top';
      top.innerHTML = '<span class="row-id">#' + (r.id || idx + 1) + '</span>' +
        '<span class="row-time">' + (store.formatTime(r.created_at) || '') + '</span>';
      const del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '删除';
      del.addEventListener('click', async () => {
        if (!confirm('确定删除这份答卷吗？此操作不可恢复。')) return;
        const ok = await store.remove(r.id);
        if (ok) load();
        else alert('删除失败：该答卷可能不存在或权限不足。');
      });
      top.appendChild(del);
      box.appendChild(top);

      const dl = document.createElement('dl');
      dl.className = 'row-kv';
      S.QUESTIONS.forEach(q => {
        const v = String(r[S.COLUMNS[q.id]] || '').trim();
        if (!v) return;
        const dt = document.createElement('dt');
        dt.textContent = q.no + ' ' + q.label;
        const dd = document.createElement('dd');
        dd.textContent = v.split('｜').join('、');
        if (q.type === 'text') dd.className = 'open';
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      box.appendChild(dl);
      panel.appendChild(box);
    });
  }

  // ---------- 使用说明 ----------
  function renderGuide() {
    const items = [
      ['调研目的', '验证荆门家长对儿童AI创意体验的实际需求、内容兴趣、担忧与付费意愿；不是招生承诺。'],
      ['建议样本', '首轮建议至少30份探索性访谈/问卷；有条件时扩展至80–120份，尽量覆盖不同年龄段、城区和县域。'],
      ['发放方式', '线下家长访谈、亲子活动现场、熟人社群均可；避免只向朋友发放，造成样本偏差。'],
      ['填写时长', '约3–4分钟；由家长独立勾选，不向家长提前暗示“合理价格”。'],
      ['价格题说明', '价格题为45–60分钟单次体验的可接受价，正式产品仍需结合成本、教学设计及合规要求再定价。'],
      ['多选录入', '录入时使用题目原文，多个选项之间用全角竖线“｜”，例如：创造力｜逻辑思维。'],
      ['回收质量', '检查必答题是否基本完整；开放题可以空白；不要代替家长填写或补全答案。'],
      ['个人信息', '匿名问卷不收集姓名、电话、孩子照片等身份信息；如后续体验邀约，采用单独自愿登记。'],
      ['合规提醒', '涉及面向儿童的线下培训、课程收费、未成年人个人信息处理等，实施前向属地主管部门核实要求。'],
      ['解释结果', '至少拆分“年龄”和“居住区域”看偏好差异；多选题人数之和会超过总样本数，属于正常。']
    ];
    $('panel-guide').innerHTML = items.map(it =>
      '<dl class="guide-item"><dt>' + it[0] + '</dt><dd>' + it[1] + '</dd></dl>'
    ).join('');
  }

  // ---------- 导出 ----------
  $('btnExport').addEventListener('click', () => {
    if (!rows.length) return alert('还没有数据可导出。');
    const csv = store.toCSV(rows);
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      '家长需求调研_答卷_' + stamp() + '.csv');
  });

  $('btnXlsx').addEventListener('click', () => {
    if (!rows.length) return alert('还没有数据可导出。');
    if (typeof XLSX === 'undefined') return alert('Excel 组件未加载，请改用 CSV 导出。');
    const header = S.QUESTIONS.map(q => q.no + ' ' + q.label).concat(['提交时间']);
    const body = rows.map(r => {
      const cells = S.QUESTIONS.map(q => {
        const v = String(r[S.COLUMNS[q.id]] || '');
        return q.type === 'multi' ? v.split('｜').filter(Boolean).join('、') : v;
      });
      cells.push(store.formatTime(r.created_at));
      return cells;
    });
    const aoa = [header].concat(body);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map((h, i) => ({ wch: i === 0 ? 34 : 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '答卷');
    XLSX.writeFile(wb, '家长需求调研_答卷_' + stamp() + '.xlsx');
  });

  function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 200);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 启动 ----------
  if (gateOk()) enter();
})();