(() => {
  'use strict';

  const REMOTE_CONTENT_URL = 'https://script.google.com/macros/s/AKfycbypl1Z5iLKPPBGwpE8xv2TyCbgl5fmGBhYi1Zn16aU8tG2zvDGtIyALBAhQZ8Jpz5fJyQ/exec';
  const FALLBACK_CONTENT_URL = 'data/site-content.json';
  const CONTENT_CACHE_KEY = 'pains-site-content-v2';
  const ASSET_WAIT_LIMIT_MS = 300;

  const page = () => location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
  const isVisible = (item) => item && item.visible !== false;
  const byOrder = (a, b) => Number(a.order ?? 999) - Number(b.order ?? 999);
  const pendingAssetLoads = [];

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

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
    const link = document.getElementById(`link-${id}`);
    if (!link) return;

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
    const url = assetUrl(src);
    if (!url) return url;

    pendingAssetLoads.push(new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = url;
      if (img.complete) resolve();
    }));

    return url;
  }

  function image(selector, src, alt, root = document) {
    const img = root.querySelector(selector);
    if (!img || !src) return;
    img.src = trackAsset(src);
    if (alt !== undefined) img.alt = alt;
  }

  function backgroundImage(el, src) {
    if (!el || !src) return;
    el.style.backgroundImage = `url("${trackAsset(src)}")`;
  }

  function visibleItems(items) {
    return Array.isArray(items) ? items.filter(isVisible).sort(byOrder) : [];
  }

  function replaceLegacyValue(target, key, legacyValue, nextValue) {
    if (target && target[key] === legacyValue) target[key] = nextValue;
  }

  // The live Sheet can lag behind a deployed design update. Migrate only exact
  // former seed values so intentional editor changes always remain authoritative.
  function migrateLegacyContent(content) {
    if (!content || typeof content !== 'object') return content;

    const home = content.home || {};
    const strategy = home.strategy || {};
    replaceLegacyValue(strategy, 'title', 'WE TURN SPORTS INTO KNOWLEDGE.', 'WE TURN SPORTS INTO INSIGHT');
    replaceLegacyValue(strategy, 'eyebrow', 'PAINS Data Archive · Since 2020', 'Providing Academic INsights for Sport');
    replaceLegacyValue(
      strategy,
      'description',
      '경기에서 시작된 질문을 데이터로 검증하고, 동료와 나눈 분석을 하나의 프로젝트로 남깁니다.',
      '스포츠에서 질문을 찾아내, 새로운 의미를 발견합니다.'
    );

    const cards = Array.isArray(home.story?.cards) ? home.story.cards : [];
    cards.forEach((card) => {
      if (card.id === 'about') {
        replaceLegacyValue(card, 'image', 'images/소개사진.jpg', 'images/pains-sports-analytics-blue.png');
        replaceLegacyValue(card, 'alt', 'PAINS 단체사진', '스포츠 위치와 추세 데이터를 분석하는 짙은 푸른색 분석실');
        if (card.caption?.label === 'PAINS COLLECTIVE') card.caption.label = 'SPORTS DATA LAB';
      }

      if (card.id === 'projects') {
        const oldTitle = Array.isArray(card.titleLines) && card.titleLines.join('|') === '흥미에서 출발해|결과를 만들어냅니다.';
        if (oldTitle) card.titleLines = ['질문에서 출발해', '결과를 만듭니다.'];
        replaceLegacyValue(
          card,
          'description',
          '야구, 축구, 농구, 배구, F1, e-sports까지 다양한 종목을 바탕으로 팀 프로젝트를 수행하고 포트폴리오로 남깁니다.',
          '야구, 축구, 농구, F1, e-sports 등 모든 스포츠에서.\n연구를 진행하고 부원과 공유합니다.'
        );
        replaceLegacyValue(card, 'image', 'images/activity_edited_1.png', 'images/project-field-model.png');
        replaceLegacyValue(
          card,
          'description',
          '야구, 축구, 농구, F1, e-sports 등 모든 스포츠에서.\n연구를 진행하고 부원과 공유합니다.',
          '야구, 축구, 농구, F1, e-sports 등 모든 스포츠에서.\n연구를 진행하고 부원들과 공유합니다.'
        );
      }

      if (card.id === 'community') {
        if (Array.isArray(card.titleLines) && card.titleLines.join('|') === '같이 보고,|같이 즐기고,|같이 성장합니다.') {
          card.titleLines = ['함께 보고,', '함께 즐기고,', '함께 성장합니다.'];
        }
        replaceLegacyValue(
          card,
          'description',
          '스포츠 경기 단체 관람, 연사초청, MT, 체육대회와 소모임을 통해 서로 다른 관심 종목을 가진 부원들이 자연스럽게 교류합니다.',
          '스포츠 경기 단체 관람, 연사초청, MT, 체육대회와 소모임을 통해 서로 다른 관심 종목을 가진 부원들이 하나가 되어 교류합니다.'
        );
      }
    });

    const about = content.about || {};
    replaceLegacyValue(
      about.hero,
      'description',
      'PAINS는 스포츠에서 질문을 찾아 데이터로 검증하고, 분석의 과정과 발견을 부원들과 공유하는 고려대학교 스포츠 통계분석 동아리입니다.',
      'PAINS는 스포츠 통계를 사랑하는 사람들이 모여, 같이 프로젝트를 수행하며 스포츠 통계에 대한 학문적 탐구를 진행하는 동아리입니다.'
    );
    replaceLegacyValue(about.hero, 'title', 'PAINS 소개', 'We Are\nPAINS');
    replaceLegacyValue(about.hero, 'image', 'images/pains-sports-analytics-blue.png', 'images/소개사진.jpg');
    replaceLegacyValue(about.whoWeAre, 'mobileTitle', 'WE ARE PAINS', '스포츠를 데이터로 탐구합니다.');
    replaceLegacyValue(
      about.whoWeAre,
      'description',
      '야구, 축구, 농구, F1, e-sports 등 종목의 경계를 두지 않고 경기 기록과 맥락을 탐구합니다. 각자의 관심에서 시작한 연구는 세미나와 팀 프로젝트를 거쳐 모두가 나누는 지식이 됩니다.',
      '야구, 축구, 농구, 배구, F1, e-sports등 다양한 종목에 대한 흥미와 열정을 지닌 부원들이 매 학기 열정적으로 프로젝트를 수행하고 있으며, 탐구 프로젝트뿐만 아니라 스포츠 경기 단체 관람, 연사초청, MT, 체육대회 등 다양한 친목활동을 개최하여 서로 다른 관심 종목을 가진 부원들 간의 교류도 활발하게 진행하고 있습니다.'
    );
    replaceLegacyValue(about.whoWeAre, 'image', 'images/pains-sports-analytics-blue.png', 'images/소개사진.jpg');
    replaceLegacyValue(about.whoWeAre, 'alt', '스포츠 위치와 추세 데이터를 분석하는 짙은 푸른색 분석실', 'PAINS 부원 단체사진');

    if (Array.isArray(home.hero?.meta) && home.hero.meta[1] === 'SPORTS ANALYTICS COLLECTIVE') {
      home.hero.meta[1] = 'SPORTS STATISTICS';
    }

    const organization = content.organization || {};
    if (!organization.generation && typeof organization.title === 'string') {
      const generationMatch = organization.title.match(/^(\d+기)\s+운영진 조직도$/);
      if (generationMatch) {
        organization.generation = generationMatch[1];
        organization.titleTemplate = '{generation} 운영진 조직도';
      }
    }

    return content;
  }

  function readContentCache() {
    try {
      return JSON.parse(localStorage.getItem(CONTENT_CACHE_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function writeContentCache(content) {
    try {
      localStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(content));
    } catch (_) {
      // Storage can be unavailable in private browsing; live content still works.
    }
  }

  async function loadContent() {
    if (window.__painsContentPromise) return window.__painsContentPromise;

    const cachedContent = readContentCache();
    const fallbackPromise = fetch(`${FALLBACK_CONTENT_URL}?v=${Date.now()}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Fallback content fetch failed: ${res.status}`);
        return res.json();
      })
      .catch(() => null);
    const refreshPromise = fetch(`${REMOTE_CONTENT_URL}?v=${Date.now()}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Remote content fetch failed: ${res.status}`);
        return res.json();
      })
      .then((content) => {
        writeContentCache(content);
        return content;
      })
      .catch(() => fallbackPromise)
      .catch((error) => {
        console.warn('[PAINS] 콘텐츠 데이터를 불러오지 못했습니다. HTML fallback을 유지합니다.', error);
        return null;
      });

    window.__painsContentRefreshPromise = refreshPromise;
    window.__painsContentPromise = cachedContent ? Promise.resolve(cachedContent) : fallbackPromise;

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
            img.src = trackAsset(item.src);
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
          img.src = trackAsset(item.src);
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

    const headerCols = document.querySelectorAll('.timeline-header .header-col');
    if (r.track1Label && headerCols[0]) headerCols[0].textContent = r.track1Label;
    if (r.track2Label && headerCols[1]) headerCols[1].textContent = r.track2Label;

    const track1Short = r.track1ShortLabel || (r.track1Label || '1차 모집').replace(/\s*\(.*\)/, '');
    const track2Short = r.track2ShortLabel || r.track2Label || '2차 모집';

    if (!Array.isArray(r.timeline) || !r.timeline.length) return;

    container.replaceChildren();
    r.timeline.forEach((item) => {
      const li = document.createElement('div');
      li.className = 'timeline-item';

      if (item.type === 'single') {
        const content = document.createElement('div');
        content.className = 'timeline-content';
        if (item.highlight) content.style.cssText = 'background-color:#ab3333;color:white;';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'timeline-date';
        if (item.highlight) dateSpan.style.color = '#ffffff';
        dateSpan.textContent = item.date || '';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'timeline-title';
        titleSpan.textContent = item.step || '';

        content.append(dateSpan, titleSpan);

        if (item.note) {
          const p = document.createElement('p');
          p.style.fontSize = '0.9rem';
          const strong = document.createElement('strong');
          if (item.highlight) strong.style.color = '#ffffff';
          strong.textContent = item.note;
          p.appendChild(strong);
          content.appendChild(p);
        }

        li.appendChild(content);
      } else {
        const content = document.createElement('div');
        content.className = 'timeline-content';
        const wrapper = document.createElement('div');
        wrapper.className = 'track-wrapper';

        [
          { label: track1Short, date: item.track1Date, step: item.track1Step || item.step, note: item.track1Note },
          { label: track2Short, date: item.track2Date, step: item.track2Step || item.step, note: item.track2Note }
        ].forEach((track) => {
          const col = document.createElement('div');
          col.className = 'track-col';

          const labelSpan = document.createElement('span');
          labelSpan.className = 'track-label';
          labelSpan.textContent = track.label;

          const dateSpan = document.createElement('span');
          dateSpan.className = 'timeline-date';
          dateSpan.textContent = track.date || '';

          const titleSpan = document.createElement('span');
          titleSpan.className = 'timeline-title';
          titleSpan.textContent = track.step || '';

          col.append(labelSpan, dateSpan, titleSpan);

          if (track.note) {
            const p = document.createElement('p');
            p.style.cssText = 'font-size:0.9rem;color:#666;';
            p.textContent = track.note;
            col.appendChild(p);
          }

          wrapper.appendChild(col);
        });

        content.appendChild(wrapper);
        li.appendChild(content);
      }

      container.appendChild(li);
    });
  }

  function renderApply(content) {
    const r = content?.recruitment;
    if (!r) return;
    const applyOpen = featureGate(content, 'apply', false) && r.applyVisible !== false;
    const applyClosedMessage = content?.settings?.applyClosedMessage || '지원 기간이 아닙니다.';

    if (r.pageTitle) document.title = r.pageTitle;
    text('.hero-apply h2', r.heroTitle);
    text('.hero-apply p', r.heroDescription);
    if (r.generation) text('.wing-box h3', `${r.generation} 신입부원 모집`);
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

    if (r.bannerVisible === false) {
      const banner = document.querySelector('.bottom-banner');
      if (banner) banner.style.display = 'none';
    }

    const overviewSection = document.querySelector('#sec-overview');
    if (overviewSection && r.overviewTitle) text('h3', r.overviewTitle, overviewSection);
    if (overviewSection && r.overviewText) text('p', r.overviewText, overviewSection);

    const introSection = document.querySelector('#sec-intro');
    if (introSection && r.introTitle) text('h3', r.introTitle, introSection);
    if (introSection && r.introDescription) text('p', r.introDescription, introSection);

    const activitySection = document.querySelector('#sec-activity');
    if (activitySection && r.eligibilityTitle) text('h3', r.eligibilityTitle, activitySection);

    const feeSection = document.querySelector('#sec-fee');
    if (feeSection && r.feeAmount) {
      const feeAmountEl = feeSection.querySelector('p');
      if (feeAmountEl) feeAmountEl.textContent = r.feeAmount;
    }
    if (feeSection && r.feeTitle) text('h3', r.feeTitle, feeSection);
    if (feeSection && r.feeDescriptionHtml) {
      const feeDesc = feeSection.querySelector('p:nth-of-type(2)');
      if (feeDesc) feeDesc.innerHTML = r.feeDescriptionHtml;
    }

    const contactSection = document.querySelector('#sec-contact');
    if (contactSection && r.contactTitle) text('h3', r.contactTitle, contactSection);

    const phoneLabel = document.getElementById('js-apply-phone-label');
    if (phoneLabel && r.contactPhoneLabel) phoneLabel.textContent = r.contactPhoneLabel;
    const phone = document.getElementById('js-apply-phone');
    if (phone && r.contactPhone) phone.textContent = r.contactPhone;
    const email = document.getElementById('js-apply-email');
    if (email && r.contactEmail) email.textContent = r.contactEmail;

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
      }
    }

    if (r.timeline) renderApplyTimeline(r);
  }

  function renderResultGate(content) {
    const r = content?.resultPage || {};
    const resultOpen = featureGate(content, 'result', false);
    if (resultOpen) return;

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

  function startOfTodayKst() {
    const nowKstIso = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    return parseKstDate(nowKstIso, 'start');
  }

  function renderHomeSchedule(items) {
    const list = document.getElementById('js-home-schedule');
    if (!list) return;

    const visible = visibleItems(items);
    const withDates = visible.map((item) => ({ item, date: parseKstDate(item.date, 'start') }));
    const today = startOfTodayKst();
    const upcoming = withDates.filter((entry) => !entry.date || !today || entry.date.getTime() >= today.getTime());

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
    textAll('.home-hero__actions .home-cta', [home.hero?.primaryCta, home.hero?.secondaryCta]);

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
    visibleItems(home.projectVariants).forEach((variant, index) => {
      const button = projectButtons[index];
      if (!button) return;
      button.hidden = false;
      button.dataset.projectSrc = variant.image || '';
      button.dataset.projectAlt = variant.alt || '';
      button.dataset.projectLabel = variant.label || '';
      text('span', String(index + 1).padStart(2, '0'), button);
      text('strong', variant.label, button);
    });
    Array.from(projectButtons).slice(visibleItems(home.projectVariants).length).forEach((button) => {
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
    text('[data-about-collective]', about.meta?.collective);

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
    text('.section-card h3', study.title);
    const headings = document.querySelectorAll('.section-card:first-child h4');
    headings.forEach((heading) => {
      if (heading.textContent.trim() === '스터디 목표') {
        const p = heading.nextElementSibling;
        if (p && study.goal) p.textContent = study.goal;
      }
      if (heading.textContent.trim() === '시간 및 장소') {
        const p = heading.nextElementSibling;
        if (p && study.timePlace) p.textContent = study.timePlace;
      }
    });
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
    migrateLegacyContent(content);
    renderAccessGates(content);

    const current = page();
    if (current === 'index') renderHome(content);
    if (current === 'about') renderAbout(content);
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

  async function waitForAssets() {
    if (!pendingAssetLoads.length) return;
    await Promise.race([
      Promise.allSettled(pendingAssetLoads),
      delay(ASSET_WAIT_LIMIT_MS)
    ]);
  }

  async function init() {
    try {
      const content = await initialContentPromise;
      if (content) applyContent(content);
      await waitForAssets();
    } finally {
      revealContent();
    }

    window.__painsContentRefreshPromise.then((freshContent) => {
      if (freshContent && freshContent !== window.__painsContentLatest) {
        applyContent(freshContent);
      }
    });
  }

  const initialContentPromise = loadContent();
  window.PainsContent = {
    load: loadContent,
    apply: applyContent,
    assetUrl,
    featureGate,
    template
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
