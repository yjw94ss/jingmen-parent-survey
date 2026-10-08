/**
 * 回执图片渲染：把一份答卷画到 canvas 上，导出真实 PNG。
 * 为什么要 PNG 而不是 HTML：手机上「长按保存图片」只对 <img> 有效，
 * DOM 元素（div/文本框）长按只会出选中菜单，存不了图。
 *
 * 无外部依赖，纯 Canvas 2D，离线可用；按 2 倍像素比绘制保证清晰。
 */
window.ReceiptImage = (function () {
  'use strict';

  const W = 750;          // 逻辑宽度（输出 1500px 宽，图更清晰）
  const SCALE = 2;
  const PAD = 34;
  const COL_NO = 46;      // 题号栏宽度
  const MAXH = 8000;      // 试排版时的临时高度

  const C = {
    headA: '#2f5fb3', headB: '#4d84e0',
    body: '#fbfbfd', footBg: '#f1f3f7', footLine: '#e4e7ec',
    secTitle: '#2f5fb3', dash: '#dcdfe6',
    qno: '#8b93a1', label: '#7b8391', value: '#14171d', foot: '#6b7280',
    white: '#ffffff'
  };

  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",-apple-system,sans-serif';

  function font(ctx, size, bold) {
    ctx.font = (bold ? '700 ' : '') + size + 'px ' + FONT;
  }

  /** 逐字换行（中文按字断行，英文尽量不断词） */
  function wrap(ctx, text, maxW) {
    const s = String(text === undefined || text === null ? '' : text);
    if (!s) return [''];
    const lines = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const t = cur + ch;
      if (ctx.measureText(t).width > maxW && cur) {
        // 英文单词尽量不拆：向前找最近的空格/分隔符
        if (/[A-Za-z0-9]/.test(ch) && /[A-Za-z0-9]/.test(cur[cur.length - 1])) {
          const sp = cur.lastIndexOf(' ');
          if (sp > cur.length - 24) {
            lines.push(cur.slice(0, sp));
            cur = cur.slice(sp + 1) + ch;
            continue;
          }
        }
        lines.push(cur);
        cur = ch;
      } else {
        cur = t;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /**
   * 绘制主体。measuring=true 时只推进 y 不实际落笔（用于先算总高）。
   * 返回内容底部 y。
   */
  function draw(ctx, data, measuring) {
    const S = window.SURVEY;
    const innerW = W - PAD * 2;
    const valX = PAD + COL_NO;
    const valW = W - valX - PAD;

    let y = 0;

    // ---------- 页眉 ----------
    const headTop = y;
    const headH = 152;
    y += headH;
    if (!measuring) {
      const g = ctx.createLinearGradient(0, headTop, W, headTop);
      g.addColorStop(0, C.headA);
      g.addColorStop(1, C.headB);
      ctx.fillStyle = g;
      ctx.fillRect(0, headTop, W, headH);

      ctx.fillStyle = 'rgba(255,255,255,.88)';
      font(ctx, 19, false);
      ctx.fillText(data.brand, PAD, headTop + 40);

      ctx.fillStyle = C.white;
      font(ctx, 34, true);
      ctx.fillText(data.title, PAD, headTop + 84);

      font(ctx, 19, false);
      ctx.fillStyle = 'rgba(255,255,255,.93)';
      ctx.fillText('问卷编号 ' + data.no, PAD, headTop + 124);
      const tw = ctx.measureText(data.time).width;
      ctx.fillText(data.time, W - PAD - tw, headTop + 124);
    }

    // ---------- 正文 ----------
    y += 22;
    let firstSec = true;

    S.SECTIONS.forEach(sec => {
      const qs = S.QUESTIONS.filter(q =>
        q.section === sec.id && String(data.row[S.COLUMNS[q.id]] || '').trim());
      if (!qs.length) return;

      if (!firstSec) {
        ctx.save();
        ctx.strokeStyle = C.dash;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(PAD, y + 6);
        ctx.lineTo(W - PAD, y + 6);
        ctx.stroke();
        ctx.restore();
        y += 22;
      }
      firstSec = false;

      // 板块标题
      y += 12;
      if (!measuring) {
        ctx.fillStyle = C.secTitle;
        font(ctx, 23, true);
        ctx.fillText(sec.title, PAD, y + 20);
      }
      y += 34;

      // 逐题
      qs.forEach(q => {
        const raw = String(data.row[S.COLUMNS[q.id]] || '').trim();
        const val = q.type === 'multi'
          ? raw.split('｜').filter(Boolean).join('　·　')
          : raw;

        font(ctx, 18, false);
        const labelLines = wrap(ctx, q.label, valW);
        const vFontSize = 26;
        font(ctx, vFontSize, true);
        const valueLines = wrap(ctx, val, valW);

        const labelH = labelLines.length * 25;
        const valueH = valueLines.length * 35;
        const rowH = labelH + valueH + 6;

        if (!measuring) {
          // 题号
          ctx.fillStyle = C.qno;
          font(ctx, 18, true);
          ctx.fillText(q.no, PAD, y + 26);

          // 题目（小字灰）
          ctx.fillStyle = C.label;
          font(ctx, 18, false);
          labelLines.forEach((ln, i) => {
            ctx.fillText(ln, valX, y + 20 + i * 25);
          });

          // 答案（大字深色）
          ctx.fillStyle = C.value;
          font(ctx, vFontSize, true);
          const vy = y + labelH + 30;
          valueLines.forEach((ln, i) => {
            ctx.fillText(ln, valX, vy + i * 35);
          });
        }
        y += rowH + 8;
      });
      y += 6;
    });

    y += 10;

    // ---------- 页脚 ----------
    y += 14;
    font(ctx, 18, false);
    const footLines = wrap(ctx, data.foot, innerW);
    const footH = 16 + footLines.length * 25 + 18;

    if (!measuring) {
      ctx.fillStyle = C.footBg;
      ctx.fillRect(0, y, W, footH);
      ctx.strokeStyle = C.footLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();

      ctx.fillStyle = C.foot;
      font(ctx, 18, false);
      footLines.forEach((ln, i) => {
        ctx.fillText(ln, PAD, y + 30 + i * 25);
      });
    }
    y += footH;

    return y;
  }

  /**
   * 生成回执图片
   * @param {object} row  答卷行
   * @returns {string}    PNG 的 dataURL
   */
  function render(row) {
    const S = window.SURVEY;
    const data = {
      brand: '荆门儿童AI创意体验',
      title: '家长需求调研 · 填写回执',
      no: String(row.id || '').slice(-6) || '—',
      time: (window.CloudStore ? window.CloudStore.formatTime(row.created_at) : '') || '',
      foot: '本问卷为匿名填写，不收集姓名、电话等身份信息。填写内容仅用于了解家长真实需求，' +
        '不代表报名或儿童能力测评。如需参与后续体验，请另行自愿登记。',
      row: row
    };

    // 第一遍：试排版算总高
    const probe = document.createElement('canvas').getContext('2d');
    const totalH = draw(probe, data, true) + 2;

    // 第二遍：正式绘制
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * SCALE);
    cv.height = Math.round(totalH * SCALE);
    const ctx = cv.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = 'alphabetic';

    // 底色（页脚外的区域）
    ctx.fillStyle = C.body;
    ctx.fillRect(0, 0, W, totalH);

    draw(ctx, data, false);

    try {
      return cv.toDataURL('image/png');
    } catch (e) {
      return '';
    }
  }

  return { render };
})();