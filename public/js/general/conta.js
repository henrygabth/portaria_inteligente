// ─── conta.js — cole este script na sua página de conta ──────────────────────
// Ele carrega os dados do responsável logado e envia as alterações para o backend.

const API = 'http://localhost:3000/api'; // Ajuste para o endereço do seu servidor

// ─── Carrega os dados ao abrir a página ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');

    if (!token) {
        alert('Sessão expirada. Faça login novamente.');
        window.location.href = 'login.html';
        return;
    }

    try {
        const resposta = await fetch(`${API}/usuarios/conta`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (resposta.status === 401) {
            alert('Sessão expirada. Faça login novamente.');
            localStorage.removeItem('token');
            window.location.href = 'login.html';
            return;
        }

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || 'Erro ao carregar dados.');
        }

        // Preenche os campos do formulário com os dados do banco
        document.getElementById('nomeResponsavel').value    = dados.nome      || '';
        document.getElementById('cpfResponsavel').value     = dados.cpf       || '';
        document.getElementById('telefoneResponsavel').value = dados.telefone || '';
        document.getElementById('emailResponsavel').value   = dados.email     || '';

    } catch (erro) {
        console.error('Erro ao carregar conta:', erro);
        alert('Não foi possível carregar os dados da conta.');
    }
});

// ─── Envia as alterações ao clicar em "Salvar" ───────────────────────────────
document.getElementById('formConta').addEventListener('submit', async (e) => {
    e.preventDefault();

    const token = localStorage.getItem('token');

    const corpo = {
        nome:       document.getElementById('nomeResponsavel').value.trim(),
        email:      document.getElementById('emailResponsavel').value.trim(),
        telefone:   document.getElementById('telefoneResponsavel').value.trim(),
        senhaAtual: document.getElementById('senhaAtual').value,
        novaSenha:  document.getElementById('novaSenha').value
    };

    // Remove campos de senha vazios para não enviar desnecessariamente
    if (!corpo.novaSenha) {
        delete corpo.novaSenha;
        delete corpo.senhaAtual;
    }

    try {
        const resposta = await fetch(`${API}/usuarios/conta`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(corpo)
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            alert(`Erro: ${resultado.erro}`);
            return;
        }

        alert('Dados atualizados com sucesso!');

        // Limpa os campos de senha após salvar
        document.getElementById('senhaAtual').value = '';
        document.getElementById('novaSenha').value  = '';

    } catch (erro) {
        console.error('Erro ao salvar conta:', erro);
        alert('Erro de conexão ao salvar os dados.');
    }
});