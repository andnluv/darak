// 브라우저 기본 확인/입력 창(confirm·prompt) 대신 쓰는 자체 창.
// 기본 창은 화면 전체를 멈추고(자동 점검·일부 모바일 브라우저에서 막힘) 디자인도 어울리지 않아 모두 이 창으로 바꿨습니다.

let seq = 0;

/**
 * @param {string} message  줄바꿈(\n)은 그대로 보입니다. HTML은 해석하지 않습니다.
 * @param {{ok?:string, cancel?:string, input?:string|null, danger?:boolean}} [opt]
 *   input이 문자열이면 입력칸이 붙고(기본값), 확인하면 입력한 글자를, 취소하면 null을 돌려줍니다.
 *   input이 없으면 확인=true, 취소=false.
 */
export function ask(message, opt = {}) {
    const { ok = '확인', cancel = '취소', input = null, danger = false } = opt;
    return new Promise(resolve => {
        const d = document.createElement('dialog');
        d.className = 'ttk-ask'; d.id = `ttk-ask-${++seq}`;
        d.setAttribute('aria-modal', 'true');
        const body = document.createElement('div'); body.className = 'ttk-ask-msg'; body.textContent = String(message);
        const field = input === null ? null : Object.assign(document.createElement('input'), { type: 'text', value: String(input), className: 'ttk-ask-input' });
        const bar = document.createElement('div'); bar.className = 'ttk-ask-bar';
        const no = Object.assign(document.createElement('button'), { type: 'button', className: 'ttk-ask-btn', textContent: cancel });
        const yes = Object.assign(document.createElement('button'), { type: 'button', className: `ttk-ask-btn ttk-ask-yes${danger ? ' ttk-ask-danger' : ''}`, textContent: ok });
        bar.append(no, yes); d.append(body); if (field) d.append(field); d.append(bar);
        let done = false;
        const finish = value => { if (done) return; done = true; try { d.close(); } catch { /* already closed */ } d.remove(); resolve(value); };
        const accept = () => finish(field ? field.value : true);
        const reject = () => finish(field ? null : false);
        yes.addEventListener('click', accept); no.addEventListener('click', reject);
        d.addEventListener('cancel', e => { e.preventDefault(); reject(); });          // Esc
        d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === field) { e.preventDefault(); accept(); } });
        d.addEventListener('click', e => { if (e.target === d) reject(); });            // 바깥 눌러 닫기
        document.body.append(d);
        try { d.showModal(); } catch { d.setAttribute('open', ''); }
        (field || (danger ? no : yes)).focus();
        if (field) field.select();
    });
}

export const confirmAsk = (message, opt) => ask(message, opt);
export const inputAsk = (message, initial = '', opt) => ask(message, { ...opt, input: initial });
