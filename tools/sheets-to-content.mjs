#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const SHEET_ID = process.env.PAINS_SHEET_ID;
const OUT = resolve(process.cwd(), process.env.PAINS_CONTENT_OUT || 'data/site-content.json');
const BASE = resolve(process.cwd(), process.env.PAINS_CONTENT_BASE || 'data/site-content.json');
const HOME_HTML = resolve(process.cwd(), process.env.PAINS_HOME_HTML || 'index.html');
const ASSET_DIR = resolve(process.cwd(), process.env.PAINS_ASSET_DIR || 'images/cms');
const ASSET_PUBLIC_PATH = String(process.env.PAINS_ASSET_PUBLIC_PATH || 'images/cms').replace(/^\/+|\/+$/g, '');

const tabs = {
  copy: 'copy',
  settings: 'settings',
  homeMedia: '홈_사진',
  homeStoryCards: 'home_story_cards',
  homeProjectImages: 'home_project_images',
  schedule: 'Schedule',
  organization: 'organization',
  societies: 'societies',
  events: 'events',
  recruitment: 'recruitment',
  recruitmentTimeline: 'recruitment_timeline',
  recruitmentActivities: 'recruitment_activities',
  recruitmentDepartments: 'recruitment_departments',
  recruitmentLists: 'recruitment_lists',
  recruitmentStats: 'recruitment_stats',
  resultPage: 'result_page',
  projects: 'projects',
  notices: 'notices'
};

function usage() {
  console.log(`
Usage:
  PAINS_SHEET_ID=<google-sheet-id> node tools/sheets-to-content.mjs

Optional:
  PAINS_CONTENT_BASE=data/site-content.json
  PAINS_CONTENT_OUT=data/site-content.json

The sheet must be public/published enough for CSV export.
Missing tabs are skipped, so you can migrate content gradually.
`);
}

function escapeHtmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function syncHomeHtmlFallback(content) {
  let html = await readFile(HOME_HTML, 'utf8');
  const metrics = Array.isArray(content?.home?.metrics) ? content.home.metrics : [];
  const archiveLinks = Array.isArray(content?.home?.archiveLinks) ? content.home.archiveLinks : [];
  const heroMeta = Array.isArray(content?.home?.hero?.meta) ? content.home.hero.meta : [];

  metrics.slice(0, 3).forEach((metric) => {
    if (!metric?.label || metric.value === undefined) return;
    const label = escapeHtmlText(metric.label);
    const value = escapeHtmlText(metric.value);
    const pattern = new RegExp(`<div><strong>[^<]*<\\/strong><span>${label}<\\/span><\\/div>`);
    html = html.replace(pattern, `<div><strong>${value}</strong><span>${label}</span></div>`);
  });

  const projectArchive = archiveLinks.find((item) => item?.href === 'activity');
  if (projectArchive?.label) {
    html = html.replace(
      /<a href="activity"><span>[^<]*<\/span><span>EXPLORE →<\/span><\/a>/,
      `<a href="activity"><span>${escapeHtmlText(projectArchive.label)}</span><span>EXPLORE →</span></a>`
    );
  }

  if (heroMeta.length) {
    const metaMarkup = heroMeta
      .slice(0, 3)
      .map((value) => `          <span>${escapeHtmlText(value)}</span>`)
      .join('\n');
    html = html.replace(
      /        <div class="hero-meta">[\s\S]*?        <\/div>/,
      `        <div class="hero-meta">\n${metaMarkup}\n        </div>`
    );
  }

  await writeFile(HOME_HTML, html, 'utf8');
  console.log(`Updated ${HOME_HTML}`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function normalizeKey(value) {
  return String(value || '').trim();
}

function toObjects(csv) {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const keys = header.map(normalizeKey);
  return rows.map((row) => {
    const obj = {};
    keys.forEach((key, index) => {
      if (key) obj[key] = String(row[index] ?? '').trim();
    });
    return obj;
  });
}

function bool(value, fallback = true) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return !['false', '0', 'no', 'n', 'hidden'].includes(v);
}

// 빈 칸은 fallback 으로. (Number('') 이 0 이라 그냥 쓰면 "비워두면 기본값"이 깨집니다.)
function number(value, fallback = undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// content-api.gs 의 toIsoDate 와 같은 규칙. 어떤 형식으로 넣어도 yyyy-MM-dd 로 통일합니다.
function isoDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const ymd = raw.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const kst = new Date(parsed.getTime() + 9 * 3600 * 1000);
    return kst.toISOString().slice(0, 10);
  }
  return raw;
}

function normalizeTime(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n|\|/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function firstField(row, keys) {
  for (const key of keys) {
    const value = String(row[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function setByPath(target, path, value) {
  const keys = String(path || '').split('.').map((v) => v.trim()).filter(Boolean);
  if (!keys.length) return;
  let cursor = target;
  keys.slice(0, -1).forEach((key, index) => {
    const nextKey = keys[index + 1];
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    cursor = cursor[key];
  });
  const lastKey = keys[keys.length - 1];
  cursor[/^\d+$/.test(lastKey) && Array.isArray(cursor) ? Number(lastKey) : lastKey] = value;
}

function normalizeRecruitment(recruitment = {}) {
  if ('bannerVisible' in recruitment) recruitment.bannerVisible = bool(recruitment.bannerVisible);
  if ('applyVisible' in recruitment) recruitment.applyVisible = bool(recruitment.applyVisible);

  const normalizeItems = (items, fields) => (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const normalized = { ...item };
      if ('visible' in normalized) normalized.visible = bool(normalized.visible);
      if ('highlight' in normalized) normalized.highlight = bool(normalized.highlight, false);
      if ('order' in normalized) normalized.order = number(normalized.order, index + 1);
      fields.forEach((field) => {
        if (field in normalized) normalized[field] = number(normalized[field], 0);
      });
      return normalized;
    })
    .sort((a, b) => number(a.order, 999) - number(b.order, 999));

  recruitment.timeline = normalizeItems(recruitment.timeline, []);
  recruitment.activities = normalizeItems(recruitment.activities, []);
  recruitment.departments = normalizeItems(recruitment.departments, []);

  recruitment.lists ||= {};
  Object.keys(recruitment.lists).forEach((group) => {
    recruitment.lists[group] = normalizeItems(recruitment.lists[group], []);
  });

  recruitment.stats ||= {};
  Object.keys(recruitment.stats).forEach((group) => {
    recruitment.stats[group] = normalizeItems(recruitment.stats[group], ['value']);
  });

  return recruitment;
}

async function fetchTab(tabName) {
  // gviz 응답은 같은 URL을 반복 호출하면 예전 시트 값을 돌려줄 수 있습니다.
  // 매 배포마다 고유 쿼리와 no-cache 헤더를 사용해 현재 셀 값을 강제로 읽습니다.
  const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tabName)}&_=${cacheBust}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, max-age=0',
      Pragma: 'no-cache'
    }
  });
  if (!res.ok) {
    console.warn(`[skip] ${tabName}: ${res.status}`);
    return [];
  }
  const csv = await res.text();
  if (/<HTML|DOCTYPE/i.test(csv.slice(0, 80))) {
    console.warn(`[skip] ${tabName}: sheet is not available as CSV`);
    return [];
  }
  const objects = toObjects(csv);
  console.log(`[sheet] ${tabName}: ${objects.length} rows`);
  return objects;
}

function driveImageUrl(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i)
    || raw.match(/drive\.google\.com\/(?:uc|thumbnail).*?[?&]id=([^&#]+)/i);
  if (!match?.[1]) return raw;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(match[1])}&sz=w2400`;
}

function imageExtension(contentType, sourceUrl) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  const byMime = {
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/webp': '.webp'
  };
  if (byMime[mime]) return byMime[mime];

  try {
    const match = new URL(sourceUrl).pathname.match(/\.(avif|gif|jpe?g|png|svg|webp)$/i);
    if (match) return `.${match[1].toLowerCase().replace('jpeg', 'jpg')}`;
  } catch (_) {
    // The caller already validates remote URLs; use a neutral extension as a last resort.
  }
  return '.img';
}

function isImageField(key) {
  return key === 'src'
    || /(?:^|_)(?:image|photo|thumbnail|logo|background)(?:\d+|Url)?$/i.test(key)
    || /(?:Image|Photo|Thumbnail|Logo|Background)(?:\d+|Url)?$/.test(key);
}

async function downloadImage(sourceUrl) {
  const fetchUrl = driveImageUrl(sourceUrl);
  const response = await fetch(fetchUrl, {
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'User-Agent': 'PAINS-site-content-sync/1.0' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`expected an image but received ${contentType || 'an unknown content type'}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('received an empty file');

  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  await mkdir(ASSET_DIR, { recursive: true });

  const extension = imageExtension(contentType, fetchUrl);
  if (extension === '.gif' || extension === '.svg') {
    const filename = `${hash}${extension}`;
    await writeFile(resolve(ASSET_DIR, filename), bytes);
    console.log(`[asset] ${sourceUrl} -> ${ASSET_PUBLIC_PATH}/${filename}`);
    return `${ASSET_PUBLIC_PATH}/${filename}`;
  }

  for (const width of [640, 1280]) {
    const filename = `${hash}-${width}.webp`;
    const optimized = await sharp(bytes)
      .rotate()
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: width === 640 ? 70 : 74, effort: 6, smartSubsample: true })
      .toBuffer();
    await writeFile(resolve(ASSET_DIR, filename), optimized);
    console.log(`[asset] ${sourceUrl} -> ${ASSET_PUBLIC_PATH}/${filename}`);
  }
  return `${ASSET_PUBLIC_PATH}/${hash}-1280.webp`;
}

async function mirrorRemoteImages(content) {
  const targets = [];

  function walk(value) {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== 'object') return;

    Object.entries(value).forEach(([key, child]) => {
      if (typeof child === 'string' && isImageField(key) && /^https?:\/\//i.test(child.trim())) {
        targets.push({ owner: value, key, url: child.trim() });
        return;
      }
      walk(child);
    });
  }

  walk(content);
  if (!targets.length) return;

  const downloads = new Map();
  targets.forEach(({ url }) => {
    if (!downloads.has(url)) downloads.set(url, downloadImage(url));
  });

  for (const target of targets) {
    try {
      target.owner[target.key] = await downloads.get(target.url);
    } catch (error) {
      throw new Error(`Could not mirror image ${target.url}: ${error.message}`);
    }
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    process.exit(0);
  }

  if (!SHEET_ID) {
    usage();
    process.exit(1);
  }

  const content = JSON.parse(await readFile(BASE, 'utf8'));

  const copyRows = await fetchTab(tabs.copy);
  copyRows.forEach((row) => {
    if (row.path) setByPath(content, row.path, row.value ?? '');
  });

  const settingRows = await fetchTab(tabs.settings);
  settingRows.forEach((row) => {
    const key = row.key || row.path;
    if (key) setByPath(content, `settings.${key}`, row.value ?? '');
  });

  const storyCards = await fetchTab(tabs.homeStoryCards);
  if (storyCards.length) {
    content.home.story.cards = storyCards.map((row) => {
      const image2 = row.image2 || row.image_2;
      return {
        id: row.id,
        eyebrow: row.eyebrow,
        titleLines: splitLines(row.titleLines || row.title_lines || row.title),
        description: row.description,
        image: row.image,
        alt: row.alt,
        images: row.id === 'community' ? [
          row.image ? { src: row.image, alt: row.alt } : null,
          image2 ? { src: image2, alt: row.alt2 || row.alt_2 } : null
        ].filter(Boolean) : undefined,
        caption: (row.captionFig || row.captionLabel)
          ? { fig: row.captionFig, label: row.captionLabel } : undefined,
        primaryCta: row.primaryLabel ? { label: row.primaryLabel, href: row.primaryHref || '#' } : undefined,
        visible: bool(row.visible),
        order: number(row.order, 999)
      };
    });
  }

  const projectImages = await fetchTab(tabs.homeProjectImages);
  if (projectImages.length) {
    content.home.projectVariants = projectImages
      .filter((row) => row.label || row.image)
      .map((row, index) => ({
        label: row.label,
        image: row.image,
        alt: row.alt,
        visible: bool(row.visible),
        order: number(row.order, index + 1)
      }));
  }

  const schedule = await fetchTab(tabs.schedule);
  if (schedule.length) {
    content.home.schedule = schedule
      .filter((row) => (row.a || row.title || row['일정명']) && (row['B (start date)'] || row.startDate || row['시작일']))
      .map((row, index) => ({
        date: isoDate(row['B (start date)'] || row.startDate || row['시작일'] || row.date),
        startTime: normalizeTime(row['C (start time)'] || row.startTime || row['시작시간']),
        endDate: isoDate(row['D (finish date)'] || row.endDate || row['종료일'] || row['B (start date)']),
        endTime: normalizeTime(row['E (finish time)'] || row.endTime || row['종료시간']),
        title: row.a || row.title || row['일정명'] || row.eventName || row.event_name,
        tag: row['G (type)'] || row.type || row['유형'] || row.tag || row.category,
        location: row['F (location)'] || row.location || row['장소'],
        visible: bool(row['H (homepage)'] || row.homepage || row['홈 공개'] || row.visible),
        order: number(row.order, index + 1)
      }));
  }

  const homeMedia = await fetchTab(tabs.homeMedia);
  homeMedia.forEach((row) => {
    const key = row.key || row['키'];
    const imageUrl = row.imageUrl || row.image || row['사진 URL'] || row['사진주소'];
    const alt = row.alt || row['사진 설명'] || '';
    if (!key || !imageUrl) return;
    if (key === 'hero') content.home.hero.image = imageUrl;
    const variantLabel = ({ projects: 'PROJECT', seminar: 'SEMINAR', column: 'COLUMN' })[key];
    if (variantLabel) {
      const variant = content.home.projectVariants.find((item) => String(item.label || '').toUpperCase() === variantLabel);
      if (variant) {
        variant.image = imageUrl;
        if (alt) variant.alt = alt;
      }
    }
    const card = content.home.story.cards.find((item) => item.id === key || (key.startsWith('community') && item.id === 'community'));
    if (!card) return;
    if (key === 'community1' || key === 'community2') {
      const index = key === 'community2' ? 1 : 0;
      card.images ||= [];
      card.images[index] = { src: imageUrl, alt };
      if (index === 0) {
        card.image = imageUrl;
        if (alt) card.alt = alt;
      }
    } else {
      card.image = imageUrl;
      if (alt) card.alt = alt;
    }
  });

  const organization = await fetchTab(tabs.organization);
  if (organization.length) {
    content.organization.members = organization
      .filter((row) => row.id || row.name || row.role || row.image)
      .map((row) => ({
        id: row.id,
        role: row.role,
        name: row.name,
        major: row.major,
        image: row.image,
        staff: bool(row.staff, false),
        visible: bool(row.visible),
        order: number(row.order, 999)
      }));
  }

  const societies = await fetchTab(tabs.societies);
  if (societies.length) {
    content.societies.items = societies
      .filter((row) => row.name || row.leader || row.description || row.image)
      .map((row) => ({
        name: row.name,
        leader: row.leader,
        description: row.description,
        image: row.image,
        visible: bool(row.visible),
        order: number(row.order, 999)
      }));
  }

  const events = await fetchTab(tabs.events);
  if (events.length) {
    content.events.items = events
      .filter((row) => row.title || row.href || row.image)
      .map((row) => ({
        title: row.title,
        href: row.href,
        image: row.image,
        visible: bool(row.visible),
        order: number(row.order, 999)
      }));
  }

  const recruitment = await fetchTab(tabs.recruitment);
  const unifiedRecruitment = recruitment.filter((row) => row.path);
  if (unifiedRecruitment.length) {
    content.recruitment = {};
    unifiedRecruitment.forEach((row) => {
      const path = String(row.path || '').trim();
      if (!path) return;
      setByPath(content, path.startsWith('recruitment.') ? path : `recruitment.${path}`, row.value ?? '');
    });
  } else {
    if (recruitment.length) {
      content.recruitment = {};
      recruitment.forEach((row) => {
        if (row.key) content.recruitment[row.key] = row.value ?? '';
      });
    }

    const recruitmentTimeline = await fetchTab(tabs.recruitmentTimeline);
    if (recruitmentTimeline.length) {
      content.recruitment.timeline = recruitmentTimeline.map((row, index) => ({
        step: row.step,
        date: row.date,
        note: row.note,
        highlight: bool(row.highlight, false),
        visible: bool(row.visible),
        order: number(row.order, index + 1)
      }));
    }

    const recruitmentActivities = await fetchTab(tabs.recruitmentActivities);
    if (recruitmentActivities.length) {
      content.recruitment.activities = recruitmentActivities.map((row, index) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        image: row.image,
        alt: row.alt,
        visible: bool(row.visible),
        order: number(row.order, index + 1)
      }));
    }

    const recruitmentDepartments = await fetchTab(tabs.recruitmentDepartments);
    if (recruitmentDepartments.length) {
      content.recruitment.departments = recruitmentDepartments.map((row, index) => ({
        title: row.title,
        description: row.description,
        visible: bool(row.visible),
        order: number(row.order, index + 1)
      }));
    }

    const recruitmentLists = await fetchTab(tabs.recruitmentLists);
    if (recruitmentLists.length) {
      content.recruitment.lists = { eligibility: [], regularSchedule: [], irregularSchedule: [] };
      recruitmentLists.forEach((row, index) => {
        const group = row.group;
        if (!group) return;
        content.recruitment.lists[group] ||= [];
        content.recruitment.lists[group].push({
          text: row.text,
          visible: bool(row.visible),
          order: number(row.order, index + 1)
        });
      });
    }

    const recruitmentStats = await fetchTab(tabs.recruitmentStats);
    if (recruitmentStats.length) {
      content.recruitment.stats = { gender: [], major: [], admissionYear: [] };
      recruitmentStats.forEach((row, index) => {
        const group = row.group;
        if (!group) return;
        content.recruitment.stats[group] ||= [];
        content.recruitment.stats[group].push({
          label: row.label,
          value: number(row.value, 0),
          color: row.color,
          visible: bool(row.visible),
          order: number(row.order, index + 1)
        });
      });
    }
  }
  content.recruitment = normalizeRecruitment(content.recruitment);

  const resultPage = await fetchTab(tabs.resultPage);
  if (resultPage.length) {
    content.resultPage = {};
    resultPage.forEach((row) => {
      if (row.key) content.resultPage[row.key] = row.value ?? '';
    });
  }

  const projects = await fetchTab(tabs.projects);
  if (projects.length) {
    content.projects = projects
      .map((row, index) => ({
        title: firstField(row, ['title', 'projectTitle', 'project_title', 'name']),
        year: firstField(row, ['year']),
        generation: firstField(row, ['generation', 'gen']),
        period: firstField(row, ['period', 'term']),
        sport: firstField(row, ['sport', 'category']),
        driveUrl: firstField(row, ['driveUrl', 'driveURL', 'drive_url', 'driveLink', 'drive_link', 'googleDriveUrl', 'google_drive_url']),
        driveId: firstField(row, ['driveId', 'driveID', 'drive_id', 'fileId', 'file_id', 'googleDriveId', 'google_drive_id']),
        pdfUrl: firstField(row, ['pdfUrl', 'pdfURL', 'url', 'link', 'href']),
        file: firstField(row, ['file', 'fileName', 'filename', 'name']),
        visible: bool(firstField(row, ['visible', 'show']), true),
        order: number(firstField(row, ['order', 'sort']), index + 1)
      }))
      .filter((item) => item.visible)
      .filter((item) => item.title || item.driveUrl || item.driveId || item.pdfUrl || item.file)
      .sort((a, b) => b.order - a.order)
      .map(({ visible, order, ...item }) => item);
  }

  const notices = await fetchTab(tabs.notices);
  if (notices.length) {
    content.notices = notices
      .map((row, index) => ({
        title: firstField(row, ['title', 'noticeTitle', 'notice_title', 'name']),
        date: isoDate(firstField(row, ['date', 'publishedAt', 'published_at'])),
        generation: firstField(row, ['generation', 'gen']),
        department: firstField(row, ['department', 'dept', 'team']),
        driveUrl: firstField(row, ['driveUrl', 'driveURL', 'drive_url', 'driveLink', 'drive_link', 'googleDriveUrl', 'google_drive_url']),
        driveId: firstField(row, ['driveId', 'driveID', 'drive_id', 'fileId', 'file_id', 'googleDriveId', 'google_drive_id']),
        pdfUrl: firstField(row, ['pdfUrl', 'pdfURL', 'url', 'link', 'href']),
        file: firstField(row, ['file', 'fileName', 'filename', 'name']),
        important: bool(firstField(row, ['important', 'pinned', 'pin']), false),
        visible: bool(firstField(row, ['visible', 'show']), true),
        order: number(firstField(row, ['order', 'sort']), index + 1)
      }))
      .filter((item) => item.visible)
      .filter((item) => item.title || item.driveUrl || item.driveId || item.pdfUrl || item.file)
      .sort((a, b) => a.order - b.order)
      .map(({ visible, order, ...item }) => item);
  }

  content.meta = {
    ...(content.meta || {}),
    source: `google-sheet:${SHEET_ID}`,
    updatedAt: new Date().toISOString()
  };

  // 사진은 배포 시점에 내려받아 GitHub Pages의 정적 파일로 고정합니다.
  // 브라우저가 Google Drive/외부 저장소를 다시 조회하지 않게 하고,
  // 파일 내용 해시를 URL에 넣어 사진 교체 시 브라우저 캐시도 자동 갱신합니다.
  await mirrorRemoteImages(content);

  await writeFile(OUT, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  await syncHomeHtmlFallback(content);
  console.log(`Updated ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
