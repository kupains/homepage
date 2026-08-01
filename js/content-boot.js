// CMS 데이터가 적용되기 전에 HTML에 남아 있는 초기 문구/사진이 노출되지 않게 합니다.
(() => {
  const root = document.documentElement;
  root.classList.add('pains-cms-loading');

  const style = document.createElement('style');
  style.id = 'pains-cms-boot-style';
  style.textContent = `
    html.pains-cms-loading body { visibility: hidden !important; }
    html.pains-cms-ready body { visibility: visible; }
  `;
  document.head.appendChild(style);

  // 네트워크 오류가 나도 페이지가 영구적으로 숨겨지지 않게 하는 안전장치입니다.
  window.__painsCmsLoadingTimer = window.setTimeout(() => {
    root.classList.remove('pains-cms-loading');
    root.classList.add('pains-cms-ready');
  }, 5000);
})();
