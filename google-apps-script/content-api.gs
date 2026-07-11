/*
 * PAINS Google Sheets CMS API
 *
 * Use this when you want every content edit to happen in Google Sheets/Drive.
 * 1. Open the Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Paste this file.
 * 4. Deploy > New deployment > Web app.
 * 5. Set access to "Anyone" or "Anyone with the link".
 * 6. Put the deployed URL into js/content-loader.js for GitHub Pages.
 */

var SHEET_ID = '1-kCJGJfKqNTW1D09GdNoL6eyZXUDJO_Ef_EBY0grJNo';
var PDF_PROXY_URL = 'https://pdf-proxy.painsports1905.workers.dev/?url=';

var TAB = {
  copy: 'copy',
  settings: 'settings',
  homeTimeline: 'home_timeline',
  homeAxes: 'home_axes',
  homeStoryNav: 'home_story_nav',
  homeStoryCards: 'home_story_cards',
  organization: 'organization',
  societies: 'societies',
  events: 'events',
  pageContent: 'page_content',
  recruitment: 'recruitment',
  recruitmentTimeline: 'recruitment_timeline',
  resultPage: 'result_page',
  projects: 'projects',
  notices: 'notices',
  readme: 'README'
};

function doGet() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('pains-site-content-v1');
  var json = cached;

  if (!json) {
    json = JSON.stringify(buildContent());
    if (json.length <= 90000) {
      cache.put('pains-site-content-v1', json, 15);
    }
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function baseContent() {
  return {
    meta: {
      version: 'sheets-live',
      source: 'google-apps-script',
      servedAt: new Date().toISOString()
    },
    settings: {},
    home: {
      hero: {},
      timeline: [],
      strategy: { axes: [] },
      story: { nav: [], cards: [] },
      calendar: {}
    },
    about: {
      hero: {},
      whoWeAre: {},
      presidentMessage: { paragraphs: [] }
    },
    organization: { members: [] },
    societies: { items: [] },
    events: { items: [] },
    pdfProxyUrl: PDF_PROXY_URL,
    study: {},
    pages: {},
    recruitment: { timeline: [] },
    resultPage: {}
  };
}

function spreadsheet() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function rows(tabName) {
  var sheet = spreadsheet().getSheetByName(tabName);
  if (!sheet) return [];

  var values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];

  var headers = values.shift().map(function (v) { return String(v || '').trim(); });
  return values
    .filter(function (row) {
      return row.some(function (v) { return String(v || '').trim() !== ''; });
    })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (key, index) {
        if (key) obj[key] = String(row[index] || '').trim();
      });
      return obj;
    });
}

function hasSheet(tabName) {
  return !!spreadsheet().getSheetByName(tabName);
}

function keyRows(tabName) {
  var sheet = spreadsheet().getSheetByName(tabName);
  if (!sheet) return [];

  var values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];

  var firstKey = String(values[0][0] || '').trim();
  var firstValue = String(values[0][1] || '').trim();
  var hasHeader = /^key$/i.test(firstKey) && /^value$/i.test(firstValue);
  var hasShiftedHeader = /^key\s+/i.test(firstKey);
  var output = [];

  if (!hasHeader && !hasShiftedHeader) return [];

  if (hasShiftedHeader) {
    output.push({
      key: firstKey.replace(/^key\s+/i, '').trim(),
      value: String(values[0][1] || '').replace(/^value\s+/i, '').trim(),
      memo: String(values[0][2] || '').replace(/^memo\s+/i, '').trim()
    });
  }

  values.slice(1).forEach(function (row) {
    var key = String(row[0] || '').trim();
    if (!key || /^key$/i.test(key)) return;
    output.push({
      key: key,
      value: String(row[1] || '').trim(),
      memo: String(row[2] || '').trim()
    });
  });

  return output;
}

function extractDriveIdFromUrl(url) {
  var v = String(url || '').trim();
  if (!v) return '';
  var fileMatch = v.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([^/?#]+)/i);
  if (fileMatch) return fileMatch[1];
  var idMatch = v.match(/[?&]id=([^&#]+)/i);
  if (idMatch) return idMatch[1];
  return '';
}

function bool(value, fallback) {
  if (fallback === undefined) fallback = true;
  var v = String(value || '').trim().toLowerCase();
  if (!v) return fallback;
  return ['false', '0', 'no', 'n', 'hidden'].indexOf(v) === -1;
}

function num(value, fallback) {
  var n = Number(value);
  return isFinite(n) ? n : fallback;
}

function splitLines(value) {
  return String(value || '')
    .split('|')
    .map(function (v) { return v.trim(); })
    .filter(Boolean);
}

function imageItems(row) {
  return [
    { src: row.image, alt: row.alt },
    { src: row.image2 || row.secondaryImage, alt: row.alt2 || row.secondaryAlt },
    { src: row.image3, alt: row.alt3 }
  ].filter(function (item) { return item.src; });
}

function firstField(row, keys) {
  for (var i = 0; i < keys.length; i += 1) {
    var value = String(row[keys[i]] || '').trim();
    if (value) return value;
  }
  return '';
}

function archiveProjects(projectRows) {
  return projectRows.map(function (row, index) {
    return {
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
      order: num(firstField(row, ['order', 'sort']), index + 1)
    };
  })
    .filter(function (project) { return project.visible; })
    .filter(function (project) {
      return project.title || project.driveUrl || project.driveId || project.pdfUrl || project.file;
    })
    .sort(function (a, b) { return a.order - b.order; })
    .map(function (project) {
      delete project.visible;
      delete project.order;
      return project;
    });
}

function archiveNotices(noticeRows) {
  return noticeRows.map(function (row, index) {
    return {
      title: firstField(row, ['title', 'noticeTitle', 'notice_title', 'name']),
      date: firstField(row, ['date', 'publishedAt', 'published_at']),
      generation: firstField(row, ['generation', 'gen']),
      department: firstField(row, ['department', 'dept', 'team']),
      driveUrl: firstField(row, ['driveUrl', 'driveURL', 'drive_url', 'driveLink', 'drive_link', 'googleDriveUrl', 'google_drive_url']),
      driveId: firstField(row, ['driveId', 'driveID', 'drive_id', 'fileId', 'file_id', 'googleDriveId', 'google_drive_id']),
      pdfUrl: firstField(row, ['pdfUrl', 'pdfURL', 'url', 'link', 'href']),
      file: firstField(row, ['file', 'fileName', 'filename', 'name']),
      important: bool(firstField(row, ['important', 'pinned', 'pin']), false),
      visible: bool(firstField(row, ['visible', 'show']), true),
      order: num(firstField(row, ['order', 'sort']), index + 1)
    };
  })
    .filter(function (notice) { return notice.visible; })
    .filter(function (notice) {
      return notice.title || notice.driveUrl || notice.driveId || notice.pdfUrl || notice.file;
    })
    .sort(function (a, b) { return a.order - b.order; })
    .map(function (notice) {
      delete notice.visible;
      delete notice.order;
      return notice;
    });
}

function setByPath(target, path, value) {
  var keys = String(path || '').split('.').map(function (v) { return v.trim(); }).filter(Boolean);
  if (!keys.length) return;

  var cursor = target;
  keys.slice(0, -1).forEach(function (key, index) {
    var nextKey = keys[index + 1];
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    cursor = cursor[key];
  });

  var lastKey = keys[keys.length - 1];
  cursor[/^\d+$/.test(lastKey) && Array.isArray(cursor) ? Number(lastKey) : lastKey] = value;
}

function fetchReleaseFiles_(owner, repo, tag) {
  try {
    var url = 'https://api.github.com/repos/' + owner + '/' + repo + '/releases/tags/' + tag;
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return [];
    return JSON.parse(res.getContentText()).assets.map(function (a) { return a.name; });
  } catch (e) { return []; }
}

function buildContent() {
  var content = baseContent();

  rows(TAB.copy).forEach(function (row) {
    if (row.path) setByPath(content, row.path, row.value || '');
  });

  keyRows(TAB.settings).forEach(function (row) {
    var key = row.key || row.path;
    if (key) setByPath(content, 'settings.' + key, row.value || '');
  });
  content.pdfProxyUrl = content.settings.pdfProxyUrl || content.pdfProxyUrl || PDF_PROXY_URL;

  content.home.timeline = rows(TAB.homeTimeline).map(function (row) {
    return {
      year: row.year,
      title: row.title,
      position: row.position || 'top',
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  content.home.strategy.axes = rows(TAB.homeAxes).map(function (row) {
    return {
      id: row.id,
      title: row.title,
      image: row.image,
      href: row.href,
      alt: row.alt,
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  content.home.story.nav = rows(TAB.homeStoryNav).map(function (row) {
    return {
      label: row.label,
      href: row.href,
      targetId: row.targetId || row.target_id,
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  content.home.story.cards = rows(TAB.homeStoryCards).map(function (row) {
    return {
      id: row.id,
      eyebrow: row.eyebrow,
      titleLines: splitLines(row.titleLines || row.title_lines || row.title),
      description: row.description,
      image: row.image,
      alt: row.alt,
      images: row.imagesMode === 'mosaic' || row.images_mode === 'mosaic' || row.id === 'community'
        ? imageItems(row)
        : undefined,
      primaryCta: row.primaryLabel ? { label: row.primaryLabel, href: row.primaryHref || '#' } : undefined,
      secondaryCta: row.secondaryLabel ? { label: row.secondaryLabel, href: row.secondaryHref || '#' } : undefined,
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  content.organization.members = rows(TAB.organization).map(function (row) {
    return {
      id: row.id,
      role: row.role,
      name: row.name,
      major: row.major,
      image: row.image,
      staff: bool(row.staff, false),
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  content.societies.items = rows(TAB.societies).map(function (row) {
    return {
      name: row.name,
      leader: row.leader,
      description: row.description,
      image: row.image,
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  content.events.items = rows(TAB.events).map(function (row) {
    return {
      title: row.title,
      href: row.href,
      image: row.image,
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  var GITHUB_OWNER = 'PAINS1905';
  var GITHUB_REPO  = 'main';

  content.release = {
    owner:       GITHUB_OWNER,
    repo:        GITHUB_REPO,
    noticesTag:  'NOTICEs',
    projectsTag: 'pdfs'
  };

  var projectData = rows(TAB.projects);
  var builtProjects = (projectData.length || hasSheet(TAB.projects))
    ? archiveProjects(projectData)
    : [];
  if (builtProjects.length > 0) {
    content.projects = builtProjects;
  } else {
    content.projects = fetchReleaseFiles_(GITHUB_OWNER, GITHUB_REPO, 'pdfs')
      .map(function (name) {
        return { title: name.replace(/\.pdf$/i, ''), file: name,
                 year: '', generation: '', period: '', sport: '' };
      });
  }

  var noticeData = rows(TAB.notices);
  var builtNotices = (noticeData.length || hasSheet(TAB.notices))
    ? archiveNotices(noticeData)
    : [];
  if (builtNotices.length > 0) {
    content.notices = builtNotices;
  } else {
    content.notices = fetchReleaseFiles_(GITHUB_OWNER, GITHUB_REPO, 'NOTICEs')
      .map(function (name) {
        return { title: name.replace(/\.pdf$/i, ''), file: name,
                 date: '', generation: '', department: '', important: false };
      });
  }

  rows(TAB.pageContent).forEach(function (row) {
    var page = row.page || row.pageName || row.page_name;
    if (!page || !row.selector) return;
    if (!content.pages[page]) content.pages[page] = [];
    content.pages[page].push({
      selector: row.selector,
      type: row.type || 'text',
      value: row.value || '',
      visible: bool(row.visible),
      order: num(row.order, 999)
    });
  });

  var recruitData = keyRows(TAB.recruitment);
  if (recruitData.length) {
    var r = {};
    recruitData.forEach(function (row) {
      if (row.key) r[row.key] = row.value || '';
    });
    content.recruitment = r;
    content.recruitment.bannerVisible = bool(r.bannerVisible);
    content.recruitment.applyVisible = bool(r.applyVisible);
  }

  var recruitTimeline = rows(TAB.recruitmentTimeline);
  if (recruitTimeline.length) {
    if (!content.recruitment) content.recruitment = {};
    content.recruitment.timeline = recruitTimeline.map(function (row) {
      return {
        step: row.step,
        type: row.type || 'dual',
        track1Step: row.track1Step || '',
        track2Step: row.track2Step || '',
        track1Date: row.track1Date || '',
        track1Note: row.track1Note || '',
        track2Date: row.track2Date || '',
        track2Note: row.track2Note || '',
        date: row.date || '',
        note: row.note || '',
        highlight: bool(row.highlight, false),
        order: num(row.order, 999)
      };
    }).sort(function (a, b) { return a.order - b.order; });
  }

  var resultData = keyRows(TAB.resultPage);
  if (resultData.length) {
    content.resultPage = {};
    resultData.forEach(function (row) {
      if (row.key) content.resultPage[row.key] = row.value || '';
    });
  }

  return content;
}

function setupPainsCms() {
  var ss = spreadsheet();

  writeTab(TAB.readme, readmeRows());
  writeTab(TAB.copy, copyRows());
  writeTab(TAB.settings, settingsRows());
  writeTab(TAB.homeTimeline, homeTimelineRows());
  writeTab(TAB.homeAxes, homeAxesRows());
  writeTab(TAB.homeStoryNav, homeStoryNavRows());
  writeTab(TAB.homeStoryCards, homeStoryCardRows());
  writeTab(TAB.organization, organizationRows());
  writeTab(TAB.societies, societyRows());
  writeTab(TAB.events, eventRows());
  writeTab(TAB.pageContent, pageContentRows());
  writeTab(TAB.recruitment, recruitmentRows());
  writeTab(TAB.recruitmentTimeline, recruitmentTimelineRows());
  writeTab(TAB.resultPage, resultPageRows());
  writeTab(TAB.projects, projectRows());
  writeTab(TAB.notices, noticeRows());

  SpreadsheetApp.flush();
  return 'PAINS_SITE_CMS setup complete';
}

function writeTab(name, values) {
  var ss = spreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear({ contentsOnly: false });
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.getDataRange().setWrap(true).setVerticalAlignment('middle');
  sheet.getRange(1, 1, 1, values[0].length)
    .setFontWeight('bold')
    .setBackground('#111827')
    .setFontColor('#ffffff');
  sheet.autoResizeColumns(1, values[0].length);
  for (var col = 1; col <= values[0].length; col += 1) {
    var width = sheet.getColumnWidth(col);
    sheet.setColumnWidth(col, Math.min(Math.max(width, 120), 360));
  }
}

function readmeRows() {
  return [
    ['항목', '내용'],
    ['시트 이름', 'PAINS_SITE_CMS'],
    ['일상 수정', 'copy, home_timeline, organization, societies, events 등 필요한 탭의 value/image/order/visible만 수정합니다.'],
    ['사진 관리', 'Google Drive에 사진 업로드 > 링크가 있는 모든 사용자 보기 가능 > 공유 링크를 image 셀에 붙입니다.'],
    ['줄바꿈', 'titleLines는 | 로 줄을 나눕니다. 일반 설명문은 셀 안에서 줄바꿈해도 됩니다.'],
    ['숨기기', 'visible 값을 FALSE로 바꾸면 사이트에서 숨깁니다. 다시 TRUE로 바꾸면 보입니다.'],
    ['연결', '확장 프로그램 > Apps Script에 content-api.gs 전체를 붙이고 setupPainsCms 실행 후 Web app으로 배포합니다.'],
    ['GitHub Pages', '배포된 Web app URL을 js/content-loader.js에 넣으면 이 시트가 사이트 콘텐츠 원본이 됩니다.']
  ];
}

function copyRows() {
  return [
    ['path', 'value', 'memo'],
    ['home.hero.eyebrow', 'Korea University Sports Statistics', '메인 첫 화면 작은 문구'],
    ['home.hero.titleLines.0', 'WE ARE', '메인 큰 제목 1줄'],
    ['home.hero.titleLines.1', 'PAINS', '메인 큰 제목 2줄'],
    ['home.hero.description', '고려대학교 스포츠 통계 동아리 PAINS입니다.', '메인 소개 문구'],
    ['home.hero.primaryCta', '살펴보기', '메인 버튼 1'],
    ['home.hero.secondaryCta', '일정 보기', '메인 버튼 2'],
    ['home.hero.image', 'images/소개사진.jpg', 'Drive URL로 교체 가능'],
    ['home.strategy.eyebrow', 'PAINS Operating System', 'Who We Are 위 작은 문구'],
    ['home.strategy.title', 'Who We Are', 'Who We Are 제목'],
    ['home.strategy.description', 'PAINS는 스포츠 통계를 사랑하는 사람들이 모여, 같이 프로젝트를 수행하며 스포츠 통계에 대한 학문적 탐구를 진행하는 동아리입니다.', 'Who We Are 설명'],
    ['home.story.eyebrow', 'Who We Are', '아래 스토리 섹션 작은 문구'],
    ['home.story.titleLines.0', '스포츠를 더 깊게', '스토리 제목 1줄'],
    ['home.story.titleLines.1', '이해하는 곳.', '스토리 제목 2줄'],
    ['home.calendar.title', '일정 안내', '캘린더 제목'],
    ['home.calendar.description', 'PAINS의 정기 활동, 비정기 활동, 리크루팅 일정을 한눈에 확인할 수 있습니다.', '캘린더 설명'],
    ['about.hero.eyebrow', 'About PAINS', '소개 페이지 상단 작은 문구'],
    ['about.hero.title', 'PAINS 소개', '소개 페이지 제목'],
    ['about.hero.description', 'PAINS는 스포츠 통계를 사랑하는 사람들이 모여, 같이 프로젝트를 수행하며 스포츠 통계에 대한 학문적 탐구를 진행하는 동아리입니다.', '소개 페이지 설명'],
    ['about.hero.image', 'images/소개사진.jpg', '소개 페이지 상단 이미지'],
    ['about.whoWeAre.eyebrow', 'Who We Are', '소개 페이지 배너 작은 문구'],
    ['about.whoWeAre.desktopTitle', '스포츠를 데이터로 탐구합니다.', 'PC 소개 배너 제목'],
    ['about.whoWeAre.mobileTitle', 'WE ARE PAINS', '모바일 소개 배너 제목'],
    ['about.whoWeAre.description', '2020년 설립되어 2026학년도 1학기에 11기로 활동하는 PAINS는 야구, 축구, 농구, 배구, F1, e-sports 등 다양한 종목에 대한 흥미와 열정을 바탕으로 매 학기 프로젝트를 수행합니다. 탐구 프로젝트뿐만 아니라 스포츠 경기 단체 관람, 연사초청, MT, 체육대회 등 다양한 친목 활동을 통해 서로 다른 관심 종목을 가진 부원들이 교류하고 있습니다.', '소개 배너 설명'],
    ['about.whoWeAre.image', 'images/소개사진.jpg', 'PC용 소개 배너 이미지'],
    ['about.whoWeAre.alt', 'PAINS 단체사진', '이미지 대체 텍스트'],
    ['about.presidentMessage.eyebrow', 'President Message', '회장 인사말 작은 문구'],
    ['about.presidentMessage.title', '회장 인사말', '회장 인사말 제목'],
    ['about.presidentMessage.paragraphs.0', '안녕하십니까, 고려대학교 스포츠 통계분석 동아리 PAINS의 11기 회장 전영재입니다. PAINS는 스포츠를 사랑하는 사람들이 모여, 익숙한 경기와 장면을 숫자와 통계라는 또 다른 언어로 해석해 보고자 만들어진 동아리입니다. 단순히 승패와 득실을 넘어 기록 속에 숨은 맥락과 의미를 발견하고 데이터를 통해 스포츠를 더 깊이 이해하는 경험을 함께 나누고 있습니다.', '회장 인사말 1문단'],
    ['about.presidentMessage.paragraphs.1', '각기 다른 배경을 가진 부원들이 모여 뜨거운 열정으로 스포츠에 대한 궁금증을 해소하는 경험을 함께 하는 동시에 통계뿐만이 아닌 AI와 데이터 과학 분야를 공부하며 부원 모두가 함께 성장하는 환경을 갖추고 있습니다. 매순간 달라지고 발전하는 PAINS의 활동에 많은 관심을 가져주시고 함께 해주셔서 감사합니다.', '회장 인사말 2문단'],
    ['about.presidentMessage.desktopImage', 'images/activity_edited_1.png', 'PC 회장 인사말 이미지'],
    ['about.presidentMessage.mobileImage', 'images/PAINS_logo.png', '모바일 회장 인사말 이미지'],
    ['about.presidentMessage.desktopAlt', 'PAINS 활동 사진', 'PC 이미지 대체 텍스트'],
    ['about.presidentMessage.mobileAlt', 'PAINS CI 로고', '모바일 이미지 대체 텍스트'],
    ['organization.title', '11기 운영진 조직도', '조직도 제목'],
    ['societies.title', 'PAINS 소모임 안내', '소모임 페이지 제목'],
    ['societies.description', 'PAINS에서는 다양한 소모임을 통해 비슷한 관심사를 가진 부원들 간의 친목을 장려하고 있습니다.\n아래 현재 개설된 소모임을 확인해보세요!\n자세한 내용은 PAINS 공지방과 잡담방을 확인해주시기 바랍니다.', '소모임 설명'],
    ['events.title', '이벤트 안내', '이벤트 페이지 제목'],
    ['events.description', 'PAINS에서 진행하는 다양한 이벤트에 참여해보세요!', '이벤트 설명'],
    ['study.title', 'PAINS 11기 스포츠데이터분석 스터디 계획 안내', '스터디 제목'],
    ['study.goal', '다양한 데이터 분석 방법에 대해 학습하고, 실습을 통해 분석 과정을 이해하며 최종적으로 간단한 프로젝트를 진행하며 동아리 활동에 유용한 기본적인 데이터 분석 능력을 기릅니다.', '스터디 목표'],
    ['study.timePlace', '평일 오후 7~9시 (변동 가능), 교내 스터디룸 (월·화·수 3개 분반 개설 예정)', '스터디 시간 및 장소']
  ];
}

function settingsRows() {
  return [
    ['key', 'value', 'memo'],
    ['projectArchiveApiUrl', '', '선택사항. 비워두면 이 CMS의 projects 탭을 프로젝트 아카이브로 사용'],
    ['noticeArchiveApiUrl', '', '선택사항. 비워두면 이 CMS의 notices 탭을 공지사항으로 사용'],
    ['pdfProxyUrl', PDF_PROXY_URL, 'Drive/GitHub PDF 미리보기용 프록시 URL'],
    ['applyEnabled', 'AUTO', '지원하기 메뉴/버튼 열림 여부. TRUE/FALSE/AUTO'],
    ['applyStartAt', '2026-02-26 00:00', 'applyEnabled가 AUTO이거나 비어있을 때 지원 시작 시각 (KST, YYYY-MM-DD HH:mm)'],
    ['applyEndAt', '2026-03-07 23:59', 'applyEnabled가 AUTO이거나 비어있을 때 지원 마감 시각 (KST, YYYY-MM-DD HH:mm)'],
    ['applyClosedMessage', '지원 기간이 아닙니다.', '지원 기간이 아닐 때 메뉴 클릭/지원 페이지에 표시할 문구'],
    ['applyHref', 'apply', '지원하기 메뉴가 열렸을 때 이동할 페이지'],
    ['resultEnabled', 'AUTO', '지원 결과 안내 메뉴 열림 여부. TRUE/FALSE/AUTO'],
    ['resultStartAt', '2026-03-09 00:00', 'resultEnabled가 AUTO이거나 비어있을 때 결과 조회 시작 시각 (KST, YYYY-MM-DD HH:mm)'],
    ['resultEndAt', '2026-03-16 23:59', 'resultEnabled가 AUTO이거나 비어있을 때 결과 조회 종료 시각 (KST, YYYY-MM-DD HH:mm)'],
    ['resultClosedMessage', '지원 결과 조회 기간이 아닙니다.', '결과 조회 기간이 아닐 때 메뉴 클릭 시 표시할 문구'],
    ['resultHref', 'result', '지원 결과 안내 메뉴가 열렸을 때 이동할 페이지'],
    ['resultApiUrl', 'https://script.google.com/macros/s/AKfycbxL7shd9op70ZSSuEYe3Iod6wSoRfQ_UKLs7DU1TdOAWoFr1Xr-d8ZDzBBQ_Iq1kEivPg/exec', '결과 조회 Apps Script Web app URL']
  ];
}

function projectRows() {
  return [
    ['title', 'year', 'generation', 'period', 'sport', 'driveUrl', 'driveId', 'fileName', 'visible', 'order'],
    ['Sample Project', '2026', '10기', '방학 중 프로젝트', '야구', 'https://drive.google.com/file/d/FILE_ID/view?usp=sharing', '', 'sample.pdf', 'TRUE', '1']
  ];
}

function noticeRows() {
  return [
    ['title', 'date', 'generation', 'department', 'driveUrl', 'driveId', 'fileName', 'important', 'visible', 'order'],
    ['Sample Notice', '2026-03-16', '11기', '운영위원회', 'https://drive.google.com/file/d/FILE_ID/view?usp=sharing', '', 'sample-notice.pdf', 'FALSE', 'TRUE', '1']
  ];
}

function homeTimelineRows() {
  return [
    ['year', 'title', 'position', 'visible', 'order'],
    ['2020', 'PAINS 설립', 'top', 'TRUE', '1'],
    ['2021', 'PAINS 1기 시작', 'bottom', 'TRUE', '2'],
    ['2023', '고려대학교 동아리 활성화 프로젝트 수상', 'top', 'TRUE', '3'],
    ['2025', '연세대학교 스포츠분석학회 YSAL과 교류 시작', 'bottom', 'TRUE', '4'],
    ['2026', '11기 활동 진행 중', 'top', 'TRUE', '5']
  ];
}

function homeAxesRows() {
  return [
    ['id', 'title', 'image', 'href', 'alt', 'visible', 'order'],
    ['about', 'About PAINS', 'images/소개사진.jpg', '#home-about', 'PAINS 소개', 'TRUE', '1'],
    ['projects', 'Projects', 'images/activity_edited_1.png', '#home-projects', 'PAINS 프로젝트', 'TRUE', '2'],
    ['community', 'Community', 'images/activity03.png', '#home-community', 'PAINS 커뮤니티', 'TRUE', '3']
  ];
}

function homeStoryNavRows() {
  return [
    ['label', 'href', 'targetId', 'visible', 'order'],
    ['About PAINS', '#home-about', 'home-about', 'TRUE', '1'],
    ['Projects', '#home-projects', 'home-projects', 'TRUE', '2'],
    ['Community', '#home-community', 'home-community', 'TRUE', '3']
  ];
}

function homeStoryCardRows() {
  return [
    ['id', 'eyebrow', 'titleLines', 'description', 'image', 'alt', 'image2', 'alt2', 'imagesMode', 'primaryLabel', 'primaryHref', 'secondaryLabel', 'secondaryHref', 'visible', 'order'],
    ['about', 'About PAINS', '데이터로 스포츠를|다시 씁니다.', '익숙한 경기와 장면을 숫자와 통계라는 또 다른 언어로 해석하며, 기록 속에 숨은 맥락과 의미를 함께 발견합니다.', 'images/소개사진.jpg', 'PAINS 단체사진', '', '', '', 'PAINS 소개 보기', 'about', '', '', 'TRUE', '1'],
    ['projects', 'Projects', '흥미에서 출발해|결과를 만들어냅니다.', '야구, 축구, 농구, 배구, F1, e-sports까지 다양한 종목을 바탕으로 팀 프로젝트를 수행하고 포트폴리오로 남깁니다.', 'images/activity_edited_1.png', 'PAINS 프로젝트 활동', '', '', '', '프로젝트 보기', 'activity', '스터디 보기', 'study', 'TRUE', '2'],
    ['community', 'Community', '같이 보고,|같이 즐기고,|같이 성장합니다.', '스포츠 경기 단체 관람, 연사초청, MT, 체육대회와 소모임을 통해 서로 다른 관심 종목을 가진 부원들이 자연스럽게 교류합니다.', 'images/단체사진.png', 'PAINS 활동 사진', 'images/activity03.png', 'PAINS 체육 활동', 'mosaic', '', '', '', '', 'TRUE', '3']
  ];
}

function organizationRows() {
  return [
    ['id', 'role', 'name', 'major', 'image', 'staff', 'visible', 'order'],
    ['president', '회장', '전영재', '언어학과 24', 'images/회장v2.png', 'FALSE', 'TRUE', '1'],
    ['treasurer', '총무', '손영현', '통계학과 23', 'images/총무.png', 'TRUE', 'TRUE', '2'],
    ['vicePresident', '부회장', '하승민', '데이터과학과 23', 'images/부회장.png', 'FALSE', 'TRUE', '3'],
    ['planning', '기획부장', '나영우', '보건환경융합과학부 25', 'images/기획부장v2.png', 'FALSE', 'TRUE', '4'],
    ['publicRelations', '홍보부장', '김가현', '미디어학부 24', 'images/홍보부장v2.png', 'FALSE', 'TRUE', '5'],
    ['education', '교육부장', '이지섭', '통계학과 24', 'images/교육부장.png', 'FALSE', 'TRUE', '6']
  ];
}

function societyRows() {
  return [
    ['name', 'leader', 'description', 'image', 'visible', 'order'],
    ['e스포츠 소모임', '손영현', 'e스포츠를 하는 것, 보는 것을 즐기는 모든 분들에게 열려있습니다. 많은 관심 부탁드립니다!', 'images/e스포츠 소모임.jpg', 'TRUE', '1'],
    ['LG 트윈스 팬 소모임', '김가현', 'LG팬분들 많은 관심 부탁드립니다!', 'images/LG 트윈스 팬 소모임.png', 'TRUE', '2'],
    ['F1 소모임', '이가람', 'F1에 관심 있으신 분들 많은 관심 부탁드립니다!!', 'images/F1 소모임.jpg', 'TRUE', '3'],
    ['카츠손으로먹기연구회', '최나훈', '주기적으로 서울 투어 및 맛집 탐방하실 열정적인 부원들을 모집합니다!!', 'images/카츠손으로먹기연구회.png', 'TRUE', '4'],
    ['보드게임 소모임', '정윤도', '공강 긴 분, 금요일 할 것 없는 분, 보드게임 잘 모르는 분 모두 환영합니다!', 'images/보드게임 소모임.jpg', 'TRUE', '5'],
    ['KIA 타이거즈 팬 소모임', '서지우', '타 소모임 팀과 연합하여 경기 직관합시다~!\nKIA 타이거즈 팬 분들, 혹은 팬이 되실 분들 많은 관심 부탁드립니다:)', 'images/KIA 타이거즈 팬 소모임.jpg', 'TRUE', '6'],
    ['롯데자이언츠의우승을위한소모임', '전영재', '롯데 우승 or nothing\n롯데가 우승하기 전까지 절대 해체하지 않을 소모임입니다.', 'images/롯데자이언츠의우승을위한소모임.jpg', 'TRUE', '7'],
    ['영화소모임', '이지섭', '장르 관계 없이 다양한 영화 같이 보실 분 모집합니다!', 'images/영화소모임.png', 'TRUE', '8'],
    ['두산 소모임', '이지섭', '함께 직관 및 단관하실 두산 팬 모집!!\n선예매도 가능합니다!', 'images/두산 소모임.png', 'TRUE', '9'],
    ['NC 다이노스 소모임', '최나훈', 'KBO 리그 9번째 심장, NC 다이노스와 함께할 부원들을 모집합니다. 단체 직관 및 친목 활동 함께하실 분들 환영해요', 'images/NC 다이노스 소모임.png', 'TRUE', '10'],
    ['호박고구마회', '김가현', '호박고구마회 하면 1년에 책 3권 이상 읽을 수 있습니다.\n같이 좋은 책 발굴해요!!', 'images/호박고구마회.jpg', 'TRUE', '11'],
    ['회귀분석 스터디 소모임', '이지섭', '박민규 교수님 회귀분석 수업 들으시는 분들 같이 공부하고 의견나누면 좋겠습니다!!!', 'images/회귀분석 스터디 소모임.png', 'TRUE', '12'],
    ['키움 히어로즈 소모임', '이정호', '키움 히어로즈 직관/단관 소모임입니다!\np.s. 저점매수 관심 있으신 분??', 'images/키움 히어로즈 소모임.png', 'TRUE', '13'],
    ['노래방 소모임', '하승민', '노래방이 제2의 집인 사람, 혼자 노래 부르기 심심했던 사람 모두 환영입니다!\n모임장이 노래를 제일 못하기 때문에 노래 실력은 상관없습니다!', 'images/노래방 소모임.jpg', 'TRUE', '14'],
    ['삼성 라이온즈 소모임', '성유현', '이젠 할 때가 됐다! V9\n삼팬들 모입시다', 'images/삼성 라이온즈 소모임.jpg', 'TRUE', '15'],
    ['Champains', '전영재', 'Champains supernova', 'images/Champains.jpg', 'TRUE', '16']
  ];
}

function eventRows() {
  return [
    ['title', 'href', 'image', 'visible', 'order'],
    ['나의 응원 유형은? - PBTI', 'PBTItest', 'images/NOTICE_ACTIVITIES.png', 'TRUE', '1']
  ];
}

function pageContentRows() {
  return [
    ['page', 'selector', 'type', 'value', 'visible', 'order'],
    ['apply', 'h2', 'text', 'PAINS 11기 지원하기', 'FALSE', '1'],
    ['ci', '.ci-logo img', 'src', 'Drive 이미지 URL', 'FALSE', '1'],
    ['fee', '.section-card:first-child p', 'text', '회비 안내 문구', 'FALSE', '1']
  ];
}

function recruitmentRows() {
  return [
    ['key', 'value', 'memo'],
    ['generation', '11기', '기수 (예: 11기, 12기)'],
    ['heroTitle', 'PAINS 신입부원 모집', '모집 페이지 상단 제목'],
    ['heroDescription', '고려대학교 교내 유일 스포츠 통계분석 동아리 PAINS가 11기 신입부원을 모집합니다.', '상단 설명 문구'],
    ['bannerText', '🔥 PAINS 11기 신입부원 모집 마감 임박!', '하단 배너 텍스트'],
    ['bannerVisible', 'TRUE', '하단 배너 표시 여부 (TRUE/FALSE)'],
    ['applyCtaTitle', '11기 2차 지원하기', '지원하기 버튼 섹션 제목'],
    ['applyCtaSubtitle', '신입생, 재학생 모두 환영합니다!', '지원하기 섹션 부제목'],
    ['formUrl', 'https://docs.google.com/forms/d/e/1FAIpQLSerzRF12IQLupIIg6-hfn9EPHYFL3riEmm19peCYW6aciNvlw/formResponse', '구글 폼 URL (매 모집마다 교체)'],
    ['formLabel', '지원서 작성하러 가기', '지원 버튼 텍스트'],
    ['applyPeriod', '지원 기간: 2026년 02월 26일 - 2026년 03월 07일', '지원 기간 안내 문구'],
    ['applyVisible', 'TRUE', '지원 버튼 섹션 표시 (FALSE = 모집 마감 시 버튼 숨김)'],
    ['overviewText', '스포츠 통계분석 동아리 PAINS가 2026년을 함께할 11기 신입 부원을 모집합니다!\nPAINS는 2020년에 스포츠와 통계분석에 관심이 많은 사람들이 모여 만든 동아리입니다.\nPAINS는 2024년까지 통계학과 동아리로 활동했으며, 2026년부터는 애기능동아리연합회 소속 동아리로 출범하게 됩니다. 스포츠를 사랑하고 데이터 분석에 열정이 있다면 전공에 관계없이 누구나 환영합니다.', '모집 개요 섹션 본문'],
    ['track1Label', '1차 모집 (신입생 지원 불가)', '타임라인 1차 모집 헤더 레이블'],
    ['track2Label', '2차 모집', '타임라인 2차 모집 헤더 레이블'],
    ['feeAmount', '학기 당 3만~3만 5천원 (추후 확정)', '회비 금액 안내 문구'],
    ['contactPhoneLabel', '회장 전영재', '연락처 이름 (예: 회장 홍길동)'],
    ['contactPhone', '010-3952-1473', '연락처 전화번호'],
    ['contactEmail', 'painsports1905@gmail.com', '공식 이메일']
  ];
}

function recruitmentTimelineRows() {
  return [
    ['step', 'type', 'track1Step', 'track2Step', 'track1Date', 'track1Note', 'track2Date', 'track2Note', 'date', 'note', 'highlight', 'order'],
    ['서류 신청 마감', 'dual', '서류 신청 마감', '서류 신청 마감', '2026. 02. 09 (월) - 2026. 02. 22 (일)', '', '2026. 02. 26 (목) - 2026. 03. 07 (토)', '', '', '', 'FALSE', '1'],
    ['합격자 발표', 'dual', '서류 합격자 발표', '서류 합격자 발표', '2026. 02. 24 (화) 중', '홈페이지 안내', '2026. 03. 09 (월) 중', '홈페이지 안내', '', '', 'FALSE', '2'],
    ['면접 진행', 'dual', '비대면 면접 진행', '대면 면접 진행', '2026. 02. 26 (목) - 2026. 03. 01 (일)', '기간 중 일정 협의', '2026. 03. 11 (수) - 2026. 03. 13 (금)', '기간 중 일정 협의', '', '', 'FALSE', '3'],
    ['최종 선발 공지', 'dual', '최종 선발 공지', '최종 선발 공지', '2026. 03. 05 (목) 중', '홈페이지 안내', '2026. 03. 15 (일) 중', '홈페이지 안내', '', '', 'FALSE', '4'],
    ['신입 기수 OT', 'single', '', '', '', '', '', '', '2026. 03. 16 (월) 19:00', '참여 필수', 'TRUE', '5']
  ];
}

function resultPageRows() {
  return [
    ['key', 'value', 'memo'],
    ['pageTitle', 'PAINS - 11기 최종 합격자 안내', '브라우저 탭 제목'],
    ['title', '11기 최종 합격자 안내', '결과 조회 페이지 제목'],
    ['subtitle', '지원 시 제출한 학번과 이름을 입력해주세요.', '입력 안내 문구'],
    ['idLabel', '학번 (ID)', '학번 입력 라벨'],
    ['idPlaceholder', '예: 2026123456', '학번 입력 예시'],
    ['nameLabel', '이름 (Name)', '이름 입력 라벨'],
    ['namePlaceholder', '예: 홍길동', '이름 입력 예시'],
    ['buttonLabel', '결과 확인하기', '결과 조회 버튼 문구'],
    ['closedButtonLabel', '조회 기간이 아닙니다', '조회 기간이 아닐 때 버튼 문구'],
    ['loadingLabel', '조회 중...', '조회 중 버튼 문구'],
    ['resultMessageTemplate', '{name}님의 결과입니다.', '결과 영역 상단 문구. {name} 사용 가능'],
    ['loadingStatusLabel', '결과 로딩중', '결과 배지 기본 문구'],
    ['passStatusLabel', '합 격', '합격 배지 문구'],
    ['failStatusLabel', '불합격', '불합격 배지 문구'],
    ['passDescription', '축하드립니다! 귀하는 PAINS 11기 최종 면접에 합격하셨습니다.<br>아래 OT 일정을 확인해주시기 바랍니다.', '합격 안내 문구. <br> 사용 가능'],
    ['failDescription', '2026년 상반기 PAINS 11기 리크루팅에 지원해주셔서 진심으로 감사드립니다.<br>지원자님의 뛰어난 역량과 열정에도 불구하고, 한정된 선발 인원으로 인해 아쉽게도 이번 기수에는 함께하지 못하게 되었습니다. 비록 이번에는 좋은 인연으로 이어지지 못했지만 보여주신 관심에 깊이 감사드리며 앞으로의 행보를 진심으로 응원하겠습니다.<br>PAINS는 매 기수 리크루팅을 진행하고 있으니, 이후에도 PAINS에 많은 관심 부탁드립니다.', '불합격 안내 문구. <br> 사용 가능'],
    ['missingInputMessage', '학번과 이름을 모두 입력해주세요.', '학번/이름 미입력 alert'],
    ['notFoundMessage', '일치하는 지원 정보를 찾을 수 없습니다.\n학번과 이름을 다시 확인해주세요.', '지원 정보 없음 alert'],
    ['lockedMessageTemplate', '아직 결과 발표 기간이 아닙니다.\n발표 일시: {releaseDate} {releaseTime}', '결과 발표 전 alert. {releaseDate}, {releaseTime} 사용 가능'],
    ['errorMessage', '조회 중 오류가 발생했습니다.', '조회 실패 alert'],
    ['missingApiMessage', '결과 조회 API가 설정되지 않았습니다.', 'resultApiUrl 미설정 alert'],
    ['defaultValue', '미정', '일자/시간/장소 값이 없을 때 표시'],
    ['otTitle', 'OT 일정 안내', '합격자 안내 박스 제목'],
    ['dateLabel', '일자:', 'OT 일자 라벨'],
    ['timeLabel', '시간:', 'OT 시간 라벨'],
    ['locationLabel', '장소:', 'OT 장소 라벨'],
    ['mapAlt', '면접장소 약도', '약도 이미지 대체 텍스트'],
    ['warningMessage', '* OT는 3월 16일 월요일 오후 7시 상남정경관 101호에서 진행될 예정입니다.', '빨간 안내 문구'],
    ['noticeMessage1', '* 합격자는 OT 시작 전 채팅방에 초대되어 OT에 대한 안내가 진행될 예정입니다.', '하단 안내 문구 1'],
    ['noticeMessage2', '* 정당한 사유 없이 OT에 불참할 경우 합격이 취소될 수 있으니 유의바랍니다.', '하단 안내 문구 2']
  ];
}
