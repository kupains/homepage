#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SHEET_ID = process.env.PAINS_SHEET_ID;
const OUT = resolve(process.cwd(), process.env.PAINS_CONTENT_OUT || 'data/site-content.json');
const BASE = resolve(process.cwd(), process.env.PAINS_CONTENT_BASE || 'data/site-content.json');

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
  recruitmentStats: 'recruitment_stats'
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
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);
}

function setByPath(target, path, value) {
  const keys = String(path || '').split('.').map((v) => v.trim()).filter(Boolean);
  if (!keys.length) return;
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  });
  cursor[keys[keys.length - 1]] = value;
}

async function fetchTab(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[skip] ${tabName}: ${res.status}`);
    return [];
  }
  const csv = await res.text();
  if (/<HTML|DOCTYPE/i.test(csv.slice(0, 80))) {
    console.warn(`[skip] ${tabName}: sheet is not available as CSV`);
    return [];
  }
  return toObjects(csv);
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
    content.organization.members = organization.map((row) => ({
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
    content.societies.items = societies.map((row) => ({
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
    content.events.items = events.map((row) => ({
      title: row.title,
      href: row.href,
      image: row.image,
      visible: bool(row.visible),
      order: number(row.order, 999)
    }));
  }

  const recruitment = await fetchTab(tabs.recruitment);
  if (recruitment.length) {
    content.recruitment ||= {};
    recruitment.forEach((row) => {
      if (row.key) content.recruitment[row.key] = row.value ?? '';
    });
    content.recruitment.bannerVisible = bool(content.recruitment.bannerVisible);
    content.recruitment.applyVisible = bool(content.recruitment.applyVisible);
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


  content.meta = {
    ...(content.meta || {}),
    source: `google-sheet:${SHEET_ID}`,
    updatedAt: new Date().toISOString()
  };

  await writeFile(OUT, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  console.log(`Updated ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
