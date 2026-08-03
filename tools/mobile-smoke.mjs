#!/usr/bin/env node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const executablePath = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const viewportWidth = Number(process.env.VIEWPORT_WIDTH || 412);
const viewportHeight = Number(process.env.VIEWPORT_HEIGHT || 915);
const screenshotPath = join(tmpdir(), 'pains-mobile-smoke.png');
const consoleErrors = [];
const failedRequests = [];

const browser = await puppeteer.launch({ executablePath, headless: true });
const page = await browser.newPage();
await page.setViewport({
  width: viewportWidth,
  height: viewportHeight,
  deviceScaleFactor: 1,
  isMobile: viewportWidth <= 768,
  hasTouch: viewportWidth <= 768
});
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url() });
});

await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
const result = await page.evaluate(() => {
  const nav = document.querySelector('.mobile-tabbar');
  const header = document.querySelector('.pains-header');
  const hero = document.querySelector('.home-hero');
  const sectionOrder = Array.from(document.querySelector('main')?.children || [])
    .map((element) => element.id || element.className)
    .filter(Boolean);
  const images = Array.from(document.images).map((image) => ({
    src: image.currentSrc || image.src,
    loading: image.loading,
    complete: image.complete,
    width: image.clientWidth,
    height: image.clientHeight
  }));

  return {
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    bodyVisible: getComputedStyle(document.body).visibility,
    header: header ? { height: header.getBoundingClientRect().height, transform: getComputedStyle(header).transform } : null,
    hero: hero ? { height: hero.getBoundingClientRect().height } : null,
    nav: nav ? {
      display: getComputedStyle(nav).display,
      position: getComputedStyle(nav).position,
      height: nav.getBoundingClientRect().height,
      bottom: nav.getBoundingClientRect().bottom,
      labels: Array.from(nav.querySelectorAll('strong')).map((label) => label.textContent.trim())
    } : null,
    sectionOrder,
    images
  };
});

await page.screenshot({ path: screenshotPath, fullPage: false });
await browser.close();
console.log(JSON.stringify({ ...result, consoleErrors, failedRequests, screenshotPath }, null, 2));
