// 다락방 설정 창 (v1.7.0)
// 요술봉(확장) 메뉴의 「다락방」으로 여는 별도 창입니다. 설정 패널(index.js의 build())을 새로 만들지 않고
// 그대로 이 창 안에 올려 쓰므로 모듈별 설정·저장 방식은 그대로입니다. 바뀐 것은 여닫는 방식뿐입니다.
//  - 바꾸는 즉시 채팅 화면에 미리 보입니다(저장 전).
//  - [저장 후 닫기]를 눌러야 확정되고, [취소]는 창을 열기 전 상태로 되돌립니다.
// 밝게/어둡게는 이 창에만 적용되며 이 기기(브라우저)에만 기억합니다.

const MODE_KEY = 'darak-window-mode';
const FONT_ID = 'ttk-win-fonts';
const FS = 'https://cdn.jsdelivr.net/npm/@fontsource';
const FONT_FALLBACK = [`${FS}/gowun-batang@5/400.css`, `${FS}/gowun-batang@5/700.css`, `${FS}/ibm-plex-sans-kr@5/400.css`, `${FS}/ibm-plex-sans-kr@5/500.css`, `${FS}/ibm-plex-sans-kr@5/600.css`];
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap';
const MENU_ID = 'ttk_window_menu';
// 왼쪽 목록 아이콘(Lucide). 값은 css의 .ttk-lc-<이름> 클래스입니다.
const NAV_ICON = {
    design: 'w-palette', localization: 'w-globe', translation: 'w-languages', ghostwrite: 'w-pen-line',
    avatars: 'w-user-round', faces: 'smile', weather: 'w-cloud', themeImages: 'img',
    optimization: 'w-smartphone', qr: 'w-qr-code', inventory: 'clip-list', gallery: 'images',
    'x:ttk-glossary-section': 'w-book-a',
};

const el = (tag, cls = '', text = '') => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const icon = name => el('span', `ttk-lc ttk-lc-${name}`);
const button = (cls, label, onClick) => { const b = el('button', cls); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', onClick); return b; };

export class SettingsWindow {
    /**
     * @param {{version:string, buildPanel:()=>HTMLElement, begin:()=>void, commit:()=>void, rollback:()=>void,
     *          ask?:(msg:string,opt?:object)=>Promise<boolean>}} o
     *  begin    창을 열 때: 이후의 변경을 임시로 쥐고 있게 합니다.
     *  commit   [저장 후 닫기] 또는 변경 없이 닫을 때: 확정합니다.
     *  rollback [취소]: 열기 전 상태로 되돌립니다.
     */
    constructor({ version, buildPanel, begin, commit, rollback, ask } = {}) {
        Object.assign(this, { version, buildPanel, begin, commit, rollback, ask });
        this.root = null; this.dirty = false; this.tab = 'all'; this.q = ''; this.groups = [];
    }

    // ---- 요술봉 메뉴 ----
    registerMenu(tries = 0) {
        const menu = document.getElementById('extensionsMenu');
        if (!menu) { if (tries < 20) this.timer = setTimeout(() => this.registerMenu(tries + 1), 500); return; }
        if (document.getElementById(MENU_ID)) return;
        const item = el('div', 'list-group-item flex-container flexGap5 interactable'); item.id = MENU_ID; item.tabIndex = 0;
        item.append(el('div', 'ttk-lc ttk-lc-w-attic extensionsMenuExtensionButton'), el('span', '', '다락방'));
        item.addEventListener('click', () => { this.open(); this.closeWandMenu(); });
        item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); } });
        // SillyTavern 기본 항목처럼 extension_container 안에 넣어 들여쓰기·간격을 같게 맞춥니다.
        const box = el('div', 'extension_container interactable'); box.id = 'darak_wand_container'; box.append(item);
        menu.prepend(box);
    }
    unregister() { clearTimeout(this.timer); (document.getElementById('darak_wand_container') || document.getElementById(MENU_ID))?.remove(); if (this.root) { this.rollback(); this.teardown(); } }
    // 요술봉 메뉴는 바깥을 누르면 닫히므로, 같은 동작을 흉내 냅니다.
    closeWandMenu() { try { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch { /* 메뉴가 열린 채여도 동작에는 문제없음 */ } }

    // ---- 열기 / 닫기 ----
    open() {
        if (this.root) return;
        this.loadFonts();
        this.begin();
        this.dirty = false; this.tab = 'all'; this.q = '';
        this.prevFocus = document.activeElement;
        this.root = this.render();
        document.body.append(this.root);
        document.documentElement.classList.add('ttk-win-open');
        this.mountPanel();
        this.onKey = e => this.keydown(e);
        document.addEventListener('keydown', this.onKey, true);
        this.card.focus({ preventScroll: true });
    }
    teardown() {
        document.removeEventListener('keydown', this.onKey, true);
        this.mo?.disconnect(); this.mo = null;
        this.root?.remove(); this.root = null;
        document.documentElement.classList.remove('ttk-win-open');
        try { this.prevFocus?.focus?.({ preventScroll: true }); } catch { /* 이전 위치가 사라졌으면 그대로 둠 */ }
        this.groups = []; this.panelEl = null;
    }
    save() { this.commit(); this.teardown(); }
    cancel() { if (this.dirty) this.rollback(); else this.commit(); this.teardown(); }
    async requestClose() {
        if (!this.dirty) { this.commit(); this.teardown(); return; }
        const ok = this.ask ? await this.ask('저장하지 않은 변경이 있습니다. 버리고 닫을까요?', { ok: '버리고 닫기', cancel: '계속 편집', danger: true }) : true;
        if (ok && this.root) { this.rollback(); this.teardown(); }
    }
    markDirty() { this.dirty = true; this.updateFoot(); }
    // 창 글꼴: Google Fonts를 먼저 쓰고, 받지 못하면(차단·오류·4초 안에 글자 없음) jsDelivr의 Fontsource 사본으로 다시 받습니다.
    loadFonts() {
        if (document.getElementById(FONT_ID)) return;
        const add = (id, href) => { const l = el('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; l.crossOrigin = 'anonymous'; document.head.append(l); return l; };
        let fell = false;
        const fallback = () => {
            if (fell) return; fell = true;
            FONT_FALLBACK.forEach((href, i) => add(`${FONT_ID}-fb${i}`, href));
            console.warn('[DARAK] 설정 창 글꼴을 Google Fonts에서 받지 못해 jsDelivr 사본을 씁니다.');
        };
        const ok = () => document.fonts?.check?.("22px 'Gowun Batang'", '다락방') !== false;
        const link = add(FONT_ID, FONT_HREF);
        link.addEventListener('error', fallback);
        link.addEventListener('load', () => document.fonts?.load?.("22px 'Gowun Batang'", '다락방').then(f => { if (!f?.length) fallback(); }).catch(fallback));
        setTimeout(() => { if (!ok()) fallback(); }, 4000);
    }

    // ---- 화면 ----
    render() {
        const root = el('div', 'ttk-win'); root.id = 'ttk-win'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '다락방 설정');
        let mode = 'dark'; try { mode = localStorage.getItem(MODE_KEY) === 'light' ? 'light' : 'dark'; } catch { /* 저장소 사용 불가 */ }
        root.dataset.mode = mode;
        const card = el('div', 'ttk-win-card'); card.tabIndex = -1; this.card = card;

        // 왼쪽(PC): 이름 + 모듈 목록
        const rail = el('aside', 'ttk-win-rail');
        const brand = el('div', 'ttk-win-brand');
        brand.append(el('span', 'ttk-win-key'), el('div', 'ttk-win-brand-name', '다락방'), el('div', 'ttk-win-ver', `DARAK · v${this.version}`));
        this.nav = el('nav', 'ttk-win-nav'); this.nav.setAttribute('aria-label', '모듈');
        rail.append(brand, this.nav);

        // 오른쪽: 위 줄(검색·밝기·닫기) / 탭(휴대폰) / 본문 / 아래 줄
        const main = el('div', 'ttk-win-main');
        const top = el('div', 'ttk-win-top');
        const brandM = el('div', 'ttk-win-brand-m');
        const bm = el('div'); bm.append(el('div', 'ttk-win-brand-name', '다락방'), el('div', 'ttk-win-ver', `DARAK · v${this.version}`));
        brandM.append(el('span', 'ttk-win-key'), bm);
        const search = el('label', 'ttk-win-search'); search.append(icon('w-search'));
        const input = el('input'); input.type = 'search'; input.placeholder = '설정 검색 · 예: 형광펜, 줄간격, 용어집'; input.setAttribute('aria-label', '설정 검색');
        input.autocomplete = 'off'; input.enterKeyHint = 'search'; input.spellcheck = false;
        input.addEventListener('input', () => { this.q = input.value; this.apply(); });
        search.append(input);
        const modeBox = el('div', 'ttk-win-mode'); modeBox.setAttribute('role', 'group'); modeBox.setAttribute('aria-label', '창 밝기');
        this.modeBtns = {};
        for (const [id, label, ic] of [['light', '밝게', 'w-sun'], ['dark', '어둡게', 'w-moon']]) {
            const b = button('ttk-win-mode-btn', label, () => this.setMode(id)); b.append(icon(ic), el('span', '', label)); this.modeBtns[id] = b; modeBox.append(b);
        }
        const close = button('ttk-win-close', '닫기', () => this.requestClose()); close.append(icon('x'));
        top.append(brandM, search, modeBox, close);

        this.tabs = el('div', 'ttk-win-tabs'); this.tabs.setAttribute('role', 'tablist');
        this.body = el('div', 'ttk-win-body');
        this.empty = el('p', 'ttk-win-empty', '검색 결과가 없습니다.'); this.empty.hidden = true;

        const foot = el('div', 'ttk-win-foot');
        this.dot = el('span', 'ttk-win-dot-state');
        this.footText = el('span', 'ttk-win-foot-text');
        this.footLong = el('span', 'ttk-win-foot-long'); this.footShort = el('span', 'ttk-win-foot-short');
        this.footText.append(this.footLong, this.footShort);
        const cancel = button('ttk-win-btn', '', () => this.cancel()); cancel.textContent = '취소';
        const save = button('ttk-win-btn ttk-win-primary', '', () => this.save()); save.textContent = '저장 후 닫기';
        foot.append(this.dot, this.footText, el('span', 'ttk-win-spacer'), cancel, save);

        main.append(top, this.tabs, this.body, foot);
        card.append(rail, main); root.append(card);
        this.modeBtns[mode].setAttribute('aria-pressed', 'true'); this.modeBtns[mode === 'dark' ? 'light' : 'dark'].setAttribute('aria-pressed', 'false');
        this.updateFoot();
        return root;
    }
    setMode(mode) {
        this.root.dataset.mode = mode;
        for (const [id, b] of Object.entries(this.modeBtns)) b.setAttribute('aria-pressed', String(id === mode));
        try { localStorage.setItem(MODE_KEY, mode); } catch { /* 저장소 사용 불가 */ }
    }
    updateFoot() {
        if (!this.dot) return;
        this.dot.classList.toggle('on', this.dirty);
        this.footLong.textContent = this.dirty ? '저장하지 않은 변경이 있습니다' : '변경 사항 없음';
        this.footShort.textContent = this.dirty ? '변경 있음' : '변경 없음';
    }

    // ---- 설정 패널 올리기 ----
    mountPanel() {
        try {
            this.ovHead = el('div', 'ttk-win-ovhead'); this.ovTitle = el('h2', 'ttk-win-ovtitle', '다락방에 있는 것'); this.ovCount = el('span', 'ttk-win-ovcount');
            this.ovHead.append(this.ovTitle, this.ovCount);
            this.body.replaceChildren(this.ovHead, this.buildPanel(), this.empty);
        }
        catch (e) { console.error('[DARAK] 설정 창을 만들지 못했습니다', e); this.body.replaceChildren(el('p', 'ttk-win-empty', '설정 화면을 만들지 못했습니다. 브라우저 콘솔(F12)의 [DARAK] 줄을 확인해 주세요. 모듈은 저장된 설정대로 동작합니다.')); }
        // 설정 가져오기처럼 패널이 통째로 바뀌면 목록·필터를 다시 맞춥니다.
        this.mo = new MutationObserver(() => { if (this.panelEl !== this.body.querySelector('#ttk-panel')) this.refresh(); });
        this.mo.observe(this.body, { childList: true });
        this.body.addEventListener('change', e => { if (e.target.matches?.('.ttk-module-row input[type=checkbox]')) { this.renderNav(); this.apply(); } });
        this.refresh();
    }
    refresh() { this.indexPanel(); this.renderNav(); this.apply(); }

    // 패널의 묶음·모듈을 읽어 목록으로 만듭니다. 모듈 줄과 그 설정 칸(details)은 data-module이 같습니다.
    indexPanel() {
        this.panelEl = this.body.querySelector('#ttk-panel'); this.groups = [];
        if (!this.panelEl) return;
        for (const g of this.panelEl.querySelectorAll('.ttk-groups > .ttk-group')) {
            const items = new Map();
            for (const child of g.children) {
                if (child.classList.contains('ttk-group-head')) continue;
                const key = child.dataset.module || `x:${child.id || items.size}`;
                if (!items.has(key)) items.set(key, { key, els: [] });
                items.get(key).els.push(child);
            }
            for (const it of items.values()) {
                const row = it.els.find(e => e.matches('.ttk-module-row'));
                it.section = it.els.find(e => e.matches('details'));
                it.input = row?.querySelector('input[type=checkbox]') || null;
                it.sections = it.els.filter(e => e.matches('details'));
                it.row = row || null;
                if (row) this.decorateRow(row, it.key);
                it.label = (row?.querySelector('.ttk-option-label strong')?.textContent || it.section?.querySelector(':scope > summary')?.textContent || '').split(' · ')[0].trim();
            }
            this.groups.push({ name: g.querySelector('.ttk-group-head strong')?.textContent || '', el: g, items: [...items.values()] });
        }
    }
    // 개요(전체·묶음 탭)에서는 모듈 줄을 카드로 씁니다: 번호·아이콘을 붙이고, 스위치 밖을 누르면 그 모듈 설정으로 갑니다.
    decorateRow(row, key) {
        if (!row.querySelector(':scope > .ttk-win-ic')) {
            row.prepend(el('span', 'ttk-win-no'), el('span', `ttk-lc ttk-lc-${NAV_ICON[key] || 'w-layout-grid'} ttk-win-ic`));
        }
        if (row.dataset.winBound) return; row.dataset.winBound = '1';
        row.addEventListener('click', e => {
            if (!this.body.classList.contains('ttk-win-overview') || e.target.closest('input')) return;
            e.preventDefault(); this.go(`m:${key}`);
        });
    }
    renderNav() {
        if (!this.nav) return;
        this.nav.replaceChildren(this.navBtn('전체', 'w-layout-grid', 'all'));
        this.tabs.replaceChildren(this.tabBtn('전체', 'all'));
        this.groups.forEach((g, gi) => {
            this.nav.append(el('div', 'ttk-win-nav-group', g.name));
            for (const it of g.items) this.nav.append(this.navBtn(it.label, NAV_ICON[it.key], `m:${it.key}`, it));
            this.tabs.append(this.tabBtn(g.name, `g:${gi}`));
        });
    }
    navBtn(label, ic, id, it) {
        const b = button('ttk-win-nav-btn', '', () => this.go(id)); b.dataset.tab = id;
        b.append(ic ? icon(ic) : el('span', 'ttk-win-nav-dot'), el('span', 'ttk-win-nav-label', label));
        if (it?.input && !it.input.checked) { b.classList.add('ttk-win-off'); b.append(el('span', 'ttk-win-nav-off', '꺼짐')); }
        if (this.tab === id) b.setAttribute('aria-current', 'true');
        return b;
    }
    tabBtn(label, id) {
        const b = button('ttk-win-tab', '', () => this.go(id)); b.textContent = label; b.dataset.tab = id; b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(this.tab === id));
        return b;
    }
    go(id) {
        this.tab = id;
        for (const b of this.root.querySelectorAll('[data-tab]')) {
            const on = b.dataset.tab === id;
            if (b.classList.contains('ttk-win-tab')) b.setAttribute('aria-selected', String(on));
            else if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        }
        this.apply(); this.body.scrollTop = 0;
    }

    // 탭과 검색어에 맞춰 보이는 모듈만 남깁니다.
    apply() {
        const p = this.panelEl; if (!p) return;
        const q = this.q.trim().toLowerCase(), solo = !q && this.tab.startsWith('m:'), overview = !this.tab.startsWith('m:') && !q;
        this.body.classList.toggle('ttk-win-solo', solo);
        this.body.classList.toggle('ttk-win-overview', overview);
        this.body.classList.toggle('ttk-win-gtab', overview && this.tab.startsWith('g:'));
        let shown = 0, no = 0, on = 0, total = 0;
        this.groups.forEach((g, gi) => {
            let n = 0;
            for (const it of g.items) {
                let vis = true;
                if (q) vis = true;                                   // 검색은 어느 탭에서든 전체에서 찾습니다
                else if (this.tab.startsWith('g:')) vis = this.tab === `g:${gi}`;
                else if (solo) vis = this.tab === `m:${it.key}`;
                if (vis && q) vis = this.textOf(it).includes(q);
                if (overview && !it.row) vis = false;              // 개요에는 모듈 카드만
                if (it.row && vis) { total++; if (it.input?.checked) on++; const nb = it.row.querySelector(':scope > .ttk-win-no'); if (nb) nb.textContent = String(++no).padStart(2, '0'); }
                for (const e of it.els) e.classList.toggle('ttk-win-hide', !vis || (overview && e !== it.row));
                if (vis) { n++; if (solo || q) for (const d of it.sections) d.open = true; }
                // 모듈 하나만 볼 때 카드 제목과 같은 접힘 칸 제목은 숨깁니다.
                for (const d of it.sections) { const sm = d.querySelector(':scope > summary'); sm?.classList.toggle('ttk-win-dup', solo && vis && sm.textContent.trim() === it.label); }
            }
            g.el.classList.toggle('ttk-win-hide', !n); shown += n;
        });
        for (const note of p.querySelectorAll('.ttk-settings-body > .ttk-note')) note.classList.add('ttk-win-hide');
        for (const box of p.querySelectorAll('.ttk-settings-body > .ttk-failures')) box.classList.toggle('ttk-win-hide', !overview || this.tab !== 'all');
        this.empty.hidden = shown > 0;
        if (this.ovHead) {
            this.ovHead.classList.toggle('ttk-win-hide', !overview);
            const g = this.tab.startsWith('g:') ? this.groups[Number(this.tab.slice(2))] : null;
            this.ovTitle.textContent = g ? g.name : '다락방에 있는 것';
            this.ovCount.textContent = `${on}개 켜짐 · 카드를 누르면 세부 설정으로 갑니다`;
        }
    }
    // 설정 칸 안의 글자(드롭다운 항목·입력칸 제외)만 검색 대상으로 삼습니다.
    textOf(it) {
        const parts = [];
        for (const e of it.els) {
            const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement?.closest('option,script,style,textarea') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
            let n; while ((n = w.nextNode())) parts.push(n.nodeValue);
        }
        return parts.join(' ').replace(/\s+/g, ' ').toLowerCase();
    }

    // ---- 키보드 ----
    keydown(e) {
        if (!this.root) return;
        if (e.key === 'Escape') {
            if (document.querySelector('dialog[open]')) return;   // 확인 창 등이 위에 열려 있으면 그쪽이 먼저
            e.preventDefault(); e.stopPropagation(); this.requestClose(); return;
        }
        if (e.key !== 'Tab' || document.querySelector('dialog[open]')) return;
        const f = [...this.card.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]:not([tabindex="-1"])')]
            .filter(n => !n.disabled && n.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1], a = document.activeElement;
        if (!this.card.contains(a)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
}
