// PAINS 공지사항 아카이브
(() => {
  'use strict';

  const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbwuNda5HuzwNhp7ecL0BTMt4eCgE8z9y1F8_kDR-ZaEp72mYngLp0DQ4ibWcKDEZyg/exec";
  const DEFAULT_PDF_PROXY = "https://pdf-proxy.painsports1905.workers.dev/?url=";
  const VIEWER_PAGE = 'pdf-viewer.html';

  const $ = (id) => document.getElementById(id);

  const els = {
    dateStart: $('filter-date-start'),
    dateEnd: $('filter-date-end'),

    genWrap: $('filter-generation'),
    deptWrap: $('filter-department'),

    gen: $('filter-generation-options'),
    dept: $('filter-department-options'),

    q: $('filter-q'),
    reset: $('btn-reset'),
    list: $('project-list'),
    count: $('results-count'),
    empty: $('empty'),
  };

  let allNotices = [];
  let releaseCfg = null;
  let pdfProxyUrl = DEFAULT_PDF_PROXY;

  const selected = {
    gen: new Set(),
    dept: new Set(),
  };

  const filterValues = {
    gen: [],
    dept: [],
  };

  function norm(v) {
    return (v ?? '').toString().trim();
  }

  function isPdfFile(name) {
    return /\.pdf$/i.test(norm(name));
  }

  function firstValue(...values) {
    return values.find((value) => norm(value) !== '') ?? '';
  }

  function noticeFileName(n) {
    return norm(firstValue(n.file, n.fileName, n.filename, n.name));
  }

  function noticeTitle(n) {
    const file = noticeFileName(n);
    return norm(n.title) || (file ? file.replace(/\.pdf$/i, '') : '제목 없음');
  }

  function isHttpUrl(url) {
    return /^https?:\/\//i.test(norm(url));
  }

  function isDriveUrl(url) {
    return /(^https?:\/\/)?(drive|docs)\.google\.com\//i.test(norm(url));
  }

  function cleanDriveId(id) {
    const decoded = decodeURIComponent(norm(id));
    if (!decoded || /^file_id$/i.test(decoded) || decoded.length < 20) return '';
    return decoded;
  }

  function extractDriveId(value) {
    const v = norm(value);
    if (!v) return '';

    const fileMatch = v.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([^/?#]+)/i);
    if (fileMatch) return cleanDriveId(fileMatch[1]);

    const idMatch = v.match(/[?&]id=([^&#]+)/i);
    if (idMatch) return cleanDriveId(idMatch[1]);

    if (!isHttpUrl(v) && /^[a-zA-Z0-9_-]{20,}$/.test(v)) return cleanDriveId(v);
    return '';
  }

  function noticeDriveId(n) {
    const explicitId = firstValue(
      n.driveId,
      n.driveID,
      n.drive_id,
      n.fileId,
      n.fileID,
      n.file_id,
      n.googleDriveId,
      n.google_drive_id
    );
    const explicitUrl = firstValue(
      n.driveUrl,
      n.driveURL,
      n.drive_url,
      n.googleDriveUrl,
      n.google_drive_url,
      n.pdfDriveUrl,
      n.pdf_drive_url
    );
    const pdfUrl = firstValue(n.pdfUrl, n.pdfURL, n.url, n.link, n.href);

    return extractDriveId(explicitId)
      || extractDriveId(explicitUrl)
      || (isDriveUrl(pdfUrl) ? extractDriveId(pdfUrl) : '');
  }

  function driveDownloadUrl(id) {
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  }

  function noticePdfUrl(n) {
    const url = norm(firstValue(
      n.pdfUrl,
      n.pdfURL,
      n.url,
      n.link,
      n.href,
      n.downloadUrl,
      n.download_url
    ));

    if (!url || isDriveUrl(url)) return '';
    return url;
  }

  function hasPdfSource(n) {
    const file = noticeFileName(n);
    const url = noticePdfUrl(n);

    if (noticeDriveId(n)) return true;
    if (file && isPdfFile(file)) return true;
    return !!url;
  }

  function coerceNotices(json) {
    if (json && Array.isArray(json.notices)) {
      return json.notices.map((n) => {
        const item = { ...n };
        if (item.date) {
          const d = new Date(item.date);
          if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            item.date = `${yyyy}-${mm}-${dd}`;
          }
        }
        return item;
      });
    }
    return [];
  }

  function hasInlineNotices(json) {
    return !!(
      json
      && Array.isArray(json.notices)
      && json.notices.some((notice) => noticeDriveId(notice) || noticePdfUrl(notice))
    );
  }

  async function fetchArchiveJson(apiUrl) {
    const res = await fetch(apiUrl, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error(`Google Apps Script fetch failed: ${res.status}`);
    return res.json();
  }

  async function resolveArchiveJson() {
    try {
      let res = await fetch(`/api/content.js?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        res = await fetch(`data/site-content.json?v=${Date.now()}`, { cache: 'no-store' });
      }
      if (!res.ok) throw new Error(`Content config fetch failed: ${res.status}`);
      const json = await res.json();

      if (hasInlineNotices(json)) return json;

      const url = norm(json?.settings?.noticeArchiveApiUrl);
      if (url) return fetchArchiveJson(url);
    } catch (err) {
      console.warn('[PAINS] 콘텐츠 설정을 불러오지 못해 기본 공지 API를 사용합니다.', err);
    }

    return fetchArchiveJson(DEFAULT_API_URL);
  }

  function byNumberPrefix(a, b) {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    const aIsNum = !Number.isNaN(na);
    const bIsNum = !Number.isNaN(nb);
    if (aIsNum && bIsNum) return na - nb;
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    return a.localeCompare(b, 'ko');
  }

  function unique(values) {
    return Array.from(new Set(values.filter((v) => norm(v) !== '').map((v) => norm(v))));
  }

  function buildCheckboxOptions(container, values, key) {
    if (!container) return;
    container.innerHTML = '';

    values.forEach((value, idx) => {
      const label = document.createElement('label');
      label.className = 'check-option';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.dataset.filterKey = key;
      input.id = `${key}-${idx}`;

      const span = document.createElement('span');
      span.textContent = value;

      label.appendChild(input);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  function updateSummaryText(key) {
    const wrapMap = {
      gen: els.genWrap,
      dept: els.deptWrap,
    };

    const wrap = wrapMap[key];
    if (!wrap) return;

    const summaryText = wrap.querySelector('.multi-filter-summary-text');
    if (!summaryText) return;

    const total = filterValues[key].length;
    const checked = selected[key].size;

    if (checked === 0 || checked === total) {
      summaryText.textContent = '전체';
      return;
    }

    if (checked === 1) {
      summaryText.textContent = Array.from(selected[key])[0];
      return;
    }

    const first = Array.from(selected[key])[0];
    summaryText.textContent = `${first} 외 ${checked - 1}개`;
  }

  function syncCheckboxes(key) {
    const containerMap = {
      gen: els.gen,
      dept: els.dept,
    };

    const container = containerMap[key];
    if (!container) return;

    const boxes = container.querySelectorAll('input[type="checkbox"]');
    const isAllSelected = selected[key].size === filterValues[key].length;

    boxes.forEach((box) => {
      box.checked = isAllSelected || selected[key].has(box.value);
    });

    updateSummaryText(key);
  }

  function selectAll(key) {
    selected[key].clear();
    filterValues[key].forEach((v) => selected[key].add(v));
    syncCheckboxes(key);
    applyFilters();
  }

  function clearAll(key) {
    selected[key].clear();
    syncCheckboxes(key);
    applyFilters();
  }

  function buildFilters(notices) {
    filterValues.gen = unique(notices.map((n) => n.generation)).sort(byNumberPrefix);
    filterValues.dept = unique(notices.map((n) => n.department)).sort((a, b) => a.localeCompare(b, 'ko'));

    buildCheckboxOptions(els.gen, filterValues.gen, 'gen');
    buildCheckboxOptions(els.dept, filterValues.dept, 'dept');

    // 기본 상태는 "전체" (모든 항목 체크)
    ['gen', 'dept'].forEach(key => {
      selected[key].clear();
      filterValues[key].forEach(v => selected[key].add(v));
      syncCheckboxes(key);
    });
  }

  function noticeMeta(n) {
    const parts = [];
    if (norm(n.date)) {
      const dateParts = norm(n.date).split('-');
      if (dateParts.length === 3) {
        parts.push(`${dateParts[0]}년 ${dateParts[1]}월 ${dateParts[2]}일`);
      } else {
        parts.push(norm(n.date));
      }
    }
    if (norm(n.generation)) parts.push(norm(n.generation));
    if (norm(n.department)) parts.push(norm(n.department));
    return parts.join(' · ');
  }

  function localPdfUrl(file) {
    const f = norm(file);
    return encodeURI(`pdfs/${f}`);
  }

  function parseReleaseCfg(json) {
    const rel = json?.release;
    if (!rel) return null;

    const owner = norm(rel.owner);
    const repo = norm(rel.repo);
    const tag = "NOTICEs";
    const useLatest = !!(rel.useLatest ?? rel.use_latest);
    const proxy = norm(rel.proxy);

    if (!owner || !repo) return null;

    return { owner, repo, tag, useLatest, proxy };
  }

  function resolvePdfProxyUrl(json) {
    return norm(firstValue(
      json?.pdfProxyUrl,
      json?.pdf_proxy_url,
      json?.proxy,
      json?.release?.proxy
    )) || DEFAULT_PDF_PROXY;
  }

  function releaseDownloadUrl(file) {
    if (!releaseCfg) return null;
    const f = norm(file);
    if (!f) return null;

    if (releaseCfg.useLatest) {
      return `https://github.com/${releaseCfg.owner}/${releaseCfg.repo}/releases/latest/download/${encodeURIComponent(f)}`;
    }

    return `https://github.com/${releaseCfg.owner}/${releaseCfg.repo}/releases/download/${encodeURIComponent(releaseCfg.tag)}/${encodeURIComponent(f)}`;
  }

  function maybeProxyUrl(directUrl) {
    if (!isHttpUrl(directUrl)) return null;
    const base = norm(pdfProxyUrl);
    if (!base) return null;

    if (base.includes('{url}')) {
      return base.replace('{url}', encodeURIComponent(directUrl));
    }
    return base + encodeURIComponent(directUrl);
  }

  function buildViewerUrl({ title, file, srcUrl, directUrl, downloadUrl }) {
    const params = new URLSearchParams();
    if (title) params.set('title', title);
    if (file) params.set('file', file);
    if (srcUrl) params.set('src', srcUrl);
    if (directUrl) params.set('direct', directUrl);
    if (downloadUrl) params.set('download', downloadUrl);
    params.set('from', 'notice');
    return `${VIEWER_PAGE}?${params.toString()}`;
  }

  function pdfLinksForNotice(n) {
    const file = noticeFileName(n);
    const title = noticeTitle(n);
    const driveId = noticeDriveId(n);
    const pdfUrl = noticePdfUrl(n);

    let directUrl = '';
    let downloadUrl = '';

    if (driveId) {
      directUrl = driveDownloadUrl(driveId);
      downloadUrl = directUrl;
    } else if (pdfUrl) {
      directUrl = isHttpUrl(pdfUrl) ? pdfUrl : encodeURI(pdfUrl);
      downloadUrl = directUrl;
    } else {
      const local = localPdfUrl(file);
      const release = releaseDownloadUrl(file);
      directUrl = releaseCfg ? release : local;
      downloadUrl = directUrl;
    }

    const srcUrl = directUrl
      ? (maybeProxyUrl(directUrl) || directUrl)
      : directUrl;

    const viewerFile = file || (driveId ? `${title}.pdf` : '');
    const previewUrl = buildViewerUrl({ title, file: viewerFile, srcUrl, directUrl, downloadUrl });

    return { previewUrl, downloadUrl, directUrl, srcUrl };
  }

  function render(notices) {
    if (!els.list) return;

    els.list.innerHTML = '';

    if (els.count) els.count.textContent = `${notices.length}개 공지`;
    if (els.empty) els.empty.style.display = notices.length ? 'none' : 'block';

    notices.forEach((n) => {
      const title = noticeTitle(n);

      const { previewUrl, downloadUrl } = pdfLinksForNotice(n);
      if (!previewUrl || !downloadUrl) return;

      const li = document.createElement('li');
      li.className = 'project-card';
      if (n.important) li.classList.add('is-important');

      const main = document.createElement('div');
      main.className = 'project-main';

      const aTitle = document.createElement('a');
      aTitle.className = 'project-title';
      aTitle.href = previewUrl;
      aTitle.target = '_blank';
      aTitle.rel = 'noopener';

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

      main.appendChild(aTitle);
      if (meta.textContent) main.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'project-actions';

      const btnViewer = document.createElement('a');
      btnViewer.className = 'btn';
      btnViewer.href = previewUrl;
      btnViewer.target = '_blank';
      btnViewer.rel = 'noopener';
      btnViewer.textContent = '열기';

      const btnDownload = document.createElement('a');
      btnDownload.className = 'btn btn-download';
      btnDownload.href = downloadUrl;
      btnDownload.target = '_blank';
      btnDownload.rel = 'noopener';
      btnDownload.setAttribute('download', '');
      btnDownload.textContent = '다운로드';

      actions.appendChild(btnViewer);
      actions.appendChild(btnDownload);

      li.appendChild(main);
      li.appendChild(actions);

      els.list.appendChild(li);
    });
  }

  function matchMulti(selectedSet, value, allCount) {
    const v = norm(value);
    if (selectedSet.size === 0) return true;
    if (selectedSet.size === allCount) return true;
    return selectedSet.has(v);
  }

  function applyFilters() {
    const ds = norm(els.dateStart?.value);
    const de = norm(els.dateEnd?.value);
    const q = norm(els.q?.value).toLowerCase();

    const filtered = allNotices.filter((n) => {
      if (n.important) return true;

      if (ds && norm(n.date) < ds) return false;
      if (de && norm(n.date) > de) return false;
      if (!matchMulti(selected.gen, n.generation, filterValues.gen.length)) return false;
      if (!matchMulti(selected.dept, n.department, filterValues.dept.length)) return false;

      if (q) {
        const t = norm(n.title).toLowerCase();
        if (!t.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (a.important && !b.important) return -1;
      if (!a.important && b.important) return 1;
      return norm(b.date).localeCompare(norm(a.date));
    });

    render(filtered);
  }

  function attachFilterCheckboxEvents(container, key) {
    if (!container) return;

    container.addEventListener('change', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;

      if (target.checked) {
        selected[key].add(target.value);
      } else {
        selected[key].delete(target.value);
      }

      updateSummaryText(key);
      applyFilters();
    });
  }

  function attachEvents() {
    [els.dateStart, els.dateEnd].forEach((el) => {
      if (!el) return;
      el.addEventListener('change', applyFilters);
    });

    attachFilterCheckboxEvents(els.gen, 'gen');
    attachFilterCheckboxEvents(els.dept, 'dept');

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.mini-btn');
      if (!btn) return;

      const action = btn.dataset.action;
      const target = btn.dataset.target;

      if (!action || !target || !selected[target]) return;

      if (action === 'select-all') {
        selectAll(target);
      } else if (action === 'clear-all') {
        clearAll(target);
      }
    });

    if (els.q) els.q.addEventListener('input', applyFilters);

    if (els.reset) {
      els.reset.addEventListener('click', () => {
        if (els.dateStart) els.dateStart.value = '';
        if (els.dateEnd) els.dateEnd.value = '';
        if (els.q) els.q.value = '';

        ['gen', 'dept'].forEach(key => {
          selected[key].clear();
          filterValues[key].forEach(v => selected[key].add(v));
          syncCheckboxes(key);
        });

        applyFilters();
      });
    }

    document.addEventListener('click', (e) => {
      const detailsList = document.querySelectorAll('.multi-filter');
      detailsList.forEach((details) => {
        if (!details.contains(e.target)) {
          details.removeAttribute('open');
        }
      });
    });
  }

  async function init() {
    if (els.count) els.count.textContent = '로딩 중…';

    try {
      const json = await resolveArchiveJson();

      releaseCfg = parseReleaseCfg(json);
      pdfProxyUrl = resolvePdfProxyUrl(json);

      const notices = coerceNotices(json)
        .filter((n) => n && typeof n === 'object')
        .filter(hasPdfSource);

      allNotices = notices;

      buildFilters(allNotices);
      attachEvents();
      applyFilters();
    } catch (err) {
      console.error(err);
      if (els.count) els.count.textContent = '데이터를 불러오지 못했습니다';
      if (els.empty) {
        els.empty.style.display = 'block';
        els.empty.innerHTML =
          '데이터 목록을 불러오지 못했습니다.<br />' +
          '스프레드시트의 배포 URL이나 네트워크 상태를 확인해 주세요.';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
