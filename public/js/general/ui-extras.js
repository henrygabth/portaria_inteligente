// ui-extras.js
// Recursos de interface compartilhados por todas as telas:
//   1) Botão "ver senha" (olhinho) em todo campo de senha.
//   2) Máscaras automáticas: CPF, telefone, matrícula (RM) e CEP.
// Basta incluir este script; ele age sozinho nos campos já existentes (e nos que
// forem criados depois). Para forçar uma máscara em outro campo, use data-mask="cpf|telefone|rm|cep".

(function () {
    // ---------- Formatadores ----------
    const apenasDigitos = (v) => String(v ?? '').replace(/\D/g, '');

    function formatarCPF(v) {
        const d = apenasDigitos(v).slice(0, 11);
        if (d.length <= 3) return d;
        if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
        if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }

    function formatarTelefone(v) {
        let d = apenasDigitos(v);
        if (d.length > 11 && d.startsWith('55')) d = d.slice(2); // +55 colado
        d = d.slice(0, 11);
        if (d.length === 0) return '';
        if (d.length <= 2) return `(${d}`;
        if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
        if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }

    function formatarCEP(v) {
        const d = apenasDigitos(v).slice(0, 8);
        return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    }

    function formatarRM(v) {
        return apenasDigitos(v).slice(0, 10);
    }

    const MASCARAS = { cpf: formatarCPF, telefone: formatarTelefone, cep: formatarCEP, rm: formatarRM };

    // Descobre a máscara pelo data-mask ou pelo id/name do campo (cpfResponsavel, telefone...).
    function tipoDaMascara(input) {
        const explicito = (input.dataset.mask || '').toLowerCase();
        if (MASCARAS[explicito]) return explicito;
        if (input.type === 'password' || input.type === 'email') return null;
        const chave = `${input.id} ${input.name}`.toLowerCase();
        if (/cpf/.test(chave)) return 'cpf';
        if (/telefone|celular|fone/.test(chave)) return 'telefone';
        if (/\bcep\b|^cep/.test(chave)) return 'cep';
        if (/^rm|\brm[a-z_]*\b/.test(chave) && !/filtro/.test(chave)) return 'rm';
        return null;
    }

    function aplicarMascara(input, tipo) {
        const novo = MASCARAS[tipo](input.value);
        if (novo !== input.value) input.value = novo;
    }

    function prepararMascara(input) {
        if (input.dataset.maskPronto) return;
        const tipo = tipoDaMascara(input);
        if (!tipo) return;
        input.dataset.maskPronto = tipo;

        // type="number" não aceita formatação; passa a texto só com teclado numérico.
        if (input.type === 'number') input.type = 'text';
        input.setAttribute('inputmode', 'numeric');
        if (tipo === 'cpf') { input.maxLength = 14; input.placeholder = input.placeholder || '000.000.000-00'; input.autocomplete = 'off'; }
        if (tipo === 'telefone') { input.maxLength = 15; input.placeholder = input.placeholder || '(00) 00000-0000'; input.setAttribute('inputmode', 'tel'); }
        if (tipo === 'cep') input.maxLength = 9;

        input.addEventListener('input', () => aplicarMascara(input, tipo));
        input.addEventListener('paste', () => setTimeout(() => aplicarMascara(input, tipo), 0));

        // Valores preenchidos por código (ex.: dados do perfil vindos da API)
        // são formatados também: monitora a propriedade .value do campo.
        const proto = Object.getPrototypeOf(input);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value') ||
                     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (desc && desc.set) {
            Object.defineProperty(input, 'value', {
                configurable: true,
                get() { return desc.get.call(this); },
                set(v) { desc.set.call(this, MASCARAS[tipo](v)); }
            });
        }
        if (input.value) aplicarMascara(input, tipo);
    }

    // ---------- Ver senha ----------
    const ICONE_OLHO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    const ICONE_OLHO_RISCADO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a19.7 19.7 0 0 1-3.17 4.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    function prepararSenha(input) {
        if (input.dataset.olhoPronto || input.type !== 'password') return;
        input.dataset.olhoPronto = '1';

        const wrap = document.createElement('span');
        wrap.className = 'ui-senha-wrap';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        input.classList.add('ui-senha-input');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ui-senha-olho';
        btn.setAttribute('aria-label', 'Mostrar senha');
        btn.title = 'Mostrar senha';
        btn.innerHTML = ICONE_OLHO;
        btn.addEventListener('click', () => {
            const mostrando = input.type === 'text';
            input.type = mostrando ? 'password' : 'text';
            btn.innerHTML = mostrando ? ICONE_OLHO : ICONE_OLHO_RISCADO;
            const rotulo = mostrando ? 'Mostrar senha' : 'Ocultar senha';
            btn.setAttribute('aria-label', rotulo);
            btn.title = rotulo;
            input.focus();
        });
        wrap.appendChild(btn);
    }

    function injetarEstilo() {
        if (document.getElementById('ui-extras-css')) return;
        const css = document.createElement('style');
        css.id = 'ui-extras-css';
        css.textContent = `
            .ui-senha-wrap { position: relative; display: block; width: 100%; }
            .ui-senha-wrap .ui-senha-input { padding-right: 44px !important; }
            .ui-senha-olho {
                position: absolute; top: 50%; right: 8px; transform: translateY(-50%);
                width: 32px !important; height: 32px !important; min-width: 0; padding: 0 !important; margin: 0;
                display: flex; align-items: center; justify-content: center;
                background: transparent !important; border: none !important; box-shadow: none !important;
                color: #64748b; cursor: pointer; border-radius: 6px;
            }
            .ui-senha-olho:hover { color: #0052cc; background: rgba(0, 82, 204, 0.08) !important; }
            .ui-senha-olho:focus-visible { outline: 2px solid #0052cc; outline-offset: 1px; }
        `;
        document.head.appendChild(css);
    }

    function varrer(raiz) {
        (raiz || document).querySelectorAll('input').forEach((input) => {
            prepararSenha(input);
            prepararMascara(input);
        });
    }

    function iniciar() {
        injetarEstilo();
        varrer(document);
        // Campos criados depois (modais, tabelas montadas por JS)
        new MutationObserver((muts) => {
            for (const m of muts) {
                m.addedNodes.forEach((n) => {
                    if (n.nodeType !== 1) return;
                    if (n.tagName === 'INPUT') { prepararSenha(n); prepararMascara(n); }
                    else if (n.querySelectorAll) varrer(n);
                });
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();

    window.UIExtras = { formatarCPF, formatarTelefone, formatarCEP };
})();
