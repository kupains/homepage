(() => {
  'use strict';

  const root = document.querySelector('[data-project-visual]');
  if (!root) return;

  const image = root.querySelector('[data-project-image]');
  const caption = root.querySelector('[data-project-caption]');
  const buttons = Array.from(root.querySelectorAll('[data-project-src]'));
  if (!image || !buttons.length) return;

  function selectVariant(button) {
    const src = button.dataset.projectSrc;
    if (!src) return;

    image.src = src;
    image.alt = button.dataset.projectAlt || '';
    if (caption) caption.textContent = button.dataset.projectLabel || '';

    buttons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
  }

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => selectVariant(button));
    button.addEventListener('pointerenter', () => {
      const src = button.dataset.projectSrc;
      if (src) new Image().src = src;
    }, { once: true });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = buttons.length - 1;
      buttons[nextIndex].focus();
      selectVariant(buttons[nextIndex]);
    });
  });

  const activeButton = () => buttons.find((button) => button.getAttribute('aria-pressed') === 'true') || buttons[0];
  selectVariant(activeButton());
  document.addEventListener('pains:content-ready', () => selectVariant(activeButton()));

  function restoreDeepLink() {
    if (!window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = document.getElementById(id);
    if (!target) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'instant' }));
    });
  }

  window.addEventListener('load', restoreDeepLink, { once: true });
  document.addEventListener('pains:content-ready', restoreDeepLink);
})();
