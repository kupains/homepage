// 배포된 HTML을 즉시 보여주고, 같은 배포본의 콘텐츠 JSON은 뒤에서 보정합니다.
(() => {
  const root = document.documentElement;
  root.classList.remove('pains-cms-loading');
  root.classList.add('pains-cms-ready');
})();
