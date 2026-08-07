// HTML fallback이 최신 JSON보다 먼저 그려지는 플래시를 막습니다.
// 이 파일은 <head>에서 동기식으로 실행되어야 합니다.
(() => {
  const root = document.documentElement;
  root.classList.remove('pains-cms-ready');
  root.classList.add('pains-cms-loading');

  const style = document.createElement('style');
  style.id = 'pains-cms-boot-style';
  style.textContent = `
    html.pains-cms-loading { background: #fff; }
    html.pains-cms-loading body { visibility: hidden !important; }
  `;
  document.head.appendChild(style);

  // JSON이나 로더가 실패해도 페이지가 영구적으로 가려지지 않게 합니다.
  window.__painsCmsLoadingTimer = window.setTimeout(() => {
    root.classList.remove('pains-cms-loading');
    root.classList.add('pains-cms-ready');
  }, 4000);
})();
