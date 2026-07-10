#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SHEET_ID = process.env.PAINS_SHEET_ID;
const OUT = resolve(process.cwd(), process.env.PAINS_CONTENT_OUT || 'data/site-content.json');
const BASE = resolve(process.cwd(), process.env.PAINS_CONTENT_BASE || 'data/site-content.json');

const tabs = {
  copy: 'copy',
  settings: 'settings',
  homeTimeline: 'home_timeline',
  homeAxes: 'home_axes',
  homeStoryNav: 'home_story_nav',
  homeStoryCards: 'home_story_cards',
  organization: 'organization',
  societies: 'societies',
  events: 'events',
  pageContent: 'page_content'
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

function number(value, fallback = undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

  const timeline = await fetchTab(tabs.homeTimeline);
  if (timeline.length) {
    content.home.timeline = timeline.map((row) => ({
      year: row.year,
      title: row.title,
      position: row.position || 'top',
      visible: bool(row.visible),
      order: number(row.order, 999)
    }));
  }

  const axes = await fetchTab(tabs.homeAxes);
  if (axes.length) {
    content.home.strategy.axes = axes.map((row) => ({
      id: row.id,
      title: row.title,
      image: row.image,
      href: row.href,
      alt: row.alt,
      visible: bool(row.visible),
      order: number(row.order, 999)
    }));
  }

  const nav = await fetchTab(tabs.homeStoryNav);
  if (nav.length) {
    content.home.story.nav = nav.map((row) => ({
      label: row.label,
      href: row.href,
      targetId: row.targetId || row.target_id,
      visible: bool(row.visible),
      order: number(row.order, 999)
    }));
  }

  const storyCards = await fetchTab(tabs.homeStoryCards);
  if (storyCards.length) {
    content.home.story.cards = storyCards.map((row) => ({
      id: row.id,
      eyebrow: row.eyebrow,
      titleLines: splitLines(row.titleLines || row.title_lines || row.title),
      description: row.description,
      image: row.image,
      alt: row.alt,
      primaryCta: row.primaryLabel ? { label: row.primaryLabel, href: row.primaryHref || '#' } : undefined,
      secondaryCta: row.secondaryLabel ? { label: row.secondaryLabel, href: row.secondaryHref || '#' } : undefined,
      visible: bool(row.visible),
      order: number(row.order, 999)
    }));
  }

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

  const pageContent = await fetchTab(tabs.pageContent);
  if (pageContent.length) {
    content.pages = {};
    pageContent.forEach((row) => {
      const page = row.page || row.pageName || row.page_name;
      if (!page || !row.selector) return;
      if (!content.pages[page]) content.pages[page] = [];
      content.pages[page].push({
        selector: row.selector,
        type: row.type || 'text',
        value: row.value || '',
        visible: bool(row.visible),
        order: number(row.order, 999)
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
