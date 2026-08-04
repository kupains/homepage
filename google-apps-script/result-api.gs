/**
 * PAINS 지원 결과 조회 API v2
 *
 * Applies 열 구조
 * A 학번 / B 이름
 * C:H 1차 상태·일정일자·일정시간·공개일·공개시각·장소
 * I:N 2차 상태·일정일자·일정시간·공개일·공개시각·장소
 */
var RESULT_SHEET_ID = '1-kCJGJfKqNTW1D09GdNoL6eyZXUDJO_Ef_EBY0grJNo';
var RESULT_API_TOKEN = 'PAINS_2026_CUSTOM_KEY';

// 최초 1회 Apps Script 편집기에서 실행해 스프레드시트 읽기 권한을 승인합니다.
function authorizeResultApi() {
  return SpreadsheetApp.openById(RESULT_SHEET_ID).getName();
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (String(params.token || '') !== RESULT_API_TOKEN) {
      return resultJson_({ result: 'error', message: '인증에 실패했습니다.' });
    }

    var studentId = String(params.id || '').replace(/\s+/g, '');
    var name = String(params.name || '').trim();
    var round = String(params.round || '1') === '2' ? 2 : 1;
    if (!studentId || !name) {
      return resultJson_({ result: 'error', message: '학번과 이름을 모두 입력해주세요.' });
    }

    var book = SpreadsheetApp.openById(RESULT_SHEET_ID);
    var settings = resultSettings_(book);
    var gate = resultGate_(settings, round, new Date());
    if (!gate.open) {
      return resultJson_({
        result: 'locked',
        round: round,
        releaseDate: gate.releaseDate || '',
        releaseTime: gate.releaseTime || '',
        message: settings['result' + round + 'ClosedMessage'] || round + '차 결과 조회 기간이 아닙니다.'
      });
    }

    var sheet = book.getSheetByName('Applies');
    if (!sheet) throw new Error('Applies 탭을 찾을 수 없습니다.');
    var values = sheet.getDataRange().getDisplayValues();
    var row = null;
    for (var i = 1; i < values.length; i += 1) {
      if (String(values[i][0] || '').replace(/\s+/g, '') === studentId
          && String(values[i][1] || '').trim() === name) {
        row = values[i];
        break;
      }
    }
    if (!row) return resultJson_({ result: 'fail', round: round });

    var offset = round === 1 ? 2 : 8;
    var status = String(row[offset] || '').trim();
    if (status !== '합격' && status !== '불합격') {
      return resultJson_({ result: 'fail', round: round });
    }

    var releaseDate = String(row[offset + 3] || '').trim();
    var releaseTime = String(row[offset + 4] || '').trim();
    var releaseAt = resultKstDate_(releaseDate, releaseTime, 'start');
    if (releaseAt && new Date().getTime() < releaseAt.getTime()) {
      return resultJson_({
        result: 'locked',
        round: round,
        releaseDate: releaseDate,
        releaseTime: releaseTime
      });
    }

    return resultJson_({
      result: 'success',
      round: round,
      status: status,
      interviewDate: String(row[offset + 1] || '').trim(),
      interviewTime: String(row[offset + 2] || '').trim(),
      interviewLocation: String(row[offset + 5] || '').trim()
    });
  } catch (error) {
    console.error(error);
    return resultJson_({ result: 'error', message: '결과 조회 중 오류가 발생했습니다.' });
  }
}

function resultSettings_(book) {
  var sheet = book.getSheetByName('settings');
  if (!sheet) return {};
  var rows = sheet.getDataRange().getDisplayValues();
  var result = {};
  for (var i = 1; i < rows.length; i += 1) {
    var key = String(rows[i][0] || '').trim();
    if (key) result[key] = String(rows[i][1] || '').trim();
  }
  return result;
}

function resultGate_(settings, round, now) {
  var prefix = 'result' + round;
  var manual = String(settings[prefix + 'Enabled'] || '').trim().toUpperCase();
  var startRaw = String(settings[prefix + 'StartAt'] || '').trim();
  var endRaw = String(settings[prefix + 'EndAt'] || '').trim();
  var start = resultKstDateTime_(startRaw, 'start');
  var end = resultKstDateTime_(endRaw, 'end');

  if (manual === 'TRUE') return { open: true };
  if (manual === 'FALSE') return resultLockedGate_(startRaw);
  if (!start && !end) return { open: false };
  if (start && now.getTime() < start.getTime()) return resultLockedGate_(startRaw);
  if (end && now.getTime() > end.getTime()) return { open: false };
  return { open: true };
}

function resultLockedGate_(startRaw) {
  var parts = String(startRaw || '').trim().split(/\s+/);
  return { open: false, releaseDate: parts[0] || '', releaseTime: parts[1] || '' };
}

function resultKstDateTime_(value, boundary) {
  var raw = String(value || '').trim();
  if (!raw) return null;
  var parts = raw.split(/\s+/);
  return resultKstDate_(parts[0], parts[1] || '', boundary);
}

function resultKstDate_(dateValue, timeValue, boundary) {
  var dateMatch = String(dateValue || '').trim().match(/^(\d{4})[-.\/]\s*(\d{1,2})[-.\/]\s*(\d{1,2})/);
  if (!dateMatch) return null;
  var timeMatch = String(timeValue || '').trim().match(/^(\d{1,2}):(\d{2})/);
  var hour = timeMatch ? Number(timeMatch[1]) : (boundary === 'end' ? 23 : 0);
  var minute = timeMatch ? Number(timeMatch[2]) : (boundary === 'end' ? 59 : 0);
  var stamp = dateMatch[1] + '-' + ('0' + dateMatch[2]).slice(-2) + '-' + ('0' + dateMatch[3]).slice(-2)
    + 'T' + ('0' + hour).slice(-2) + ':' + ('0' + minute).slice(-2) + ':00+09:00';
  var parsed = new Date(stamp);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function resultJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
