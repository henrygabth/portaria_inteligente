// privacidade.js — cartões da "Minha Conta": avisos no celular (push) e privacidade/LGPD
// (baixar meus dados, excluir minha conta). Aparece onde houver <div data-privacidade></div>.
(function () {
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const token = () => localStorage.getItem('token');
    const usuario = () => { try { return JSON.parse(localStorage.getItem('usuario') || '{}'); } catch (_) { return {}; } };
    const ehResponsavel = () => ['PAI', 'RESPONSAVEL'].includes(String(usuario().tipo_usuario || '').toUpperCase());

    const TEXTO_PUSH = {
        ativo: ['Ligados neste aparelho', 'Você recebe os avisos mesmo com o sistema fechado.'],
        inativo: ['Desligados neste aparelho', 'Ative para saber na hora quando houver novidade.'],
        negado: ['Bloqueados pelo navegador', 'Libere as notificações deste site nas configurações do navegador e tente de novo.'],
        'instalar-ios': ['Instale o app primeiro', 'No iPhone, toque em Compartilhar → "Adicionar à Tela de Início" e abra o sistema pelo ícone.'],
        indisponivel: ['Indisponível neste navegador', 'Use o Chrome, Edge, Firefox ou Safari atualizado (com o site em https).']
    };

    function montar(caixa) {
        const avisos = ehResponsavel()
            ? 'Saída aprovada ou recusada, quando seu filho sair e voltar, atrasos e mensagens da secretaria.'
            : 'Novas solicitações, atrasos no retorno, alertas da portaria e mensagens.';
        caixa.innerHTML = `
            <div class="card recurso-card">
                <h2><i class="fas fa-mobile-screen" aria-hidden="true"></i> Avisos no celular</h2>
                <p class="tela-intro">${esc(avisos)}</p>
                <p class="push-estado" id="pushEstado" role="status" aria-live="polite">Verificando...</p>
                <div class="recurso-botoes">
                    <button type="button" class="btn-importar" id="pushLigar" hidden><i class="fas fa-bell" aria-hidden="true"></i> Ativar avisos</button>
                    <button type="button" class="btn-filtro secundario" id="pushTestar" hidden>Enviar um teste</button>
                    <button type="button" class="btn-filtro secundario" id="pushDesligar" hidden>Desligar</button>
                </div>
            </div>
            <div class="card recurso-card">
                <h2><i class="fas fa-user-shield" aria-hidden="true"></i> Privacidade e seus dados</h2>
                <p class="tela-intro">Seus dados são usados só para a segurança dos alunos. Veja os detalhes na <a href="politica-privacidade.html" target="_blank" rel="noopener">política de privacidade<span class="sr-only"> (abre em nova aba)</span></a>.</p>
                <div class="recurso-botoes">
                    <button type="button" class="btn-filtro secundario" id="lgpdBaixar"><i class="fas fa-download" aria-hidden="true"></i> Baixar meus dados</button>
                    ${ehResponsavel() ? '<button type="button" class="btn-perigo" id="lgpdExcluir"><i class="fas fa-user-xmark" aria-hidden="true"></i> Excluir minha conta</button>' : ''}
                </div>
                ${ehResponsavel() ? '' : '<p class="tela-intro">Contas da equipe da escola são encerradas pela administração.</p>'}
                <p class="erro-texto" id="lgpdMsg" role="alert"></p>
            </div>`;
        ligarPush(caixa);
        caixa.querySelector('#lgpdBaixar').addEventListener('click', baixarDados);
        const excluir = caixa.querySelector('#lgpdExcluir');
        if (excluir) excluir.addEventListener('click', confirmarExclusao);
    }

    async function ligarPush(caixa) {
        const estado = caixa.querySelector('#pushEstado');
        const [ligar, testar, desligar] = ['#pushLigar', '#pushTestar', '#pushDesligar'].map(s => caixa.querySelector(s));
        const atualizar = async () => {
            const st = window.PIPush ? await PIPush.estado() : 'indisponivel';
            const [titulo, texto] = TEXTO_PUSH[st] || TEXTO_PUSH.indisponivel;
            estado.className = `push-estado push-${st}`;
            estado.innerHTML = `<strong>${esc(titulo)}.</strong> ${esc(texto)}`;
            ligar.hidden = st !== 'inativo';
            testar.hidden = desligar.hidden = st !== 'ativo';
        };
        const agir = async (fn) => {
            try { const r = await fn(); if (r && r.mensagem) estado.insertAdjacentHTML('beforeend', ` <em>${esc(r.mensagem)}</em>`); }
            catch (err) { estado.innerHTML = `<strong>Não deu certo.</strong> ${esc(err.message)}`; return; }
            const extra = estado.querySelector('em') ? estado.querySelector('em').outerHTML : '';
            await atualizar(); if (extra) estado.insertAdjacentHTML('beforeend', ' ' + extra);
        };
        ligar.addEventListener('click', () => agir(() => PIPush.ativar()));
        desligar.addEventListener('click', () => agir(() => PIPush.desativar()));
        testar.addEventListener('click', () => agir(() => PIPush.testar()));
        atualizar();
    }

    async function baixarDados() {
        const msg = document.getElementById('lgpdMsg'); msg.textContent = '';
        try {
            const r = await fetch('/api/usuarios/meus-dados', { headers: { Authorization: `Bearer ${token()}` } });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não foi possível gerar o arquivo.');
            const url = URL.createObjectURL(await r.blob());
            const a = Object.assign(document.createElement('a'), { href: url, download: 'meus-dados-portaria-inteligente.json' });
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) { msg.textContent = err.message; }
    }

    function confirmarExclusao() {
        const fundo = document.createElement('div');
        fundo.className = 'modal-recurso';
        fundo.innerHTML = `<div class="modal-recurso-caixa" role="dialog" aria-modal="true" aria-labelledby="exclTitulo">
            <button type="button" class="modal-recurso-fechar" aria-label="Fechar">&times;</button>
            <h2 id="exclTitulo"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Excluir minha conta</h2>
            <p class="tela-intro">Seu nome, CPF, e-mail, telefone, mensagens e horários fixos serão <strong>apagados</strong> e você não poderá mais entrar nem pedir saídas. O histórico de saídas dos alunos continua com a escola, <strong>sem identificar você</strong>, por segurança dos alunos.</p>
            <p class="tela-intro">Dica: antes, use “Baixar meus dados” se quiser guardar uma cópia.</p>
            <form id="exclForm" novalidate>
                <div class="form-field"><label for="exclSenha">Sua senha</label><input type="password" id="exclSenha" autocomplete="current-password" required></div>
                <div class="form-field"><label for="exclPalavra">Digite <strong>EXCLUIR</strong> para confirmar</label><input type="text" id="exclPalavra" autocomplete="off" required></div>
                <p class="erro-texto" id="exclErro" role="alert"></p>
                <div class="importar-botoes"><button type="button" class="btn-filtro secundario" id="exclCancelar">Cancelar</button><button type="submit" class="btn-perigo">Excluir definitivamente</button></div>
            </form></div>`;
        document.body.appendChild(fundo);
        const fechar = () => fundo.remove();
        fundo.addEventListener('click', e => { if (e.target === fundo || e.target.closest('.modal-recurso-fechar') || e.target.id === 'exclCancelar') fechar(); });
        fundo.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
        fundo.querySelector('#exclForm').addEventListener('submit', async e => {
            e.preventDefault();
            const erro = fundo.querySelector('#exclErro');
            try {
                const r = await fetch('/api/usuarios/excluir-conta', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                    body: JSON.stringify({ senha: fundo.querySelector('#exclSenha').value, confirmacao: fundo.querySelector('#exclPalavra').value.trim().toUpperCase() })
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) { erro.textContent = d.erro || 'Não foi possível excluir.'; return; }
                if (window.PIPush) await PIPush.desativar().catch(() => {});
                ['token', 'usuario', 'pi-dispositivo'].forEach(k => localStorage.removeItem(k));
                alert(d.mensagem);
                location.href = 'login.html';
            } catch (_) { erro.textContent = 'Erro de conexão com o servidor.'; }
        });
        fundo.querySelector('#exclSenha').focus();
    }

    document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-privacidade]').forEach(montar));
})();
