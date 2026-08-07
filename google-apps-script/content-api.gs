/*
 * PAINS Google Sheets CMS API
 *
 * 이 시트가 painsports 홈페이지 전체 콘텐츠의 원본입니다.
 *
 * [처음 연결할 때]
 * 1. 시트 열기 > 확장 프로그램 > Apps Script
 * 2. 이 파일 전체를 붙여넣기
 * 3. setupPainsCms() 실행  (주의: 모든 CMS 탭을 시드값으로 덮어씀)
 * 4. setGithubSyncToken() 실행 후 GitHub fine-grained token 저장
 * 5. 시트의 "홈페이지 관리 → 변경사항 사이트에 반영" 메뉴로 배포
 *
 * [이미 쓰고 있는 시트를 최신 구조로 올릴 때]  ← 보통 이 경우
 * 1. 이 파일 전체를 붙여넣기
 * 2. upgradeSheetV2() 실행   (기존에 입력한 값은 보존됩니다)
 * 3. migrateProjectsOrder() 실행  (프로젝트 순서를 역순 방식으로 1회 전환)
 * 4. setGithubSyncToken() 실행 후 시트의 반영 메뉴 사용
 *
 * 주요 콘텐츠/사진은 버튼을 눌렀을 때 GitHub에 정적으로 배포합니다.
 * Schedule 탭만 홈페이지가 열릴 때 직접 조회합니다.
 * Members / Requests는 홈페이지에서 참조하지 않습니다. Applies는 결과 조회 API가 사용합니다.
 */

var SHEET_ID = '1-kCJGJfKqNTW1D09GdNoL6eyZXUDJO_Ef_EBY0grJNo';
var PDF_PROXY_URL = 'https://pdf-proxy.painsports1905.workers.dev/?url=';
var GITHUB_SYNC_ENDPOINT = 'https://api.github.com/repos/kupains/homepage/dispatches';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('홈페이지 관리')
    .addItem('변경사항 사이트에 반영', 'publishHomepage')
    .addSeparator()
    .addItem('GitHub 연결 토큰 설정', 'setGithubSyncToken')
    .addToUi();
}

function setGithubSyncToken() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'GitHub 연결 토큰 설정',
    'kupains/homepage 저장소의 Contents 쓰기 권한이 있는 fine-grained token을 입력하세요. 토큰은 셀에 표시되지 않고 Apps Script 속성에만 저장됩니다.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var token = response.getResponseText().trim();
  if (!token) {
    ui.alert('토큰이 비어 있습니다.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('GITHUB_SYNC_TOKEN', token);
  ui.alert('연결 토큰을 저장했습니다.');
}

function publishHomepage() {
  var ui = SpreadsheetApp.getUi();
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_SYNC_TOKEN');
  if (!token) {
    ui.alert('먼저 홈페이지 관리 → GitHub 연결 토큰 설정을 실행해 주세요.');
    return;
  }

  var response = UrlFetchApp.fetch(GITHUB_SYNC_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    payload: JSON.stringify({
      event_type: 'sync-sheet-content',
      client_payload: {
        source: 'google-sheets',
        requested_at: new Date().toISOString()
      }
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() === 204) {
    ui.alert('사이트 반영을 시작했습니다. 보통 1~2분 뒤 홈페이지에 적용됩니다.');
    return;
  }
  ui.alert('반영 요청 실패 (' + response.getResponseCode() + ')\n' + response.getContentText());
}

var TAB = {
  readme: 'README',
  copy: 'copy',
  settings: 'settings',
  homeMedia: '홈_사진',
  homeStoryCards: 'home_story_cards',
  homeProjectImages: 'home_project_images',
  schedule: 'Schedule',
  organization: 'organization',
  societies: 'societies',
  events: 'events',
  pageContent: 'page_content',
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

// 지금 홈페이지에서 쓰지 않는 탭 — setupPainsCms / upgradeSheetV2 실행 시 자동 삭제합니다.
// page_content 는 renderGenericPage() 기능 자체는 코드에 남아있으므로,
// 나중에 필요하면 page/selector/type/value/visible/order 헤더로 탭만 다시 만들면 됩니다.
var DEPRECATED_TABS = ['home_timeline', 'home_axes', 'home_story_nav', 'page_content', 'home_schedule'];
var LEGACY_RECRUITMENT_TABS = [
  'recruitment_timeline',
  'recruitment_activities',
  'recruitment_departments',
  'recruitment_lists',
  'recruitment_stats'
];

// 시트에 남아있는 옛 문구를 현재 사이트 문구로 승격시킵니다.
// upgradeSheetV2() 가 copy 탭을 다시 쓸 때, 값이 아래 "옛값"과 정확히 일치할 때만 바꿉니다.
// (직접 새로 쓰신 문구는 절대 건드리지 않습니다.)
var LEGACY_COPY_VALUES = [
  {
    path: 'home.strategy.title',
    from: 'WE TURN SPORTS INTO KNOWLEDGE.',
    to: 'WE TURN SPORTS INTO INSIGHT'
  },
  {
    path: 'home.strategy.eyebrow',
    from: 'PAINS Data Archive · Since 2020',
    to: 'Providing Academic INsights for Sport'
  },
  {
    path: 'home.strategy.description',
    from: '경기에서 시작된 질문을 데이터로 검증하고, 동료와 나눈 분석을 하나의 프로젝트로 남깁니다.',
    to: '스포츠에서 질문을 찾아내, 새로운 의미를 발견합니다.'
  },
  {
    path: 'home.hero.meta.1',
    from: 'SPORTS ANALYTICS COLLECTIVE',
    to: 'SPORTS STATISTICS'
  },
  {
    path: 'about.hero.title',
    from: 'PAINS 소개',
    to: 'We Are\nPAINS'
  },
  {
    path: 'about.whoWeAre.mobileTitle',
    from: 'WE ARE PAINS',
    to: '스포츠를 데이터로 탐구합니다.'
  }
];

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
      strategy: { axes: [] },
      story: { nav: [], cards: [] },
      schedule: [],
      calendar: {}
    },
    about: {
      hero: {},
      whoWeAre: {},
      presidentMessage: { paragraphs: [] }
    },
    organization: { generation: '', titleTemplate: '', members: [] },
    societies: { items: [] },
    events: { items: [] },
    pdfProxyUrl: PDF_PROXY_URL,
    study: {},
    pages: {},
    recruitment: {
      timeline: [],
      activities: [],
      departments: [],
      lists: { eligibility: [], regularSchedule: [], irregularSchedule: [] },
      stats: { gender: [], major: [], admissionYear: [] }
    },
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

// 빈 칸은 fallback 으로 넘깁니다.
// (Number('') 은 0 이라 그냥 쓰면 "비워두면 기본값" 규칙이 깨집니다.)
function num(value, fallback) {
  var raw = String(value === null || value === undefined ? '' : value).trim();
  if (!raw) return fallback;
  var n = Number(raw);
  return isFinite(n) ? n : fallback;
}

// 날짜 셀을 어떤 형식으로 입력하든 yyyy-MM-dd (한국 시간) 로 통일해서 내보냅니다.
// "2026-03-16" / "2026. 3. 16" / 날짜 서식 셀 / Date 객체 모두 받습니다.
// 해석할 수 없으면 입력값을 그대로 돌려주므로 기존 데이터가 깨지지 않습니다.
function toIsoDate(value) {
  var raw = String(value === null || value === undefined ? '' : value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  var ymd = raw.match(/^(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/);
  if (ymd) {
    return ymd[1] + '-' + ('0' + ymd[2]).slice(-2) + '-' + ('0' + ymd[3]).slice(-2);
  }

  var parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Seoul', 'yyyy-MM-dd');
  }

  return raw;
}

function normalizeTime(value) {
  var raw = String(value === null || value === undefined ? '' : value).trim();
  var match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return ('0' + match[1]).slice(-2) + ':' + match[2];
}

// "11기" / "11" / "11th" 에서 앞의 숫자만 뽑습니다. 없으면 0.
function generationNumber(value) {
  var match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n|\|/)
    .map(function (v) { return v.trim(); })
    .filter(Boolean);
}

// 커뮤니티 카드는 사진 2장을 나란히 씁니다(홈 04 섹션의 .community__gallery).
function imageItems(row) {
  return [
    { src: row.image, alt: row.alt },
    { src: row.image2 || row.secondaryImage, alt: row.alt2 || row.secondaryAlt }
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
    // 역순 정렬: order 가 큰 것이 사이트 맨 위.
    // order 열을 비워두면 위 map 의 index + 1 (= 행 위치)이 들어가므로,
    // projects 탭 맨 아래에 행을 추가하기만 하면 사이트 최상단에 뜹니다.
    .sort(function (a, b) { return b.order - a.order; })
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
      date: toIsoDate(firstField(row, ['date', 'publishedAt', 'published_at'])),
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

function normalizeRecruitment_(recruitment) {
  recruitment = recruitment || {};
  if (Object.prototype.hasOwnProperty.call(recruitment, 'bannerVisible')) {
    recruitment.bannerVisible = bool(recruitment.bannerVisible);
  }
  if (Object.prototype.hasOwnProperty.call(recruitment, 'applyVisible')) {
    recruitment.applyVisible = bool(recruitment.applyVisible);
  }

  function normalizeItems(items, numericFields) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      return item && typeof item === 'object';
    }).map(function (item, index) {
      if (Object.prototype.hasOwnProperty.call(item, 'visible')) item.visible = bool(item.visible);
      if (Object.prototype.hasOwnProperty.call(item, 'highlight')) item.highlight = bool(item.highlight, false);
      if (Object.prototype.hasOwnProperty.call(item, 'order')) item.order = num(item.order, index + 1);
      numericFields.forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(item, field)) item[field] = num(item[field], 0);
      });
      return item;
    }).sort(function (a, b) { return num(a.order, 999) - num(b.order, 999); });
  }

  recruitment.timeline = normalizeItems(recruitment.timeline, []);
  recruitment.activities = normalizeItems(recruitment.activities, []);
  recruitment.departments = normalizeItems(recruitment.departments, []);
  recruitment.lists = recruitment.lists || {};
  Object.keys(recruitment.lists).forEach(function (group) {
    recruitment.lists[group] = normalizeItems(recruitment.lists[group], []);
  });
  recruitment.stats = recruitment.stats || {};
  Object.keys(recruitment.stats).forEach(function (group) {
    recruitment.stats[group] = normalizeItems(recruitment.stats[group], ['value']);
  });
  return recruitment;
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

  // 홈 02 ABOUT / 03 PROJECTS / 04 COMMUNITY 카드.
  // community 카드만 사진 2장(모자이크)을 씁니다.
  content.home.story.cards = rows(TAB.homeStoryCards).filter(function (row) {
    return row.id || row.titleLines || row.title || row.description;
  }).map(function (row) {
    return {
      id: row.id,
      eyebrow: row.eyebrow,
      titleLines: splitLines(row.titleLines || row.title_lines || row.title),
      description: row.description,
      image: row.image,
      alt: row.alt,
      images: row.id === 'community' ? imageItems(row) : undefined,
      caption: (row.captionFig || row.captionLabel)
        ? { fig: row.captionFig, label: row.captionLabel } : undefined,
      primaryCta: row.primaryLabel ? { label: row.primaryLabel, href: row.primaryHref || '#' } : undefined,
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  // 홈 03 PROJECTS 사진 아래 시안 선택 버튼. visible 이 전부 FALSE 면 버튼 묶음이 통째로 숨습니다.
  content.home.projectVariants = rows(TAB.homeProjectImages).filter(function (row) {
    return row.label || row.image;
  }).map(function (row, index) {
    return {
      label: row.label,
      image: row.image,
      alt: row.alt,
      visible: bool(row.visible),
      order: num(row.order, index + 1)
    };
  });

  // Schedule이 홈페이지 일정의 유일한 원본입니다.
  // 기존 운영 시트의 A:G 열을 그대로 읽으므로 별도 복사/동기화가 필요 없습니다.
  content.home.schedule = rows(TAB.schedule).filter(function (row) {
    return firstField(row, ['a', 'title', '일정명', 'eventName', 'event_name'])
      && firstField(row, ['B (start date)', 'startDate', 'start_date', '시작일', 'date']);
  }).map(function (row, index) {
    var date = firstField(row, ['B (start date)', 'startDate', 'start_date', '시작일', 'date']);
    var startTime = firstField(row, ['C (start time)', 'startTime', 'start_time', '시작시간', 'time']);
    var endDate = firstField(row, ['D (finish date)', 'endDate', 'end_date', '종료일']) || date;
    var endTime = firstField(row, ['E (finish time)', 'endTime', 'end_time', '종료시간']);
    return {
      date: toIsoDate(date),
      startTime: normalizeTime(startTime),
      endDate: toIsoDate(endDate),
      endTime: normalizeTime(endTime),
      title: firstField(row, ['a', 'title', '일정명', 'eventName', 'event_name']),
      tag: firstField(row, ['G (type)', 'type', '유형', 'tag', 'category', 'badge']),
      location: firstField(row, ['F (location)', 'location', '장소']),
      visible: bool(firstField(row, ['H (homepage)', 'homepage', '홈 공개', 'visible']), true),
      order: num(row.order, index + 1)
    };
  });

  // 홈 사진은 이 한 탭에서 URL만 교체하면 됩니다.
  rows(TAB.homeMedia).forEach(function (row) {
    var key = firstField(row, ['key', '키']);
    var imageUrl = firstField(row, ['imageUrl', 'image', '사진 URL', '사진주소']);
    var alt = firstField(row, ['alt', '사진 설명']);
    if (!key || !imageUrl) return;

    if (key === 'hero') content.home.hero.image = imageUrl;
    if (key === 'about') setStoryImage_(content, 'about', imageUrl, alt, 0);
    if (key === 'projects') {
      setStoryImage_(content, 'projects', imageUrl, alt, 0);
      setProjectVariantImage_(content, 'PROJECT', imageUrl, alt);
    }
    if (key === 'seminar') setProjectVariantImage_(content, 'SEMINAR', imageUrl, alt);
    if (key === 'column') setProjectVariantImage_(content, 'COLUMN', imageUrl, alt);
    if (key === 'community1') setStoryImage_(content, 'community', imageUrl, alt, 0);
    if (key === 'community2') setStoryImage_(content, 'community', imageUrl, alt, 1);
  });

  content.organization.members = rows(TAB.organization).filter(function (row) {
    return row.id || row.name || row.role;
  }).map(function (row) {
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

  content.societies.items = rows(TAB.societies).filter(function (row) {
    return row.name;
  }).map(function (row) {
    return {
      name: row.name,
      leader: row.leader,
      description: row.description,
      image: row.image,
      visible: bool(row.visible),
      order: num(row.order, 999)
    };
  });

  content.events.items = rows(TAB.events).filter(function (row) {
    return row.title || row.href;
  }).map(function (row) {
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

  var recruitRows = rows(TAB.recruitment);
  var unifiedRecruitment = recruitRows.filter(function (row) { return row.path; });
  if (unifiedRecruitment.length) {
    content.recruitment = {};
    unifiedRecruitment.forEach(function (row) {
      var path = String(row.path || '').trim();
      if (!path) return;
      setByPath(content, path.indexOf('recruitment.') === 0 ? path : 'recruitment.' + path, row.value || '');
    });
  } else {
    var recruitData = keyRows(TAB.recruitment);
    if (recruitData.length) {
      var r = {};
      recruitData.forEach(function (row) {
        if (row.key) r[row.key] = row.value || '';
      });
      content.recruitment = r;
    }

    var recruitTimeline = rows(TAB.recruitmentTimeline);
    if (recruitTimeline.length) {
      content.recruitment.timeline = recruitTimeline.map(function (row) {
        return { step: row.step, date: row.date || '', note: row.note || '', highlight: row.highlight,
          visible: row.visible, order: row.order };
      });
    }

    var recruitActivities = rows(TAB.recruitmentActivities);
    if (recruitActivities.length) {
      content.recruitment.activities = recruitActivities.map(function (row) {
        return { id: row.id || '', title: row.title || '', description: row.description || '',
          image: row.image || '', alt: row.alt || '', visible: row.visible, order: row.order };
      });
    }

    var recruitDepartments = rows(TAB.recruitmentDepartments);
    if (recruitDepartments.length) {
      content.recruitment.departments = recruitDepartments.map(function (row) {
        return { title: row.title || '', description: row.description || '', visible: row.visible, order: row.order };
      });
    }

    var recruitLists = rows(TAB.recruitmentLists);
    if (recruitLists.length) {
      content.recruitment.lists = { eligibility: [], regularSchedule: [], irregularSchedule: [] };
      recruitLists.forEach(function (row) {
        var group = row.group || '';
        if (!group) return;
        if (!content.recruitment.lists[group]) content.recruitment.lists[group] = [];
        content.recruitment.lists[group].push({ text: row.text || '', visible: row.visible, order: row.order });
      });
    }

    var recruitStats = rows(TAB.recruitmentStats);
    if (recruitStats.length) {
      content.recruitment.stats = { gender: [], major: [], admissionYear: [] };
      recruitStats.forEach(function (row) {
        var group = row.group || '';
        if (!group) return;
        if (!content.recruitment.stats[group]) content.recruitment.stats[group] = [];
        content.recruitment.stats[group].push({ label: row.label || '', value: row.value,
          color: row.color || '', visible: row.visible, order: row.order });
      });
    }
  }
  content.recruitment = normalizeRecruitment_(content.recruitment);

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
  writeCopyTab_(copyRows());
  writeTab(TAB.settings, settingsRows());
  writeTab(TAB.homeMedia, homeMediaRows());
  writeTab(TAB.homeStoryCards, homeStoryCardRows());
  writeTab(TAB.homeProjectImages, homeProjectImageRows());
  writeTab(TAB.organization, organizationRows());
  writeTab(TAB.societies, societyRows());
  writeTab(TAB.events, eventRows());
  writeTab(TAB.recruitment, recruitmentRows());
  hideLegacyRecruitmentTabs_(ss);
  writeTab(TAB.resultPage, resultPageRows());
  writeTab(TAB.projects, projectRows());
  writeTab(TAB.notices, noticeRows());

  removeDeprecatedTabs(ss);

  SpreadsheetApp.flush();
  return 'PAINS_SITE_CMS setup complete';
}

// 홈페이지에서 더 이상 쓰지 않는 중복 탭만 정리합니다.
// Schedule은 홈페이지의 일정 원본이므로 절대 삭제하지 않습니다.
function removeDeprecatedTabs(ss) {
  DEPRECATED_TABS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) ss.deleteSheet(sheet);
  });
}

/*
 * ⭐️ 이미 쓰고 있는 시트를 최신 구조로 올립니다. 입력해둔 값은 보존됩니다.
 *
 *   - copy 탭을 4열(섹션 / path / value / 어디에 보이나)로 재구성하고
 *     행 순서를 실제 사이트 스크롤 순서와 맞춥니다.
 *   - 홈페이지 어디에도 표시되지 않는 항목을 정리합니다.
 *   - 옛 문구가 그대로 남아있으면 현재 사이트 문구로 승격합니다.
 *   - home_project_images 탭을 만들고, home_story_cards 의 안 쓰는 열을 정리합니다.
 *   - 안 쓰는 탭(home_timeline / home_axes / home_story_nav / page_content)을 삭제합니다.
 *   - organization / societies / Schedule / projects / notices / recruitment 등
 *     실제 데이터 탭은 건드리지 않습니다.
 *
 * 실행 전 상태는 _backup_* 탭으로 자동 저장되므로 언제든 되돌릴 수 있습니다.
 * 처음부터 전체를 시드값으로 새로 깔려면 setupPainsCms() 를 쓰세요(주의: 덮어씀).
 */
function upgradeSheetV2() {
  var ss = spreadsheet();
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmm');
  var log = ['── PAINS 시트 개편 결과 ──'];

  log = log.concat(rebuildCopyTab_(ss, stamp));
  log = log.concat(tidyStoryCards_(ss));
  log = log.concat(ensureProjectImagesTab_(ss));
  if (!ss.getSheetByName(TAB.homeMedia)) {
    writeTab(TAB.homeMedia, homeMediaRows());
    log.push('홈_사진 탭 생성 완료');
  }

  DEPRECATED_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh) {
      backupTab_(ss, name, stamp);
      ss.deleteSheet(sh);
      log.push('탭 삭제: ' + name + ' (백업됨)');
    }
  });

  writeTab(TAB.readme, readmeRows());
  log.push('README 갱신 완료');

  log.push('');
  log.push('다음 단계: migrateProjectsOrder() 실행 → 홈페이지 관리 메뉴에서 변경사항 사이트에 반영');

  SpreadsheetApp.flush();
  return log.join('\n');
}

/*
 * 프로젝트 순서를 "맨 아래 추가 → 사이트 맨 위 노출" 방식으로 1회 전환합니다.
 *
 *   전: 최신 프로젝트가 시트 맨 위  (새 프로젝트를 넣으려면 맨 위에 행 삽입)
 *   후: 오래된 프로젝트가 시트 맨 위 (새 프로젝트는 맨 아래에 그냥 추가)
 *
 * order 열은 비워둡니다. 비어 있으면 행 위치가 곧 순번이 되고,
 * 사이트는 이것을 역순으로 뒤집어 보여주므로 맨 아래 행이 최상단에 뜹니다.
 *
 * 두 번 실행해도 안전합니다. 첫 행과 마지막 행의 기수를 비교해
 * 이미 전환된 상태면 아무것도 하지 않습니다.
 * 기수가 전부 같아서 판단이 안 되는 경우에만 migrateProjectsOrder(true) 로 강제 실행하세요.
 */
function migrateProjectsOrder(force) {
  var ss = spreadsheet();
  var sheet = ss.getSheetByName(TAB.projects);
  if (!sheet) return 'projects 탭이 없습니다.';

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 3) return 'projects 탭에 뒤집을 데이터가 없습니다.';

  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
    .map(function (v) { return String(v || '').trim(); });
  var genIdx = headerIndex_(headers, ['generation', 'gen']);
  var orderIdx = headerIndex_(headers, ['order', 'sort']);

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues()
    .filter(function (row) {
      return row.some(function (cell) { return String(cell === null ? '' : cell).trim() !== ''; });
    });
  if (data.length < 2) return 'projects 탭에 뒤집을 데이터가 없습니다.';

  if (!force && genIdx !== -1) {
    var firstGen = generationNumber(data[0][genIdx]);
    var lastGen = generationNumber(data[data.length - 1][genIdx]);
    if (firstGen && lastGen && firstGen <= lastGen) {
      return '이미 전환된 상태입니다(맨 위 ' + firstGen + '기 → 맨 아래 ' + lastGen + '기).\n'
        + '아무것도 바꾸지 않았습니다. 강제로 다시 뒤집으려면 migrateProjectsOrder(true).';
    }
  }

  backupTab_(ss, TAB.projects, Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmm'));

  data.reverse();
  if (orderIdx !== -1) {
    data.forEach(function (row) { row[orderIdx] = ''; });
  }

  sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  sheet.getRange(2, 1, data.length, lastCol).setValues(data);
  SpreadsheetApp.flush();

  var topLabel = genIdx === -1 ? '' : ' (맨 위 ' + generationNumber(data[0][genIdx]) + '기 → 맨 아래 '
    + generationNumber(data[data.length - 1][genIdx]) + '기)';

  return '프로젝트 ' + data.length + '건 순서 전환 완료' + topLabel + '\n'
    + 'order 열을 비웠습니다. 이제 맨 아래에 행을 추가하면 사이트 최상단에 표시됩니다.\n'
    + '★ 홈페이지 관리 메뉴에서 변경사항 사이트에 반영을 눌러야 적용됩니다.';
}

// ── upgradeSheetV2 내부 도우미 ──────────────────────────────────────────────

// 헤더 이름 후보 중 먼저 발견되는 열 번호(0-based). 없으면 -1.
function headerIndex_(headers, names) {
  for (var i = 0; i < names.length; i += 1) {
    var idx = headers.indexOf(names[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

// 탭을 _backup_<이름>_<시각> 으로 복제해 둡니다.
function backupTab_(ss, name, stamp) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return '';
  var backupName = '_backup_' + name + '_' + stamp;
  try {
    if (ss.getSheetByName(backupName)) ss.deleteSheet(ss.getSheetByName(backupName));
    sheet.copyTo(ss).setName(backupName);
    return backupName;
  } catch (e) {
    return '';
  }
}

// copy 탭을 새 4열 구조로 다시 씁니다. 기존 value 는 path 기준으로 이어받습니다.
function rebuildCopyTab_(ss, stamp) {
  var log = [];
  var seed = copyRows();
  var sheet = ss.getSheetByName(TAB.copy);

  if (!sheet) {
    writeCopyTab_(seed);
    log.push('copy 탭 생성 (' + (seed.length - 1) + '개 항목)');
    return log;
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var existing = {};

  if (lastRow > 1) {
    var values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    var headers = values[0].map(function (v) { return String(v || '').trim(); });
    var pathIdx = headerIndex_(headers, ['path']);
    var valueIdx = headerIndex_(headers, ['value']);

    // 헤더가 없는 옛 시트는 1열=path, 2열=value 로 간주합니다.
    if (pathIdx === -1) { pathIdx = 0; valueIdx = 1; }
    if (valueIdx === -1) valueIdx = pathIdx + 1;

    values.slice(1).forEach(function (row) {
      var path = String(row[pathIdx] || '').trim();
      if (!path || path === 'path') return;
      existing[path] = String(row[valueIdx] === undefined ? '' : row[valueIdx]);
    });
  }

  // 옛 문구 → 현재 사이트 문구 승격
  var promoted = [];
  LEGACY_COPY_VALUES.forEach(function (rule) {
    if (existing[rule.path] === rule.from) {
      existing[rule.path] = rule.to;
      promoted.push(rule.path);
    }
  });

  // 시드 순서대로 새 표를 만들되, 값은 기존 것을 우선합니다.
  var kept = 0;
  var next = seed.map(function (row, index) {
    if (index === 0) return row.slice();
    var path = row[1];
    var value = Object.prototype.hasOwnProperty.call(existing, path) ? existing[path] : row[2];
    if (Object.prototype.hasOwnProperty.call(existing, path)) kept += 1;
    return [row[0], path, value, row[3]];
  });

  var seedPaths = {};
  seed.slice(1).forEach(function (row) { seedPaths[row[1]] = true; });
  var dropped = Object.keys(existing).filter(function (path) { return !seedPaths[path]; });

  var backupName = backupTab_(ss, TAB.copy, stamp);
  writeCopyTab_(next);

  log.push('copy 탭 재구성: ' + (next.length - 1) + '개 항목 (기존 값 ' + kept + '개 그대로 유지)');
  if (backupName) log.push('  백업: ' + backupName);
  if (promoted.length) {
    log.push('  옛 문구를 현재 사이트 문구로 승격 (' + promoted.length + '개):');
    promoted.forEach(function (path) { log.push('    · ' + path); });
  }
  if (dropped.length) {
    log.push('  삭제됨 — 홈페이지 어디에도 표시되지 않던 항목 (' + dropped.length + '개):');
    dropped.forEach(function (path) { log.push('    · ' + path); });
  }
  return log;
}

// home_story_cards 에서 지금 홈 마크업이 쓰지 않는 열을 제거합니다.
function tidyStoryCards_(ss) {
  var sheet = ss.getSheetByName(TAB.homeStoryCards);
  if (!sheet) {
    writeTab(TAB.homeStoryCards, homeStoryCardRows());
    return ['home_story_cards 탭 생성'];
  }

  var unused = ['image3', 'alt3', 'captionFig2', 'captionLabel2', 'secondaryLabel', 'secondaryHref', 'imagesMode', 'images_mode'];
  var removed = [];

  // 뒤에서부터 지워야 열 번호가 밀리지 않습니다.
  for (var col = sheet.getLastColumn(); col >= 1; col -= 1) {
    var header = String(sheet.getRange(1, col).getDisplayValue() || '').trim();
    if (unused.indexOf(header) !== -1) {
      sheet.deleteColumn(col);
      removed.push(header);
    }
  }

  var added = ensureColumns(sheet, ['captionFig', 'captionLabel']);
  var log = [];
  log.push('home_story_cards 정리: 안 쓰는 열 ' + removed.length + '개 삭제'
    + (removed.length ? ' (' + removed.reverse().join(', ') + ')' : ''));
  if (added) log.push('  캡션 열 ' + added + '개 보강');
  return log;
}

// copy 탭에 흩어져 있던 home.projectVariants.* 15행을 대체하는 전용 탭.
function ensureProjectImagesTab_(ss) {
  if (ss.getSheetByName(TAB.homeProjectImages)) {
    return ['home_project_images 탭 이미 있음 — 건드리지 않음'];
  }
  writeTab(TAB.homeProjectImages, homeProjectImageRows());
  return ['home_project_images 탭 생성 (홈 03 PROJECTS 사진 시안 3개)'];
}

// 헤더 행에 없는 열 이름만 맨 뒤에 추가합니다(데이터 유지). 추가한 개수 반환.
function ensureColumns(sheet, colNames) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
    .map(function (v) { return String(v || '').trim(); });
  var added = 0;
  colNames.forEach(function (name) {
    if (headers.indexOf(name) === -1) {
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(name)
        .setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');
      headers.push(name);
      added += 1;
    }
  });
  return added;
}

// copy 탭 전용 쓰기: 섹션별로 배경색을 번갈아 칠하고 1행에 필터를 겁니다.
// 어느 섹션을 고치는 중인지 눈으로 바로 구분되게 하는 것이 목적입니다.
function writeCopyTab_(values) {
  writeTab(TAB.copy, values);

  var sheet = spreadsheet().getSheetByName(TAB.copy);
  if (!sheet || values.length < 2) return;

  var shades = ['#ffffff', '#f3f4f6'];
  var shadeIndex = 0;
  var previousSection = null;

  values.slice(1).forEach(function (row, index) {
    var section = String(row[0] || '');
    if (previousSection !== null && section !== previousSection) {
      shadeIndex = (shadeIndex + 1) % shades.length;
    }
    previousSection = section;
    sheet.getRange(index + 2, 1, 1, values[0].length).setBackground(shades[shadeIndex]);
  });

  // 섹션·설명 열은 참고용이라 흐리게, path 는 고정폭으로.
  sheet.getRange(2, 1, values.length - 1, 1).setFontColor('#6b7280').setFontWeight('bold');
  sheet.getRange(2, 2, values.length - 1, 1).setFontFamily('Roboto Mono').setFontColor('#6b7280');
  sheet.getRange(2, 4, values.length - 1, 1).setFontColor('#9ca3af');

  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 230);
  sheet.setColumnWidth(3, 460);
  sheet.setColumnWidth(4, 300);

  try {
    if (sheet.getFilter()) sheet.getFilter().remove();
    sheet.getRange(1, 1, values.length, values[0].length).createFilter();
  } catch (e) {
    // 필터는 있으면 좋은 정도라 실패해도 넘어갑니다.
  }
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
    ['무엇을 고치고 싶은지', '어느 탭 / 어느 열', '메모'],

    ['── 홈 화면 ──', '', ''],
    ['첫 화면 배경 사진, 로고 아래 라벨', 'copy 탭 · 섹션 "홈 · 첫 화면"', ''],
    ['01 정체성 제목·설명·숫자 지표', 'copy 탭 · 섹션 "홈 01 정체성"', ''],
    ['02 ABOUT / 03 PROJECTS / 04 COMMUNITY 카드', 'home_story_cards 탭', '제목(titleLines)·설명·사진(image, community만 image2)·캡션(captionFig/captionLabel)'],
    ['03 PROJECTS 사진 시안 버튼', 'home_project_images 탭', 'visible 이 전부 FALSE 면 버튼이 통째로 숨습니다(현재 상태)'],
    ['05 다가오는 일정 목록', 'Schedule 탭', '운영 일정과 자동 연동됩니다. 현재 시각에 이미 끝난 일정은 제외하고 다음 4개를 표시합니다'],
    ['05 섹션 제목·설명', 'copy 탭 · 섹션 "홈 05 일정"', ''],
    ['맨 아래 링크 3개', 'copy 탭 · 섹션 "홈 06 아카이브"', ''],

    ['── 다른 페이지 ──', '', ''],
    ['PAINS 소개 페이지 글·사진', 'copy 탭 · 섹션 "PAINS 소개 · …"', ''],
    ['회원정보/결석계 문구·알림', 'copy 탭 · 섹션 "회원정보 · …" / "결석계 · …"', ''],
    ['운영진 조직도', 'organization 탭', '기수 제목은 copy 탭의 organization.generation 하나만 고치면 됩니다'],
    ['소모임 목록', 'societies 탭', ''],
    ['이벤트 목록', 'events 탭', ''],
    ['프로젝트 아카이브', 'projects 탭', '★ 오래된 것이 위, 최신이 아래. 새 프로젝트는 맨 아래에 추가 (order 는 비워둘 것)'],
    ['공지사항', 'notices 탭', '날짜는 아무 형식으로 넣어도 됩니다. important=TRUE 면 상단 고정'],
    ['모집 페이지 전체', 'recruitment 탭', '기본 문구·모집 일정·활동 사진·부서·지원 자격·활동 일정·분포 그래프를 섹션별로 한 번에 관리'],
    ['합격 조회 페이지 문구', 'result_page 탭', ''],
    ['지원·결과 조회 기간 열고 닫기', 'settings 탭', 'applyEnabled / result1Enabled / result2Enabled 를 TRUE·FALSE·AUTO 로'],

    ['── 공통 규칙 ──', '', ''],
    ['홈 사진 넣는 법', '홈_사진 탭 · imageUrl 열', 'Drive에 올리고 "링크가 있는 모든 사용자" 로 공유 → 링크를 붙여넣기'],
    ['줄바꿈', '', '모든 제목·설명·안내 문구는 셀 안에서 Alt+Enter로 줄바꿈합니다.'],
    ['숨기기', '', 'visible 을 FALSE 로 바꾸면 사이트에서 사라집니다. TRUE 로 되돌리면 다시 보입니다'],
    ['순서 바꾸기', '', 'order 숫자를 고칩니다. projects 탭만 반대로(큰 숫자가 위) 정렬됩니다'],

    ['── 반영 방법 ──', '', ''],
    ['일정·지원/결과 운영값을 고쳤을 때', 'Schedule / settings / recruitment 탭의 지원하기 섹션 / Applies', '재배포 불필요. 사이트 또는 결과 조회 시 최신값을 직접 조회합니다'],
    ['그 밖의 본문·사진을 고쳤을 때', '', '★ 홈페이지 관리 → 변경사항 사이트에 반영을 누릅니다'],
    ['content-api.gs 를 고쳤을 때', '', 'Apps Script에 저장한 뒤 시트를 새로 엽니다'],

    ['── 주의 ──', '', ''],
    ['운영 데이터 탭', 'Members / Requests / Applies', 'Members·Requests는 홈페이지 미사용. Applies는 결과 조회 API용이므로 삭제·이름 변경 금지'],
    ['_backup_ 으로 시작하는 탭', '', '업그레이드 직전 상태의 자동 백업입니다. 확인 후 지우셔도 됩니다']
  ];
}

/*
 * copy 탭 = 홈 + 소개 + 회원정보/결석계 등 주요 페이지의 "글자와 사진".
 * 행 순서는 실제 사이트를 스크롤하는 순서와 같습니다.
 * 여기에 없는 항목은 홈페이지 어디에도 표시되지 않으므로 일부러 넣지 않았습니다.
 */
function copyRows() {
  return [
    ['섹션', 'path', 'value', '어디에 보이나'],

    ['홈 · 첫 화면', 'home.hero.image', 'images/pains-data-stadium.png', '첫 화면을 가득 채우는 배경 사진 (Drive 공유 링크도 됨)'],
    ['홈 · 첫 화면', 'home.hero.meta.0', 'KOREA UNIVERSITY', 'PAINS 로고 아래 라벨 — 왼쪽'],
    ['홈 · 첫 화면', 'home.hero.meta.1', 'SPORTS STATISTICS', 'PAINS 로고 아래 라벨 — 가운데'],
    ['홈 · 첫 화면', 'home.hero.meta.2', 'SEOUL · EST. 2020', 'PAINS 로고 아래 라벨 — 오른쪽'],

    ['홈 01 정체성', 'home.identity.index', '01 / IDENTITY', '섹션 왼쪽 위 번호 라벨'],
    ['홈 01 정체성', 'home.strategy.eyebrow', 'Providing Academic INsights for Sport', '큰 제목 위 작은 영문 문구'],
    ['홈 01 정체성', 'home.strategy.title', 'WE TURN SPORTS INTO INSIGHT', '가운데 큰 제목'],
    ['홈 01 정체성', 'home.strategy.description', '스포츠에서 질문을 찾아내, 새로운 의미를 발견합니다.', '큰 제목 아래 한 줄 설명'],
    ['홈 01 정체성', 'home.metrics.0.value', '167+', '숫자 지표 1 — 숫자'],
    ['홈 01 정체성', 'home.metrics.0.label', 'PROJECTS', '숫자 지표 1 — 이름'],
    ['홈 01 정체성', 'home.metrics.1.value', '11TH', '숫자 지표 2 — 숫자'],
    ['홈 01 정체성', 'home.metrics.1.label', 'GENERATION', '숫자 지표 2 — 이름'],
    ['홈 01 정체성', 'home.metrics.2.value', '2020', '숫자 지표 3 — 숫자'],
    ['홈 01 정체성', 'home.metrics.2.label', 'FOUNDED', '숫자 지표 3 — 이름'],

    ['홈 04 커뮤니티', 'home.community.index', '04 / COMMUNITY', '섹션 왼쪽 위 번호 라벨 (제목·사진은 home_story_cards 탭)'],

    ['홈 05 일정', 'home.scheduleHead.index', '05 / SCHEDULE', '섹션 왼쪽 위 번호 라벨'],
    ['홈 05 일정', 'home.scheduleHead.label', 'UPCOMING', '제목 위 작은 라벨'],
    ['홈 05 일정', 'home.scheduleHead.title', '다가오는 일정', '섹션 제목'],
    ['홈 05 일정', 'home.scheduleHead.description', '정기 세미나부터 소모임·행사까지, PAINS의 다음 일정을 확인하세요.', '섹션 설명 (일정 목록은 Schedule 탭과 자동 연동)'],

    ['홈 06 아카이브', 'home.archive.eyebrow', 'PAINS ARCHIVE', '맨 아래 링크 묶음 위 작은 문구'],
    ['홈 06 아카이브', 'home.archiveLinks.0.label', '167+ PROJECTS', '맨 아래 링크 1 — 왼쪽 글자'],
    ['홈 06 아카이브', 'home.archiveLinks.0.action', 'EXPLORE →', '맨 아래 링크 1 — 오른쪽 글자'],
    ['홈 06 아카이브', 'home.archiveLinks.0.href', 'activity', '맨 아래 링크 1 — 눌렀을 때 갈 페이지'],
    ['홈 06 아카이브', 'home.archiveLinks.1.label', 'NOTICE', '맨 아래 링크 2 — 왼쪽 글자'],
    ['홈 06 아카이브', 'home.archiveLinks.1.action', 'READ →', '맨 아래 링크 2 — 오른쪽 글자'],
    ['홈 06 아카이브', 'home.archiveLinks.1.href', 'notice', '맨 아래 링크 2 — 눌렀을 때 갈 페이지'],
    ['홈 06 아카이브', 'home.archiveLinks.2.label', 'JOIN PAINS', '맨 아래 링크 3 — 왼쪽 글자'],
    ['홈 06 아카이브', 'home.archiveLinks.2.action', 'APPLY →', '맨 아래 링크 3 — 오른쪽 글자'],
    ['홈 06 아카이브', 'home.archiveLinks.2.href', 'apply', '맨 아래 링크 3 — 눌렀을 때 갈 페이지'],

    ['PAINS 소개 · 상단', 'about.meta.indexLabel', '01 / About', '페이지 맨 위 왼쪽 번호 라벨'],
    ['PAINS 소개 · 상단', 'about.meta.collective', 'Korea University · Sports Data Analysis Circle', '페이지 맨 위 오른쪽 영문 한 줄'],
    ['PAINS 소개 · 상단', 'about.hero.eyebrow', 'About PAINS', '제목 위 작은 문구'],
    ['PAINS 소개 · 상단', 'about.hero.title', 'We Are\nPAINS', '페이지 제목 (셀 안에서 줄바꿈하면 그대로 반영)'],
    ['PAINS 소개 · 상단', 'about.hero.description', 'PAINS는 스포츠 통계를 사랑하는 사람들이 모여, 같이 프로젝트를 수행하며 스포츠 통계에 대한 학문적 탐구를 진행하는 동아리입니다.', '제목 아래 설명'],
    ['PAINS 소개 · 상단', 'about.hero.image', 'images/소개사진.jpg', '대표 사진 (Drive 공유 링크도 됨)'],
    ['PAINS 소개 · 상단', 'about.hero.alt', 'PAINS 부원 단체사진', '대표 사진 설명 (화면에는 안 보이고 검색·접근성용)'],
    ['PAINS 소개 · 상단', 'about.hero.captionLeft', 'Fig. 01', '대표 사진 아래 왼쪽 캡션'],
    ['PAINS 소개 · 상단', 'about.hero.captionRight', 'Sport × Data', '대표 사진 아래 오른쪽 캡션'],

    ['PAINS 소개 · Who We Are', 'about.whoWeAre.eyebrow', 'Who We Are', '검은 배너 왼쪽 작은 문구'],
    ['PAINS 소개 · Who We Are', 'about.whoWeAre.desktopTitle', '스포츠를 데이터로 탐구합니다.', '검은 배너 제목 — PC 화면'],
    ['PAINS 소개 · Who We Are', 'about.whoWeAre.mobileTitle', '스포츠를 데이터로 탐구합니다.', '검은 배너 제목 — 휴대폰 화면'],
    ['PAINS 소개 · Who We Are', 'about.whoWeAre.description', '야구, 축구, 농구, 배구, F1, e-sports등 다양한 종목에 대한 흥미와 열정을 지닌 부원들이 매 학기 열정적으로 프로젝트를 수행하고 있으며, 탐구 프로젝트뿐만 아니라 스포츠 경기 단체 관람, 연사초청, MT, 체육대회 등 다양한 친목활동을 개최하여 서로 다른 관심 종목을 가진 부원들 간의 교류도 활발하게 진행하고 있습니다.', '검은 배너 본문'],

    ['PAINS 소개 · 회장 인사말', 'about.presidentMessage.indexLabel', '02 / Message', '회장 인사말 위 번호 라벨'],
    ['PAINS 소개 · 회장 인사말', 'about.presidentMessage.visible', 'TRUE', 'FALSE로 바꾸면 회장 인사말 섹션 전체가 숨겨집니다'],
    ['PAINS 소개 · 회장 인사말', 'about.presidentMessage.title', '회장 인사말', '섹션 제목'],
    ['PAINS 소개 · 회장 인사말', 'about.presidentMessage.paragraphs.0', '안녕하십니까, 고려대학교 스포츠 통계분석 동아리 PAINS의 11기 회장 전영재입니다. PAINS는 스포츠를 사랑하는 사람들이 모여, 익숙한 경기와 장면을 숫자와 통계라는 또 다른 언어로 해석해 보고자 만들어진 동아리입니다. 단순히 승패와 득실을 넘어 기록 속에 숨은 맥락과 의미를 발견하고 데이터를 통해 스포츠를 더 깊이 이해하는 경험을 함께 나누고 있습니다.', '첫 번째 문단'],
    ['PAINS 소개 · 회장 인사말', 'about.presidentMessage.paragraphs.1', '각기 다른 배경을 가진 부원들이 모여 뜨거운 열정으로 스포츠에 대한 궁금증을 해소하는 경험을 함께 하는 동시에 통계뿐만이 아닌 AI와 데이터 과학 분야를 공부하며 부원 모두가 함께 성장하는 환경을 갖추고 있습니다. 매순간 달라지고 발전하는 PAINS의 활동에 많은 관심을 가져주시고 함께 해주셔서 감사합니다.', '두 번째 문단'],

    ['조직도', 'organization.generation', '11기', '기수. 기수가 바뀌면 이 값 하나만 고치면 제목이 따라 바뀝니다'],
    ['조직도', 'organization.titleTemplate', '{generation} 운영진 조직도', '조직도 제목 형식. {generation} 자리에 위 기수가 들어갑니다'],

    ['소모임', 'societies.title', 'PAINS 소모임 안내', '소모임 페이지 제목'],
    ['소모임', 'societies.description', 'PAINS에서는 다양한 소모임을 통해 비슷한 관심사를 가진 부원들 간의 친목을 장려하고 있습니다.\n아래 현재 개설된 소모임을 확인해보세요!\n자세한 내용은 PAINS 공지방과 잡담방을 확인해주시기 바랍니다.', '제목 아래 설명 (소모임 목록은 societies 탭)'],

    ['이벤트', 'events.title', '이벤트 안내', '이벤트 페이지 제목'],
    ['이벤트', 'events.description', 'PAINS에서 진행하는 다양한 이벤트에 참여해보세요!', '제목 아래 설명 (이벤트 목록은 events 탭)'],

    ['회원정보 · 공통 입력', 'attendance.common.idLabel', '학번', '회원 조회와 결석계 제출의 학번 라벨'],
    ['회원정보 · 공통 입력', 'attendance.common.idPlaceholder', '예: 2024123456', '학번 입력칸 예시'],
    ['회원정보 · 공통 입력', 'attendance.common.nameLabel', '이름', '회원 조회와 결석계 제출의 이름 라벨'],
    ['회원정보 · 공통 입력', 'attendance.common.namePlaceholder', '예: 홍길동', '이름 입력칸 예시'],

    ['회원정보 · 조회', 'attendance.member.title', '회원 정보 조회', '회원정보 페이지 첫 번째 제목'],
    ['회원정보 · 조회', 'attendance.member.subtitle', '학번과 이름을 입력하여 회원 정보를 확인하세요.', '첫 번째 제목 아래 안내'],
    ['회원정보 · 조회', 'attendance.member.lookupButton', '조회하기', '회원 조회 버튼'],
    ['회원정보 · 조회', 'attendance.member.loadingButton', '조회 중...', '회원 조회 중 버튼'],
    ['회원정보 · 결과', 'attendance.member.resultSuffix', '님의 정보 및 출석 현황', '조회 결과 이름 뒤 문구'],
    ['회원정보 · 결과', 'attendance.member.statusLabel', '회원 자격', '첫 번째 결과 배지 제목'],
    ['회원정보 · 결과', 'attendance.member.usedCountLabel', '사용한 결석계', '두 번째 결과 배지 제목'],
    ['회원정보 · 결과', 'attendance.member.usedCountUnit', '회', '사용한 결석계 단위'],
    ['회원정보 · 결과', 'attendance.member.attendanceRateLabel', '현재 출석률', '세 번째 결과 배지 제목'],
    ['회원정보 · 결과', 'attendance.member.attendanceRateUnit', '%', '출석률 단위'],
    ['회원정보 · 결과', 'attendance.member.regularTitle', '[정기 활동 출석 현황 안내]', '정기 활동 표 제목'],
    ['회원정보 · 결과', 'attendance.member.irregularTitle', '[비정기 활동 출석 현황 안내]', '비정기 활동 표 제목'],
    ['회원정보 · 안내', 'attendance.member.calculationTitle', '[출석률 계산 안내]', '출석률 계산 박스 제목'],
    ['회원정보 · 안내', 'attendance.member.calculationIntro', '현재 출석률은 다음 수식을 바탕으로 계산됩니다.', '출석률 수식 위 설명'],
    ['회원정보 · 안내', 'attendance.member.bylawTitle', '[운영회칙 안내]', '운영회칙 박스 제목'],
    ['회원정보 · 안내', 'attendance.member.bylawLead', '준회원 및 정회원은 한 기수에 결석계를 3번째 사용하는 시점부터 1회당 5,000원의 결석비를 납부하여야 합니다.', '운영회칙 핵심 문구'],
    ['회원정보 · 안내', 'attendance.member.bylawNotes', '※ 제출한 결석계는 일정 기간 이후 반영됩니다. 활동 후 2일 이상 경과에도 결석계 반영이 되어 있지 않을 경우 운영진에게 문의바랍니다.\n※ 결석계 유형을 변경하거나, 결석계 취소를 원하실 경우 운영진에게 문의바랍니다.\n※ 지각, 조퇴가 아닌 결석의 경우 결석계를 제출하였더라도 출석률에는 출석으로 반영되지 않습니다.', '운영회칙 아래 안내. 셀 안 줄바꿈 사용'],

    ['결석계 · 제출', 'attendance.absence.title', '결석계 제출', '결석계 제출 섹션 제목'],
    ['결석계 · 제출', 'attendance.absence.intro', '3주 내 예정된 정기활동에 대해서만 제출 가능합니다.\n21일 전부터 활동 전날까지만 제출이 가능하며, 당일에는 제출이 불가합니다.', '제목 아래 제출 가능 기간 안내'],
    ['결석계 · 제출', 'attendance.absence.eventLabel', '활동 선택', '활동 선택 영역 라벨'],
    ['결석계 · 제출', 'attendance.absence.typeLabel', '결석계 종류', '결석계 종류 영역 라벨'],
    ['결석계 · 제출', 'attendance.absence.guide', '▶ 지각: 명시된 시작 시각 10분 이후 참여\n▶ 조퇴: 명시된 종료 시각 10분 이전 퇴실\n▶ 지각 & 조퇴: 지각과 조퇴를 모두 해야하는 경우\n※ 단, 최소 전체 활동 시간의 50% 이상 활동하지 못하면 일부 참여했더라도 인정 결석으로 처리됩니다.\n※ 일반적인 정기활동 시간은 시작 시각으로부터 2시간입니다. 상황에 따라 변동될 수 있습니다.\n※ 결석계를 제출했더라도 출석 또는 참여하면 결석계는 사용되지 않습니다.', '결석계 종류 아래 안내. 셀 안 줄바꿈 사용'],
    ['결석계 · 제출', 'attendance.absence.submitButton', '제출하기', '결석계 제출 버튼'],
    ['결석계 · 제출', 'attendance.absence.checkingButton', '정보 확인 중...', '회원정보 확인 중 버튼'],
    ['결석계 · 제출', 'attendance.absence.submittingButton', '제출 중...', '결석계 제출 중 버튼'],
    ['결석계 · 제출', 'attendance.absence.loadingEvents', '불러오는 중...', '활동 목록 로딩 문구'],
    ['결석계 · 제출', 'attendance.absence.noEvents', '현재 제출 가능한 정기활동이 없습니다.\n(활동 21일 전부터 전날까지만 결석계 제출이 가능합니다)', '제출 가능한 활동이 없을 때 문구'],
    ['결석계 · 제출', 'attendance.absence.scheduleError', '일정을 불러오지 못했습니다.', '활동 일정 조회 실패 문구'],

    ['결석계 · 상태 설명', 'attendance.modal.title', '출석 상태 안내', '상태 설명 팝업 기본 제목'],
    ['결석계 · 상태 설명', 'attendance.modal.defaultDescription', '출석 상태에 대한 설명입니다.', '등록되지 않은 상태의 기본 설명'],
    ['결석계 · 상태 설명', 'attendance.modal.closeLabel', '닫기', '상태 설명 팝업 닫기 버튼'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.출석', '활동에 정상적으로 참여하여 출석으로 처리된 상태입니다.', '출석 상태를 눌렀을 때 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.인정 결석', '사유가 인정되어 결석으로 기록되었지만, 운영 기준에 따라 인정 처리된 상태입니다.', '인정 결석 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.인정 지각', '사유가 인정되어 지각으로 기록되었지만, 운영 기준에 따라 인정 처리된 상태입니다.', '인정 지각 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.인정 조퇴', '사유가 인정되어 조퇴로 기록되었지만, 운영 기준에 따라 인정 처리된 상태입니다.', '인정 조퇴 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.사전 통지 결석', '활동 전에 미리 알린 결석으로 접수된 상태입니다.', '사전 통지 결석 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.사전 통지 지각', '활동 전에 미리 알린 지각으로 접수된 상태입니다.', '사전 통지 지각 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.사전 통지 조퇴', '활동 전에 미리 알린 조퇴로 접수된 상태입니다.', '사전 통지 조퇴 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.무단 결석', '사전 안내 없이 활동에 참여하지 않아 무단 결석으로 처리된 상태입니다.', '무단 결석 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.무단 지각', '사전 안내 없이 늦게 참여하여 무단 지각으로 처리된 상태입니다.', '무단 지각 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.무단 조퇴', '사전 안내 없이 중도 퇴실하여 무단 조퇴로 처리된 상태입니다.', '무단 조퇴 설명'],
    ['결석계 · 상태 설명', 'attendance.statusDescriptions.결석', '비정기 활동에 참여하지 않은 상태입니다.', '비정기 활동 결석 설명'],

    ['결석계 · 알림 문구', 'attendance.messages.missingCredentials', '학번과 이름을 입력해주세요.', '학번 또는 이름을 비웠을 때'],
    ['결석계 · 알림 문구', 'attendance.messages.memberNotFound', '일치하는 부원 정보가 없습니다.', '회원정보 조회 결과가 없을 때'],
    ['결석계 · 알림 문구', 'attendance.messages.lookupError', '조회 중 오류가 발생했습니다.', '회원정보 조회 실패'],
    ['결석계 · 알림 문구', 'attendance.messages.missingEvent', '결석계를 제출할 활동을 선택해주세요.', '활동을 고르지 않았을 때'],
    ['결석계 · 알림 문구', 'attendance.messages.duplicate', '이미 해당 활동에 대한 결석계를 제출하셨습니다.\n결석계 취소나 변경을 원하실 경우, 운영진에게 문의해주세요.', '중복 제출 안내'],
    ['결석계 · 알림 문구', 'attendance.messages.submitMemberNotFound', '일치하는 부원 정보가 없습니다.\n학번과 이름을 다시 확인해주세요.', '결석계 제출 전 회원정보 불일치'],
    ['결석계 · 알림 문구', 'attendance.messages.serverError', '서버 연결 중 오류가 발생했습니다.', '결석계 제출 전 서버 오류'],
    ['결석계 · 알림 문구', 'attendance.messages.confirmTemplate', '[{eventName}] 활동에 대해\n[{absenceType}] 결석계를 제출하시겠습니까?', '제출 확인창. {eventName}, {absenceType} 유지'],
    ['결석계 · 알림 문구', 'attendance.messages.success', '결석계가 제출되었습니다.', '제출 성공 안내'],
    ['결석계 · 알림 문구', 'attendance.messages.submitError', '제출 중 오류가 발생했습니다.', '제출 실패 안내'],

    ['스터디', 'study.title', 'PAINS 11기 스포츠데이터분석 스터디 계획 안내', '스터디 페이지 제목'],
    ['스터디', 'study.goalLabel', '스터디 목표', '첫 카드 항목 제목'],
    ['스터디', 'study.goal', '다양한 데이터 분석 방법에 대해 학습하고, 실습을 통해 분석 과정을 이해하며 최종적으로 간단한 프로젝트를 진행하며 동아리 활동에 유용한 기본적인 데이터 분석 능력을 기릅니다.', '"스터디 목표" 항목 본문'],
    ['스터디', 'study.timePlaceLabel', '시간 및 장소', '첫 카드 항목 제목'],
    ['스터디', 'study.timePlace', '평일 오후 7~9시 (변동 가능), 교내 스터디룸 (월·화·수 3개 분반 개설 예정)', '"시간 및 장소" 항목 본문'],
    ['스터디', 'study.methodLabel', '진행 방식', '첫 카드 항목 제목'],
    ['스터디', 'study.methodItems', '대면으로 진행되며, 총 6차시로 구성됩니다.|1~3차시에서는 다양한 데이터 분석 방법 및 코딩을 통한 구현 방법을 배우며, 간단한 실습 과제가 부여되고 스터디장과 조교의 피드백이 제공됩니다.|중간고사 기간 이후 4~6차시에서는 앞서 배운 내용을 바탕으로 직접 간단한 스포츠데이터분석 프로젝트를 진행할 예정입니다.', '목록 항목은 | 로 구분'],
    ['스터디', 'study.targetLabel', '대상', '첫 카드 항목 제목'],
    ['스터디', 'study.targetItems', '11기 신입부원 및 스터디 참여 의사가 있는 모든 부원|11기 신입부원은 스터디 필참 대상이며, 그 외 인원은 수요 조사 후 최근 기수부터 우선으로 배정될 예정|신입부원만으로 최대 인원이 이루어지면 기존 기수 비모집|교육부장의 판단 하에 이미 충분한 데이터 분석 능력이 있다고 판단되는 신입부원에 한해 스터디 면제', '목록 항목은 | 로 구분'],
    ['스터디', 'study.topicsTitle', '차시별 주제 (예정)', '일반 스터디 차시표 제목'],
    ['스터디', 'study.topics', '1차시::OT(R, 파이썬 안내), 회귀분석|2차시::군집분석|3차시::랜덤 포레스트, XGBoost|중간고사 기간::|4차시::프로젝트 계획서 작성 및 발표&피드백 (+데이터 크롤링, 전처리)|5차시::진행상황 보고&교류 및 피드백|6차시::발표', '차시::내용 형식, 행은 | 로 구분'],
    ['스터디', 'study.sabermetricsTitle', '세이버메트릭스 차시별 주제 (예정)', '세이버메트릭스 차시표 제목'],
    ['스터디', 'study.sabermetricsTopics', '1차시::OT / Classic - 공격|2차시::Classic - 수비|3차시::Sabermetrics - 보정, 공격|중간고사 기간::|4차시::Sabermetrics - 수비|5차시::Sabermetrics - 종합|6차시::축구에서의 세이버메트릭스', '차시::내용 형식, 행은 | 로 구분'],
    ['스터디', 'study.noticeTitle', '유의 사항', '유의사항 카드 제목'],
    ['스터디', 'study.noticeItems', '과제 제출 기한은 다음 차시 전날 11시까지이며, 조교의 개인톡으로 제출합니다.|과제 지각 제출 시 벌금이 부과되며, 벌금은 추후 스터디 회식에서 사용됩니다.', '목록 항목은 | 로 구분'],
    ['스터디', 'study.ruleTitle', '[스터디 규정]', '규정 박스 제목'],
    ['스터디', 'study.ruleIntro', '스터디 규정에 따라 다음과 같은 규칙이 적용됩니다.', '규정 박스 소개'],
    ['스터디', 'study.completionTitle', '1) 수료 조건', '수료 조건 제목'],
    ['스터디', 'study.completionText', '6회차 스터디 기준, 4회 이상 출석 (사유 불문)', '수료 조건 본문'],
    ['스터디', 'study.absenceTitle', '2) 결석 및 지각 규정', '결석·지각 규정 제목'],
    ['스터디', 'study.absenceText', '▶ 무단 결석 1회 이상: 수료 미인정\n무단 결석은 연락 여부로 결정되며, 스터디 시작 1시간 전까지 스터디장에게 결석 사유와 함께 연락이 필요합니다.\n▶ 지각 2회 이상: 음료 돌리기 (수료 조건에는 영향 X)', '줄바꿈은 셀 안 줄바꿈 사용']
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
    ['result1Enabled', 'FALSE', '1차 결과 조회 열림 여부. TRUE/FALSE/AUTO'],
    ['result1StartAt', '', 'result1Enabled가 AUTO일 때 1차 결과 조회 시작 시각 (KST, YYYY-MM-DD HH:mm)'],
    ['result1EndAt', '', 'result1Enabled가 AUTO일 때 1차 결과 조회 종료 시각 (KST, YYYY-MM-DD HH:mm)'],
    ['result1ClosedMessage', '1차 결과 조회 기간이 아닙니다.', '1차 결과 조회가 닫혀 있을 때 표시할 문구'],
    ['result2Enabled', 'FALSE', '2차 결과 조회 열림 여부. TRUE/FALSE/AUTO'],
    ['result2StartAt', '', 'result2Enabled가 AUTO일 때 2차 결과 조회 시작 시각 (KST, YYYY-MM-DD HH:mm)'],
    ['result2EndAt', '', 'result2Enabled가 AUTO일 때 2차 결과 조회 종료 시각 (KST, YYYY-MM-DD HH:mm)'],
    ['result2ClosedMessage', '2차 결과 조회 기간이 아닙니다.', '2차 결과 조회가 닫혀 있을 때 표시할 문구'],
    ['resultClosedMessage', '지원 결과 조회 기간이 아닙니다.', '1차와 2차가 모두 닫혀 있을 때 메뉴 클릭 시 표시할 문구'],
    ['resultHref', 'result', '지원 결과 안내 메뉴가 열렸을 때 이동할 페이지'],
    ['resultApiUrl', 'https://script.google.com/macros/s/AKfycbxgfkCdZ0dlDqvLH4zpjRjS02VBcFs7StPkY_5J7fT4eqt8fjbFNqpTgaQgawiBprvM/exec', '1차/2차 결과 조회 Apps Script Web app v2 URL']
  ];
}

/*
 * 프로젝트 아카이브. ★ 오래된 것이 위, 최신이 아래입니다.
 * 새 프로젝트는 맨 아래에 행을 추가하기만 하면 사이트 최상단에 뜹니다(order 는 비워두세요).
 * order 에 숫자를 넣으면 그 값이 큰 순서대로 정렬됩니다.
 */
function projectRows() {
  return [
    ['title', 'year', 'generation', 'period', 'sport', 'driveUrl', 'driveId', 'fileName', 'visible', 'order'],
    ['Sample Project', '2026', '10기', '방학 중 프로젝트', '야구', 'https://drive.google.com/file/d/FILE_ID/view?usp=sharing', '', 'sample.pdf', 'TRUE', '']
  ];
}

function noticeRows() {
  return [
    ['title', 'date', 'generation', 'department', 'driveUrl', 'driveId', 'fileName', 'important', 'visible', 'order'],
    ['Sample Notice', '2026-03-16', '11기', '운영위원회', 'https://drive.google.com/file/d/FILE_ID/view?usp=sharing', '', 'sample-notice.pdf', 'FALSE', 'TRUE', '1']
  ];
}

/*
 * 홈 02 ABOUT / 03 PROJECTS / 04 COMMUNITY 카드.
 *   titleLines : 셀 안에서 Alt+Enter로 줄을 나눕니다. 기존 | 입력도 호환됩니다.
 *   image2     : community 행에서만 씁니다(사진 2장을 나란히 배치).
 *   captionFig / captionLabel : 사진 아래 작은 캡션. community 는 캡션이 없습니다.
 */
function homeStoryCardRows() {
  return [
    ['id', 'eyebrow', 'titleLines', 'description', 'image', 'alt', 'image2', 'alt2', 'captionFig', 'captionLabel', 'primaryLabel', 'primaryHref', 'visible', 'order'],
    ['about', 'ABOUT PAINS', '데이터로 스포츠를|다시 씁니다.', '익숙한 경기와 장면을 숫자와 통계라는 또 다른 언어로 해석하며, 기록 속에 숨은 맥락과 의미를 함께 발견합니다.', 'images/pains-sports-analytics-blue.png', '스포츠 위치와 추세 데이터를 분석하는 짙은 푸른색 분석실', '', '', 'FIG.01', 'SPORTS DATA LAB', 'ABOUT PAINS', 'about', 'TRUE', '1'],
    ['projects', 'PROJECTS', '질문에서 출발해|결과를 만듭니다.', '야구, 축구, 농구, F1, e-sports 등 모든 스포츠에서.\n연구를 진행하고 부원들과 공유합니다.', 'images/project-field-model.png', 'PAINS 프로젝트', '', '', 'FIG.02', 'PROJECT', 'VIEW PROJECTS', 'activity', 'TRUE', '2'],
    ['community', 'COMMUNITY', '함께 보고,|함께 즐기고,|함께 성장합니다.', '스포츠 경기 단체 관람, 연사초청, MT, 체육대회와 소모임을 통해 서로 다른 관심 종목을 가진 부원들이 하나가 되어 교류합니다.', 'images/community-summer-mt-2026.jpg', 'PAINS 여름 MT 단체사진', 'images/activity4.png', 'PAINS 친목 활동', '', '', '', '', 'TRUE', '3']
  ];
}

/*
 * 홈 03 PROJECTS 사진 아래에 뜨는 시안 선택 버튼(01/02/03).
 * visible 이 전부 FALSE 면 버튼 묶음이 통째로 숨습니다.
 * 쓰고 싶으면 원하는 행의 visible 을 TRUE 로 바꾸세요.
 */
function homeProjectImageRows() {
  return [
    ['label', 'image', 'alt', 'visible', 'order'],
    ['PROJECT', 'images/project-field-model.png', 'PAINS 프로젝트', 'TRUE', '1'],
    ['SEMINAR', 'images/seminar-20260515.jpg', 'PAINS 세미나 현장', 'TRUE', '2'],
    ['COLUMN', 'images/project-column.png', 'PAINS 프로젝트 칼럼', 'TRUE', '3']
  ];
}

function homeMediaRows() {
  return [
    ['위치', 'key', 'imageUrl', '사진 설명'],
    ['홈 첫 화면 배경', 'hero', 'images/pains-data-stadium.png', 'PAINS 홈 첫 화면 배경'],
    ['홈 02 ABOUT', 'about', 'images/pains-sports-analytics-blue.png', 'PAINS 소개'],
    ['홈 03 PROJECTS', 'projects', 'images/project-field-model.png', 'PAINS 프로젝트'],
    ['홈 03 SEMINAR', 'seminar', 'images/seminar-20260515.jpg', 'PAINS 세미나 현장'],
    ['홈 03 COLUMN', 'column', 'images/project-column.png', 'PAINS 프로젝트 칼럼'],
    ['홈 04 COMMUNITY 왼쪽', 'community1', 'images/community-summer-mt-2026.jpg', 'PAINS 여름 MT 단체사진'],
    ['홈 04 COMMUNITY 오른쪽', 'community2', 'images/activity4.png', 'PAINS 친목 활동']
  ];
}

function setStoryImage_(content, cardId, imageUrl, alt, imageIndex) {
  var cards = content.home && content.home.story && content.home.story.cards;
  if (!cards) return;
  for (var i = 0; i < cards.length; i += 1) {
    if (cards[i].id !== cardId) continue;
    if (cardId === 'community') {
      if (!cards[i].images) cards[i].images = [];
      while (cards[i].images.length <= imageIndex) cards[i].images.push({ src: '', alt: '' });
      cards[i].images[imageIndex] = { src: imageUrl, alt: alt || cards[i].images[imageIndex].alt || '' };
      if (imageIndex === 0) {
        cards[i].image = imageUrl;
        if (alt) cards[i].alt = alt;
      }
    } else {
      cards[i].image = imageUrl;
      if (alt) cards[i].alt = alt;
    }
    return;
  }
}

function setProjectVariantImage_(content, label, imageUrl, alt) {
  var variants = content.home && content.home.projectVariants;
  if (!variants) return;
  for (var i = 0; i < variants.length; i += 1) {
    if (String(variants[i].label || '').toUpperCase() !== label) continue;
    variants[i].image = imageUrl;
    if (alt) variants[i].alt = alt;
    return;
  }
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

function hideLegacyRecruitmentTabs_(ss) {
  LEGACY_RECRUITMENT_TABS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) sheet.hideSheet();
  });
}

function recruitmentRows() {
  var output = [['섹션', 'path', 'value', '어디에 보이나']];

  recruitmentBaseRows_().slice(1).forEach(function (row) {
    output.push([recruitmentSectionForKey_(row[0]), 'recruitment.' + row[0], row[1], row[2]]);
  });

  appendRecruitmentRecords_(output, '모집 일정', 'recruitment.timeline', recruitmentTimelineRows(), '일정');
  appendRecruitmentRecords_(output, '활동 사진', 'recruitment.activities', recruitmentActivityRows(), '활동 카드');
  appendRecruitmentRecords_(output, '부서 소개', 'recruitment.departments', recruitmentDepartmentRows(), '부서');

  var listCounters = {};
  var listRows = recruitmentListRows();
  var listHeaders = listRows[0];
  listRows.slice(1).forEach(function (row) {
    var group = row[0];
    var index = listCounters[group] || 0;
    listCounters[group] = index + 1;
    var section = group === 'eligibility' ? '지원 자격' : (group === 'regularSchedule' ? '정기 활동 일정' : '비정기 활동 일정');
    listHeaders.slice(1).forEach(function (field, fieldIndex) {
      output.push([section, 'recruitment.lists.' + group + '.' + index + '.' + field,
        row[fieldIndex + 1], (index + 1) + '번째 항목 · ' + field]);
    });
  });

  var statCounters = {};
  var statRows = recruitmentStatRows();
  var statHeaders = statRows[0];
  statRows.slice(1).forEach(function (row) {
    var group = row[0];
    var index = statCounters[group] || 0;
    statCounters[group] = index + 1;
    var section = group === 'gender' ? '분포 그래프 · 성별' : (group === 'major' ? '분포 그래프 · 전공' : '분포 그래프 · 학번');
    statHeaders.slice(1).forEach(function (field, fieldIndex) {
      output.push([section, 'recruitment.stats.' + group + '.' + index + '.' + field,
        row[fieldIndex + 1], (index + 1) + '번째 그래프 항목 · ' + field]);
    });
  });

  return output;
}

function recruitmentSectionForKey_(key) {
  if (/^nav/.test(key) || key === 'sidebarTitle') return '왼쪽 메뉴';
  if (/^(overview|intro|genderChart|majorChart|admissionYearChart|admissionCount)/.test(key)) return '모집 개요 · 소개';
  if (/^(activities|departments|recruitTitle|eligibilityTitle|regularScheduleTitle|irregularScheduleTitle)/.test(key)) return '섹션 제목';
  if (/^fee/.test(key)) return '회비 안내';
  if (/^(contact|instagram)/.test(key)) return '문의 안내';
  if (/^(apply|form)/.test(key)) return '지원하기';
  return '페이지 · 상단';
}

function appendRecruitmentRecords_(output, section, basePath, table, itemLabel) {
  var headers = table[0];
  table.slice(1).forEach(function (row, index) {
    headers.forEach(function (field, fieldIndex) {
      output.push([section, basePath + '.' + index + '.' + field, row[fieldIndex],
        (index + 1) + '번째 ' + itemLabel + ' · ' + field]);
    });
  });
}

function recruitmentBaseRows_() {
  return [
    ['key', 'value', 'memo'],
    ['pageTitle', 'PAINS - 신입부원 모집', '브라우저 탭 제목'],
    ['generation', '12기', '기수 (예: 11기, 12기)'],
    ['sidebarTitle', '12기 신입부원 모집', '왼쪽 메뉴 상단 제목'],
    ['heroTitle', 'PAINS 신입부원 모집', '모집 페이지 상단 제목'],
    ['heroDescription', '고려대학교 교내 유일 스포츠 통계분석 동아리 PAINS가 12기 신입부원을 모집합니다.', '상단 설명 문구'],
    ['bannerText', '🔥 PAINS 12기 신입부원 모집 마감 임박!', '하단 배너 텍스트'],
    ['bannerButtonLabel', '지금 지원하기 >', '하단 배너 버튼 문구'],
    ['bannerVisible', 'TRUE', '하단 배너 표시 여부 (TRUE/FALSE)'],
    ['navOverviewLabel', '모집 개요', '왼쪽 메뉴 문구'],
    ['navIntroLabel', '동아리 소개', '왼쪽 메뉴 문구'],
    ['navRecruitLabel', '모집 일정', '왼쪽 메뉴 문구'],
    ['navActivityLabel', '활동 일정', '왼쪽 메뉴 문구'],
    ['navFeeLabel', '회비 안내', '왼쪽 메뉴 문구'],
    ['navContactLabel', '문의하기', '왼쪽 메뉴 문구'],
    ['navApplyLabel', '지원하기', '왼쪽 메뉴 문구'],
    ['overviewTitle', '📢 모집 개요', '모집 개요 제목'],
    ['overviewText', '스포츠 통계분석 동아리 PAINS가 2026년을 함께할 12기 신입 부원을 모집합니다!\nPAINS는 2021년에 스포츠와 통계분석에 관심이 많은 사람들이 모여 만든 동아리입니다.\nPAINS는 2024년까지 통계학과 동아리로 활동했으며, 2026년부터는 애기능동아리연합회 소속 동아리로 소속되어 활동하고 있습니다. 스포츠를 사랑하고 데이터 분석에 열정이 있다면 전공에 관계없이 누구나 환영합니다.', '모집 개요 본문. 줄바꿈 가능'],
    ['introTitle', '🎯 동아리 소개', '동아리 소개 제목'],
    ['introDescription', '현재 PAINS는 50명의 부원들이 하나의 관심사를 깊이 나누며 활동하고 있습니다.\n성별, 학과, 학번 그 무엇도 상관없습니다. 스포츠에 대한 관심과 열정만 있으면 충분합니다.', '동아리 소개 본문. 줄바꿈 가능'],
    ['genderChartTitle', '부원 성별 분포', '성별 그래프 제목'],
    ['majorChartTitle', '부원 전공 분포', '전공 그래프 제목'],
    ['admissionYearChartTitle', '학번 분포', '학번 그래프 제목'],
    ['admissionCountLabel', '인원(명)', '학번 그래프 툴팁 단위'],
    ['activitiesTitle', '📸 PAINS 활동 톺아보기', '활동 사진 섹션 제목'],
    ['activitiesDescription', 'PAINS에서는 학기 중 다양한 학술 활동과 친목 활동을 진행합니다.', '활동 사진 섹션 설명'],
    ['departmentsTitle', '🏢 부서 운영', '부서 섹션 제목'],
    ['departmentsDescription', '모든 부원들은 아래 3개 부서 중 하나에 소속되어 활동할 수 있습니다.', '부서 섹션 설명'],
    ['recruitTitle', '📅 모집 일정', '단일 모집 파이프라인 제목'],
    ['eligibilityTitle', '✅ 지원 자격', '지원 자격 제목'],
    ['regularScheduleTitle', '🗓️ 정기 활동 일정', '정기 활동 제목'],
    ['irregularScheduleTitle', '⚡ 비정기 활동 일정', '비정기 활동 제목'],
    ['feeTitle', '💸 회비 안내', '회비 섹션 제목'],
    ['feeAmount', '학기 당 3만 5천원 (추후 확정)', '회비 금액 안내 문구'],
    ['feeDescription', '회비는 주로 동아리 활동 중 장소대여, 홍보자료 제작, 프로젝트 지원 등에 사용됩니다.', '회비 설명'],
    ['feeLinkPrefix', '회비 사용 내역은', '회비 링크 앞 문구'],
    ['feeLinkLabel', '회비 내역 조회 페이지', '회비 링크 문구'],
    ['feeLinkHref', 'fee.html', '회비 링크 주소'],
    ['feeLinkSuffix', '에서 부원들에게 투명하게 공개되고 있습니다.', '회비 링크 뒤 문구'],
    ['contactTitle', '📞 문의사항', '문의 섹션 제목'],
    ['instagramLabel', '인스타그램 DM', '인스타그램 안내 문구'],
    ['instagramHandle', '@ku_pains', '인스타그램 계정 문구'],
    ['instagramUrl', 'https://www.instagram.com/ku_pains', '인스타그램 주소'],
    ['contactPhoneLabel', '회장 전영재', '연락처 이름 (예: 회장 홍길동)'],
    ['contactPhone', '010-3952-1473', '연락처 전화번호'],
    ['contactEmailLabel', 'PAINS 공식 이메일', '이메일 항목 제목'],
    ['contactEmail', 'painsports1905@gmail.com', '공식 이메일'],
    ['applyCtaTitle', '12기 지원하기', '지원하기 버튼 섹션 제목'],
    ['applyCtaSubtitle', '신입생, 재학생 모두 환영합니다!', '지원하기 섹션 부제목'],
    ['formUrl', 'https://docs.google.com/forms/d/e/1FAIpQLSerzRF12IQLupIIg6-hfn9EPHYFL3riEmm19peCYW6aciNvlw/formResponse', '구글 폼 URL (매 모집마다 교체)'],
    ['formLabel', '지원서 작성하러 가기', '지원 버튼 텍스트'],
    ['applyPeriod', '지원 기간: 2026년 02월 26일 - 2026년 03월 07일', '지원 기간 안내 문구'],
    ['applyVisible', 'TRUE', '지원 버튼 섹션 표시 (FALSE = 모집 마감 시 버튼 숨김)']
  ];
}

function recruitmentTimelineRows() {
  return [
    ['step', 'date', 'note', 'highlight', 'visible', 'order'],
    ['서류 신청', '2026. 02. 26 (목) - 2026. 03. 07 (토)', '', 'FALSE', 'TRUE', '1'],
    ['서류 합격자 발표', '2026. 03. 09 (월) 중', '홈페이지 안내', 'FALSE', 'TRUE', '2'],
    ['면접 진행', '2026. 03. 11 (수) - 2026. 03. 13 (금)', '기간 중 일정 협의', 'FALSE', 'TRUE', '3'],
    ['최종 선발 공지', '2026. 03. 15 (일) 중', '홈페이지 안내', 'FALSE', 'TRUE', '4'],
    ['신입 기수 OT', '2026. 03. 16 (월) 19:00', '참여 필수', 'TRUE', 'TRUE', '5']
  ];
}

function recruitmentActivityRows() {
  return [
    ['id', 'title', 'description', 'image', 'alt', 'visible', 'order'],
    ['seminar', '정기 세미나', '학기 중과 방학 중 2번씩 개최되는 정기 세미나에서는 조별 프로젝트를 공유하고 피드백을 주고받는 시간을 가집니다.', 'images/activity_edited_1.png', '정기 세미나 사진', 'TRUE', '1'],
    ['lecture', '통계 세미나와 연사 초청 강연', '기초 통계학 강의와 연사 초청 강연 등의 활동을 통해 부원들의 통계분석 역량 향상을 도모합니다.', 'images/activity2.png', '정기 활동 사진', 'TRUE', '2'],
    ['sports-day', 'PAINS 체육대회', '보는 것만큼 직접 하는 것도 열정적인 부원들과 함께 매 학기 체육대회를 개최합니다.', 'images/activity03.png', '체육대회 사진', 'TRUE', '3'],
    ['community', 'MT 및 기타 행사', '학기 초와 방학 중 MT, 단체 직관 행사 등 여러 부원들과 친해질 수 있는 행사들이 개최됩니다.', 'images/activity4.png', 'MT 및 기타 행사 사진', 'TRUE', '4']
  ];
}

function recruitmentDepartmentRows() {
  return [
    ['title', 'description', 'visible', 'order'],
    ['📅 기획부', '세미나 준비, MT 등 전반적인 친목 활동 기획 및 기타 이벤트 기획', 'TRUE', '1'],
    ['📢 홍보부', '홍보 플랫폼(SNS 등) 관리, 리쿠르팅 홍보, 동아리 내 플랫폼 관리 업무(노션 등)', 'TRUE', '2'],
    ['📘 교육부', '초심자용 강의 제작 (스포츠데이터분석, 세이버메트릭스), 동아리 자료 및 파일 관리', 'TRUE', '3']
  ];
}

function recruitmentListRows() {
  return [
    ['group', 'text', 'visible', 'order'],
    ['eligibility', '연속 또는 비연속으로 1년(2학기) 이상 활동 가능한 재/휴학 대학생 (신입생 환영) - 한 학기 활동은 개강부터 방학 중 세미나까지를 기준으로 합니다.', 'TRUE', '1'],
    ['eligibility', '3월 16일 월요일 OT에 대면 참여가 가능한 사람', 'TRUE', '2'],
    ['eligibility', '즐겨보는 스포츠가 있는 사람', 'TRUE', '3'],
    ['eligibility', '스포츠를 데이터 분석의 측면에서 접근해보고 싶은 사람', 'TRUE', '4'],
    ['regularSchedule', '일반 정기 활동: 3월 19일, 3월 27일, 5월 1일', 'TRUE', '1'],
    ['regularSchedule', 'PAINS 체육대회: 5월 중(미정)', 'TRUE', '2'],
    ['regularSchedule', '학기 중 세미나: 5월 14일, 5월 15일', 'TRUE', '3'],
    ['regularSchedule', '방학 중 세미나: 8월 중(미정)', 'TRUE', '4'],
    ['irregularSchedule', '봄 MT: 4월 3일 - 4월 4일 (예정)', 'TRUE', '1'],
    ['irregularSchedule', '스포츠 단체 직관: 5월 중(미정)', 'TRUE', '2'],
    ['irregularSchedule', '월드컵 단체 관람: 월드컵 기간(계획 중)', 'TRUE', '3'],
    ['irregularSchedule', '여름 MT: 7월 중(미정)', 'TRUE', '4']
  ];
}

function recruitmentStatRows() {
  return [
    ['group', 'label', 'value', 'color', 'visible', 'order'],
    ['gender', '여자', '11', '#FF6B81', 'TRUE', '1'],
    ['gender', '남자', '39', '#4D96FF', 'TRUE', '2'],
    ['major', '통계학과', '9', '#FF9F43', 'TRUE', '1'],
    ['major', '데이터과학과', '5', '#FF6B6B', 'TRUE', '2'],
    ['major', '국제학부', '4', '#FDCB6E', 'TRUE', '3'],
    ['major', '컴퓨터학과', '3', '', 'TRUE', '4'],
    ['major', '사회학과', '3', '#20BF6B', 'TRUE', '5'],
    ['major', '화학과', '3', '#0FB9B1', 'TRUE', '6'],
    ['major', '언어학과', '2', '#2D98DA', 'TRUE', '7'],
    ['major', '전기전자공학부', '2', '#3867D6', 'TRUE', '8'],
    ['major', '행정학과', '2', '#8854D0', 'TRUE', '9'],
    ['major', '경제학과', '2', '#4B6584', 'TRUE', '10'],
    ['major', '기타', '15', '#9980FA', 'TRUE', '11'],
    ['admissionYear', '20', '1', '#ab3333', 'TRUE', '1'],
    ['admissionYear', '21', '3', '#ab3333', 'TRUE', '2'],
    ['admissionYear', '22', '5', '#ab3333', 'TRUE', '3'],
    ['admissionYear', '23', '5', '#ab3333', 'TRUE', '4'],
    ['admissionYear', '24', '13', '#ab3333', 'TRUE', '5'],
    ['admissionYear', '25', '17', '#ab3333', 'TRUE', '6'],
    ['admissionYear', '26', '6', '#ab3333', 'TRUE', '7']
  ];
}

function resultPageRows() {
  return [
    ['key', 'value', 'memo'],
    ['pageTitle', 'PAINS - 11기 최종 합격자 안내', '브라우저 탭 제목'],
    ['title', '11기 최종 합격자 안내', '결과 조회 페이지 제목'],
    ['subtitle', '지원 시 제출한 학번과 이름을 입력해주세요.', '입력 안내 문구'],
    ['round1Label', '1차 결과', '1차 결과 선택 버튼 문구'],
    ['round1PageTitle', 'PAINS - 11기 1차 합격자 안내', '1차 선택 시 브라우저 탭 제목'],
    ['round1Title', '11기 1차 합격자 안내', '1차 선택 시 결과 조회 페이지 제목'],
    ['round1Subtitle', '지원 시 제출한 학번과 이름을 입력해주세요.', '1차 조회 입력 안내 문구'],
    ['round2Label', '2차 결과', '2차 결과 선택 버튼 문구'],
    ['round2PageTitle', 'PAINS - 11기 최종 합격자 안내', '2차 선택 시 브라우저 탭 제목'],
    ['round2Title', '11기 최종 합격자 안내', '2차 선택 시 결과 조회 페이지 제목'],
    ['round2Subtitle', '지원 시 제출한 학번과 이름을 입력해주세요.', '2차 조회 입력 안내 문구'],
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
    ['passDescription', '축하드립니다! 귀하는 PAINS 11기 최종 면접에 합격하셨습니다.\n아래 OT 일정을 확인해주시기 바랍니다.', '합격 안내 문구. 셀 안에서 Alt+Enter 사용'],
    ['failDescription', '2026년 상반기 PAINS 11기 리크루팅에 지원해주셔서 진심으로 감사드립니다.\n지원자님의 뛰어난 역량과 열정에도 불구하고, 한정된 선발 인원으로 인해 아쉽게도 이번 기수에는 함께하지 못하게 되었습니다. 비록 이번에는 좋은 인연으로 이어지지 못했지만 보여주신 관심에 깊이 감사드리며 앞으로의 행보를 진심으로 응원하겠습니다.\nPAINS는 매 기수 리크루팅을 진행하고 있으니, 이후에도 PAINS에 많은 관심 부탁드립니다.', '불합격 안내 문구. 셀 안에서 Alt+Enter 사용'],
    ['round1PassDescription', '축하드립니다! 귀하는 PAINS 11기 리크루팅 1차 전형에 합격하셨습니다.\n아래 면접 일정을 확인해주시기 바랍니다.', '1차 합격 안내 문구. 셀 안에서 Alt+Enter 사용'],
    ['round1FailDescription', 'PAINS 11기 리크루팅에 지원해주셔서 진심으로 감사드립니다.\n아쉽게도 이번 1차 전형에서는 함께하지 못하게 되었습니다.', '1차 불합격 안내 문구. 셀 안에서 Alt+Enter 사용'],
    ['round2PassDescription', '축하드립니다! 귀하는 PAINS 11기 리크루팅 최종 면접에 합격하셨습니다.\n아래 OT 일정을 확인해주시기 바랍니다.', '2차 합격 안내 문구. 셀 안에서 Alt+Enter 사용'],
    ['round2FailDescription', 'PAINS 11기 리크루팅에 지원해주셔서 진심으로 감사드립니다.\n아쉽게도 이번 최종 전형에서는 함께하지 못하게 되었습니다.', '2차 불합격 안내 문구. 셀 안에서 Alt+Enter 사용'],
    ['missingInputMessage', '학번과 이름을 모두 입력해주세요.', '학번/이름 미입력 alert'],
    ['notFoundMessage', '일치하는 지원 정보를 찾을 수 없습니다.\n학번과 이름을 다시 확인해주세요.', '지원 정보 없음 alert'],
    ['lockedMessageTemplate', '아직 결과 발표 기간이 아닙니다.\n발표 일시: {releaseDate} {releaseTime}', '결과 발표 전 alert. {releaseDate}, {releaseTime} 사용 가능'],
    ['errorMessage', '조회 중 오류가 발생했습니다.', '조회 실패 alert'],
    ['missingApiMessage', '결과 조회 API가 설정되지 않았습니다.', 'resultApiUrl 미설정 alert'],
    ['defaultValue', '미정', '일자/시간/장소 값이 없을 때 표시'],
    ['otTitle', 'OT 일정 안내', '합격자 안내 박스 제목'],
    ['round1ScheduleTitle', '면접 일정 안내', '1차 합격자 일정 박스 제목'],
    ['round2ScheduleTitle', 'OT 일정 안내', '2차 합격자 일정 박스 제목'],
    ['dateLabel', '일자:', 'OT 일자 라벨'],
    ['timeLabel', '시간:', 'OT 시간 라벨'],
    ['locationLabel', '장소:', 'OT 장소 라벨'],
    ['mapAlt', '면접장소 약도', '약도 이미지 대체 텍스트'],
    ['warningMessage', '* OT는 3월 16일 월요일 오후 7시 상남정경관 101호에서 진행될 예정입니다.', '빨간 안내 문구'],
    ['noticeMessage1', '* 합격자는 OT 시작 전 채팅방에 초대되어 OT에 대한 안내가 진행될 예정입니다.', '하단 안내 문구 1'],
    ['noticeMessage2', '* 정당한 사유 없이 OT에 불참할 경우 합격이 취소될 수 있으니 유의바랍니다.', '하단 안내 문구 2'],
    ['round1WarningMessage', '* 면접 일시와 장소를 반드시 확인해주세요.', '1차 합격자 빨간 안내 문구'],
    ['round1NoticeMessage1', '* 면접 관련 추가 안내는 개별 연락으로 전달될 수 있습니다.', '1차 합격자 하단 안내 문구 1'],
    ['round1NoticeMessage2', '* 부득이한 사정이 있는 경우 운영진에게 미리 연락해주세요.', '1차 합격자 하단 안내 문구 2'],
    ['round2WarningMessage', '* OT 일시와 장소를 반드시 확인해주세요.', '2차 합격자 빨간 안내 문구'],
    ['round2NoticeMessage1', '* 합격자는 OT 시작 전 채팅방에 초대될 예정입니다.', '2차 합격자 하단 안내 문구 1'],
    ['round2NoticeMessage2', '* 정당한 사유 없이 OT에 불참할 경우 합격이 취소될 수 있습니다.', '2차 합격자 하단 안내 문구 2']
  ];
}
