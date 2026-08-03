#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const outputDir = resolve(root, 'images/optimized');
const responsiveImages = [
  'images/pains-data-stadium.png',
  'images/pains-sports-analytics-blue.png',
  'images/project-field-model.png',
  'images/seminar-20260515.jpg',
  'images/project-column.png',
  'images/community-summer-mt-2026.jpg',
  'images/activity4.png',
  'images/activity_edited_1.png',
  'images/activity2.png',
  'images/activity03.png',
  'images/소개사진.jpg'
];
const icons = [
  'images/instagram.png',
  'images/notion.png',
  'images/naver_blog.png'
];

function stem(file) {
  return basename(file, extname(file));
}

async function optimizeResponsive(file) {
  for (const width of [640, 1280]) {
    const output = resolve(outputDir, `${stem(file)}-${width}.webp`);
    await sharp(resolve(root, file))
      .rotate()
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: width === 640 ? 70 : 74, effort: 6, smartSubsample: true })
      .toFile(output);
    console.log(`[image] ${file} -> images/optimized/${basename(output)}`);
  }
}

async function optimizeIcon(file) {
  const output = resolve(outputDir, `${stem(file)}.webp`);
  await sharp(resolve(root, file))
    .rotate()
    .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(output);
  console.log(`[icon] ${file} -> images/optimized/${basename(output)}`);
}

async function optimizeFavicon() {
  const output = resolve(outputDir, 'favicon-32.png');
  await sharp(resolve(root, 'images/PAINS_logo.png'))
    .rotate()
    .resize({ width: 32, height: 32, fit: 'contain' })
    .png({ compressionLevel: 9, palette: true })
    .toFile(output);
  console.log('[icon] images/PAINS_logo.png -> images/optimized/favicon-32.png');
}

await mkdir(outputDir, { recursive: true });
await Promise.all(responsiveImages.map(optimizeResponsive));
await Promise.all(icons.map(optimizeIcon));
await optimizeFavicon();
