// dialogo.js — janelas de confirmação e aviso no visual do sistema, no lugar das caixas
// cinzas do navegador ("portaria-inteligente.onrender.com diz...").
//
//   await PIDialogo.confirmar({ titulo, texto, ok: 'Aprovar', tipo: 'sucesso' | 'perigo' | 'normal' })  -> true/false
//   await PIDialogo.avisar('Texto', { titulo, tipo: 'sucesso' | 'erro' | 'info' })                      -> fecha no OK
//   await PIDialogo.pedirTexto({ titulo, texto, rotulo, maximo })                                       -> texto ou null
//
// Carregado no <head> de todas as telas. window.alert também passa a usar esta janela.
(function () {
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ICONES = {
        sucesso: 'fa-circle-check', erro: 'fa-circle-exclamation', perigo: 'fa-triangle-exclamation',
        info: 'fa-circle-info', normal: 'fa-circle-question'
    };
    const fila = [];
    let aberto = false;

    // Adivinha o tipo pelo texto quando quem chamou não informou (ex.: mensagens antigas "Erro: ...").
    function tipoPeloTexto(t) {
        const s = String(t || '').toLowerCase();
        if (/^erro|falha|não foi possível|nao foi possivel|inválid|invalid|expirad/.test(s)) return 'erro';
        if (/sucesso|enviad[oa]|atualizad[oa]|registrad[oa]|aprovad[oa]|liberad[oa]|criad[oa]|removid[oa]/.test(s)) return 'sucesso';
        return 'info';
    }
    const TITULOS = { sucesso: 'Pronto!', erro: 'Atenção', info: 'Aviso', perigo: 'Confirme', normal: 'Confirme' };

    function abrir(montar) {
        return new Promise(resolve => {
            fila.push({ montar, resolve });
            if (!aberto) proximo();
        });
    }

    function proximo() {
        const item = fila.shift();
        if (!item) { aberto = false; return; }
        aberto = true;
        const anterior = document.activeElement;
        const fundo = document.createElement('div');
        fundo.className = 'pi-dialogo-fundo';
        const { html, foco, valor, aoMontar } = item.montar();
        fundo.innerHTML = html;
        (document.body || document.documentElement).appendChild(fundo);
        const caixa = fundo.querySelector('.pi-dialogo');

        const fechar = resultado => {
            fundo.remove();
            document.removeEventListener('keydown', tecla, true);
            if (anterior && anterior.focus && document.contains(anterior)) { try { anterior.focus(); } catch (_) { /* ignora */ } }
            item.resolve(resultado);
            setTimeout(proximo, 0);
        };
        const tecla = e => {
            if (e.key === 'Escape') { e.preventDefault(); fechar(valor('cancelar')); }
            if (e.key === 'Tab') { // foco preso dentro da janela
                const f = [...caixa.querySelectorAll('button, input, textarea')].filter(x => !x.disabled);
                if (!f.length) return;
                if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
                else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
            }
        };
        document.addEventListener('keydown', tecla, true);
        fundo.addEventListener('click', e => {
            const b = e.target.closest('[data-acao]');
            if (b) {
                const r = valor(b.dataset.acao, caixa);
                if (r !== undefined) fechar(r);
            } else if (e.target === fundo) fechar(valor('cancelar'));
        });
        if (aoMontar) aoMontar(caixa, fechar, valor);
        const alvo = caixa.querySelector(foco);
        setTimeout(() => (alvo || caixa).focus(), 20);
    }

    function cabecalho(tipo, titulo, texto, idTitulo) {
        return `<div class="pi-dialogo-icone pi-dialogo-${tipo}" aria-hidden="true"><i class="fas ${ICONES[tipo] || ICONES.info}"></i></div>
            <h2 id="${idTitulo}">${esc(titulo)}</h2>
            ${texto ? `<p class="pi-dialogo-texto">${esc(texto).replace(/\n/g, '<br>')}</p>` : ''}`;
    }

    function confirmar(opcoes = {}) {
        if (typeof opcoes === 'string') opcoes = { texto: opcoes };
        const tipo = opcoes.tipo || 'normal';
        return abrir(() => ({
            html: `<div class="pi-dialogo" role="alertdialog" aria-modal="true" aria-labelledby="piDlgTitulo" aria-describedby="piDlgTexto" tabindex="-1">
                ${cabecalho(tipo, opcoes.titulo || TITULOS[tipo], opcoes.texto, 'piDlgTitulo').replace('class="pi-dialogo-texto"', 'class="pi-dialogo-texto" id="piDlgTexto"')}
                <div class="pi-dialogo-botoes">
                    <button type="button" class="pi-dialogo-btn pi-dialogo-secundario" data-acao="cancelar">${esc(opcoes.cancelar || 'Cancelar')}</button>
                    <button type="button" class="pi-dialogo-btn pi-dialogo-${tipo === 'perigo' ? 'perigo' : tipo === 'sucesso' ? 'sucesso' : 'principal'}" data-acao="ok">${esc(opcoes.ok || 'Confirmar')}</button>
                </div></div>`,
            // Ação que apaga ou bloqueia algo: o foco começa no "Cancelar" (Enter sem querer não confirma).
            foco: tipo === 'perigo' ? '[data-acao="cancelar"]' : '[data-acao="ok"]',
            valor: acao => acao === 'ok'
        }));
    }

    function avisar(texto, opcoes = {}) {
        const tipo = opcoes.tipo || tipoPeloTexto(texto);
        return abrir(() => ({
            html: `<div class="pi-dialogo" role="${tipo === 'erro' ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="piDlgTitulo" aria-describedby="piDlgTexto" tabindex="-1">
                ${cabecalho(tipo, opcoes.titulo || TITULOS[tipo], texto, 'piDlgTitulo').replace('class="pi-dialogo-texto"', 'class="pi-dialogo-texto" id="piDlgTexto"')}
                <div class="pi-dialogo-botoes"><button type="button" class="pi-dialogo-btn pi-dialogo-principal" data-acao="ok">${esc(opcoes.ok || 'OK')}</button></div></div>`,
            foco: '[data-acao="ok"]',
            valor: () => true
        }));
    }

    function pedirTexto(opcoes = {}) {
        const maximo = opcoes.maximo || 500;
        return abrir(() => ({
            html: `<div class="pi-dialogo" role="dialog" aria-modal="true" aria-labelledby="piDlgTitulo" tabindex="-1">
                ${cabecalho(opcoes.tipo || 'normal', opcoes.titulo || 'Informe', opcoes.texto, 'piDlgTitulo')}
                <label class="pi-dialogo-rotulo" for="piDlgCampo">${esc(opcoes.rotulo || 'Motivo')}</label>
                <textarea id="piDlgCampo" class="pi-dialogo-campo" rows="3" maxlength="${maximo}" aria-describedby="piDlgErro"></textarea>
                <p class="pi-dialogo-erro" id="piDlgErro" role="alert"></p>
                <div class="pi-dialogo-botoes">
                    <button type="button" class="pi-dialogo-btn pi-dialogo-secundario" data-acao="cancelar">${esc(opcoes.cancelar || 'Voltar')}</button>
                    <button type="button" class="pi-dialogo-btn pi-dialogo-${opcoes.tipo === 'perigo' ? 'perigo' : 'principal'}" data-acao="ok">${esc(opcoes.ok || 'Confirmar')}</button>
                </div></div>`,
            foco: '#piDlgCampo',
            valor: (acao, caixa) => {
                if (acao !== 'ok') return null;
                const v = caixa.querySelector('#piDlgCampo').value.trim();
                if (!v) { caixa.querySelector('#piDlgErro').textContent = opcoes.erroVazio || 'Este campo é obrigatório.'; caixa.querySelector('#piDlgCampo').focus(); return undefined; }
                return v;
            }
        }));
    }

    window.PIDialogo = { confirmar, avisar, pedirTexto };
    // Qualquer alert() que ainda exista no sistema também aparece no visual do sistema.
    window.alert = texto => { avisar(texto); };
})();
