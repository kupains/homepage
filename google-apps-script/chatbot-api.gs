// Add this file to the same Apps Script project as content-api.gs.
// The project already uses SHEET_ID and rows() from content-api.gs.

var CHATBOT_INTENTS = {
  attendanceRate: true,
  absenceUsage: true,
  memberSummary: true,
  attendancePlan: true,
  upcomingSchedule: true,
  sourceInfo: true
};

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return chatbotJsonResponse_(handleChatbotRequest_(body));
  } catch (error) {
    console.error(error);
    return chatbotJsonResponse_({
      error: '요청을 처리하지 못했습니다.',
      authenticated: null
    });
  }
}

function chatbotJsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleChatbotRequest_(body) {
  var intent = String(body.intent || '').trim();
  if (!CHATBOT_INTENTS[intent]) {
    return { error: '지원하지 않는 조회입니다.', authenticated: null };
  }

  if (intent === 'sourceInfo') {
    return chatbotReply_('본인 출석 정보와 일정 정보를 기준으로 처리합니다.', null, 'static');
  }
  if (intent === 'upcomingSchedule') {
    return chatbotReply_(answerUpcomingSchedule_(), null, 'registered-data');
  }

  var member = findChatbotMember_(body.studentId, body.name);
  if (!member) {
    var hasCredentials = chatbotCompact_(body.studentId) && chatbotCompact_(body.name);
    return chatbotReply_(
      hasCredentials
        ? '입력한 학번과 이름이 등록된 정보와 일치하지 않습니다. 본인 정보를 다시 확인해주세요.'
        : '본인 출석 정보 조회는 학번과 이름을 먼저 입력해야 합니다.',
      false,
      'registered-data'
    );
  }

  if (intent === 'attendanceRate') {
    return chatbotReply_('출석률: ' + (chatbotValue_(member, '출석률') || '정보 없음'), true, 'registered-data');
  }
  if (intent === 'absenceUsage') {
    return chatbotReply_(answerAbsenceUsage_(member), true, 'registered-data');
  }
  if (intent === 'memberSummary') {
    return chatbotReply_(answerMemberSummary_(member), true, 'registered-data');
  }
  if (intent === 'attendancePlan') {
    return chatbotReply_(answerAttendancePlan_(member), true, 'registered-data');
  }

  return { error: '지원하지 않는 조회입니다.', authenticated: null };
}

function chatbotReply_(reply, authenticated, source) {
  return { reply: reply, authenticated: authenticated, source: source };
}

function chatbotValue_(row, key) {
  return String((row && row[key]) || '').trim();
}

function chatbotCompact_(value) {
  return String(value || '').trim().replace(/\s/g, '');
}

function findChatbotMember_(studentId, name) {
  var targetId = chatbotCompact_(studentId);
  var targetName = chatbotCompact_(name);
  if (!targetId || !targetName) return null;

  var members = rows('Members');
  for (var i = 0; i < members.length; i += 1) {
    if (
      chatbotCompact_(members[i]['학번']) === targetId &&
      chatbotCompact_(members[i]['이름']) === targetName
    ) return members[i];
  }
  return null;
}

function chatbotMemberActivityFields_(member) {
  return Object.keys(member).filter(function (key) {
    return ['학번', '이름', '사용 결석계', '출석률', '분류'].indexOf(key) === -1;
  });
}

function answerMemberSummary_(member) {
  var lines = ['등록된 본인 정보입니다.'];
  ['사용 결석계', '출석률', '분류'].forEach(function (key) {
    lines.push('- ' + key + ': ' + (chatbotValue_(member, key) || '정보 없음'));
  });
  var activities = chatbotMemberActivityFields_(member)
    .filter(function (key) { return chatbotValue_(member, key); })
    .slice(0, 12)
    .map(function (key) { return '- ' + key + ': ' + chatbotValue_(member, key); });
  if (activities.length) lines.push('', '활동 기록:', activities.join('\n'));
  return lines.join('\n');
}

function answerAbsenceUsage_(member) {
  var seen = {};
  var activities = rows('Requests')
    .filter(function (request) {
      return chatbotCompact_(request['학번']) === chatbotCompact_(member['학번']) &&
        chatbotCompact_(request['이름']) === chatbotCompact_(member['이름']);
    })
    .filter(function (request) {
      return chatbotCompact_(request['종류(결석/지각/조퇴)'] || request['종류'] || request.type) === '결석';
    })
    .map(function (request) {
      return chatbotValue_(request, '활동명') || chatbotValue_(request, '활동') ||
        chatbotValue_(request, 'name') || chatbotValue_(request, 'activityName');
    })
    .map(function (name) { return name.replace(/\s*\(\d{4}[-./]\d{1,2}[-./]\d{1,2}\)\s*$/, ''); })
    .filter(function (name) {
      if (!name || seen[name]) return false;
      seen[name] = true;
      return true;
    });
  return '사용 결석계: ' + (chatbotValue_(member, '사용 결석계') || '정보 없음') +
    '\n\n결석계 제출 활동:\n' +
    (activities.length ? activities.map(function (name) { return '- ' + name; }).join('\n') : '제출된 결석계 활동이 없습니다.');
}

function scheduleTimestamp_(row, finish) {
  var date = chatbotValue_(row, finish ? 'finish date' : 'start date') || chatbotValue_(row, 'start date');
  var time = chatbotValue_(row, finish ? 'finish time' : 'start time');
  var match = date.replace(/[./]/g, '-').replace(/\s/g, '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  var timeMatch = time.match(/^(\d{1,2})(?::(\d{1,2}))?/);
  var hour = timeMatch ? Number(timeMatch[1]) : (finish ? 23 : 0);
  var minute = timeMatch ? Number(timeMatch[2] || 0) : (finish ? 59 : 0);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour - 9, minute);
}

function isAttendanceSchedule_(row) {
  return ['정기활동', '비정기활동'].indexOf(chatbotCompact_(row.type)) !== -1;
}

function upcomingSchedules_(limit) {
  var now = Date.now();
  return rows('Schedule')
    .filter(isAttendanceSchedule_)
    .map(function (row, index) {
      return { row: row, index: index, start: scheduleTimestamp_(row, false), finish: scheduleTimestamp_(row, true) };
    })
    .filter(function (item) { return (item.finish || item.start) !== null && (item.finish || item.start) >= now; })
    .sort(function (a, b) { return (a.start || 8640000000000000) - (b.start || 8640000000000000) || a.index - b.index; })
    .slice(0, limit || 100)
    .map(function (item) { return item.row; });
}

function formatSchedule_(row) {
  var start = chatbotValue_(row, 'start date');
  var finish = chatbotValue_(row, 'finish date');
  var date = start && finish && start !== finish ? start + ' - ' + finish : (start || finish || '날짜 미정');
  return '- ' + (chatbotValue_(row, 'name') || '이름 없는 일정') + ': ' + date + ', ' +
    (chatbotValue_(row, 'location') || '장소 미정') +
    (chatbotValue_(row, 'type') ? ' / ' + chatbotValue_(row, 'type') : '');
}

function answerUpcomingSchedule_() {
  var schedule = upcomingSchedules_(5);
  return schedule.length
    ? '남은 정기/비정기활동입니다.\n' + schedule.map(formatSchedule_).join('\n')
    : '남은 정기/비정기활동이 없습니다.';
}

function answerAttendancePlan_(member) {
  var type = chatbotCompact_(chatbotValue_(member, '분류'));
  if (type === '활동오비' || type === '활동올드비') type = '활동OB';
  var targetRates = { '활동OB': 0.4, '준회원': 0.7, '정회원': 0.7 };
  if (targetRates[type] === undefined) {
    return '분류가 ' + (chatbotValue_(member, '분류') || '정보 없음') + '입니다. 현재 기준은 활동OB 40%, 준회원/정회원 70%만 계산합니다.';
  }

  var included = ['출석', '무단 지각', '무단 조퇴', '사전 통지 지각', '사전 통지 조퇴'];
  var fields = chatbotMemberActivityFields_(member);
  var regular = fields.slice(0, 7).filter(function (key) {
    var status = chatbotValue_(member, key);
    return included.indexOf(status) !== -1 || status.indexOf('인정') === 0;
  }).length;
  var irregular = fields.slice(7).filter(function (key) { return chatbotValue_(member, key) === '출석'; }).length;
  var points = regular + Math.floor(irregular / 2);
  var targetPoints = Math.ceil(targetRates[type] * 7);
  var remaining = upcomingSchedules_(100);
  var remainingRegular = remaining.filter(function (row) { return chatbotCompact_(row.type) === '정기활동'; });
  var remainingIrregular = remaining.filter(function (row) { return chatbotCompact_(row.type) === '비정기활동'; });
  var base = [
    '현재 분류: ' + chatbotValue_(member, '분류'),
    '현재 출석률: ' + (chatbotValue_(member, '출석률') || '정보 없음'),
    '충족 기준: ' + Math.round(targetRates[type] * 100) + '% 이상',
    '현재 출석 기준: ' + points + '/7',
    '남은 정기활동: ' + remainingRegular.length + '회, 남은 비정기활동: ' + remainingIrregular.length + '회'
  ];
  if (points >= targetPoints) return type + ' 출석 기준을 충족했습니다.\n\n' + base.join('\n');

  var best = null;
  for (var r = 0; r <= remainingRegular.length; r += 1) {
    for (var ir = 0; ir <= remainingIrregular.length; ir += 1) {
      var gain = r + Math.floor((irregular + ir) / 2) - Math.floor(irregular / 2);
      if (points + gain >= targetPoints && (!best || r + ir < best.total)) best = { regular: r, irregular: ir, total: r + ir };
    }
  }
  if (!best) return type + ' 출석 기준을 남은 일정으로 충족할 수 없습니다.\n\n' + base.join('\n');
  return type + ' 출석 기준을 아직 충족하지 못했습니다.\n\n' + base.join('\n') +
    '\n\n최소 ' + best.total + '회 더 출석해야 합니다.\n필요 조합: 정기활동 ' + best.regular + '회, 비정기활동 ' + best.irregular + '회';
}
