// acessibilidade.js — menu "Como você quer ver o sistema?" em TODAS as telas.
// Carregue no <head> SEM defer: as preferências são aplicadas antes de a página aparecer,
// evitando o "pisca" das cores. O botão e o painel são montados quando o HTML termina.
//
// Recursos (salvos neste aparelho, em localStorage):
//   - Cores: originais, saturadas, sépia, invertidas, para daltônicos, alto contraste
//   - Tamanho do texto: 100% a 150%
//   - Espaçamento de texto, fonte mais legível, destacar links, cursor grande,
//     pausar animações, guia de leitura
//   - Ouvir o texto (leitor de voz do navegador) e Libras (VLibras, do governo federal)
(function () {
    const CHAVE = 'pi-acessibilidade';
    const PADRAO = { cores: 'originais', texto: 100, espacamento: false, fonte: false, links: false, cursor: false, animacoes: false, guia: false, libras: false, voz: false };
    const CORES = [
        ['originais', 'Cores originais'], ['saturadas', 'Cores saturadas'], ['sepia', 'Cores de sépia'],
        ['invertidas', 'Cores invertidas'], ['daltonico', 'Cores para daltônicos'], ['contraste', 'Alto contraste']
    ];
    const TAMANHOS = [100, 110, 120, 135, 150];
    const html = document.documentElement;

    function ler() {
        try { return Object.assign({}, PADRAO, JSON.parse(localStorage.getItem(CHAVE) || '{}')); }
        catch (_) { return Object.assign({}, PADRAO); }
    }
    let pref = ler();
    const jaEscolheu = () => { try { return localStorage.getItem(CHAVE) !== null; } catch (_) { return true; } };
    function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(pref)); } catch (_) { /* modo privado */ } }

    // ------------------------------------------------------------ aplicar (antes de pintar a tela)
    function aplicar() {
        CORES.forEach(([c]) => html.classList.remove('a11y-cor-' + c));
        if (pref.cores !== 'originais') html.classList.add('a11y-cor-' + pref.cores);
        html.style.setProperty('--a11y-zoom', String(Number(pref.texto) / 100));
        html.classList.toggle('a11y-zoom', Number(pref.texto) !== 100);
        ['espacamento', 'fonte', 'links', 'cursor', 'animacoes', 'guia'].forEach(k => html.classList.toggle('a11y-' + k, !!pref[k]));
        atualizarPainel();
        guiaLeitura(pref.guia);
        if (pref.libras) carregarVLibras();
        mostrarLibras(pref.libras);
    }

    // Filtro para daltonismo (realça a diferença entre vermelho e verde).
    function filtrosSvg() {
        if (document.getElementById('a11y-filtros')) return;
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('id', 'a11y-filtros'); svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
        svg.innerHTML = '<filter id="a11y-daltonico"><feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/>'
            + '<feComponentTransfer><feFuncR type="linear" slope="1.15"/><feFuncB type="linear" slope="1.25"/></feComponentTransfer></filter>';
        document.body.appendChild(svg);
    }

    // ------------------------------------------------------------ Libras (VLibras)
    let vlibrasPedido = false;
    function carregarVLibras() {
        if (vlibrasPedido || !document.body) return;
        vlibrasPedido = true;
        const caixa = document.createElement('div');
        caixa.setAttribute('vw', ''); caixa.className = 'enabled';
        caixa.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
        document.body.appendChild(caixa);
        const s = document.createElement('script');
        s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
        s.onload = () => {
            try {
                new window.VLibras.Widget('https://vlibras.gov.br/app');
                // O VLibras monta o botão no evento "load"; se a página já carregou, dispara de novo.
                if (document.readyState === 'complete') window.dispatchEvent(new Event('load'));
            } catch (e) { avisoLibras(); }
        };
        s.onerror = avisoLibras;
        document.body.appendChild(s);
    }
    function mostrarLibras(ligado) {
        const caixa = document.querySelector('div[vw]');
        if (caixa) caixa.style.display = ligado ? '' : 'none';
    }
    function avisoLibras() {
        const el = document.getElementById('a11yLibrasAviso');
        if (el) { el.hidden = false; el.textContent = 'Não foi possível carregar o VLibras agora. Verifique a internet e tente de novo.'; }
        vlibrasPedido = false;
    }

    // ------------------------------------------------------------ guia de leitura
    let guia = null;
    function moverGuia(e) { if (guia) guia.style.top = (e.clientY - 22) + 'px'; }
    function guiaLeitura(ligar) {
        if (!document.body) return;
        if (ligar && !guia) {
            guia = document.createElement('div'); guia.className = 'a11y-guia'; guia.setAttribute('aria-hidden', 'true');
            document.body.appendChild(guia);
            document.addEventListener('mousemove', moverGuia, { passive: true });
        } else if (!ligar && guia) {
            guia.remove(); guia = null; document.removeEventListener('mousemove', moverGuia);
        }
    }

    // ------------------------------------------------------------ ouvir o texto
    function falar(texto) {
        if (!('speechSynthesis' in window) || !texto) return false;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(texto.slice(0, 4000));
        u.lang = 'pt-BR'; u.rate = 1;
        const voz = window.speechSynthesis.getVoices().find(v => /pt(-|_)BR/i.test(v.lang));
        if (voz) u.voice = voz;
        window.speechSynthesis.speak(u);
        return true;
    }
    function textoParaLer() {
        const sel = String(window.getSelection ? window.getSelection() : '').trim();
        if (sel) return sel;
        const tela = [...document.querySelectorAll('main section, .main-content section')].find(s => s.offsetParent !== null);
        const alvo = tela || document.querySelector('main, .main-content, form') || document.body;
        return alvo.innerText.replace(/\s+/g, ' ').trim();
    }
    // Com "ouvir ao passar/tocar" ligado, lê o botão, link ou campo em que a pessoa clicar.
    document.addEventListener('focusin', e => {
        if (!pref.voz) return;
        const el = e.target.closest('button, a, input, select, textarea, [role=button]');
        if (!el || el.closest('.a11y-painel')) return;
        const rotulo = el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.innerText || el.placeholder || el.value || '';
        if (rotulo.trim()) falar(rotulo.trim());
    });

    // ------------------------------------------------------------ painel
    const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ICONE = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.2" r="1.8"/><path d="M4 8.2c2.6.9 5.3 1.3 8 1.3s5.4-.4 8-1.3"/><path d="M12 9.5v4.5"/><path d="m8.5 21 3.5-7 3.5 7"/></svg>';
    let botao = null, painel = null, ultimoFoco = null;

    function opcoesHtml() {
        const sw = (k, titulo, desc) => `<label class="a11y-chave"><input type="checkbox" data-pref="${k}"><span class="a11y-trilho" aria-hidden="true"></span><span><strong>${titulo}</strong><small>${desc}</small></span></label>`;
        return `
        <fieldset class="a11y-grupo"><legend>Cores</legend>
            <div class="a11y-lista">${CORES.map(([v, t]) => `<button type="button" class="a11y-opcao" data-cores="${v}" aria-pressed="false"><span class="a11y-amostra a11y-amostra-${v}" aria-hidden="true"></span>${t}</button>`).join('')}</div>
        </fieldset>
        <fieldset class="a11y-grupo"><legend>Tamanho do texto</legend>
            <div class="a11y-tamanhos">${TAMANHOS.map(t => `<button type="button" class="a11y-opcao" data-texto="${t}" aria-pressed="false" aria-label="Texto em ${t}%"><span style="font-size:${12 + (t - 100) / 6}px">A</span> ${t}%</button>`).join('')}</div>
        </fieldset>
        <fieldset class="a11y-grupo"><legend>Leitura</legend>
            ${sw('espacamento', 'Espaçar o texto', 'Mais espaço entre letras, palavras e linhas')}
            ${sw('fonte', 'Fonte mais legível', 'Letras simples, sem itálico')}
            ${sw('links', 'Destacar links e botões', 'Sublinha links e reforça o contorno do que tem foco')}
            ${sw('guia', 'Guia de leitura', 'Uma faixa acompanha o mouse para não se perder na linha')}
            ${sw('cursor', 'Cursor grande', 'Seta do mouse maior e mais visível')}
            ${sw('animacoes', 'Pausar animações', 'Remove movimentos e transições da tela')}
        </fieldset>
        <fieldset class="a11y-grupo"><legend>Ouvir e Libras</legend>
            ${sw('libras', 'Tradução em Libras (VLibras)', 'Abre o intérprete virtual do Governo Federal; clique em um texto para traduzir')}
            <p class="a11y-aviso" id="a11yLibrasAviso" hidden></p>
            ${sw('voz', 'Ler o que eu tocar', 'O navegador fala o nome do botão, link ou campo selecionado')}
            <button type="button" class="a11y-acao" data-acao="ouvir">${'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>'} Ouvir esta tela (ou o texto selecionado)</button>
            <button type="button" class="a11y-acao" data-acao="parar">Parar a leitura</button>
        </fieldset>`;
    }

    function montar() {
        filtrosSvg();
        // "Pular para o conteúdo": primeiro item do teclado em toda tela.
        const alvo = document.querySelector('main, .main-content, form');
        if (alvo && !document.querySelector('.a11y-pular')) {
            if (!alvo.id) alvo.id = 'conteudo-principal';
            if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
            const pular = document.createElement('a');
            pular.href = '#' + alvo.id; pular.className = 'a11y-pular'; pular.textContent = 'Pular para o conteúdo';
            document.body.prepend(pular);
        }

        botao = document.createElement('button');
        botao.type = 'button'; botao.className = 'a11y-botao';
        botao.setAttribute('aria-label', 'Acessibilidade: cores, tamanho do texto e Libras');
        botao.setAttribute('aria-haspopup', 'dialog'); botao.setAttribute('aria-expanded', 'false');
        botao.title = 'Acessibilidade (Alt + A)';
        botao.innerHTML = ICONE;
        document.body.appendChild(botao);

        painel = document.createElement('div');
        painel.className = 'a11y-painel'; painel.hidden = true;
        painel.setAttribute('role', 'dialog'); painel.setAttribute('aria-modal', 'true'); painel.setAttribute('aria-labelledby', 'a11yTitulo');
        painel.innerHTML = `<div class="a11y-caixa">
            <div class="a11y-topo"><div><h2 id="a11yTitulo">Como você quer ver o sistema?</h2><p>As escolhas ficam salvas neste aparelho.</p></div>
            <button type="button" class="a11y-fechar" aria-label="Fechar">&times;</button></div>
            <div class="a11y-corpo">${opcoesHtml()}</div>
            <div class="a11y-rodape"><button type="button" class="a11y-restaurar">Voltar ao padrão</button><button type="button" class="a11y-pronto">Pronto</button></div></div>`;
        document.body.appendChild(painel);

        botao.addEventListener('click', () => abrir());
        painel.addEventListener('click', e => {
            if (e.target === painel || e.target.closest('.a11y-fechar') || e.target.closest('.a11y-pronto')) return fechar();
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.cores) { pref.cores = b.dataset.cores; mudou(); }
            else if (b.dataset.texto) { pref.texto = Number(b.dataset.texto); mudou(); }
            else if (b.classList.contains('a11y-restaurar')) { pref = Object.assign({}, PADRAO); mudou(); falar(''); }
            else if (b.dataset.acao === 'ouvir') { if (!falar(textoParaLer())) b.textContent = 'Seu navegador não tem leitura em voz'; }
            else if (b.dataset.acao === 'parar' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        });
        painel.addEventListener('change', e => {
            const k = e.target.dataset.pref;
            if (k) { pref[k] = e.target.checked; mudou(); }
        });
        painel.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); fechar(); }
            if (e.key === 'Tab') { // mantém o foco dentro do painel
                const f = [...painel.querySelectorAll('button, input')].filter(x => x.offsetParent !== null);
                if (!f.length) return;
                if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
                else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
            }
        });
        document.addEventListener('keydown', e => {
            if (e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); painel.hidden ? abrir() : fechar(); }
        });
        aplicar();
        // As telas definem mostrarTela no próprio script, que roda depois deste: espera tudo carregar.
        window.addEventListener('load', prepararLeitorDeTela);

        // Na tela de login, na primeira visita deste aparelho, pergunta como a pessoa quer ver.
        if (document.body.dataset.a11yBoasVindas !== undefined && !jaEscolheu()) abrir(true);
    }

    // ------------------------------------------------------------ leitor de tela (NVDA, TalkBack, VoiceOver)
    // Ajustes gerais que valem para todas as telas, sem mudar nada no visual.
    function ocultarIcones(raiz) {
        // Ícones decorativos (Font Awesome) não devem ser lidos como símbolos estranhos.
        (raiz.querySelectorAll ? raiz : document).querySelectorAll('i.fas, i.far, i.fab, i.fa, i[class*="fa-"]').forEach(i => {
            if (!i.hasAttribute('aria-hidden') && !i.getAttribute('aria-label')) i.setAttribute('aria-hidden', 'true');
        });
    }
    function prepararLeitorDeTela() {
        ocultarIcones(document);
        new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) ocultarIcones(n); })))
            .observe(document.body, { childList: true, subtree: true });
        const aside = document.querySelector('aside.sidebar');
        if (aside && !aside.getAttribute('aria-label')) aside.setAttribute('aria-label', 'Menu principal');
        const navbar = document.querySelector('.navbar');
        if (navbar && !navbar.getAttribute('aria-label')) navbar.setAttribute('aria-label', 'Barra superior');
        // Aviso falado quando a tela muda (as telas do painel trocam sem recarregar a página).
        const anuncio = document.createElement('div');
        anuncio.className = 'a11y-anuncio'; anuncio.setAttribute('role', 'status'); anuncio.setAttribute('aria-live', 'polite');
        document.body.appendChild(anuncio);
        if (typeof window.mostrarTela === 'function' && !window.mostrarTela.a11y) {
            const original = window.mostrarTela;
            const nova = function (id) {
                const r = original.apply(this, arguments);
                const secao = document.getElementById(id);
                const titulo = secao && secao.querySelector('h1, h2');
                if (titulo) {
                    if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
                    try { titulo.focus({ preventScroll: false }); } catch (_) { titulo.focus(); }
                    anuncio.textContent = ''; setTimeout(() => { anuncio.textContent = 'Tela: ' + titulo.innerText.trim(); }, 60);
                }
                document.querySelectorAll('aside.sidebar a').forEach(a => {
                    const alvo = (a.getAttribute('onclick') || '').match(/mostrarTela\('([^']+)'\)/);
                    if (alvo) { if (alvo[1] === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
                });
                return r;
            };
            nova.a11y = true;
            window.mostrarTela = nova;
        }
    }

    function mudou() { salvar(); aplicar(); }

    function atualizarPainel() {
        if (!painel) return;
        painel.querySelectorAll('[data-cores]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cores === pref.cores)));
        painel.querySelectorAll('[data-texto]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.texto) === Number(pref.texto))));
        painel.querySelectorAll('[data-pref]').forEach(i => { i.checked = !!pref[i.dataset.pref]; });
    }

    function abrir(boasVindas) {
        ultimoFoco = document.activeElement;
        painel.hidden = false; botao.setAttribute('aria-expanded', 'true');
        painel.classList.toggle('a11y-boas-vindas', !!boasVindas);
        atualizarPainel();
        const marcado = painel.querySelector('[data-cores][aria-pressed="true"]') || painel.querySelector('button');
        setTimeout(() => marcado.focus(), 30);
    }
    function fechar() {
        painel.hidden = true; botao.setAttribute('aria-expanded', 'false');
        if (!jaEscolheu()) salvar(); // fechou sem mudar: não pergunta de novo
        if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus(); else botao.focus();
    }

    aplicar();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
    window.PIAcessibilidade = { abrir: () => painel && abrir(), preferencias: () => Object.assign({}, pref) };
})();
