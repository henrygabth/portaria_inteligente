// Página pública de apresentação: envia o pedido de demonstração para /api/contato.
(function () {
    const form = document.getElementById('formContato');
    if (!form) return;
    const $ = id => document.getElementById(id);
    const erro = $('ctErro'), botao = $('ctEnviar');
    form.addEventListener('submit', async e => {
        e.preventDefault();
        erro.textContent = '';
        const corpo = {
            nome: $('ctNome').value.trim(), escola: $('ctEscola').value.trim(), cargo: $('ctCargo').value,
            alunos: $('ctAlunos').value, email: $('ctEmail').value.trim(), telefone: $('ctTel').value.trim(),
            mensagem: $('ctMsg').value.trim(), site: $('ctSite').value, aceite: $('ctAceite').checked
        };
        const falta = [['ctNome', corpo.nome.length < 3, 'Informe o seu nome.'], ['ctEscola', corpo.escola.length < 3, 'Informe o nome da escola.'],
            ['ctCargo', !corpo.cargo, 'Escolha o seu cargo.'], ['ctAlunos', !corpo.alunos, 'Escolha o número de alunos.'],
            ['ctEmail', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email), 'Informe um e-mail válido.'],
            ['ctAceite', !corpo.aceite, 'Marque a caixa de concordância para enviar.']].find(f => f[1]);
        if (falta) { erro.textContent = falta[2]; $(falta[0]).focus(); return; }
        botao.disabled = true;
        botao.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Enviando...';
        try {
            const r = await fetch('/api/contato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
            const dados = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(dados.erro || 'Não foi possível enviar agora.');
            form.hidden = true;
            const ok = $('ctOk'); ok.querySelector('span').textContent = dados.mensagem; ok.hidden = false; ok.focus && ok.focus();
        } catch (err) {
            erro.textContent = err.message;
            botao.disabled = false;
            botao.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> Enviar pedido';
        }
    });
})();
