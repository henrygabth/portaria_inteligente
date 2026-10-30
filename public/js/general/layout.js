// layout.js — comportamento padrão de navbar + sidebar para as telas "avulsas"
// (professor, professores e turmas, minha conta). Faz o mesmo que home/secretaria/portaria:
//   - monta a sidebar do perfil logado (<aside id="sidebar" data-sidebar-auto>), com os
//     MESMOS itens do painel de origem, para que a tela avulsa fique idêntica às demais;
//   - botão do menu abre/fecha a sidebar e empurra o conteúdo;
//   - botão de tema alterna claro/escuro (ícone lua/sol) e salva a escolha;
//   - logout().
// ATENÇÃO: se um item for criado/removido na sidebar de home.html, secretaria.html,
// portaria.html ou professor.html, atualize também a lista MENUS abaixo.
(function () {
    // [ícone, texto, página, tela dentro da página (ou null), somente ADMIN]
    const SECRETARIA = [
        ['fa-th-large', 'Início', 'secretaria.html', 'tela-inicio'],
        ['fa-chart-line', 'Painel', 'secretaria.html', 'tela-painel'],
        ['fa-bell', 'Solicitações', 'secretaria.html', 'tela-solicitacoes'],
        ['fa-user-plus', 'Vincular Responsável', 'secretaria.html', 'tela-vincular'],
        ['fa-user-graduate', 'Gerenciar Alunos', 'secretaria.html', 'tela-alunos'],
        ['fa-users-gear', 'Gerenciar Perfis', 'secretaria.html', 'tela-perfis'],
        ['fa-chalkboard-user', 'Professores e Turmas', 'professores-admin.html', null, true],
        ['fa-history', 'Histórico', 'secretaria.html', 'tela-historico'],
        ['fa-arrow-right-arrow-left', 'Trocar de Painel', 'selecionar-painel.html', null, true]
    ];
    const PORTARIA = [
        ['fa-id-card', 'Início', 'portaria.html', 'tela-inicio'],
        ['fa-door-open', 'Saídas', 'portaria.html', 'tela-saidas'],
        ['fa-undo', 'Registrar Retorno', 'portaria.html', 'tela-retorno'],
        ['fa-clipboard-list', 'Histórico', 'portaria.html', 'tela-historico']
    ];
    const PROFESSOR = [
        ['fa-chalkboard-user', 'Minhas Turmas', 'professor.html', 'tela-painel'],
        ['fa-bell', 'Comunicados', 'professor.html', 'tela-comunicados'],
        ['fa-user', 'Minha Conta', 'conta.html', null]
    ];
    const RESPONSAVEL = [
        ['fa-home', 'Início', 'home.html', 'tela-inicio'],
        ['fa-plus-circle', 'Criar Solicitação', 'home.html', 'tela-criar'],
        ['fa-redo', 'Pedidos Recorrentes', 'home.html', 'tela-recorrentes'],
        ['fa-list-alt', 'Histórico', 'home.html', 'tela-historico'],
        ['fa-user-circle', 'Minha Conta', 'home.html', 'tela-conta']
    ];
    const MENUS = {
        ADMIN: SECRETARIA, SECRETARIA, PORTARIA, PORTEIRO: PORTARIA, PROFESSOR, PAI: RESPONSAVEL, RESPONSAVEL
    };

    function paginaAtual() {
        return window.location.pathname.split('/').pop() || '';
    }

    function lerUsuario() {
        try { return JSON.parse(localStorage.getItem('usuario') || '{}'); }
        catch (_) { return {}; }
    }

    function montarSidebar(usuario) {
        const aside = document.querySelector('aside[data-sidebar-auto]');
        if (!aside) return;
        const tipo = (usuario.tipo_usuario || '').toUpperCase();
        const itens = MENUS[tipo] || RESPONSAVEL;
        const lista = document.createElement('ul');
        lista.className = 'nav-links';

        function adicionar(icone, texto, aoClicar, href, ativo) {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = href || '#';
            if (ativo) a.className = 'ativo';
            const i = document.createElement('i');
            i.className = `fas ${icone}`;
            a.append(i, ` ${texto}`);
            if (aoClicar) a.addEventListener('click', e => { e.preventDefault(); aoClicar(); });
            li.appendChild(a);
            lista.appendChild(li);
        }

        const atual = paginaAtual();
        for (const [icone, texto, pagina, tela, soAdmin] of itens) {
            if (soAdmin && tipo !== 'ADMIN') continue;
            const href = tela ? `${pagina}?tela=${tela}` : pagina;
            // Só marca como ativo quando a página inteira é o item (não os painéis com várias telas).
            adicionar(icone, texto, null, href, !tela && pagina === atual);
        }
        adicionar('fa-sign-out-alt', 'Sair', logout);
        aside.replaceChildren(lista);
    }

    function aplicarTema(tema) {
        const icone = document.querySelector('#themeToggle i');
        if (tema === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (icone) { icone.classList.remove('fa-moon'); icone.classList.add('fa-sun'); }
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (icone) { icone.classList.remove('fa-sun'); icone.classList.add('fa-moon'); }
        }
        // O particulas.js também observa data-theme; esta chamada só garante a troca imediata.
        if (typeof window.iniciarParticulas === 'function') window.iniciarParticulas(tema === 'dark' ? 'dark' : 'light');
    }

    function logout() {
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('usuario');
            localStorage.removeItem('sugerirTrocaSenha');
        } catch (_) { /* sem storage */ }
        window.location.href = 'login.html';
    }

    function iniciar() {
        if (!localStorage.getItem('token')) { window.location.href = 'login.html'; return; }
        const usuario = lerUsuario();
        if ((usuario.tipo_usuario || '').toUpperCase() === 'ADMIN') {
            document.querySelectorAll('[data-somente-admin]').forEach(el => { el.style.display = 'block'; });
        }
        montarSidebar(usuario);

        const menu = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const conteudo = document.getElementById('mainContent');
        if (menu && sidebar) {
            menu.addEventListener('click', () => {
                menu.classList.toggle('active');
                sidebar.classList.toggle('open');
                if (conteudo) conteudo.classList.toggle('shifted');
            });
        }

        const botaoTema = document.getElementById('themeToggle');
        if (botaoTema) {
            botaoTema.addEventListener('click', () => {
                const novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                aplicarTema(novo);
                try { localStorage.setItem('theme', novo); } catch (_) { /* sem storage */ }
            });
        }
        let salvo = 'light';
        try { salvo = localStorage.getItem('theme') || 'light'; } catch (_) { /* sem storage */ }
        aplicarTema(salvo);
    }

    window.logout = logout;
    window.PILayout = { aplicarTema, iniciar, montarSidebar };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
