// trocar-senha.js — troca OBRIGATÓRIA da senha temporária no primeiro acesso.
(function () {
    const $ = id => document.getElementById(id);
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return; }

    // Só aceita voltar para uma página do próprio sistema (nada de endereço externo).
    const parametro = new URLSearchParams(location.search).get('depois') || '';
    const depois = /^[a-z-]+\.html(\?[\w=&-]*)?$/i.test(parametro) && parametro !== 'trocar-senha.html' ? parametro : 'home.html';

    try {
        const u = JSON.parse(localStorage.getItem('usuario') || '{}');
        if (u.nome) $('tsNome').textContent = ', ' + String(u.nome).split(' ')[0];
    } catch (_) { /* sem nome */ }

    function regras() {
        const nova = $('novaSenha').value, atual = $('senhaAtual').value;
        const ok = {
            tamanho: nova.length >= 8,
            letra: /[A-Za-zÀ-ÿ]/.test(nova),
            numero: /\d/.test(nova),
            diferente: !!nova && nova !== atual
        };
        document.querySelectorAll('#tsRegras li').forEach(li => {
            const certo = ok[li.dataset.regra];
            li.classList.toggle('ok', certo);
            li.querySelector('i').className = `fas ${certo ? 'fa-circle-check' : 'fa-circle'}`;
        });
        let pontos = Object.values(ok).filter(Boolean).length;
        if (nova.length >= 12) pontos++;
        if (/[^A-Za-z0-9]/.test(nova)) pontos++;
        const barra = $('tsBarra');
        barra.style.width = Math.min(100, pontos / 6 * 100) + '%';
        barra.dataset.nivel = pontos <= 2 ? 'fraca' : pontos <= 4 ? 'media' : 'forte';
        return Object.values(ok).every(Boolean);
    }

    function mensagem(texto, tipo = 'erro') {
        const el = $('tsMsg');
        el.hidden = !texto;
        el.className = `ts-msg ${tipo}`;
        el.textContent = texto || '';
    }

    $('novaSenha').addEventListener('input', regras);
    $('senhaAtual').addEventListener('input', regras);
    $('tsSair').addEventListener('click', () => {
        localStorage.removeItem('token'); localStorage.removeItem('usuario');
        window.location.href = 'login.html';
    });

    $('formPrimeiraSenha').addEventListener('submit', async e => {
        e.preventDefault();
        mensagem('');
        if (!$('senhaAtual').value) return mensagem('Digite a senha temporária que você recebeu.');
        if (!regras()) return mensagem('A nova senha ainda não cumpre todas as regras.');
        if ($('novaSenha').value !== $('confirmarSenha').value) return mensagem('A confirmação não é igual à nova senha.');
        if (!$('tsTermos').checked) return mensagem('Para continuar, leia e aceite o termo de uso e a política de privacidade.');

        const botao = $('tsSalvar');
        botao.disabled = true; botao.textContent = 'Salvando...';
        try {
            const resp = await fetch('/api/usuarios/primeira-senha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ senhaAtual: $('senhaAtual').value, novaSenha: $('novaSenha').value, aceitoTermos: $('tsTermos').checked })
            });
            const dados = await resp.json().catch(() => ({}));
            if (resp.status === 401) { window.location.href = 'login.html'; return; }
            if (!resp.ok) throw new Error(dados.erro || 'Não foi possível salvar a senha.');
            if (dados.token) localStorage.setItem('token', dados.token);
            mensagem(dados.mensagem || 'Senha definida!', 'ok');
            setTimeout(() => { window.location.href = depois; }, 900);
        } catch (err) {
            mensagem(err.message);
            botao.disabled = false; botao.textContent = 'Salvar e entrar';
        }
    });
})();
