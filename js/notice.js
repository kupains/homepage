// PAINS 공지사항 아카이브 — Google Drive / GitHub Releases 연동
(() => {
  'use strict';

  const API_URL = window.PAINS_CONTENT_API_URL || 'https://script.google.com/macros/s/AKfycbwuNda5HuzwNhp7ecL0BTMt4eCgE8z9y1F8_kDR-ZaEp72mYngLp0DQ4ibWcKDEZyg/exec';
  const VIEWER_PAGE = 'pdf-viewer.html';

  const $ = (id) => document.getElementById(id);

  const els = {
    dateStart: $('filter-date-start'),
    dateEnd:   $('filter-date-end'),
    genWrap:   $('filter-generation'),
    deptWrap:  $('filter-department'),
    gen:       $('filter-generation-options'),
    dept:      $('filter-department-options'),
    q:         $('filter-q'),
    reset:     $('btn-reset'),
    list:      $('project-list'),
    count:     $('results-count'),
    empty:     $('empty'),
  };

  let allNotices  = [];
  let pdfProxyUrl = '';
  let releaseConfig = null;

  const selected     = { gen: new Set(), dept: new Set() };
  const filterValues = { gen: [],        dept: [] };

  const norm = (v) => (v ?? '').toString().trim();

  // ─── URL 헬퍼 ────────────────────────────────────────────────
  function getDriveId(item) {
    if (norm(item.driveId)) return norm(item.driveId);
    const m = norm(item.driveUrl).match(/\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : '';
  }

  function getDownloadUrl(item) {
    // Drive 우선
    const driveId = getDriveId(item);
    if (driveId) return `https://drive.google.com/uc?export=download&id=${driveId}`;

    // GitHub Releases 폴백
    if (norm(item.file) && releaseConfig) {
      const tag = releaseConfig.noticesTag || releaseConfig.tag || 'NOTICEs';
      return `https://github.com/${releaseConfig.owner}/${releaseConfig.repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(norm(item.file))}`;
    }
    return '';
  }

  function getSrcUrl(downloadUrl) {
    if (!downloadUrl) return '';
    return pdfProxyUrl ? pdfProxyUrl + encodeURIComponent(downloadUrl) : downloadUrl;
  }

  function hasFile(item) {
    return !!(getDriveId(item) || (norm(item.file) && releaseConfig));
  }

  function buildViewerUrl(title, fileName, downloadUrl) {
    const srcUrl = getSrcUrl(downloadUrl);
    const p = new URLSearchParams({
      src:      srcUrl,
      direct:   downloadUrl,
      download: downloadUrl,
      from:     'notice',
    });
    if (title)    p.set('title', title);
    if (fileName) p.set('file',  fileName);
    return `${VIEWER_PAGE}?${p}`;
  }

  // ─── 필터 UI ─────────────────────────────────────────────────
  function byNumberPrefix(a, b) {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    const an = !isNaN(na), bn = !isNaN(nb);
    if (an && bn) return na - nb;
    return an ? -1 : bn ? 1 : a.localeCompare(b, 'ko');
  }

  function unique(arr) {
    return [...new Set(arr.map(norm).filter(Boolean))];
  }

  function buildCheckboxOptions(container, values, key) {
    if (!container) return;
    container.innerHTML = '';
    values.forEach((value, idx) => {
      const label = document.createElement('label');
      label.className = 'check-option';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = value;
      input.dataset.filterKey = key; input.id = `${key}-${idx}`;
      const span = document.createElement('span');
      span.textContent = value;
      label.append(input, span);
      container.appendChild(label);
    });
  }

  function updateSummaryText(key) {
    const wrap = key === 'gen' ? els.genWrap : els.deptWrap;
    const el = wrap?.querySelector('.multi-filter-summary-text');
    if (!el) return;
    const total = filterValues[key].length, checked = selected[key].size;
    if (checked === 0 || checked === total) { el.textContent = '전체'; return; }
    const first = [...selected[key]][0];
    el.textContent = checked === 1 ? first : `${first} 외 ${checked - 1}개`;
  }

  function syncCheckboxes(key) {
    const container = key === 'gen' ? els.gen : els.dept;
    if (!container) return;
    const isAll = selected[key].size === filterValues[key].length;
    container.querySelectorAll('input[type="checkbox"]').forEach(box => {
      box.checked = isAll || selected[key].has(box.value);
    });
    updateSummaryText(key);
  }

  function selectAll(key) {
    selected[key].clear();
    filterValues[key].forEach(v => selected[key].add(v));
    syncCheckboxes(key); applyFilters();
  }

  function clearAll(key) { selected[key].clear(); syncCheckboxes(key); applyFilters(); }

  function buildFilters(notices) {
    filterValues.gen  = unique(notices.map(n => n.generation)).sort(byNumberPrefix);
    filterValues.dept = unique(notices.map(n => n.department)).sort((a, b) => a.localeCompare(b, 'ko'));
    buildCheckboxOptions(els.gen,  filterValues.gen,  'gen');
    buildCheckboxOptions(els.dept, filterValues.dept, 'dept');
    ['gen', 'dept'].forEach(key => {
      selected[key].clear();
      filterValues[key].forEach(v => selected[key].add(v));
      syncCheckboxes(key);
    });
  }

  function noticeMeta(n) {
    const parts = [];
    if (norm(n.date)) {
      const [y, m, d] = norm(n.date).split('-');
      parts.push(y && m && d ? `${y}년 ${m}월 ${d}일` : norm(n.date));
    }
    if (norm(n.generation)) parts.push(norm(n.generation));
    if (norm(n.department)) parts.push(norm(n.department));
    return parts.join(' · ');
  }

  // ─── 렌더링 ──────────────────────────────────────────────────
  function render(notices) {
    if (!els.list) return;
    els.list.innerHTML = '';
    if (els.count) els.count.textContent = `${notices.length}개 공지`;
    if (els.empty) els.empty.style.display = notices.length ? 'none' : 'block';

    notices.forEach(n => {
      const downloadUrl = getDownloadUrl(n);
      if (!downloadUrl) return;
      const title      = norm(n.title) || norm(n.file) || '제목 없음';
      const fileName   = norm(n.file);
      const previewUrl = buildViewerUrl(title, fileName, downloadUrl);

      const li = document.createElement('li');
      li.className = 'project-card' + (n.important ? ' is-important' : '');

      const main = document.createElement('div');
      main.className = 'project-main';

      const aTitle = document.createElement('a');
      aTitle.className = 'project-title';
      aTitle.href = previewUrl; aTitle.target = '_blank'; aTitle.rel = 'noopener';
      if (n.important) {
        const badge = document.createElement('span');
        badge.className = 'badge-important';
        badge.textContent = '📌';
        aTitle.append(badge, document.createTextNode(title));
      } else {
        aTitle.textContent = title;
      }

      const meta = document.createElement('div');
      meta.className = 'project-meta';
      meta.textContent = noticeMeta(n);

      main.append(aTitle);
      if (meta.textContent) main.append(meta);

      const actions = document.createElement('div');
      actions.className = 'project-actions';

      const btnView = document.createElement('a');
      btnView.className = 'btn'; btnView.href = previewUrl;
      btnView.target = '_blank'; btnView.rel = 'noopener';
      btnView.textContent = '열기';

      const btnDl = document.createElement('a');
      btnDl.className = 'btn btn-download'; btnDl.href = downloadUrl;
      btnDl.target = '_blank'; btnDl.rel = 'noopener';
      if (fileName) btnDl.setAttribute('download', fileName);
      btnDl.textContent = '다운로드';

      actions.append(btnView, btnDl);
      li.append(main, actions);
      els.list.appendChild(li);
    });
  }

  // ─── 필터 적용 ───────────────────────────────────────────────
  function matchMulti(set, value, total) {
    return set.size === 0 || set.size === total || set.has(norm(value));
  }

  function applyFilters() {
    const ds = norm(els.dateStart?.value);
    const de = norm(els.dateEnd?.value);
    const q  = norm(els.q?.value).toLowerCase();

    const filtered = allNotices.filter(n => {
      if (n.important) return true;
      if (ds && norm(n.date) < ds) return false;
      if (de && norm(n.date) > de) return false;
      if (!matchMulti(selected.gen,  n.generation, filterValues.gen.length))  return false;
      if (!matchMulti(selected.dept, n.department, filterValues.dept.length)) return false;
      if (q && !norm(n.title).toLowerCase().includes(q)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (a.important !== b.important) return a.important ? -1 : 1;
      return norm(b.date).localeCompare(norm(a.date));
    });

    render(filtered);
  }

  // ─── 이벤트 연결 ─────────────────────────────────────────────
  function attachCheckboxEvents(container, key) {
    if (!container) return;
    container.addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      e.target.checked ? selected[key].add(e.target.value) : selected[key].delete(e.target.value);
      updateSummaryText(key);
      applyFilters();
    });
  }

  function attachEvents() {
    [els.dateStart, els.dateEnd].forEach(el => el?.addEventListener('change', applyFilters));
    attachCheckboxEvents(els.gen,  'gen');
    attachCheckboxEvents(els.dept, 'dept');

    document.addEventListener('click', e => {
      const btn = e.target.closest('.mini-btn');
      if (btn) {
        const { action, target } = btn.dataset;
        if (action === 'select-all') selectAll(target);
        else if (action === 'clear-all') clearAll(target);
        return;
      }
      document.querySelectorAll('.multi-filter').forEach(d => {
        if (!d.contains(e.target)) d.removeAttribute('open');
      });
    });

    els.q?.addEventListener('input', applyFilters);
    els.reset?.addEventListener('click', () => {
      if (els.dateStart) els.dateStart.value = '';
      if (els.dateEnd)   els.dateEnd.value   = '';
      if (els.q)         els.q.value         = '';
      ['gen', 'dept'].forEach(key => {
        selected[key].clear();
        filterValues[key].forEach(v => selected[key].add(v));
        syncCheckboxes(key);
      });
      applyFilters();
    });
  }

  // ─── 초기화 ──────────────────────────────────────────────────
  async function init() {
    if (!API_URL) {
      if (els.count) els.count.textContent = 'API URL이 설정되지 않았습니다';
      return;
    }
    if (els.count) els.count.textContent = '로딩 중…';
    try {
      const res = await fetch(API_URL, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      releaseConfig = json.release || null;
      pdfProxyUrl   = json.pdfProxyUrl || (releaseConfig && releaseConfig.proxy) || '';

      allNotices = (json.notices || [])
        .filter(n => n && typeof n === 'object' && hasFile(n));

      buildFilters(allNotices);
      attachEvents();
      applyFilters();
    } catch (err) {
      console.error('[notice.js]', err);
      if (els.count) els.count.textContent = '데이터를 불러오지 못했습니다';
      if (els.empty) {
        els.empty.style.display = 'block';
        els.empty.innerHTML = '데이터 목록을 불러오지 못했습니다.<br>스프레드시트 배포 URL이나 네트워크 상태를 확인해주세요.';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
