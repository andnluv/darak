/** DARAK — 프로필 사진 (multiple profile pictures per bot character / user persona).
 *
 * SillyTavern's own avatar files are never touched. The extra pictures are uploaded as ordinary user
 * files (/api/files/upload) and only change what the chat *shows*:
 *  - each owner (character avatar file / persona avatar file) has a list of pictures and one "default"
 *    picture that new messages use;
 *  - the picture a message used is stored in message.extra.ttk_avatar, so old messages keep theirs;
 *  - the picture of any single message can be changed by hand from its message-action menu.
 */
import { addComposerButton, removeComposerButton } from './composer.js';
import { confirmAsk } from './dialogs.js';

export const MAX_PER_OWNER = 24;
const MAX_SIDE = 512;
const URL_OK = /^\/?user\/files\/[\w.\-%]+$/;

export const DEFAULT_AVATARS = Object.freeze({ owners: {} });
export function normalizeAvatars(raw = {}) {
    const owners = {};
    for (const [key, v] of Object.entries(raw?.owners && typeof raw.owners === 'object' ? raw.owners : {})) {
        if (!/^(char|persona):/.test(key) || key.length > 300) continue;
        const images = (Array.isArray(v?.images) ? v.images : [])
            .filter(i => i && typeof i.id === 'string' && typeof i.url === 'string' && URL_OK.test(i.url))
            .slice(0, MAX_PER_OWNER).map(i => ({ id: i.id.slice(0, 40), url: i.url.startsWith('/') ? i.url : `/${i.url}`, name: String(i.name || '').slice(0, 40) }));
        if (!images.length) continue;
        owners[key] = { images, active: images.some(i => i.id === v?.active) ? v.active : null };
    }
    return { owners };
}

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Downscale to MAX_SIDE and return {blob, ext}. */
export async function shrink(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.9));
    if (!blob) throw Error('이미지를 변환하지 못했습니다.');
    return { blob, ext: blob.type === 'image/webp' ? 'webp' : 'png' };
}
export const toBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

export class Avatars {
    constructor({ getSettings, save } = {}) { this.getSettings = getSettings; this.save = save; this.enabled = false; this.drawer = null; }
    ctx() { return window.SillyTavern?.getContext?.(); }
    S() { return this.getSettings(); }

    // ---- who is speaking ----
    /** The active persona's avatar file. The persona list is paginated, so its "selected" row is only the last resort. */
    personaKey() {
        const c = this.ctx();
        let id = c?.userAvatar || c?.user_avatar || this.mod?.user_avatar;
        if (!id) { const sel = document.querySelector('#user_avatar_block .avatar-container.selected'); id = sel?.getAttribute('data-avatar-id') || sel?.querySelector('[imgfile]')?.getAttribute('imgfile'); }
        if (!id) { // the newest of my own messages shows the persona's avatar: .../thumbnail?type=persona&file=<id>
            const img = [...document.querySelectorAll('#chat .mes[is_user="true"] .mesAvatarWrapper .avatar img')].pop();
            try { id = img && new URL(img.dataset.ttkSrc ?? img.getAttribute('src'), location.href).searchParams.get('file'); } catch { id = ''; }
        }
        return id ? `persona:${id}` : '';
    }
    charKey(msg) {
        const c = this.ctx();
        const file = msg?.original_avatar || c?.characters?.[c?.characterId]?.avatar;
        return file ? `char:${file}` : '';
    }
    ownerOf(msg) { return msg?.is_user ? (msg.extra?.ttk_avatar?.key || this.personaKey()) : (msg.extra?.ttk_avatar?.key || this.charKey(msg)); }
    ownerLabel(key) {
        const c = this.ctx();
        if (key.startsWith('char:')) return c?.characters?.find(x => x.avatar === key.slice(5))?.name || key.slice(5);
        const name = document.querySelector('#user_avatar_block .avatar-container.selected .ch_name')?.textContent?.trim();
        return name || c?.name1 || key.slice(8);
    }
    list(key) { return this.S().owners[key]?.images || []; }
    activeOf(key) { const o = this.S().owners[key]; return o?.images.find(i => i.id === o.active) || null; }

    /** For the bookshelf strip (Paper): this message owner's pictures, the one in use marked, and a way to switch this message's picture. */
    shelfFor(mesId) {
        const msg = this.ctx()?.chat?.[mesId]; if (!msg || msg.is_system) return null;
        const key = this.ownerOf(msg), list = key ? this.list(key) : []; if (!list.length) return null;
        const cur = msg.extra?.ttk_avatar?.url, def = this.S().owners[key]?.active;
        return {
            items: list.map(p => ({ url: p.url, name: p.name, active: cur ? p.url === cur : p.id === def })),
            pick: url => { msg.extra = { ...(msg.extra || {}), ttk_avatar: { key, url } }; this.paint(this.mesEl(mesId), msg); this.ctx().saveChat?.(); },
        };
    }

    // ---- chat display ----
    mesEl(id) { return document.querySelector(`#chat .mes[mesid="${id}"]`); }
    paint(el, msg) {
        const url = msg?.extra?.ttk_avatar?.url, img = el?.querySelector('.mesAvatarWrapper .avatar img');
        if (!img) return;
        if (url) {
            if (img.dataset.ttkSrc === undefined) img.dataset.ttkSrc = img.getAttribute('src') || '';
            if (!img.dataset.ttkErr) { img.dataset.ttkErr = '1'; img.addEventListener('error', () => { if (img.dataset.ttkSrc !== undefined && img.getAttribute('src') === (this.ctx()?.chat?.[Number(img.closest('.mes')?.getAttribute('mesid'))]?.extra?.ttk_avatar?.url)) { img.src = img.dataset.ttkSrc; } }); } // a deleted or unreachable picture shows the original avatar
            if (img.getAttribute('src') !== url) img.src = url;
        }
        else if (img.dataset.ttkSrc !== undefined) { img.src = img.dataset.ttkSrc; delete img.dataset.ttkSrc; }
    }
    /** Give a freshly rendered message the owner's default picture. */
    stamp(mesId) {
        const msg = this.ctx()?.chat?.[mesId]; if (!msg || msg.is_system || msg.extra?.ttk_avatar) return;
        const key = this.ownerOf(msg), pic = key && this.activeOf(key); if (!pic) return;
        msg.extra = { ...(msg.extra || {}), ttk_avatar: { key, url: pic.url } };
        this.paint(this.mesEl(mesId), msg); this.ctx().saveChat?.();
    }
    paintAll() { const chat = this.ctx()?.chat || []; document.querySelectorAll('#chat .mes').forEach(e => this.paint(e, chat[Number(e.getAttribute('mesid'))])); }
    addMesButtons(root = document) {
        root.querySelectorAll?.('#chat .mes .extraMesButtons:not(:has(.ttk_avatar_btn))').forEach(box => {
            const b = el('div', 'mes_button ttk_avatar_btn fa-solid fa-id-badge'); b.title = '이 메시지의 프로필 사진 바꾸기'; b.tabIndex = 0;
            b.addEventListener('click', e => { e.stopPropagation(); this.open({ mesId: Number(box.closest('.mes')?.getAttribute('mesid')) }); });
            box.prepend(b);
        });
    }

    /** Drop the record of a deleted picture from the open chat so its messages fall back to the original avatar. */
    forget(url) {
        const c = this.ctx(); let n = 0;
        (c?.chat || []).forEach((m, i) => { if (m?.extra?.ttk_avatar?.url === url) { delete m.extra.ttk_avatar; this.paint(this.mesEl(i), m); n++; } });
        if (n) c.saveChat?.();
    }

    // ---- uploads ----
    async upload(key, files) {
        const c = this.ctx(), s = this.S(); let added = 0, failed = 0;
        for (const f of files) {
            if ((s.owners[key]?.images.length || 0) >= MAX_PER_OWNER) { window.toastr?.warning?.(`사진은 최대 ${MAX_PER_OWNER}장까지 등록할 수 있습니다.`); break; }
            try {
                if (!f.type.startsWith('image/')) throw Error('이미지 파일이 아닙니다.');
                const { blob, ext } = await shrink(f), name = `ttk_avatar_${uid()}.${ext}`;
                const r = await fetch('/api/files/upload', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ name, data: await toBase64(blob) }) });
                if (!r.ok) throw Error(String(r.status));
                const { path } = await r.json(); if (!path) throw Error('경로 없음');
                const o = s.owners[key] ||= { images: [], active: null };
                const id = uid(); o.images.push({ id, url: `/${String(path).replace(/^\/+/, '')}`, name: f.name.replace(/\.[^.]+$/, '').slice(0, 40) });
                o.active ||= id; added++;
            } catch (e) { failed++; console.warn('[DARAK] avatar upload failed', f.name, e); }
        }
        this.save(); if (failed) window.toastr?.error?.(`${failed}장을 올리지 못했습니다.`); return added;
    }
    async remove(key, id) {
        const o = this.S().owners[key]; const pic = o?.images.find(i => i.id === id); if (!pic) return;
        this.forget(pic.url);
        o.images = o.images.filter(i => i.id !== id); if (o.active === id) o.active = o.images[0]?.id || null; if (!o.images.length) delete this.S().owners[key];
        this.save();
        try { await fetch('/api/files/delete', { method: 'POST', headers: this.ctx().getRequestHeaders(), body: JSON.stringify({ path: pic.url.replace(/^\//, '') }) }); } catch { /* best effort */ }
    }

    // ---- UI ----
    start() {
        if (this.enabled) return; this.enabled = true;
        if (!this.mod) for (const url of ['/scripts/personas.js', '/script.js']) import(/* @vite-ignore */ url).then(m => { if (m && 'user_avatar' in m && !this.mod) this.mod = m; }).catch(() => {});
        addComposerButton({ id: 'ttk_avatar_button', icon: 'fa-id-badge', label: '프로필 사진', title: '프로필 사진 (봇·내 페르소나)', order: 4, onClick: () => this.open() });
        const c = this.ctx(), ev = c?.eventSource, T = c?.eventTypes || {};
        this.handlers = [[T.USER_MESSAGE_RENDERED, id => { this.stamp(id); this.addMesButtons(); }], [T.CHARACTER_MESSAGE_RENDERED, id => { this.stamp(id); this.addMesButtons(); }],
            [T.CHAT_CHANGED, () => { this.paintAll(); this.addMesButtons(); this.close(); }], [T.MESSAGE_SWIPED, id => { this.stamp(id); this.paint(this.mesEl(id), this.ctx()?.chat?.[id]); }], [T.MESSAGE_UPDATED, id => this.paint(this.mesEl(id), this.ctx()?.chat?.[id])]].filter(h => h[0]);
        for (const [t, f] of this.handlers) ev?.on?.(t, f);
        const chat = document.getElementById('chat');
        if (chat) { this.mo = new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1 && n.matches?.('.mes')) { this.paint(n, this.ctx()?.chat?.[Number(n.getAttribute('mesid'))]); this.addMesButtons(n); } }); this.mo.observe(chat, { childList: true }); }
        this.paintAll(); this.addMesButtons();
    }
    stop() {
        if (!this.enabled) return; this.enabled = false;
        removeComposerButton('ttk_avatar_button');
        const ev = this.ctx()?.eventSource; for (const [t, f] of this.handlers || []) ev?.removeListener?.(t, f);
        this.mo?.disconnect(); this.mo = null; this.close();
        document.querySelectorAll('.ttk_avatar_btn').forEach(b => b.remove());
        document.querySelectorAll('#chat .mes .avatar img[data-ttk-src]').forEach(img => { img.src = img.dataset.ttkSrc; delete img.dataset.ttkSrc; });
    }
    close() { this.drawer?.remove(); this.drawer = null; document.getElementById('form_sheld')?.classList.remove('ttk-av-host'); document.removeEventListener('pointerdown', this.onDown, true); }
    open({ mesId = null } = {}) {
        this.close();
        const host = document.getElementById('form_sheld'); if (!host) return;
        const d = this.drawer = el('div'); d.id = 'ttk-avatar-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', '프로필 사진');
        this.mode = mesId == null || Number.isNaN(mesId) ? null : mesId;
        host.classList.add('ttk-av-host'); this.render(); host.append(d);
        this.onDown = e => { if (this.drawer && !this.drawer.contains(e.target) && !e.target.closest?.('#ttk_avatar_button,.ttk_avatar_btn')) this.close(); };
        setTimeout(() => document.addEventListener('pointerdown', this.onDown, true));
    }
    render() {
        const d = this.drawer; if (!d) return; d.replaceChildren();
        const c = this.ctx(), head = el('div', 'ttk-av-head'); head.append(el('strong', '', this.mode == null ? '프로필 사진' : '이 메시지의 프로필 사진'));
        const x = el('button', 'ttk-av-x', '닫기'); x.type = 'button'; x.addEventListener('click', () => this.close()); head.append(x); d.append(head);
        if (this.mode != null) {
            const msg = c?.chat?.[this.mode], key = msg && this.ownerOf(msg);
            if (!key) { d.append(el('p', 'ttk-av-empty', '이 메시지의 주인을 알 수 없습니다.')); return; }
            d.append(this.group(key, { messageId: this.mode, msg })); return;
        }
        const ch = c?.characters?.[c?.characterId]?.avatar, pk = this.personaKey();
        if (ch) d.append(this.group(`char:${ch}`, {})); else d.append(el('p', 'ttk-av-empty', c?.groupId ? '그룹 채팅에서는 메시지 단위로 바꿔 주세요. (메시지 메뉴의 ID 아이콘)' : '캐릭터가 선택되어 있지 않습니다.'));
        if (pk) d.append(this.group(pk, {})); else d.append(el('p', 'ttk-av-empty', '선택된 페르소나를 찾지 못했습니다.'));
        const all = el('button', 'ttk-av-wide', '이 채팅의 기존 메시지에 지금 기본 사진 적용'); all.type = 'button';
        all.addEventListener('click', async () => { if (!(await confirmAsk('이 채팅의 모든 메시지 사진을 현재 기본 사진으로 바꿉니다. 메시지마다 따로 고른 사진도 덮어씁니다. 계속할까요?'))) return; this.applyAll(); });
        d.append(all);
    }
    /** Re-stamp every message with its own owner's default picture (a message keeps the persona/character it was made with). */
    applyAll() {
        const c = this.ctx(); let n = 0;
        (c?.chat || []).forEach((m, i) => {
            if (m.is_system) return;
            const key = m.extra?.ttk_avatar?.key || (m.is_user ? this.personaKey() : this.charKey(m)), pic = key && this.activeOf(key);
            if (!pic) return;
            m.extra = { ...(m.extra || {}), ttk_avatar: { key, url: pic.url } }; this.paint(this.mesEl(i), m); n++;
        });
        c?.saveChat?.(); window.toastr?.success?.(`메시지 ${n}개에 적용했습니다.`); this.render();
    }
    group(key, { messageId = null, msg = null }) {
        const g = el('section', 'ttk-av-group'), pics = this.list(key), act = this.S().owners[key]?.active;
        g.append(el('h4', '', `${key.startsWith('char:') ? '봇' : '페르소나'} · ${this.ownerLabel(key)}`));
        const grid = el('div', 'ttk-av-grid'), cur = msg?.extra?.ttk_avatar?.url;
        for (const p of pics) {
            const cell = el('div', 'ttk-av-cell'), b = el('button', 'ttk-av-pic'), img = el('img'); b.type = 'button'; img.src = p.url; img.alt = p.name || '프로필 사진'; img.loading = 'lazy'; b.append(img);
            const on = messageId != null ? cur === p.url : act === p.id; if (on) cell.classList.add('ttk-av-on'); b.title = p.name || '';
            b.addEventListener('click', () => {
                if (messageId != null) { msg.extra = { ...(msg.extra || {}), ttk_avatar: { key, url: p.url } }; this.paint(this.mesEl(messageId), msg); this.ctx().saveChat?.(); }
                else { this.S().owners[key].active = p.id; this.save(); }
                this.render();
            });
            cell.append(b);
            if (messageId == null) { const del = el('button', 'ttk-av-del', '×'); del.type = 'button'; del.title = '이 사진 지우기'; del.setAttribute('aria-label', '사진 지우기'); del.addEventListener('click', async () => { if (!(await confirmAsk('이 사진을 목록에서 지우고 서버 파일도 삭제합니다. 이미 이 사진을 쓴 메시지는 기본 이미지로 보일 수 있습니다.', { ok: '지우기', danger: true }))) return; await this.remove(key, p.id); this.render(); }); cell.append(del); }
            grid.append(cell);
        }
        if (messageId != null) {
            const reset = el('button', 'ttk-av-add', '원래대로'); reset.type = 'button'; reset.addEventListener('click', () => { if (msg.extra) delete msg.extra.ttk_avatar; this.paint(this.mesEl(messageId), msg); this.ctx().saveChat?.(); this.render(); }); grid.append(reset);
        }
        const add = el('label', 'ttk-av-add', '+ 사진 추가'), input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
        input.addEventListener('change', async () => { add.classList.add('ttk-av-busy'); await this.upload(key, [...input.files]); this.render(); });
        add.append(input); grid.append(add); g.append(grid);
        if (!pics.length) g.append(el('small', 'ttk-av-hint', '사진을 올리면 기본 사진으로 쓰이고, 새 메시지부터 적용됩니다.'));
        else if (messageId == null) g.append(el('small', 'ttk-av-hint', '사진을 누르면 새 메시지의 기본 사진이 바뀝니다. 이미 있는 메시지는 그대로입니다.'));
        return g;
    }
}
