/* menu.js - v4.3 (너비 제어권 HTML로 위임, Sticky Footer, 글로벌 폰트 관리, 사이드바 스크롤 개선) */

const PAINS_LAYOUT = {
    brandText: 'Providing Academic INsights for Sports.',
    homeHref: 'index',
    footerText: '&copy; 2026 PAINS. All rights reserved.',
    socials: [
        { href: 'https://www.instagram.com/ku_pains', title: 'Instagram', icon: 'images/instagram.png', alt: 'Instagram' },
        { href: 'https://www.notion.so/painsports/PAINS-a9294ba2a44b4ea6a53f0d5ae069749e', title: 'Notion', icon: 'images/notion.png', alt: 'Notion' },
        { href: 'https://blog.naver.com/painsports', title: 'Blog', icon: 'images/naver_blog.png', alt: 'Naver Blog' }
    ],
    menuGroups: [
        {
            type: 'group',
            id: 'aboutpains',
            label: 'PAINS 소개',
            items: [
                { href: 'ci', id: 'ci', label: 'CI' },
                { href: 'members', id: 'members', label: '조직도' }
            ]
        },
        {
            type: 'group',
            id: 'activities',
            label: '활동',
            items: [
                { href: 'activity', id: 'activity', label: '프로젝트 아카이브' },
                { href: 'study', id: 'study', label: '신입부원 스터디' },
                { href : 'society', id: 'society', label: '소모임' },
                { href : 'notice', id: 'notice', label: '공지사항' }
                /* { href: 'javascript:void(0)', id: 'society', label: '소모임', onclick: "alert('작업 중인 페이지입니다. 추후 개시될 예정이오니 잠시만 기다려주시면 감사하겠습니다.'); return false;" } */
            ]
        },
        {
            type: 'group',
            id: 'operating',
            label: '운영',
            items: [
                { href: 'attendance', id: 'attendance', label: '회원 정보 / 결석계' },
                { href: 'fee', id: 'fee', label: '회비 내역 조회' }
            ]
        },
        {
            type: 'group',
            id: 'applying',
            label: '지원',
            items: [
                { href: 'javascript:void(0)', id: 'apply', label: '지원하기', onclick: "alert('지원 기간이 아닙니다.'); return false;" },
                { href: 'javascript:void(0)', id: 'result', label: '지원 결과 안내', onclick: "alert('지원 결과 조회 기간이 아닙니다.'); return false;" }
            ]
        }
    ]
};

const PAGE_ALIASES = {
    members_intro: 'members',
    study_plan: 'study'
};

function buildHeaderHTML() {
    return `
        <div class="hamburger-btn" onclick="toggleMenu()" aria-label="메뉴 열기" aria-expanded="false" aria-controls="sidebar" role="button" tabindex="0">
            <span></span><span></span><span></span>
        </div>
        <h1><a href="${PAINS_LAYOUT.homeHref}">${PAINS_LAYOUT.brandText}</a></h1>
    `;
}

function buildFooterHTML() {
    const icons = PAINS_LAYOUT.socials.map(item => `
        <a href="${item.href}" target="_blank" rel="noopener noreferrer" class="icon-btn" title="${item.title}">
            <img src="${item.icon}" alt="${item.alt}">
        </a>
    `).join('');

    return `
        <div class="footer-icons">${icons}</div>
        <p>${PAINS_LAYOUT.footerText}</p>
    `;
}

function buildSidebarHTML() {
    return PAINS_LAYOUT.menuGroups.map(group => {
        if (group.type === 'link') {
            return `<a href="${group.href}" id="link-${group.id}">${group.label}</a>`;
        }

        const arrowId = `${group.id}-arrow`;
        const submenuId = `${group.id}-submenu`;
        const children = group.items.map(item => {
            const onclickAttr = item.onclick ? ` onclick="${item.onclick}"` : '';
            return `<a href="${item.href}" id="link-${item.id}"${onclickAttr}>${item.label}</a>`;
        }).join('');

        return `
            <a href="javascript:void(0)" class="menu-toggle" onclick="toggleSubmenu('${submenuId}', '${arrowId}')">
                <span>${group.label}</span>
                <span id="${arrowId}" class="menu-arrow">▼</span>
            </a>
            <div class="submenu" id="${submenuId}">${children}</div>
        `;
    }).join('');
}

function ensureLayoutShell() {
    const body = document.body;
    if (!body) return {};

    let header = document.querySelector('header');
    if (!header) {
        header = document.createElement('header');
        body.insertBefore(header, body.firstChild);
    }

    let sidebar = document.getElementById('sidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'sidebar';
        sidebar.className = 'sidebar';
        header.insertAdjacentElement('afterend', sidebar);
    }

    let overlay = document.getElementById('overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'overlay';
        overlay.className = 'overlay';
        overlay.setAttribute('onclick', 'toggleMenu()');
        sidebar.insertAdjacentElement('afterend', overlay);
    }

    let footer = document.querySelector('footer');
    if (!footer) {
        footer = document.createElement('footer');
        body.appendChild(footer);
    }

    return { header, sidebar, overlay, footer };
}

function loadSidebar(currentPage) {
    console.log('PAINS Menu v4.3 Loaded (Width Control Delegated to HTML)');

    const { header, sidebar, overlay, footer } = ensureLayoutShell();
    if (!header || !sidebar || !overlay || !footer) return;

    header.innerHTML = buildHeaderHTML();
    sidebar.innerHTML = buildSidebarHTML();
    footer.innerHTML = buildFooterHTML();

    header.classList.add('pains-header');
    sidebar.classList.add('sidebar');
    overlay.classList.add('overlay');
    footer.classList.add('pains-footer');
    document.body.classList.add('pains-theme');

    initGlobalStyles();
    highlightCurrentPage(currentPage);
    syncHeaderHeight();
    initScrollEvent();
    initEscapeClose();
    initHeaderKeyboardAccess();
}

function highlightCurrentPage(currentPage) {
    const resolvedPage = PAGE_ALIASES[currentPage] || currentPage;
    if (!resolvedPage) return;

    const targetLink = document.getElementById('link-' + resolvedPage);
    if (!targetLink) return;

    targetLink.classList.add('active-link');
    const parentSubmenu = targetLink.closest('.submenu');
    if (parentSubmenu) {
        parentSubmenu.classList.add('open');
        const toggleBtn = parentSubmenu.previousElementSibling;
        const arrowSpan = toggleBtn ? toggleBtn.querySelector('.menu-arrow') : null;
        if (arrowSpan) arrowSpan.style.transform = 'rotate(180deg)';
    }
}

function initGlobalStyles() {
    if (document.getElementById('pains-dynamic-style')) return;

    const style = document.createElement('style');
    style.id = 'pains-dynamic-style';
    style.innerHTML = `
        /* ========================================== */
        /* 1. 글로벌 폰트 불러오기 (@font-face)       */
        /* ========================================== */
        
        /* 🎯 제목용 폰트 (ATOZ5) */
        @font-face { 
            font-family: 'ATOZ5'; 
            src: url('fonts/ATOZ5.woff2') format('woff2'); 
            font-weight: normal; 
            font-style: normal; 
        }

        /* 📖 본문용 폰트 (ATOZ4) */
        @font-face { 
            font-family: 'ATOZ4'; 
            src: url('fonts/ATOZ4.woff2') format('woff2'); 
            font-weight: normal; 
            font-style: normal; 
        }

        :root {
            --pains-accent: #ab3333;
            --pains-accent-strong: #8f2a2a;
            --pains-accent-soft: #f4e9eb;
            --pains-text: #18202a;
            --pains-muted: #647084;
            --pains-border: #d8dee8;
            --pains-surface: rgba(255,255,255,0.92);
            --pains-surface-strong: #ffffff;
            --pains-bg: #f3f5f8;
            --pains-shadow: 0 18px 50px rgba(16, 24, 40, 0.08);
            --pains-header-height: 72px;
            --pains-sidebar-width: 280px;
            --pains-radius-lg: 24px;
            --pains-radius-md: 16px;
            --pains-radius-sm: 12px;
        }

        html { scroll-behavior: smooth; }

        /* ========================================== */
        /* 2. 글로벌 폰트 및 레이아웃 적용            */
        /* ========================================== */

        /* 📖 사이트 전체 본문 기본 폰트 적용 (ATOZ4) */
        body.pains-theme {
            font-family: 'ATOZ4', sans-serif !important;
            background:
                radial-gradient(circle at top left, rgba(171, 51, 51, 0.07), transparent 28%),
                linear-gradient(180deg, #f8f9fb 0%, var(--pains-bg) 100%) !important;
            color: var(--pains-text) !important;
            padding-top: calc(var(--pains-header-height) + 18px) !important;
            
            /* Sticky Footer를 위한 속성 */
            min-height: 100vh;
            display: flex !important;
            flex-direction: column !important;
        }

        /* 🎯 제목(h1, h2, h3) 등에 제목 폰트 적용 (ATOZ5) */
        body.pains-theme h1,
        body.pains-theme h2,
        body.pains-theme h3,
        body.pains-theme .society-name, 
        body.pains-theme .title {      
            font-family: 'ATOZ5', sans-serif !important;
        }

        /* 📖 폼 요소(입력창, 버튼)에 본문 폰트 적용 (ATOZ4) */
        body.pains-theme input,
        body.pains-theme select,
        body.pains-theme textarea,
        body.pains-theme button {
            font-family: 'ATOZ4', sans-serif !important;
            border-radius: 12px !important;
            border-color: rgba(216, 222, 232, 0.95) !important;
            box-shadow: none !important;
        }

        /* ========================================== */
        /* 3. 컴포넌트 세부 디자인 (너비 제외, 테마만) */
        /* ========================================== */

        body.pains-theme section {
            background: #ffffff;
            border: 1px solid rgba(216, 222, 232, 0.85);
            border-radius: 28px;
            padding: clamp(24px, 3vw, 40px) !important;
            box-shadow: var(--pains-shadow);
        }

        body.pains-theme .hero {
            background: linear-gradient(135deg, #0f2041, #1A365D) !important;
            border-radius: 30px;
            /* 그림자도 붉은 톤(127, 22, 33)에서 푸른 톤(26, 54, 93)으로 변경 */
            box-shadow: 0 24px 60px rgba(26, 54, 93, 0.28);
            overflow: hidden;
        }

        body.pains-theme header,
        body.pains-theme .pains-header {
            position: fixed !important;
            top: 0;
            left: 0;
            width: 100%;
            height: var(--pains-header-height);
            padding: 0 24px !important;
            display: flex !important;
            align-items: center;
            gap: 18px;
            background: #ffffff !important;
            color: var(--pains-text) !important;
            border-bottom: 1px solid rgba(216, 222, 232, 0.95);
            box-shadow: 0 10px 35px rgba(15, 23, 42, 0.07);
            transition: transform 0.28s ease, box-shadow 0.28s ease;
            z-index: 1200 !important;
        }

        body.pains-theme header.nav-up {
            transform: translateY(-100%);
        }

        body.pains-theme header h1,
        body.pains-theme .pains-header h1 {
            font-size: clamp(1.05rem, 1.6vw, 1.4rem) !important;
            line-height: 1.2;
            letter-spacing: -0.02em;
            margin: 0;
        }

        body.pains-theme header h1 a,
        body.pains-theme .pains-header h1 a {
            color: var(--pains-text) !important;
            text-decoration: none;
        }

        body.pains-theme .hamburger-btn {
            width: 42px;
            height: 42px;
            min-width: 42px;
            border-radius: 12px;
            display: inline-flex !important;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 5px;
            background: var(--pains-surface-strong);
            border: 1px solid rgba(216, 222, 232, 0.95);
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
            cursor: pointer;
        }

        body.pains-theme .hamburger-btn span {
            width: 18px;
            height: 2px;
            border-radius: 999px;
            background: var(--pains-text) !important;
            display: block;
        }

        body.pains-theme .sidebar {
            position: fixed !important;
            top: 0 !important;
            left: calc(-1 * var(--pains-sidebar-width) - 24px) !important;
            width: var(--pains-sidebar-width) !important;
            height: 100vh !important;
            box-sizing: border-box !important;
            padding: calc(var(--pains-header-height) + 12px) 14px 80px !important;
            background: rgba(255,255,255,0.96) !important;
            border-right: 1px solid rgba(216, 222, 232, 0.95);
            box-shadow: 24px 0 60px rgba(15, 23, 42, 0.14);
            overflow-y: auto !important;
            overflow-x: hidden;
            overscroll-behavior: contain;
            transition: left 0.28s ease;
            z-index: 1100 !important;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        body.pains-theme .sidebar.active {
            left: 0 !important;
        }

        body.pains-theme .sidebar::-webkit-scrollbar {
            width: 10px;
        }

        body.pains-theme .sidebar::-webkit-scrollbar-thumb {
            background: rgba(100, 112, 132, 0.35);
            border-radius: 999px;
            border: 2px solid transparent;
            background-clip: padding-box;
        }

        body.pains-theme .sidebar::-webkit-scrollbar-track {
            background: transparent;
        }

        body.pains-theme .sidebar a {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 14px 16px !important;
            margin: 0;
            border: 1px solid transparent !important;
            border-radius: var(--pains-radius-sm);
            color: var(--pains-text) !important;
            background: transparent !important;
            font-size: 1rem !important;
            font-weight: 600 !important;
            text-decoration: none;
            transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }

        body.pains-theme .sidebar a:hover {
            background: #fff !important;
            color: var(--pains-accent) !important;
            border-color: rgba(171, 51, 51, 0.14) !important;
            transform: translateX(2px);
        }

        body.pains-theme .sidebar a.active-link {
            background: linear-gradient(135deg, rgba(171, 51, 51, 0.11), rgba(171, 51, 51, 0.04)) !important;
            color: var(--pains-accent) !important;
            border-color: rgba(171, 51, 51, 0.2) !important;
            font-weight: 800 !important;
        }

        body.pains-theme .sidebar a.menu-toggle {
            cursor: pointer;
        }

        body.pains-theme .menu-arrow {
            font-size: 1.1rem;
            color: var(--pains-muted);
            transition: transform 0.28s ease;
            flex-shrink: 0;
        }

        body.pains-theme .submenu {
            display: block !important;
            max-height: 0;
            overflow: hidden;
            opacity: 0;
            margin: -2px 0 2px;
            padding-left: 8px;
            border-left: 2px solid rgba(171, 51, 51, 0.09);
            background: transparent !important;
            transition: max-height 0.28s ease, opacity 0.22s ease, margin 0.22s ease;
        }

        body.pains-theme .submenu.open {
            max-height: 1000px;
            opacity: 1;
            margin: 2px 0 8px;
        }

        body.pains-theme .submenu a {
            font-size: 0.95rem !important;
            font-weight: 500 !important;
            color: var(--pains-muted) !important;
            padding-left: 16px !important;
            margin-left: 6px;
        }

        body.pains-theme .submenu a:hover,
        body.pains-theme .submenu a.active-link {
            color: var(--pains-accent) !important;
            background: rgba(171, 51, 51, 0.06) !important;
        }

        body.pains-theme .overlay {
            position: fixed !important;
            inset: 0;
            background: rgba(15, 23, 42, 0.28) !important;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.24s ease, visibility 0.24s ease;
            z-index: 1090 !important;
            display: block !important;
        }

        body.pains-theme .overlay.active {
            opacity: 1;
            visibility: visible;
        }

        /* 📌 푸터 하단 고정 (Sticky Footer) */
        body.pains-theme footer,
        body.pains-theme .pains-footer {
            width: 100%;
            max-width: none;
            margin-top: auto !important; /* 항상 화면 맨 아래로 푸시 */
            padding: 28px 24px !important;
            border-top: 1px solid rgba(216, 222, 232, 0.95);
            border-left: none;
            border-right: none;
            border-bottom: none;
            border-radius: 0;
            background: rgba(255,255,255,0.92) !important;
            box-shadow: var(--pains-shadow);
            color: var(--pains-muted) !important;
            text-align: center;
            box-sizing: border-box;
        }

        body.pains-theme .footer-icons {
            display: flex !important;
            justify-content: center;
            gap: 14px;
            margin-bottom: 18px !important;
        }

        body.pains-theme .icon-btn {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            background: #fff !important;
            border: 1px solid rgba(216, 222, 232, 0.95);
            display: inline-flex !important;
            justify-content: center;
            align-items: center;
            box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
            transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }

        body.pains-theme .icon-btn:hover {
            transform: translateY(-2px);
            border-color: rgba(171, 51, 51, 0.28);
            box-shadow: 0 12px 26px rgba(171, 51, 51, 0.12);
            background: #fff !important;
        }

        body.pains-theme .icon-btn img {
            width: 22px;
            height: 22px;
            object-fit: contain;
        }

        body.pains-theme .content-box,
        body.pains-theme .rule-box,
        body.pains-theme .project-list,
        body.pains-theme .chart-card,
        body.pains-theme .org-card,
        body.pains-theme .search-box,
        body.pains-theme .result-box,
        body.pains-theme .fee-table-container,
        body.pains-theme .info-card,
        body.pains-theme .project-card,
        body.pains-theme .society-btn {
            box-shadow: var(--pains-shadow);
        }

        body.pains-theme h2,
        body.pains-theme h3 {
            color: #111827 !important;
            border-bottom-color: rgba(216, 222, 232, 0.95) !important;
        }

        body.pains-theme strong,
        body.pains-theme .calendar-title,
        body.pains-theme .calendar-nav-btn:hover,
        body.pains-theme .inline-link:hover {
            color: var(--pains-accent) !important;
        }

        body.pains-theme button,
        body.pains-theme .btn,
        body.pains-theme input[type="submit"],
        body.pains-theme .btn-today-reset {
            font-family: 'ATOZ4', sans-serif !important;
            font-weight: normal !important;
            border-radius: 12px !important;
            text-decoration: none !important;
            border-color: rgba(216, 222, 232, 0.95) !important;
            box-shadow: none !important;
        }

        body.pains-theme .btn:not(.btn-today-reset),
        body.pains-theme button[type="submit"],
        body.pains-theme input[type="submit"] {
            background: linear-gradient(135deg, var(--pains-accent), var(--pains-accent-strong)) !important;
            color: #fff !important;
            border: none !important;
            box-shadow: 0 14px 26px rgba(171, 51, 51, 0.22);
        }

        body.pains-theme .btn-today-reset {
            background: #fff !important;
            border: 1px solid rgba(216, 222, 232, 0.95) !important;
            color: var(--pains-text) !important;
        }

        body.pains-theme table,
        body.pains-theme .calendar-container,
        body.pains-theme .rule-box,
        body.pains-theme .search-box,
        body.pains-theme .result-box,
        body.pains-theme .fee-table-container {
            border-color: rgba(216, 222, 232, 0.95) !important;
        }

        @media (max-width: 768px) {
            :root {
                --pains-header-height: 66px;
                --pains-sidebar-width: min(88vw, 320px);
            }

            body.pains-theme {
                padding-top: calc(var(--pains-header-height) + 14px) !important;
            }

            body.pains-theme header,
            body.pains-theme .pains-header {
                padding: 0 16px !important;
            }

            body.pains-theme section,
            body.pains-theme .hero,
            body.pains-theme .container {
                border-radius: 22px;
                padding: 20px !important; 
            }

            body.pains-theme footer,
            body.pains-theme .pains-footer {
                max-width: 100%;
                border-radius: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

function syncHeaderHeight() {
    const header = document.querySelector('header');
    if (!header) return;

    const update = () => {
        const height = Math.ceil(header.offsetHeight || 72);
        document.documentElement.style.setProperty('--pains-header-height', `${height}px`);
    };

    update();
    window.addEventListener('resize', update);
}

function initScrollEvent() {
    if (window.__painsScrollInit) return;
    window.__painsScrollInit = true;

    let lastScrollTop = 0;
    const delta = 6;
    const header = document.querySelector('header');
    if (!header) return;

    window.addEventListener('scroll', function () {
        const st = window.scrollY || document.documentElement.scrollTop;
        if (Math.abs(lastScrollTop - st) <= delta) return;

        if (st > lastScrollTop && st > header.offsetHeight + 20) {
            header.classList.add('nav-up');
        } else {
            header.classList.remove('nav-up');
        }
        lastScrollTop = st <= 0 ? 0 : st;
    }, { passive: true });
}

function initEscapeClose() {
    if (window.__painsEscapeInit) return;
    window.__painsEscapeInit = true;

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu();
    });
}

function initHeaderKeyboardAccess() {
    const burger = document.querySelector('.hamburger-btn');
    if (!burger || burger.dataset.keyboardBound === 'true') return;

    burger.dataset.keyboardBound = 'true';
    burger.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleMenu();
        }
    });
}

function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const burger = document.querySelector('.hamburger-btn');
    if (!sidebar || !overlay) return;

    const willOpen = !sidebar.classList.contains('active');
    sidebar.classList.toggle('active', willOpen);
    overlay.classList.toggle('active', willOpen);
    document.body.classList.toggle('menu-open', willOpen);

    if (burger) {
        burger.setAttribute('aria-expanded', String(willOpen));
    }
}

function closeMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const burger = document.querySelector('.hamburger-btn');

    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.body.classList.remove('menu-open');

    if (burger) {
        burger.setAttribute('aria-expanded', 'false');
    }
}

function toggleSubmenu(menuId, arrowId) {
    const submenu = document.getElementById(menuId);
    const arrow = document.getElementById(arrowId);
    if (!submenu) return;

    const isOpen = submenu.classList.contains('open');
    submenu.classList.toggle('open', !isOpen);

    if (arrow) {
        arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    }
}
