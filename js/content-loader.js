(() => {
  'use strict';

  const FALLBACK_CONTENT_URL = 'data/site-content.json';
  const CONTENT_SHEET_ID = '1-kCJGJfKqNTW1D09GdNoL6eyZXUDJO_Ef_EBY0grJNo';
  const LIVE_APPLY_PATHS = new Set([
    'recruitment.bannerText',
    'recruitment.bannerButtonLabel',
    'recruitment.bannerVisible',
    'recruitment.applyCtaTitle',
    'recruitment.applyCtaSubtitle',
    'recruitment.formUrl',
    'recruitment.formLabel',
    'recruitment.applyPeriod',
    'recruitment.applyVisible'
  ]);

  const page = () => location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
  const isVisible = (item) => item && boolValue(item.visible, true);
  const byOrder = (a, b) => Number(a.order ?? 999) - Number(b.order ?? 999);

  function revealContent() {
    if (window.__painsCmsLoadingTimer) {
      window.clearTimeout(window.__painsCmsLoadingTimer);
      window.__painsCmsLoadingTimer = null;
    }
    document.documentElement.classList.remove('pains-cms-loading');
    document.documentElement.classList.add('pains-cms-ready');
  }

  function text(selector, value, root = document) {
    const el = root.querySelector(selector);
    if (el && value !== undefined && value !== null) el.textContent = value;
  }

  function html(selector, value, root = document) {
    const el = root.querySelector(selector);
    if (el && value !== undefined && value !== null) el.innerHTML = value;
  }

  function textAll(selector, values, root = document) {
    const nodes = root.querySelectorAll(selector);
    nodes.forEach((el, index) => {
      const value = values?.[index];
      if (value !== undefined && value !== null) el.textContent = value;
    });
  }

  function multiline(el, value) {
    if (!el || value === undefined || value === null) return;
    el.textContent = value;
    el.style.whiteSpace = 'pre-line';
  }

  function lines(selector, values, root = document) {
    const el = root.querySelector(selector);
    if (!el || !Array.isArray(values)) return;
    el.replaceChildren();
    values.forEach((value) => {
      const span = document.createElement('span');
      span.className = 'home-title-line';
      span.textContent = value;
      el.appendChild(span);
    });
  }

  function heroLines(selector, values, root = document) {
    const el = root.querySelector(selector);
    if (!el || !Array.isArray(values)) return;
    el.replaceChildren();
    values.forEach((value) => {
      const span = document.createElement('span');
      span.textContent = value;
      el.appendChild(span);
    });
  }

  function assetUrl(src) {
    const value = String(src || '').trim();
    if (!value) return value;

    const optimizedLocalAssets = {
      'images/pains-data-stadium.png': 'images/optimized/pains-data-stadium-1280.webp',
      'images/pains-sports-analytics-blue.png': 'images/optimized/pains-sports-analytics-blue-1280.webp',
      'images/project-field-model.png': 'images/optimized/project-field-model-1280.webp',
      'images/seminar-20260515.jpg': 'images/optimized/seminar-20260515-1280.webp',
      'images/project-column.png': 'images/optimized/project-column-1280.webp',
      'images/community-summer-mt-2026.jpg': 'images/optimized/community-summer-mt-2026-1280.webp',
      'images/activity4.png': 'images/optimized/activity4-1280.webp',
      'images/activity_edited_1.png': 'images/optimized/activity_edited_1-1280.webp',
      'images/activity2.png': 'images/optimized/activity2-1280.webp',
      'images/activity03.png': 'images/optimized/activity03-1280.webp',
      'images/소개사진.jpg': 'images/optimized/소개사진-1280.webp'
    };
    if (optimizedLocalAssets[value]) return optimizedLocalAssets[value];

    const driveMatch = value.match(/drive\.google\.com\/file\/d\/([^/]+)/)
      || value.match(/[?&]id=([^&]+)/);
    if (driveMatch?.[1]) {
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w2400`;
    }

    return value;
  }

  function firstValue(...values) {
    return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  }

  function boolValue(value, fallback) {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'open', 'opened', 'enabled', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'closed', 'disabled', 'off', 'hidden'].includes(normalized)) return false;
    return fallback;
  }

  function template(value, vars = {}) {
    return String(value || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
  }

  function cloneContent(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function setByPath(target, path, value) {
    const keys = String(path || '').split('.').map((key) => key.trim()).filter(Boolean);
    if (!keys.length) return;
    let cursor = target;
    keys.slice(0, -1).forEach((key) => {
      if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
      cursor = cursor[key];
    });
    cursor[keys[keys.length - 1]] = value;
  }

  function splitSheetLines(value) {
    return String(value || '').split('|').map((line) => line.trim()).filter(Boolean);
  }

  function parseKstDate(value, boundary = 'start') {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    const dotted = raw.match(/^(\d{4})[.\/]\s*(\d{1,2})[.\/]\s*(\d{1,2})(?:\s+(?:\([^)]*\)\s*)?(\d{1,2}):(\d{2}))?/);
    const match = iso || dotted;
    if (!match) {
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const [, year, month, day, hour, minute] = match;
    const hh = hour || (boundary === 'end' ? '23' : '00');
    const mm = minute || (boundary === 'end' ? '59' : '00');
    const ss = boundary === 'end' ? '59' : '00';
    const stamp = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${ss}+09:00`;
    const parsed = new Date(stamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function featureGate(content, prefix, fallbackOpen = false) {
    const settings = content?.settings || {};
    const manual = firstValue(
      settings[`${prefix}Enabled`],
      settings[`${prefix}Open`],
      settings[`${prefix}Visible`]
    );
    const manualText = manual === undefined ? '' : String(manual).trim().toLowerCase();
    if (manualText && manualText !== 'auto') {
      return boolValue(manual, fallbackOpen);
    }

    const start = parseKstDate(firstValue(settings[`${prefix}StartAt`], settings[`${prefix}Start`]), 'start');
    const end = parseKstDate(firstValue(settings[`${prefix}EndAt`], settings[`${prefix}End`]), 'end');
    const now = new Date();

    if (start && now < start) return false;
    if (end && now > end) return false;
    if (start || end) return true;
    return fallbackOpen;
  }

  function configureGateLink(id, isOpen, href, message) {
    const links = document.querySelectorAll(`#link-${id}, [data-gate-link="${id}"]`);
    links.forEach((link) => {
      link.removeAttribute('onclick');
      link.onclick = null;
      link.href = href || id;
      link.classList.toggle('is-disabled-link', !isOpen);
      link.setAttribute('aria-disabled', String(!isOpen));

      if (!isOpen) {
        link.onclick = (event) => {
          event.preventDefault();
          alert(message);
          return false;
        };
      }
    });
  }

  function renderAccessGates(content) {
    const settings = content?.settings || {};
    const applyOpen = featureGate(content, 'apply', false);
    const resultOpen = featureGate(content, 'result', false);

    configureGateLink(
      'apply',
      applyOpen,
      settings.applyHref || 'apply',
      settings.applyClosedMessage || '지원 기간이 아닙니다.'
    );
    configureGateLink(
      'result',
      resultOpen,
      settings.resultHref || 'result',
      settings.resultClosedMessage || '지원 결과 조회 기간이 아닙니다.'
    );
  }

  function trackAsset(src) {
    return assetUrl(src);
  }

  function applyImageSource(img, src) {
    if (!img || !src) return;
    const url = trackAsset(src);
    img.src = url;

    const responsive = url.match(/^(.*)-1280\.webp(?:\?.*)?$/i);
    if (responsive) {
      img.srcset = `${responsive[1]}-640.webp 640w, ${responsive[1]}-1280.webp 1280w`;
      img.sizes = img.closest('.home-hero') ? '100vw' : '(max-width: 820px) calc(100vw - 36px), 50vw';
    } else {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
    }
  }

  function image(selector, src, alt, root = document) {
    const img = root.querySelector(selector);
    if (!img || !src) return;
    applyImageSource(img, src);
    if (alt !== undefined) img.alt = alt;
  }

  function backgroundImage(el, src) {
    if (!el || !src) return;
    el.style.backgroundImage = `url("${trackAsset(src)}")`;
  }

  function visibleItems(items) {
    return Array.isArray(items) ? items.filter(isVisible).sort(byOrder) : [];
  }

  // 조직도 제목은 organization.generation + titleTemplate 조합으로 만듭니다.
  // 아직 옛 형식(organization.title = "11기 운영진 조직도")만 있는 시트를 위한 보정입니다.
  function fillOrganizationGeneration(content) {
    const organization = content?.organization;
    if (!organization || organization.generation) return;
    if (typeof organization.title !== 'string') return;

    const match = organization.title.match(/^(\d+기)\s+운영진 조직도$/);
    if (!match) return;
    organization.generation = match[1];
    organization.titleTemplate = '{generation} 운영진 조직도';
  }

  async function loadContent() {
    if (window.__painsContentPromise) return window.__painsContentPromise;

    const contentPromise = fetch(FALLBACK_CONTENT_URL, { cache: 'default' })
      .then((res) => {
        if (!res.ok) throw new Error(`Content fetch failed: ${res.status}`);
        return res.json();
      })
      .catch((error) => {
        console.warn('[PAINS] 콘텐츠 데이터를 불러오지 못했습니다. HTML fallback을 유지합니다.', error);
        return null;
      });

    // 배포된 JSON만 콘텐츠 원본으로 사용합니다. 브라우저 캐시나 Apps Script가
    // 나중에 화면 전체를 덮어쓰지 않으므로 이전 내용이 잠깐 보이는 현상이 없습니다.
    window.__painsContentRefreshPromise = Promise.resolve(null);
    window.__painsContentPromise = contentPromise;

    return window.__painsContentPromise;
  }

  function renderTimeline(items) {
    const track = document.querySelector('.home-timeline__track');
    if (!track) return;

    track.replaceChildren();
    visibleItems(items).forEach((item) => {
      const wrap = document.createElement('div');
      const position = item.position === 'bottom' ? 'bottom' : 'top';
      wrap.className = `home-timeline__item home-timeline__item--${position}`;

      const content = document.createElement('span');
      content.className = 'home-timeline__content';

      const year = document.createElement('strong');
      year.textContent = item.year ?? '';

      const title = document.createElement('span');
      title.textContent = item.title ?? '';

      content.append(year, title);
      wrap.appendChild(content);
      track.appendChild(wrap);
    });
  }

  function renderHomeAxes(axes) {
    const cards = {
      about: document.querySelector('.home-axis--about'),
      projects: document.querySelector('.home-axis--projects'),
      community: document.querySelector('.home-axis--community')
    };

    visibleItems(axes).forEach((axis) => {
      const card = cards[axis.id];
      if (!card) return;
      if (axis.href) card.href = axis.href;
      image('img', axis.image, axis.alt, card);
      text('.home-axis__body strong', axis.title, card);
    });
  }

  function renderHomeStoryNav(items) {
    const nav = document.querySelector('.home-story-nav');
    if (!nav) return;
    nav.replaceChildren();

    visibleItems(items).forEach((item) => {
      const link = document.createElement('a');
      link.href = item.href || '#';
      link.textContent = item.label || '';
      if (item.targetId) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          if (typeof window.scrollToSection === 'function') {
            window.scrollToSection(item.targetId);
          } else {
            document.getElementById(item.targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }
      nav.appendChild(link);
    });
  }

  function renderHomeStoryCards(cards) {
    const roots = {
      about: document.querySelector('.home-feature-card--about, .story-panel--about'),
      projects: document.querySelector('.home-feature-card--projects, .story-panel--projects'),
      community: document.querySelector('.home-feature-card--community, .community')
    };

    visibleItems(cards).forEach((card) => {
      const boundRoot = document.querySelector(`[data-home-card="${card.id}"]`);
      const root = boundRoot || roots[card.id];
      if (!root) return;

      if (boundRoot) {
        text('[data-field="eyebrow"]', card.eyebrow, boundRoot);
        const title = boundRoot.querySelector('[data-field="title"]');
        if (title && Array.isArray(card.titleLines) && card.titleLines.length) {
          title.textContent = card.titleLines.join('\n');
          title.style.whiteSpace = 'pre-line';
        }
        text('[data-field="description"]', card.description, boundRoot);
        if (card.image) image('[data-field="image"]', card.image, card.alt, boundRoot);
        if (Array.isArray(card.images)) {
          card.images.forEach((item, index) => {
            const img = boundRoot.querySelector(index === 0 ? '[data-field="image"]' : '[data-field="image2"]');
            if (!img || !item?.src) return;
            applyImageSource(img, item.src);
            if (item.alt !== undefined) img.alt = item.alt;
          });
        }
        const primary = boundRoot.querySelector('[data-field="primary-cta"]');
        if (primary && card.primaryCta) {
          primary.firstChild.textContent = `${card.primaryCta.label || ''} `;
          primary.href = card.primaryCta.href || '#';
        }

        const figcaptions = boundRoot.querySelectorAll('figcaption');
        setCaption(figcaptions[0], card.caption);
        setCaption(figcaptions[1], card.caption2);
        return;
      }

      text('.home-eyebrow', card.eyebrow, root);
      lines('h3, h2', card.titleLines, root);
      text('.home-feature-card__copy > p:not(.home-eyebrow), .story-panel__copy > p:not(.home-eyebrow), .community__header > p:last-child', card.description, root);

      if (card.image) image('.home-feature-card__media img, .story-panel__media img', card.image, card.alt, root);

      if (Array.isArray(card.images)) {
        const imgs = root.querySelectorAll('.home-mosaic img, .community__gallery img');
        card.images.forEach((item, index) => {
          const img = imgs[index];
          if (!img) return;
          applyImageSource(img, item.src);
          if (item.alt !== undefined) img.alt = item.alt;
        });
      }

      const actions = root.querySelectorAll('.home-billboard__actions a');
      if (card.primaryCta && actions[0]) {
        actions[0].textContent = card.primaryCta.label || '';
        actions[0].href = card.primaryCta.href || '#';
      }
      if (card.secondaryCta && actions[1]) {
        actions[1].textContent = card.secondaryCta.label || '';
        actions[1].href = card.secondaryCta.href || '#';
      }
    });
  }

  function renderApplyTimeline(r) {
    const container = document.getElementById('js-apply-timeline') || document.querySelector('#sec-recruit .timeline');
    if (!container) return;
    if (!Array.isArray(r.timeline) || !r.timeline.length) return;

    container.replaceChildren();
    visibleItems(r.timeline).forEach((item) => {
      const li = document.createElement('div');
      li.className = 'timeline-item';

      const content = document.createElement('div');
      content.className = 'timeline-content';
      if (item.highlight) content.style.cssText = 'background-color:#ab3333;color:white;';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'timeline-date';
      if (item.highlight) dateSpan.style.color = '#ffffff';
      dateSpan.textContent = item.date || item.track2Date || item.track1Date || '';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'timeline-title';
      titleSpan.textContent = item.step || item.track2Step || item.track1Step || '';

      content.append(dateSpan, titleSpan);

      const note = item.note || item.track2Note || item.track1Note || '';
      if (note) {
        const p = document.createElement('p');
        p.style.cssText = `font-size:0.9rem;${item.highlight ? '' : 'color:#666;'}`;
        p.textContent = note;
        content.appendChild(p);
      }

      li.appendChild(content);
      container.appendChild(li);
    });
  }

  function renderApplyCards(r) {
    const activities = document.getElementById('js-apply-activities');
    if (activities && Array.isArray(r.activities)) {
      activities.replaceChildren();
      visibleItems(r.activities).forEach((item) => {
        const card = document.createElement('div');
        card.className = 'activity-card';
        const media = document.createElement('div');
        media.className = 'activity-img-wrapper';
        const img = document.createElement('img');
        applyImageSource(img, item.image || '');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = item.alt || item.title || '';
        media.appendChild(img);
        const body = document.createElement('div');
        body.className = 'activity-text';
        const title = document.createElement('h4');
        title.textContent = item.title || '';
        const description = document.createElement('p');
        description.textContent = item.description || '';
        body.append(title, description);
        card.append(media, body);
        activities.appendChild(card);
      });
    }

    const departments = document.getElementById('js-apply-departments');
    if (departments && Array.isArray(r.departments)) {
      departments.replaceChildren();
      visibleItems(r.departments).forEach((item) => {
        const card = document.createElement('div');
        card.className = 'dept-card';
        const title = document.createElement('h4');
        title.textContent = item.title || '';
        const description = document.createElement('p');
        description.textContent = item.description || '';
        card.append(title, description);
        departments.appendChild(card);
      });
    }
  }

  function renderApplyList(id, items) {
    const list = document.getElementById(id);
    if (!list || !Array.isArray(items)) return;
    list.replaceChildren();
    visibleItems(items).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item.text || '';
      list.appendChild(li);
    });
  }

  const applyCharts = {};
  function replaceApplyChart(key, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof window.Chart !== 'function') return;
    if (applyCharts[key]) applyCharts[key].destroy();
    applyCharts[key] = new window.Chart(canvas.getContext('2d'), config);
  }

  function renderApplyCharts(r) {
    if (window.Chart?.defaults?.font) {
      window.Chart.defaults.font.family = '"Helvetica Neue", Arial, Pretendard, sans-serif';
    }
    const stats = r.stats || {};
    const gender = visibleItems(stats.gender?.length ? stats.gender : [
      { label: '여자', value: 20, color: '#FF6B81', order: 1 },
      { label: '남자', value: 80, color: '#4D96FF', order: 2 }
    ]);
    const major = visibleItems(stats.major?.length ? stats.major : [
      ['데이터과학과', 6, '#FF6B6B'], ['통계학과', 6, '#FF9F43'],
      ['중어중문학과', 4, '#FDCB6E'], ['경제학과', 3, '#20BF6B'],
      ['언어학과', 2, '#0FB9B1'], ['컴퓨터학과', 2, '#2D98DA'],
      ['경영학과', 2, '#3867D6'], ['행정학과', 2, '#8854D0'],
      ['화학과', 2, '#A55EEA'], ['사회학과', 2, '#F06292'],
      ['국제학부', 2, '#4B6584'], ['기타', 12, '#9980FA']
    ].map(([label, value, color], index) => ({ label, value, color, order: index + 1 })));
    const admission = visibleItems(stats.admissionYear?.length ? stats.admissionYear : [
      ['19', 1], ['20', 2], ['21', 3], ['22', 4], ['23', 4], ['24', 17], ['25', 14]
    ].map(([label, value], index) => ({ label, value, color: '#ab3333', order: index + 1 })));

    if (gender.length) {
      replaceApplyChart('gender', 'skillsChart', {
        type: 'bar',
        data: {
          labels: ['성별 분포'],
          datasets: gender.map((item) => ({
            label: item.label,
            data: [Number(item.value) || 0],
            backgroundColor: item.color || '#ab3333',
            barThickness: 40
          }))
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } },
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }

    if (major.length) {
      replaceApplyChart('major', 'majorChart', {
        type: 'doughnut',
        data: {
          labels: major.map((item) => item.label),
          datasets: [{
            data: major.map((item) => Number(item.value) || 0),
            backgroundColor: major.map((item) => item.color || '#ab3333'),
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 10
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: 10 },
          plugins: { legend: { position: window.innerWidth < 600 ? 'bottom' : 'right', labels: { color: '#333', boxWidth: 12, font: { size: 11 } } } }
        }
      });
    }

    if (admission.length) {
      replaceApplyChart('admission', 'idChart', {
        type: 'bar',
        data: {
          labels: admission.map((item) => item.label),
          datasets: [{
            label: r.admissionCountLabel || '인원(명)',
            data: admission.map((item) => Number(item.value) || 0),
            backgroundColor: admission.map((item) => item.color || '#ab3333'),
            borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  }

  function renderApply(content) {
    const r = content?.recruitment;
    if (!r) return;
    const applyOpen = featureGate(content, 'apply', false) && r.applyVisible !== false;
    const applyClosedMessage = content?.settings?.applyClosedMessage || '지원 기간이 아닙니다.';

    if (r.pageTitle) document.title = r.pageTitle;
    text('.hero-apply h2', r.heroTitle);
    text('.hero-apply p', r.heroDescription);
    text('.wing-box h3', r.sidebarTitle || (r.generation ? `${r.generation} 신입부원 모집` : undefined));
    text('.banner-text', r.bannerText);
    text('.banner-btn', r.bannerButtonLabel);

    const navLabels = {
      'sec-overview': r.navOverviewLabel,
      'sec-intro': r.navIntroLabel,
      'sec-recruit': r.navRecruitLabel,
      'sec-activity': r.navActivityLabel,
      'sec-fee': r.navFeeLabel,
      'sec-contact': r.navContactLabel,
      'apply-target': r.navApplyLabel
    };
    Object.entries(navLabels).forEach(([target, label]) => {
      const item = document.querySelector(`.wing-box li[data-target="${target}"]`);
      if (item && label) item.textContent = label;
    });

    const banner = document.querySelector('.bottom-banner');
    if (banner) banner.style.display = r.bannerVisible === false ? 'none' : '';

    const overviewSection = document.querySelector('#sec-overview');
    if (overviewSection && r.overviewTitle) text('h3', r.overviewTitle, overviewSection);
    if (overviewSection && r.overviewText) text('p', r.overviewText, overviewSection);

    const introSection = document.querySelector('#sec-intro');
    if (introSection && r.introTitle) text('h3', r.introTitle, introSection);
    if (introSection && r.introDescription) text('p', r.introDescription, introSection);
    text('#js-apply-gender-chart-title', r.genderChartTitle);
    text('#js-apply-major-chart-title', r.majorChartTitle);
    text('#js-apply-admission-chart-title', r.admissionYearChartTitle);
    text('#js-apply-activities-title', r.activitiesTitle);
    text('#js-apply-activities-description', r.activitiesDescription);
    text('#js-apply-departments-title', r.departmentsTitle);
    text('#js-apply-departments-description', r.departmentsDescription);
    text('#js-apply-recruit-title', r.recruitTitle);

    const activitySection = document.querySelector('#sec-activity');
    text('#js-apply-eligibility-title', r.eligibilityTitle);
    text('#js-apply-regular-title', r.regularScheduleTitle);
    text('#js-apply-irregular-title', r.irregularScheduleTitle);

    const feeSection = document.querySelector('#sec-fee');
    if (feeSection && r.feeAmount) {
      const feeAmountEl = document.getElementById('js-apply-fee-amount');
      if (feeAmountEl) feeAmountEl.textContent = r.feeAmount;
    }
    if (feeSection && r.feeTitle) text('h3', r.feeTitle, feeSection);
    text('#js-apply-fee-description-text', r.feeDescription);
    text('#js-apply-fee-link-prefix', r.feeLinkPrefix);
    text('#js-apply-fee-link-suffix', r.feeLinkSuffix);
    const feeLink = document.getElementById('js-apply-fee-link');
    if (feeLink) {
      if (r.feeLinkLabel) feeLink.textContent = r.feeLinkLabel;
      if (r.feeLinkHref) feeLink.href = r.feeLinkHref;
    }

    const contactSection = document.querySelector('#sec-contact');
    if (contactSection && r.contactTitle) text('h3', r.contactTitle, contactSection);

    const phoneLabel = document.getElementById('js-apply-phone-label');
    if (phoneLabel && r.contactPhoneLabel) phoneLabel.textContent = r.contactPhoneLabel;
    const phone = document.getElementById('js-apply-phone');
    if (phone && r.contactPhone) phone.textContent = r.contactPhone;
    const email = document.getElementById('js-apply-email');
    if (email && r.contactEmail) email.textContent = r.contactEmail;
    text('#js-apply-email-label', r.contactEmailLabel);
    const instagramLabel = document.getElementById('js-apply-instagram-label');
    const instagramHandle = document.getElementById('js-apply-instagram-handle');
    [instagramLabel, instagramHandle].forEach((link) => {
      if (link && r.instagramUrl) link.href = r.instagramUrl;
    });
    if (instagramLabel && r.instagramLabel) instagramLabel.textContent = r.instagramLabel;
    if (instagramHandle && r.instagramHandle) instagramHandle.textContent = r.instagramHandle;

    const ctaEl = document.querySelector('.apply-cta');
    if (ctaEl) {
      text('h3', applyOpen ? r.applyCtaTitle : applyClosedMessage, ctaEl);
      const ctaPs = ctaEl.querySelectorAll('p');
      if (ctaPs[0] && r.applyCtaSubtitle) ctaPs[0].textContent = applyOpen ? r.applyCtaSubtitle : r.applyPeriod || '';
      if (ctaPs[1] && r.applyPeriod) ctaPs[1].textContent = r.applyPeriod;
      const formLink = ctaEl.querySelector('.btn-apply-big');
      if (formLink) {
        if (r.formLabel) formLink.textContent = r.formLabel;
        formLink.style.display = applyOpen ? '' : 'none';
        if (applyOpen && r.formUrl) formLink.href = r.formUrl;
        else formLink.removeAttribute('href');
      }
    }

    renderApplyCards(r);
    renderApplyList('js-apply-eligibility', r.lists?.eligibility);
    renderApplyList('js-apply-regular-schedule', r.lists?.regularSchedule);
    renderApplyList('js-apply-irregular-schedule', r.lists?.irregularSchedule);
    renderApplyCharts(r);
    if (r.timeline) renderApplyTimeline(r);
  }

  function loadGvizTab(sheetName, range = '') {
    return new Promise((resolve, reject) => {
      const callbackName = `painsGviz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        delete window[callbackName];
        script.remove();
        reject(new Error(`Sheet timeout: ${sheetName}`));
      }, 8000);

      window[callbackName] = (response) => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        if (response?.status !== 'ok' || !response.table) {
          reject(new Error(`Sheet load failed: ${sheetName}`));
          return;
        }

        const headers = response.table.cols.map((col) => col.label || col.id);
        const objects = response.table.rows.map((row) => {
          const item = {};
          headers.forEach((header, index) => {
            const cell = row.c?.[index];
            item[header] = cell?.v ?? '';
          });
          return item;
        });
        resolve(objects);
      };

      script.onerror = () => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        reject(new Error(`Sheet script failed: ${sheetName}`));
      };
      const base = `https://docs.google.com/spreadsheets/d/${CONTENT_SHEET_ID}/gviz/tq`;
      const rangeParam = range ? `&range=${encodeURIComponent(range)}` : '';
      script.src = `${base}?tqx=responseHandler:${callbackName}&headers=1&sheet=${encodeURIComponent(sheetName)}${rangeParam}`;
      document.head.appendChild(script);
    });
  }

  function gvizDatePart(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})/);
    if (!match) return raw;
    return `${match[1]}-${String(Number(match[2]) + 1).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }

  function gvizTimePart(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^Date\(\d{4},\d{1,2},\d{1,2},(\d{1,2}),(\d{1,2})/);
    if (!match) return raw;
    return `${String(match[1]).padStart(2, '0')}:${String(match[2]).padStart(2, '0')}`;
  }

  async function loadLiveHomeScheduleFromSheet() {
    const rows = await loadGvizTab('Schedule', 'A:H');
    return rows
      .filter((row) => String(row['일정명'] || '').trim() && String(row['시작일'] || '').trim())
      .map((row, index) => ({
        title: row['일정명'],
        date: gvizDatePart(row['시작일']),
        startTime: gvizTimePart(row['시작시간']),
        endDate: gvizDatePart(row['종료일']),
        endTime: gvizTimePart(row['종료시간']),
        location: row['장소'],
        tag: row['유형'],
        visible: boolValue(row['홈 공개'], true),
        order: index + 1
      }));
  }

  async function loadLiveSettingsFromSheet() {
    const rows = await loadGvizTab('settings', 'A:C');
    const settings = {};
    rows.forEach((row) => {
      const key = String(row.key || '').trim();
      if (key) settings[key] = row.value ?? '';
    });
    return settings;
  }

  async function loadLiveApplyOperationsFromSheet() {
    const rows = await loadGvizTab('recruitment', 'A:D');
    const recruitment = {};
    rows.forEach((row) => {
      const path = String(row.path || '').trim();
      if (!LIVE_APPLY_PATHS.has(path)) return;
      const key = path.slice('recruitment.'.length);
      const value = row.value ?? '';
      recruitment[key] = /(?:Visible)$/.test(key) ? boolValue(value, true) : value;
    });
    return recruitment;
  }

  async function refreshLiveOperationalContent(currentPage) {
    const jobs = [loadLiveSettingsFromSheet()];
    if (currentPage === 'apply') jobs.push(loadLiveApplyOperationsFromSheet());

    const results = await Promise.allSettled(jobs);
    const current = cloneContent(window.__painsContentLatest || {});
    let changed = false;

    if (results[0]?.status === 'fulfilled') {
      current.settings = { ...(current.settings || {}), ...results[0].value };
      changed = true;
    }
    if (currentPage === 'apply' && results[1]?.status === 'fulfilled') {
      current.recruitment = { ...(current.recruitment || {}), ...results[1].value };
      changed = true;
    }
    if (!changed) return;

    renderAccessGates(current);
    if (currentPage === 'apply') renderApply(current);
    if (currentPage === 'result') renderResult(current);
    window.__painsContentLatest = current;
    document.dispatchEvent(new CustomEvent('pains:operations-ready', { detail: current }));
  }

  function renderResultGate(content) {
    const r = content?.resultPage || {};
    const resultOpen = featureGate(content, 'result', false);
    if (resultOpen) {
      const button = document.getElementById('btn-search');
      if (button) {
        button.disabled = false;
        button.textContent = r.buttonLabel || '결과 확인하기';
        button.onclick = typeof window.checkResult === 'function' ? window.checkResult : null;
      }
      return;
    }

    const message = r.closedMessage || content?.settings?.resultClosedMessage || '지원 결과 조회 기간이 아닙니다.';
    text('.search-card .sub-title', message);

    const resultArea = document.getElementById('result-area');
    if (resultArea) resultArea.style.display = 'none';

    const button = document.getElementById('btn-search');
    if (button) {
      button.disabled = false;
      button.textContent = r.closedButtonLabel || '조회 기간이 아닙니다';
      button.onclick = (event) => {
        event.preventDefault();
        alert(message);
        return false;
      };
    }
  }

  function renderResult(content) {
    const r = content?.resultPage || {};
    if (r.pageTitle) document.title = r.pageTitle;

    text('.search-card h2', r.title);
    text('.search-card .sub-title', r.subtitle);
    text('label[for="input-id"]', r.idLabel);
    text('label[for="input-name"]', r.nameLabel);
    text('#btn-search', r.buttonLabel);
    text('#status-badge', r.loadingStatusLabel);

    const idInput = document.getElementById('input-id');
    if (idInput && r.idPlaceholder) idInput.placeholder = r.idPlaceholder;
    const nameInput = document.getElementById('input-name');
    if (nameInput && r.namePlaceholder) nameInput.placeholder = r.namePlaceholder;

    const resultMsg = document.querySelector('.result-msg');
    if (resultMsg && r.resultMessageTemplate) {
      resultMsg.dataset.template = r.resultMessageTemplate;
      resultMsg.innerHTML = template(r.resultMessageTemplate, {
        name: '<span id="user-name-display" style="font-weight:bold;"></span>'
      });
    }

    text('.interview-box h4', r.otTitle);
    const labels = document.querySelectorAll('.interview-info strong');
    if (labels[0] && r.dateLabel) labels[0].textContent = r.dateLabel;
    if (labels[1] && r.timeLabel) labels[1].textContent = r.timeLabel;
    if (labels[2] && r.locationLabel) labels[2].textContent = r.locationLabel;

    const map = document.getElementById('display-map');
    if (map && r.mapAlt) map.alt = r.mapAlt;
    if (map && r.mapImage) {
      map.src = assetUrl(r.mapImage);
      map.style.display = '';
    }

    text('.warning-msg', r.warningMessage);
    textAll('.notice-msg', [r.noticeMessage1, r.noticeMessage2]);

    renderResultGate(content);
  }

  function setCaption(figcaption, caption) {
    if (!figcaption || !caption) return;
    const spans = figcaption.querySelectorAll('span');
    if (spans[0] && caption.fig !== undefined && caption.fig !== '') spans[0].textContent = caption.fig;
    if (spans[1] && caption.label !== undefined && caption.label !== '') spans[1].textContent = caption.label;
  }

  const SCHEDULE_WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const SCHEDULE_ITEM_COUNT = 4;
  const SCHEDULE_PLACEHOLDER_LABEL = 'TBD';

  function kstDateParts(date) {
    const shifted = new Date(date.getTime() + 9 * 3600 * 1000);
    return {
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      weekday: SCHEDULE_WEEKDAYS[shifted.getUTCDay()]
    };
  }

  function scheduleBoundary(item, type) {
    const date = type === 'end' ? (item.endDate || item.date) : item.date;
    const time = type === 'end' ? item.endTime : item.startTime;
    if (!date) return null;
    return parseKstDate(time ? `${date} ${time}` : date, type);
  }

  function renderHomeSchedule(items) {
    const list = document.getElementById('js-home-schedule');
    if (!list) return;

    const now = new Date();
    const visible = visibleItems(items);
    const withDates = visible.map((item) => ({
      item,
      date: scheduleBoundary(item, 'start'),
      end: scheduleBoundary(item, 'end')
    }));
    // 종료 시각이 있으면 행사 종료까지, 없으면 해당 날짜 23:59까지 노출합니다.
    const upcoming = withDates.filter((entry) => !entry.end || entry.end.getTime() >= now.getTime());

    upcoming.sort((a, b) => {
      if (a.date && b.date) return a.date.getTime() - b.date.getTime();
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    const entries = upcoming.slice(0, SCHEDULE_ITEM_COUNT);
    while (entries.length < SCHEDULE_ITEM_COUNT) {
      entries.push({
        item: {
          dateLabel: '—',
          title: SCHEDULE_PLACEHOLDER_LABEL,
          placeholder: true
        },
        date: null
      });
    }

    list.replaceChildren();

    entries.forEach(({ item, date }) => {
      const parts = date ? kstDateParts(date) : null;
      const dateLabel = item.dateLabel
        || (parts ? `${String(parts.month).padStart(2, '0')}.${String(parts.day).padStart(2, '0')}` : (item.date || SCHEDULE_PLACEHOLDER_LABEL));
      const weekday = item.weekday || (parts ? parts.weekday : '');

      const li = document.createElement('li');
      li.className = 'schedule__item';
      if (item.placeholder) li.classList.add('schedule__item--placeholder');

      const dateEl = document.createElement('span');
      dateEl.className = 'schedule__date';
      const dayStrong = document.createElement('b');
      dayStrong.textContent = dateLabel;
      const weekdayEl = document.createElement('i');
      weekdayEl.textContent = weekday;
      dateEl.append(dayStrong, weekdayEl);

      const titleEl = document.createElement('span');
      titleEl.className = 'schedule__title';
      titleEl.textContent = item.title || '';

      li.append(dateEl, titleEl);

      if (item.tag) {
        const tagEl = document.createElement('span');
        tagEl.className = 'schedule__tag';
        tagEl.textContent = item.tag;
        li.appendChild(tagEl);
      }

      list.appendChild(li);
    });
  }

  function renderHome(content) {
    const home = content?.home;
    if (!home) return;

    text('.home-hero__copy .home-eyebrow', home.hero?.eyebrow);
    heroLines('.home-hero__title--en', home.hero?.titleLines);
    const heroDescription = Array.from(document.querySelectorAll('.home-hero__copy > p'))
      .find((el) => !el.classList.contains('home-eyebrow'));
    if (heroDescription && home.hero?.description) heroDescription.textContent = home.hero.description;
    image('.home-hero__media img', home.hero?.image, '');
    textAll('.home-hero__actions .home-cta', [
      home.hero?.primaryCta || '일정 보기',
      home.hero?.secondaryCta || '지원하기'
    ]);

    renderTimeline(home.timeline);

    text('.home-strategy__copy .home-eyebrow', home.strategy?.eyebrow);
    text('.home-strategy__copy h3, .home-strategy__copy h2', home.strategy?.title);
    text('.home-strategy__copy p:not(.home-eyebrow)', home.strategy?.description);
    renderHomeAxes(home.strategy?.axes);

    const metrics = document.querySelectorAll('.home-data-strip > div');
    visibleItems(home.metrics).forEach((metric, index) => {
      const root = metrics[index];
      if (!root) return;
      text('strong', metric.value, root);
      text('span', metric.label, root);
    });

    const archiveLinks = document.querySelectorAll('.archive-cta > a');
    visibleItems(home.archiveLinks).forEach((item, index) => {
      const link = archiveLinks[index];
      if (!link) return;
      const labels = link.querySelectorAll('span');
      if (labels[0]) labels[0].textContent = item.label || '';
      if (labels[1]) labels[1].textContent = item.action || '';
      if (item.href) link.href = item.href;
    });

    text('.home-feature-cloud__rail .home-eyebrow', home.story?.eyebrow);
    lines('.home-feature-cloud__rail h3', home.story?.titleLines);
    renderHomeStoryNav(home.story?.nav);
    renderHomeStoryCards(home.story?.cards);

    const projectButtons = document.querySelectorAll('.project-variants button');
    const projectVariants = visibleItems(home.projectVariants);
    const projectVariantsRoot = document.querySelector('.project-variants');
    if (projectVariantsRoot) projectVariantsRoot.hidden = projectVariants.length === 0;
    projectVariants.forEach((variant, index) => {
      const button = projectButtons[index];
      if (!button) return;
      button.hidden = false;
      button.dataset.projectSrc = assetUrl(variant.image || '');
      button.dataset.projectAlt = variant.alt || '';
      button.dataset.projectLabel = variant.label || '';
      text('span', String(index + 1).padStart(2, '0'), button);
      text('strong', variant.label, button);
    });
    Array.from(projectButtons).slice(projectVariants.length).forEach((button) => {
      button.hidden = true;
    });

    // Hero meta + scroll label
    textAll('.hero-meta span', home.hero?.meta);
    const scrollMark = document.querySelector('.scroll-mark');
    if (scrollMark) {
      scrollMark.hidden = home.scrollVisible === false || !home.scrollLabel;
      if (scrollMark.firstChild && home.scrollLabel) scrollMark.firstChild.textContent = `${home.scrollLabel} `;
    }

    // Section index labels + archive eyebrow
    text('#manifesto .section-index', home.identity?.index);
    text('#home-community .section-index', home.community?.index);
    text('.archive-cta > .home-eyebrow', home.archive?.eyebrow);

    // Schedule
    text('#home-schedule .section-index', home.scheduleHead?.index);
    text('#home-schedule [data-field="label"]', home.scheduleHead?.label);
    text('#home-schedule [data-field="title"]', home.scheduleHead?.title);
    text('#home-schedule [data-field="description"]', home.scheduleHead?.description);
    renderHomeSchedule(home.schedule);

    text('.home-section--calendar .home-section__heading h3', home.calendar?.title);
    text('.home-section--calendar .home-section__heading p', home.calendar?.description);
  }

  function renderAbout(content) {
    const about = content?.about;
    if (!about) return;

    text('.about-hero .section-kicker', about.hero?.eyebrow);
    text('.about-hero h2', about.hero?.title);
    text('.about-hero p', about.hero?.description);
    image('.about-hero__media img', about.hero?.image, '');
    image('.about-visual img', about.hero?.image, about.hero?.alt || 'PAINS 부원 단체사진');
    text('[data-about-index]', about.meta?.indexLabel);
    text('[data-about-collective]', about.meta?.collective);
    text('[data-about-caption-left]', about.hero?.captionLeft);
    text('[data-about-caption-right]', about.hero?.captionRight);

    const who = document.querySelector('.about-banner--dark');
    if (who) {
      text('.section-kicker', about.whoWeAre?.eyebrow, who);
      text('.desktop-only', about.whoWeAre?.desktopTitle, who);
      text('.mobile-only', about.whoWeAre?.mobileTitle, who);
      text('.about-banner__copy p', about.whoWeAre?.description, who);
      image('.about-banner__media img', about.whoWeAre?.image, about.whoWeAre?.alt, who);
    }

    const president = document.querySelector('.about-banner--president');
    if (president) {
      president.hidden = !boolValue(about.presidentMessage?.visible, true);
      text('[data-president-index]', about.presidentMessage?.indexLabel, president);
      text('.section-kicker', about.presidentMessage?.eyebrow, president);
      text('h3', about.presidentMessage?.title, president);
      const copy = president.querySelector('.about-banner__copy');
      const existing = copy ? Array.from(copy.querySelectorAll('p')) : [];
      const paragraphs = about.presidentMessage?.paragraphs;
      if (copy && Array.isArray(paragraphs)) {
        existing.forEach((p, index) => {
          if (paragraphs[index] !== undefined) p.textContent = paragraphs[index];
        });
      }
      image('.about-banner__media img.desktop-only', about.presidentMessage?.desktopImage, about.presidentMessage?.desktopAlt, president);
      image('.about-banner__media img.mobile-only', about.presidentMessage?.mobileImage, about.presidentMessage?.mobileAlt, president);
    }
  }

  function renderAttendance(content) {
    const attendance = content?.attendance;
    if (!attendance) return;

    const common = attendance.common || {};
    const member = attendance.member || {};
    const absence = attendance.absence || {};
    const modal = attendance.modal || {};

    text('#attendance-member-title', member.title);
    text('#attendance-member-subtitle', member.subtitle);
    text('#attendance-check-id-label', common.idLabel);
    text('#attendance-check-name-label', common.nameLabel);
    text('#btn-check-submit', member.lookupButton);
    text('#attendance-result-suffix', member.resultSuffix);
    text('#status-label', member.statusLabel);
    text('#attendance-used-label', member.usedCountLabel);
    text('#attendance-used-unit', member.usedCountUnit);
    text('#attendance-rate-label', member.attendanceRateLabel);
    text('#attendance-rate-unit', member.attendanceRateUnit);
    text('#attendance-regular-title', member.regularTitle);
    text('#attendance-irregular-title', member.irregularTitle);
    text('#attendance-calculation-title', member.calculationTitle);
    text('#attendance-calculation-intro', member.calculationIntro);
    text('#attendance-bylaw-title', member.bylawTitle);
    text('#attendance-bylaw-lead', member.bylawLead);
    multiline(document.querySelector('#attendance-bylaw-notes'), member.bylawNotes);

    text('#attendance-absence-title', absence.title);
    multiline(document.querySelector('#attendance-absence-intro'), absence.intro);
    text('#attendance-submit-id-label', common.idLabel);
    text('#attendance-submit-name-label', common.nameLabel);
    text('#attendance-event-label', absence.eventLabel);
    text('#attendance-type-label', absence.typeLabel);
    multiline(document.querySelector('#attendance-absence-guide'), absence.guide);
    text('#btn-submit-form', absence.submitButton);

    text('#status-modal-title', modal.title);
    text('#status-modal-desc', modal.defaultDescription);
    text('#status-modal-close', modal.closeLabel);

    const checkId = document.querySelector('#check-id');
    const submitId = document.querySelector('#submit-id');
    const checkName = document.querySelector('#check-name');
    const submitName = document.querySelector('#submit-name');
    if (common.idPlaceholder) {
      if (checkId) checkId.placeholder = common.idPlaceholder;
      if (submitId) submitId.placeholder = common.idPlaceholder;
    }
    if (common.namePlaceholder) {
      if (checkName) checkName.placeholder = common.namePlaceholder;
      if (submitName) submitName.placeholder = common.namePlaceholder;
    }
  }

  function renderOrganization(content) {
    const org = content?.organization;
    if (!org) return;

    const heading = document.querySelector('[data-organization-title]')
      || document.querySelector('section h2');
    const generation = firstValue(org.generation, content?.recruitment?.generation, '');
    const headingTemplate = firstValue(
      org.titleTemplate,
      org.title,
      generation ? '{generation} 운영진 조직도' : '',
      heading?.textContent
    );
    const resolvedHeading = template(headingTemplate, { generation }).trim();
    if (heading && resolvedHeading) heading.textContent = resolvedHeading;

    const cards = document.querySelectorAll('.org-card');
    visibleItems(org.members).forEach((member, index) => {
      const card = cards[index];
      if (!card) return;
      card.dataset.orgId = member.id || '';
      card.classList.toggle('card-staff', !!member.staff);
      text('.org-role', member.role, card);
      text('.org-name', member.name, card);
      text('.org-major', member.major, card);
      const img = card.querySelector('.org-img');
      if (img) {
        const profileLabel = [member.role, member.name, '프로필 사진'].filter(Boolean).join(' ');
        if (profileLabel) img.setAttribute('aria-label', profileLabel);
      }
      backgroundImage(img, member.image);
    });
  }

  function appendLineText(container, value) {
    const lines = String(value || '').split('\n');
    lines.forEach((line, index) => {
      if (index) container.appendChild(document.createElement('br'));
      container.appendChild(document.createTextNode(line));
    });
  }

  function renderSocieties(content) {
    const societies = content?.societies;
    const list = document.querySelector('.society-list');
    if (!societies || !list) return;

    text('section h2', societies.title);
    const desc = document.querySelector('.event-description');
    if (desc) multiline(desc, societies.description);

    list.replaceChildren();
    visibleItems(societies.items).forEach((item) => {
      const card = document.createElement('div');
      card.className = 'society-btn';
      backgroundImage(card, item.image);
      card.addEventListener('click', () => card.classList.toggle('active'));

      const name = document.createElement('span');
      name.className = 'society-name';
      name.textContent = item.name || '';

      const details = document.createElement('div');
      details.className = 'society-details';

      const title = document.createElement('div');
      title.className = 'detail-title';
      title.textContent = item.name || '';

      const row = document.createElement('div');
      row.className = 'detail-content-row';

      const leader = document.createElement('div');
      leader.className = 'detail-leader';
      leader.textContent = item.leader ? `모임장: ${item.leader}` : '';

      const divider = document.createElement('div');
      divider.className = 'detail-divider';

      const description = document.createElement('div');
      description.className = 'detail-desc';
      appendLineText(description, item.description);

      row.append(leader, divider, description);
      details.append(title, row);
      card.append(name, details);
      list.appendChild(card);
    });
  }

  function renderEvents(content) {
    const events = content?.events;
    const list = document.querySelector('.event-list');
    if (!events || !list) return;

    text('section h2', events.title);
    const desc = document.querySelector('.event-description');
    if (desc) desc.textContent = events.description || '';

    list.replaceChildren();
    visibleItems(events.items).forEach((item) => {
      const card = document.createElement('div');
      card.className = 'event-btn';
      backgroundImage(card, item.image);
      if (item.href) card.addEventListener('click', () => { location.href = item.href; });

      const name = document.createElement('span');
      name.className = 'event-name';
      name.textContent = item.title || '';

      card.appendChild(name);
      list.appendChild(card);
    });
  }

  function renderStudy(content) {
    const study = content?.study;
    if (!study) return;
    const items = (value) => String(value || '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);

    const renderList = (selector, value) => {
      const list = document.querySelector(selector);
      if (!list || !value) return;
      list.replaceChildren();
      items(value).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
    };

    const renderTopics = (selector, value) => {
      const body = document.querySelector(selector);
      if (!body || !value) return;
      body.replaceChildren();
      items(value).forEach((item) => {
        const [rawLabel, ...topicParts] = item.split('::');
        const label = String(rawLabel || '').trim();
        const topic = topicParts.join('::').trim();
        const row = document.createElement('tr');

        if (!topic || label.includes('중간고사')) {
          const divider = document.createElement('td');
          divider.colSpan = 2;
          divider.className = 'divider-row';
          divider.textContent = label ? `(${label})` : '';
          row.appendChild(divider);
        } else {
          const th = document.createElement('th');
          const td = document.createElement('td');
          th.textContent = label;
          td.textContent = topic;
          row.append(th, td);
        }
        body.appendChild(row);
      });
    };

    text('#js-study-title', study.title);
    text('#js-study-goal-label', study.goalLabel);
    text('#js-study-goal', study.goal);
    text('#js-study-time-place-label', study.timePlaceLabel);
    text('#js-study-time-place', study.timePlace);
    text('#js-study-method-label', study.methodLabel);
    text('#js-study-target-label', study.targetLabel);
    text('#js-study-topics-title', study.topicsTitle);
    text('#js-study-sabermetrics-title', study.sabermetricsTitle);
    text('#js-study-notice-title', study.noticeTitle);
    text('#js-study-rule-title', study.ruleTitle);
    text('#js-study-rule-intro', study.ruleIntro);
    text('#js-study-completion-title', study.completionTitle);
    text('#js-study-completion-text', study.completionText);
    text('#js-study-absence-title', study.absenceTitle);
    multiline(document.querySelector('#js-study-absence-text'), study.absenceText);

    renderList('#js-study-method-items', study.methodItems);
    renderList('#js-study-target-items', study.targetItems);
    renderTopics('#js-study-topics', study.topics);
    renderTopics('#js-study-sabermetrics-topics', study.sabermetricsTopics);
    renderList('#js-study-notice-items', study.noticeItems);
  }

  function renderGenericPage(content) {
    const entries = content?.pages?.[page()];
    if (!Array.isArray(entries)) return;

    visibleItems(entries).forEach((entry) => {
      const nodes = document.querySelectorAll(entry.selector);
      nodes.forEach((node) => {
        const type = String(entry.type || 'text').toLowerCase();
        const value = entry.value ?? '';

        if (type === 'html') {
          node.innerHTML = value;
        } else if (type === 'src' && 'src' in node) {
          node.src = assetUrl(value);
        } else if (type === 'href' && 'href' in node) {
          node.href = value;
        } else if (type === 'background') {
          backgroundImage(node, value);
        } else if (type === 'value' && 'value' in node) {
          node.value = value;
        } else {
          node.textContent = value;
        }
      });
    });
  }

  function applyContent(content) {
    fillOrganizationGeneration(content);
    renderAccessGates(content);

    const current = page();
    if (current === 'index') renderHome(content);
    if (current === 'about') renderAbout(content);
    if (current === 'attendance') renderAttendance(content);
    if (current === 'members') renderOrganization(content);
    if (current === 'society') renderSocieties(content);
    if (current === 'event') renderEvents(content);
    if (current === 'study') renderStudy(content);
    if (current === 'apply') renderApply(content);
    if (current === 'result') renderResult(content);
    renderGenericPage(content);

    window.__painsContentLatest = content;
    document.dispatchEvent(new CustomEvent('pains:content-ready', { detail: content }));
  }

  async function loadLatestContent() {
    const content = await loadContent();
    if (window.__painsOperationsPromise) {
      await window.__painsOperationsPromise.catch(() => null);
    }
    return window.__painsContentLatest || content;
  }

  async function init() {
    try {
      const content = await initialContentPromise;
      if (content) applyContent(content);
    } finally {
      revealContent();
    }

    const currentPage = page();
    // 운영성 데이터는 배포 없이 Google Sheet/API에서 최신값을 읽습니다.
    // 본문·사진은 배포 JSON을 유지해 첫 화면 속도와 내용 안정성을 보장합니다.
    window.__painsOperationsPromise = refreshLiveOperationalContent(currentPage).catch(() => {
      // 시트를 읽지 못하면 배포 JSON의 설정과 지원 운영값을 유지합니다.
    });

    if (currentPage === 'index') {
      loadLiveHomeScheduleFromSheet().then((schedule) => {
        const current = cloneContent(window.__painsContentLatest || {});
        current.home ||= {};
        current.home.schedule = schedule;
        window.__painsContentLatest = current;
        renderHomeSchedule(schedule);
        document.dispatchEvent(new CustomEvent('pains:schedule-ready', { detail: schedule }));
      }).catch(() => {
        // 시트를 읽지 못하면 배포 JSON의 일정 목록을 유지합니다.
      });
    }
  }

  const initialContentPromise = loadContent();
  window.PainsContent = {
    load: loadLatestContent,
    apply: applyContent,
    assetUrl,
    featureGate,
    template,
    loadSheetTab: loadGvizTab
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
