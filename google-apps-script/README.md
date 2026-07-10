# PAINS Google Apps Script backend

홈페이지는 GitHub Pages에서 정적으로 배포하고, 콘텐츠와 챗봇 API는 Google Apps Script 웹 앱에서 제공합니다.

## 구성

- 기존 콘텐츠 배포: `GET` 요청으로 홈페이지 콘텐츠, 프로젝트, 공지 목록 제공
- `chatbot-api.gs`: `POST` 요청으로 출석률, 결석계, 회원 정보, 출석 계획, 일정 조회 제공
- Google Sheet: `Members`, `Requests`, `Schedule` 및 기존 CMS 탭

`chatbot-api.gs`는 `SHEET_ID`, `rows()`를 제공하는 Apps Script 프로젝트에 추가합니다. 운영 프로젝트·공지 데이터는 기존 169/7 항목을 반환하는 콘텐츠 배포 URL을 계속 사용합니다.

## 배포

1. 기존 Apps Script 프로젝트를 엽니다.
2. `chatbot-api.gs` 파일을 추가하고 저장소의 코드를 붙여넣습니다.
3. Apps Script 프로젝트 설정에서 V8 런타임을 사용합니다.
4. **배포 → 배포 관리 → 수정 → 새 버전**을 선택합니다.
5. 실행 사용자는 소유자, 액세스 권한은 웹사이트 이용자가 접근 가능한 범위로 설정합니다.
6. 새 웹앱 버전을 배포하고 생성된 `/exec` URL을 `widget/chatbot.js`에 설정합니다.

프로젝트·공지 데이터가 샘플이 아닌 운영 169/7 항목을 반환하는지 확인하기 전에는 `js/activity.js`, `js/notice.js`의 기존 콘텐츠 URL을 변경하지 않습니다.

## 요청 형식

브라우저의 불필요한 CORS 사전 요청을 피하기 위해 챗봇은 JSON을 `text/plain;charset=utf-8` POST 본문으로 전송합니다.

```json
{
  "intent": "attendanceRate",
  "studentId": "학번",
  "name": "이름"
}
```

지원 intent:

- `attendanceRate`
- `absenceUsage`
- `memberSummary`
- `attendancePlan`
- `upcomingSchedule`
- `sourceInfo`

## 프런트엔드 배포

GitHub 저장소의 `Settings → Pages`에서 `Deploy from a branch`, `main`, `/(root)`를 선택합니다. 이후 `main` 브랜치에 푸시하면 홈페이지가 갱신됩니다.
