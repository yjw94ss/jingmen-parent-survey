/**
 * 家长填写页交互
 * - 依据 questions.js 渲染选项（HTML 里只留容器，避免两处维护题面）
 * - 单选互斥、多选限选（最多选N项）超限时拦截并提示
 * - 必答校验 + 提交 + 写入数据层
 */
(function () {
  'use strict';

  const S = window.SURVEY;
  const store = window.CloudStore;

  const form = document.getElementById('surveyForm');
  const errMsg = document.getElementById('errMsg');
  const notReady = document.getElementById('notReady');
  const submitBtn = document.getElementById('submitBtn');
  const barFill = document.getElementById('barFill');
  const progressText = document.getElementById('progressText');

  const state = {};
  S.QUESTIONS.forEach(q => {
    state[q.id] = q.type === 'multi' ? [] : '';
  });

  // ---- 渲染选项 ----
  S.QUESTIONS.forEach(q => {
    const box = form.querySelector('.q[data-qid="' + q.id + '"]');
    if (!box) return;
    const opts = box.querySelector('[data-opts]');
    if (!opts) return;

    q.options.forEach((text, i) => {
      const label = document.createElement('label');
      label.className = 'opt';
      label.dataset.value = text;
      label.innerHTML =
        '<input type="' + (q.type === 'multi' ? 'checkbox' : 'radio') +
        '" name="' + q.id + '" value="' + text + '">' +
        '<span class="box"></span><span class="otext">' + text + '</span>';
      opts.appendChild(label);
    });

    if (q.type === 'multi') {
      opts.addEventListener('change', e => onMultiChange(q, box, opts, e));
    } else {
      opts.addEventListener('change', () => {
        const picked = box.querySelector('input:checked');
        state[q.id] = picked ? picked.value : '';
        box.classList.remove('invalid');
        updateProgress();
      });
    }
  });

  function onMultiChange(q, box, opts, e) {
    const checked = Array.from(opts.querySelectorAll('input:checked'));
    const max = q.max || 0;
    if (max && checked.length > max) {
      // 超限：撤销本次勾选，并明确提示
      e.target.checked = false;
      flashLimit(box, max);
      return;
    }
    state[q.id] = checked.map(c => c.value);
    box.classList.remove('invalid');
    updateProgress();
  }

  function flashLimit(box, max) {
    let tip = box.querySelector('.limit-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'limit-tip';
      box.appendChild(tip);
    }
    tip.textContent = '本题最多只能选 ' + max + ' 项，请先取消一项再选。';
    tip.classList.add('show');
    clearTimeout(tip._t);
    tip._t = setTimeout(() => tip.classList.remove('show'), 3200);
  }

  // ---- 进度 ----
  function updateProgress() {
    const done = S.REQUIRED_IDS.filter(id => {
      const v = state[id];
      return Array.isArray(v) ? v.length > 0 : !!v;
    }).length;
    const total = S.REQUIRED_IDS.length;
    barFill.style.width = (done / total * 100) + '%';
    progressText.textContent = '已完成 ' + done + ' / ' + total + ' 题';
  }

  // ---- 开放题字数 ----
  const ta = form.querySelector('[data-text]');
  const counter = form.querySelector('[data-counter]');
  if (ta && counter) {
    ta.addEventListener('input', () => {
      counter.textContent = ta.value.length + ' / 500';
    });
  }

  // ---- 云端状态提示 ----
  if (!store.isReady()) {
    notReady.textContent = '提示：当前尚未接入云端数据库，提交后内容只保留在本页，刷新后会丢失。';
    notReady.classList.remove('hidden');
  }

  // ---- 提交 ----
  form.addEventListener('submit', async e => {
    e.preventDefault();
    errMsg.classList.add('hidden');

    const missing = S.REQUIRED_IDS.filter(id => {
      const v = state[id];
      return Array.isArray(v) ? v.length === 0 : !v;
    });

    if (missing.length) {
      const first = form.querySelector('.q[data-qid="' + missing[0] + '"]');
      if (first) {
        first.classList.add('invalid');
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      errMsg.textContent = '还有 ' + missing.length + ' 道必答题未完成（' +
        missing.map(id => id.replace('q', '') + '.').join('、') + '），请补充后再提交。';
      errMsg.classList.remove('hidden');
      return;
    }

    const answers = Object.assign({}, state);
    answers.q14 = ta ? ta.value.trim() : '';

    submitBtn.disabled = true;
    submitBtn.textContent = '提交中…';

    try {
      const res = await store.submit(answers);
      const no = res.row && res.row.id ? String(res.row.id).slice(-6) : '—';
      document.getElementById('doneId').textContent = no;
      document.getElementById('doneMsg').textContent = res.persisted
        ? '感谢您花时间填写这份需求调研。您的回答仅用于了解真实需求，不代表报名或测评。'
        : '感谢您填写。但当前未接入云端数据库，这份答卷只在本页有效，刷新后不会保留。';
      form.classList.add('hidden');
      document.getElementById('progress').classList.add('hidden');
      document.getElementById('doneView').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      errMsg.textContent = '提交失败：' + (err && err.message ? err.message : '未知错误') +
        '。请稍后重试，或联系发放问卷的老师。';
      errMsg.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = '提交问卷';
    }
  });

  updateProgress();
})();