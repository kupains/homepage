(() => {
  'use strict';

  const currentScript = document.currentScript;
  const endpoint = currentScript?.dataset.endpoint || window.PAINS_CONTENT_API_URL ||
    'https://script.google.com/macros/s/AKfycbypl1Z5iLKPPBGwpE8xv2TyCbgl5fmGBhYi1Zn16aU8tG2zvDGtIyALBAhQZ8Jpz5fJyQ/exec';
  const actions = [
    ['attendanceRate', '출석률'],
    ['absenceUsage', '결석계 사용'],
    ['memberSummary', '내 정보'],
    ['attendancePlan', '출석 계획'],
    ['upcomingSchedule', '남은 일정']
  ];

  const host = document.createElement('div');
  host.id = 'pains-chatbot';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{font-family:Arial,"Noto Sans KR",sans-serif;color:#172033}
      button,input{font:inherit}.toggle{position:fixed;right:20px;bottom:20px;z-index:9998;width:58px;height:58px;border:0;border-radius:50%;background:#7b001c;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 10px 30px #0004}
      .panel{position:fixed;right:20px;bottom:88px;z-index:9999;width:min(380px,calc(100vw - 28px));height:min(600px,calc(100vh - 120px));display:none;grid-template-rows:auto auto 1fr auto;background:#fff;border:1px solid #ddd;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px #0004}
      .panel.open{display:grid}.head{padding:16px 18px;background:#7b001c;color:#fff;font-weight:800;display:flex;justify-content:space-between}.close{border:0;background:transparent;color:#fff;cursor:pointer;font-size:20px}
      .identity{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;border-bottom:1px solid #eee}.identity input{min-width:0;padding:10px;border:1px solid #ccd1da;border-radius:9px}
      .messages{padding:14px;overflow:auto;background:#f5f6f8}.message{white-space:pre-wrap;line-height:1.55;margin:0 0 10px;padding:11px 13px;border-radius:12px;background:#fff;border:1px solid #e4e6ea}.message.error{color:#a00022}
      .actions{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;padding:12px;border-top:1px solid #eee}.actions button{padding:10px 7px;border:1px solid #7b001c;border-radius:9px;background:#fff;color:#7b001c;cursor:pointer}.actions button:hover{background:#7b001c;color:#fff}.actions button:disabled{opacity:.5;cursor:wait}
      @media(max-width:520px){.toggle{right:14px;bottom:14px}.panel{right:14px;bottom:82px}}
    </style>
    <button class="toggle" type="button" aria-label="PAINS 챗봇 열기">PAINS</button>
    <section class="panel" aria-label="PAINS 챗봇">
      <header class="head"><span>PAINS 조회 도우미</span><button class="close" type="button" aria-label="닫기">×</button></header>
      <div class="identity"><input class="student" inputmode="numeric" placeholder="학번"><input class="name" autocomplete="name" placeholder="이름"></div>
      <div class="messages" aria-live="polite"><div class="message">조회할 항목을 선택하세요.</div></div>
      <div class="actions"></div>
    </section>`;

  const panel = root.querySelector('.panel');
  const messages = root.querySelector('.messages');
  const buttons = [];

  function appendMessage(text, isError) {
    const element = document.createElement('div');
    element.className = `message${isError ? ' error' : ''}`;
    element.textContent = text;
    messages.appendChild(element);
    messages.scrollTop = messages.scrollHeight;
  }

  function setBusy(busy) {
    buttons.forEach((button) => { button.disabled = busy; });
  }

  async function request(intent) {
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          intent,
          studentId: root.querySelector('.student').value.trim(),
          name: root.querySelector('.name').value.trim()
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      appendMessage(data.reply || '응답이 없습니다.', false);
    } catch (error) {
      appendMessage(`조회에 실패했습니다: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  actions.forEach(([intent, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => request(intent));
    root.querySelector('.actions').appendChild(button);
    buttons.push(button);
  });

  root.querySelector('.toggle').addEventListener('click', () => panel.classList.toggle('open'));
  root.querySelector('.close').addEventListener('click', () => panel.classList.remove('open'));
  document.body.appendChild(host);
})();


