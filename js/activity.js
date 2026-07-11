// PAINS 활동 아카이브 (GitHub Pages용)
// - 구글 앱스 스크립트 API에서 프로젝트 목록을 불러와 필터/검색 후 렌더링합니다.
// - 다중 선택 필터 지원 (전체 선택 / 전체 해제 포함)

(() => {
  'use strict';

  // 기본값은 fallback이고, 실제 운영 URL은 Google Sheets/API에서 관리합니다.
  const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbypl1Z5iLKPPBGwpE8xv2TyCbgl5fmGBhYi1Zn16aU8tG2zvDGtIyALBAhQZ8Jpz5fJyQ/exec";
  const DEFAULT_PDF_PROXY = "https://pdf-proxy.painsports1905.workers.dev/?url=";
  const VIEWER_PAGE = 'pdf-viewer.html';
  const EXCLUDED_FILES = new Set(['03V_07.pdf', '02V_07.pdf']);

  const $ = (id) => document.getElementById(id);

  const els = {
    yearWrap: $('filter-year'),
    genWrap: $('filter-generation'),
    periodWrap: $('filter-period'),
    sportWrap: $('filter-sport'),

    year: $('filter-year-options'),
    gen: $('filter-generation-options'),
    period: $('filter-period-options'),
    sport: $('filter-sport-options'),

    q: $('filter-q'),
    reset: $('btn-reset'),
    list: $('project-list'),
    count: $('results-count'),
    empty: $('empty'),
  };

  let allProjects = [];
  let releaseCfg = null;
  let pdfProxyUrl = DEFAULT_PDF_PROXY;

  const selected = {
    year: new Set(),
    gen: new Set(),
    period: new Set(),
    sport: new Set(),
  };

  const filterValues = {
    year: [],
    gen: [],
    period: [],
    sport: [],
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

  function projectFileName(p) {
    return norm(firstValue(p.file, p.fileName, p.filename, p.name));
  }

  function projectTitle(p) {
    const file = projectFileName(p);
    return norm(p.title) || (file ? file.replace(/\.pdf$/i, '') : '제목 없음');
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

  function projectDriveId(p) {
    const explicitId = firstValue(
      p.driveId,
      p.driveID,
      p.drive_id,
      p.fileId,
      p.fileID,
      p.file_id,
      p.googleDriveId,
      p.google_drive_id
    );
    const explicitUrl = firstValue(
      p.driveUrl,
      p.driveURL,
      p.drive_url,
      p.googleDriveUrl,
      p.google_drive_url,
      p.pdfDriveUrl,
      p.pdf_drive_url
    );
    const pdfUrl = firstValue(p.pdfUrl, p.pdfURL, p.url, p.link, p.href);

    return extractDriveId(explicitId)
      || extractDriveId(explicitUrl)
      || (isDriveUrl(pdfUrl) ? extractDriveId(pdfUrl) : '');
  }

  function driveDownloadUrl(id) {
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  }

  function projectPdfUrl(p) {
    const url = norm(firstValue(
      p.pdfUrl,
      p.pdfURL,
      p.url,
      p.link,
      p.href,
      p.downloadUrl,
      p.download_url
    ));

    if (!url || isDriveUrl(url)) return '';
    return url;
  }

  function hasPdfSource(p) {
    const file = projectFileName(p);
    const url = projectPdfUrl(p);

    if (projectDriveId(p)) return true;
    if (file && isPdfFile(file)) return true;
    return !!url;
  }

  function coerceProjects(json) {
    if (Array.isArray(json)) {
      if (json.every((x) => typeof x === 'string')) {
        return json
          .filter(isPdfFile)
          .map((file) => ({
            title: file.replace(/\.pdf$/i, ''),
            file,
          }));
      }
      return json;
    }
    if (json && Array.isArray(json.projects)) return json.projects;
    return [];
  }

  function hasInlineProjects(json) {
    return !!(
      json
      && Array.isArray(json.projects)
      && json.projects.some((project) => projectDriveId(project) || projectPdfUrl(project))
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

      if (hasInlineProjects(json)) return json;

      const url = norm(json?.settings?.projectArchiveApiUrl);
      if (url) return fetchArchiveJson(url);
    } catch (err) {
      console.warn('[PAINS] 콘텐츠 설정을 불러오지 못해 기본 프로젝트 API를 사용합니다.', err);
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
      year: els.yearWrap,
      gen: els.genWrap,
      period: els.periodWrap,
      sport: els.sportWrap,
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
      year: els.year,
      gen: els.gen,
      period: els.period,
      sport: els.sport,
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

  function buildFilters(projects) {
    filterValues.year = unique(projects.map((p) => p.year))
      .sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        const aIsNum = !Number.isNaN(na);
        const bIsNum = !Number.isNaN(nb);
        if (aIsNum && bIsNum) return nb - na;
        return b.localeCompare(a, 'ko');
      });

    filterValues.gen = unique(projects.map((p) => p.generation)).sort(byNumberPrefix);
    filterValues.period = unique(projects.map((p) => p.period)).sort((a, b) => a.localeCompare(b, 'ko'));
    filterValues.sport = unique(projects.map((p) => p.sport)).sort((a, b) => a.localeCompare(b, 'ko'));

    buildCheckboxOptions(els.year, filterValues.year, 'year');
    buildCheckboxOptions(els.gen, filterValues.gen, 'gen');
    buildCheckboxOptions(els.period, filterValues.period, 'period');
    buildCheckboxOptions(els.sport, filterValues.sport, 'sport');

    // 기본 상태는 "전체" (모든 항목 체크)
    ['year', 'gen', 'period', 'sport'].forEach(key => {
      selected[key].clear();
      filterValues[key].forEach(v => selected[key].add(v));
      syncCheckboxes(key);
    });
  }

  function projectMeta(p) {
    const parts = [];
    if (norm(p.year)) parts.push(norm(p.year));
    if (norm(p.generation)) parts.push(norm(p.generation));
    if (norm(p.period)) parts.push(norm(p.period));
    if (norm(p.sport)) parts.push(norm(p.sport));
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
    const tag = norm(rel.tag);
    const useLatest = !!(rel.useLatest ?? rel.use_latest);
    const proxy = norm(rel.proxy);

    if (!owner || !repo) return null;
    if (!useLatest && !tag) return null;

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

  function releaseDownloadUrl(file, projectTag) {
    if (!releaseCfg) return null;
    const f = norm(file);
    if (!f) return null;

    if (releaseCfg.useLatest) {
      return `https://github.com/${releaseCfg.owner}/${releaseCfg.repo}/releases/latest/download/${encodeURIComponent(f)}`;
    }

    const tag = norm(projectTag) || releaseCfg.tag;
    return `https://github.com/${releaseCfg.owner}/${releaseCfg.repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(f)}`;
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
    params.set('from', 'activity');
    return `${VIEWER_PAGE}?${params.toString()}`;
  }

  function pdfLinksForProject(p) {
    const file = projectFileName(p);
    const title = projectTitle(p);
    const driveId = projectDriveId(p);
    const pdfUrl = projectPdfUrl(p);

    let directUrl = '';
    let downloadUrl = '';

    if (driveId) {
      directUrl = driveDownloadUrl(driveId);
      downloadUrl = directUrl;
    } else if (pdfUrl) {
      directUrl = isHttpUrl(pdfUrl) ? pdfUrl : encodeURI(pdfUrl);
      downloadUrl = directUrl;
    } else {
      const origin = norm(p.origin).toLowerCase();
      const local = localPdfUrl(file);
      const release = releaseDownloadUrl(file, p.tag);
      directUrl = (origin === 'local') ? local : (origin === 'release' ? release : (releaseCfg ? release : local));
      downloadUrl = directUrl;
    }

    const srcUrl = directUrl
      ? (maybeProxyUrl(directUrl) || directUrl)
      : directUrl;

    const viewerFile = file || (driveId ? `${title}.pdf` : '');
    const previewUrl = buildViewerUrl({ title, file: viewerFile, srcUrl, directUrl, downloadUrl });

    return {
      previewUrl,
      downloadUrl,
      directUrl,
      srcUrl,
    };
  }

  function render(projects) {
    if (!els.list) return;

    els.list.innerHTML = '';

    if (els.count) els.count.textContent = `${projects.length}개 프로젝트`;
    if (els.empty) els.empty.style.display = projects.length ? 'none' : 'block';

    projects.forEach((p) => {
      const title = projectTitle(p);

      const { previewUrl, downloadUrl } = pdfLinksForProject(p);
      if (!previewUrl || !downloadUrl) return;

      const li = document.createElement('li');
      li.className = 'project-card';

      const main = document.createElement('div');
      main.className = 'project-main';

      const aTitle = document.createElement('a');
      aTitle.className = 'project-title';
      aTitle.href = previewUrl;
      aTitle.target = '_blank';
      aTitle.rel = 'noopener';
      aTitle.textContent = title;

      const meta = document.createElement('div');
      meta.className = 'project-meta';
      meta.textContent = projectMeta(p);

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
    if (selectedSet.size === 0) return true;           // 아무것도 선택 안 했으면 전체
    if (selectedSet.size === allCount) return true;    // 전부 선택한 상태도 전체와 동일
    return selectedSet.has(v);
  }

  function applyFilters() {
    const q = norm(els.q?.value).toLowerCase();

    const filtered = allProjects.filter((proj) => {
      if (!matchMulti(selected.year, proj.year, filterValues.year.length)) return false;
      if (!matchMulti(selected.gen, proj.generation, filterValues.gen.length)) return false;
      if (!matchMulti(selected.period, proj.period, filterValues.period.length)) return false;
      if (!matchMulti(selected.sport, proj.sport, filterValues.sport.length)) return false;

      if (q) {
        const t = norm(proj.title).toLowerCase();
        if (!t.includes(q)) return false;
      }

      return true;
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
    attachFilterCheckboxEvents(els.year, 'year');
    attachFilterCheckboxEvents(els.gen, 'gen');
    attachFilterCheckboxEvents(els.period, 'period');
    attachFilterCheckboxEvents(els.sport, 'sport');

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

    if (els.q) {
      els.q.addEventListener('input', applyFilters);
    }

    if (els.reset) {
      els.reset.addEventListener('click', () => {
        ['year', 'gen', 'period', 'sport'].forEach(key => {
          selected[key].clear();
          filterValues[key].forEach(v => selected[key].add(v));
          syncCheckboxes(key);
        });

        if (els.q) els.q.value = '';
        applyFilters();
      });
    }

    // 다른 곳 클릭 시 열린 details 닫기
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

      const projects = coerceProjects(json)
        .filter((p) => p && typeof p === 'object')
        .filter(hasPdfSource)
        .filter((p) => !EXCLUDED_FILES.has(String(p.file || '').trim()));

      allProjects = projects;

      buildFilters(allProjects);
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
