// professores-admin.js — tela "Professores e Turmas" (secretaria/admin).
// Turmas são escolhidas por "chips" (clique para marcar), sem o antigo Ctrl+clique.
const tokenAdm = () => localStorage.getItem('token');
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let turmasAdm = [];
let professoresAdm = [];
let editando = null; // id do professor com o editor de turmas aberto

async function apiAdm(url, options = {}) {
    const r = await fetch(url, {...options, headers: {'Authorization':`Bearer ${tokenAdm()}`, 'Content-Type':'application/json', ...(options.headers || {})}});
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(data.erro || 'Falha no servidor.');
    return data;
}

const nomeTurma = t => t ? t.sala_turma : '';
const turmaPorId = id => turmasAdm.find(t => Number(t.id_turma) === Number(id));
const iniciais = nome => {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() : '?';
};

// ---------------------------------------------------------------- seletor de turmas
// Monta um seletor de chips agrupado por turno, com busca e contador.
function montarSeletor(container, selecionadas = []) {
    const marcadas = new Set(selecionadas.map(Number));
    const grupos = {};
    for (const t of turmasAdm) (grupos[t.turno || 'Sem turno'] ||= []).push(t);
    const ordem = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    container.innerHTML = turmasAdm.length ? `
        <div class="pa-seletor-topo">
            <div class="pa-busca pequena"><i class="fas fa-filter" aria-hidden="true"></i>
                <input type="search" placeholder="Filtrar turmas" aria-label="Filtrar turmas" data-filtro></div>
            <span class="pa-contador" data-contador></span>
            <button type="button" class="pa-link" data-limpar>Limpar</button>
        </div>
        ${ordem.map(turno => `
            <div class="pa-grupo" data-grupo>
                <span class="pa-grupo-nome">${safe(turno)}</span>
                <div class="pa-chips">${grupos[turno].sort((a, b) => nomeTurma(a).localeCompare(nomeTurma(b), 'pt-BR')).map(t => `
                    <label class="pa-chip" data-nome="${safe(nomeTurma(t).toLowerCase())}">
                        <input type="checkbox" value="${Number(t.id_turma)}" ${marcadas.has(Number(t.id_turma)) ? 'checked' : ''}>
                        <span><i class="fas fa-check" aria-hidden="true"></i>${safe(nomeTurma(t))}</span>
                    </label>`).join('')}
                </div>
            </div>`).join('')}`
        : '<p class="pa-vazio">Nenhuma turma cadastrada. Cadastre as turmas na secretaria primeiro.</p>';

    const contar = () => {
        const n = container.querySelectorAll('input[type=checkbox]:checked').length;
        const el = container.querySelector('[data-contador]');
        if (el) el.textContent = n ? `${n} turma${n > 1 ? 's' : ''} selecionada${n > 1 ? 's' : ''}` : 'Nenhuma selecionada';
    };
    container.onchange = contar; // onchange (e não addEventListener): remontar não acumula ouvintes
    container.querySelector('[data-limpar]')?.addEventListener('click', () => {
        container.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = false; });
        contar();
    });
    container.querySelector('[data-filtro]')?.addEventListener('input', e => {
        const termo = e.target.value.trim().toLowerCase();
        container.querySelectorAll('.pa-chip').forEach(ch => { ch.hidden = !!termo && !ch.dataset.nome.includes(termo); });
        container.querySelectorAll('[data-grupo]').forEach(g => { g.hidden = ![...g.querySelectorAll('.pa-chip')].some(ch => !ch.hidden); });
    });
    contar();
}

const lerSeletor = container => [...container.querySelectorAll('input[type=checkbox]:checked')].map(c => Number(c.value));

// ---------------------------------------------------------------- lista
function desenharResumo() {
    const comTurma = new Set(professoresAdm.flatMap(p => p.turmas_ids));
    const semProfessor = turmasAdm.filter(t => !comTurma.has(Number(t.id_turma)));
    const ativos = professoresAdm.filter(p => String(p.status) !== '0').length;
    document.getElementById('paResumo').innerHTML = `
        <div class="pa-resumo-item"><strong>${ativos}</strong><span>professor${ativos === 1 ? '' : 'es'} ativo${ativos === 1 ? '' : 's'}</span></div>
        <div class="pa-resumo-item"><strong>${turmasAdm.length - semProfessor.length}/${turmasAdm.length}</strong><span>turmas com professor</span></div>`;
    const aviso = document.getElementById('avisoSemProfessor');
    aviso.hidden = !semProfessor.length || !turmasAdm.length;
    if (semProfessor.length) {
        aviso.innerHTML = `<i class="fas fa-circle-info"></i> <span><strong>${semProfessor.length} turma${semProfessor.length > 1 ? 's' : ''} sem professor:</strong>
            ${semProfessor.slice(0, 12).map(t => `<span class="pa-tag">${safe(nomeTurma(t))}</span>`).join(' ')}${semProfessor.length > 12 ? ' …' : ''}
            <br><small>Ninguém recebe os avisos de saída e atraso dessas turmas.</small></span>`;
    }
}

function desenharLista() {
    const ul = document.getElementById('listaProfessores');
    const termo = document.getElementById('buscaProf').value.trim().toLowerCase();
    const lista = professoresAdm.filter(p => !termo ||
        String(p.nome).toLowerCase().includes(termo) || String(p.email).toLowerCase().includes(termo) ||
        p.turmas_ids.some(id => nomeTurma(turmaPorId(id)).toLowerCase().includes(termo)));

    if (!professoresAdm.length) { ul.innerHTML = '<li class="pa-vazio"><i class="fas fa-user-plus"></i> Nenhum professor cadastrado ainda. Use o formulário ao lado.</li>'; return; }
    if (!lista.length) { ul.innerHTML = '<li class="pa-vazio">Nenhum professor encontrado para essa busca.</li>'; return; }

    ul.innerHTML = lista.map(p => {
        const ativo = String(p.status) !== '0';
        const turmas = p.turmas_ids.map(turmaPorId).filter(Boolean).sort((a, b) => nomeTurma(a).localeCompare(nomeTurma(b), 'pt-BR'));
        const aberto = editando === p.id_usuario;
        return `<li class="pa-prof ${ativo ? '' : 'inativo'} ${aberto ? 'editando' : ''}" data-id="${Number(p.id_usuario)}">
            <div class="pa-prof-linha">
                <span class="pa-avatar" aria-hidden="true">${safe(iniciais(p.nome))}</span>
                <div class="pa-prof-info">
                    <strong>${safe(p.nome)}</strong>
                    <span>${safe(p.email)}</span>
                </div>
                <span class="pa-status ${ativo ? 'ativo' : 'inativo'}">${ativo ? 'Ativo' : 'Desativado'}</span>
                <button type="button" class="pa-btn-sec" data-editar="${Number(p.id_usuario)}" aria-expanded="${aberto}">
                    <i class="fas ${aberto ? 'fa-xmark' : 'fa-pen'}"></i> ${aberto ? 'Fechar' : 'Editar turmas'}
                </button>
            </div>
            <div class="pa-prof-turmas">
                ${turmas.length
                    ? turmas.map(t => `<span class="pa-tag">${safe(nomeTurma(t))}</span>`).join('')
                    : '<span class="pa-sem-turma"><i class="fas fa-triangle-exclamation"></i> Sem turma vinculada: este professor não vê nenhum aluno.</span>'}
            </div>
            ${aberto ? `<div class="pa-editor">
                <div class="pa-seletor" data-seletor-edicao></div>
                <div class="pa-editor-acoes">
                    <button type="button" class="pa-btn-sec" data-cancelar>Cancelar</button>
                    <button type="button" class="btn-professor" data-salvar="${Number(p.id_usuario)}"><i class="fas fa-floppy-disk"></i> Salvar turmas</button>
                </div>
            </div>` : ''}
        </li>`;
    }).join('');

    const aberto = ul.querySelector('[data-seletor-edicao]');
    if (aberto) {
        const prof = professoresAdm.find(p => p.id_usuario === editando);
        montarSeletor(aberto, prof ? prof.turmas_ids : []);
    }
}

async function carregarCadastroProf() {
    const [turmas, professores] = await Promise.all([apiAdm('/api/turmas'), apiAdm('/api/professores')]);
    turmasAdm = turmas; professoresAdm = professores;
    montarSeletor(document.getElementById('seletorNovo'), lerSeletor(document.getElementById('seletorNovo')));
    desenharResumo();
    desenharLista();
}

function mensagem(texto, tipo) {
    const msg = document.getElementById('msgCadastro');
    msg.hidden = !texto;
    msg.className = `pa-msg ${tipo || ''}`;
    msg.innerHTML = texto ? `<i class="fas ${tipo === 'erro' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${safe(texto)}` : '';
}

function gerarSenha() {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const numeros = '23456789';
    const todos = letras + numeros;
    const sorteio = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
    const chars = [letras[sorteio(letras.length)], numeros[sorteio(numeros.length)]];
    while (chars.length < 10) chars.push(todos[sorteio(todos.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = sorteio(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join('');
}

function validarFormulario(v) {
    if (v.nome.length < 3) return ['nomeProf', 'Informe o nome completo do professor.'];
    if (v.cpf.replace(/\D/g, '').length !== 11) return ['cpfProf', 'O CPF precisa ter 11 números.'];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) return ['emailProf', 'Informe um e-mail válido.'];
    if (v.senha.length < 8 || !/[A-Za-z]/.test(v.senha) || !/\d/.test(v.senha)) return ['senhaProf', 'A senha precisa ter pelo menos 8 caracteres, com letras e números.'];
    return null;
}

document.addEventListener('DOMContentLoaded', async () => {
    let u = {};
    try { u = JSON.parse(localStorage.getItem('usuario') || '{}'); } catch (_) { u = {}; }
    if (!tokenAdm() || !['ADMIN', 'SECRETARIA'].includes(String(u.tipo_usuario || '').toUpperCase())) { location.href='login.html'; return; }
    try { await carregarCadastroProf(); }
    catch (e) { document.getElementById('listaProfessores').innerHTML = `<li class="pa-vazio erro">${safe(e.message)}</li>`; }

    document.getElementById('buscaProf').addEventListener('input', desenharLista);

    document.getElementById('gerarSenha').addEventListener('click', () => {
        const campo = document.getElementById('senhaProf');
        campo.value = gerarSenha();
        campo.type = 'text'; // mostra a senha gerada para a secretaria anotar
        campo.select();
    });

    document.getElementById('listaProfessores').addEventListener('click', async e => {
        const editar = e.target.closest('[data-editar]');
        const salvar = e.target.closest('[data-salvar]');
        if (editar) {
            const id = Number(editar.dataset.editar);
            editando = editando === id ? null : id;
            desenharLista();
        } else if (e.target.closest('[data-cancelar]')) {
            editando = null;
            desenharLista();
        } else if (salvar) {
            const id = Number(salvar.dataset.salvar);
            const seletor = salvar.closest('.pa-prof').querySelector('[data-seletor-edicao]');
            salvar.disabled = true;
            try {
                await apiAdm(`/api/professores/${id}/turmas`, { method: 'PUT', body: JSON.stringify({ turmas: lerSeletor(seletor) }) });
                editando = null;
                await carregarCadastroProf();
                const li = document.querySelector(`.pa-prof[data-id="${id}"]`);
                if (li) { li.classList.add('salvo'); setTimeout(() => li.classList.remove('salvo'), 1600); }
            } catch (err) { PIDialogo.avisar(err.message); salvar.disabled = false; }
        }
    });

    document.getElementById('formProfessor').addEventListener('submit', async e => {
        e.preventDefault();
        const v = id => document.getElementById(id).value.trim();
        const payload = { nome: v('nomeProf'), cpf: v('cpfProf'), telefone: v('telProf'), email: v('emailProf').toLowerCase(),
            senha: document.getElementById('senhaProf').value, turmas: lerSeletor(document.getElementById('seletorNovo')) };
        const problema = validarFormulario(payload);
        if (problema) { mensagem(problema[1], 'erro'); document.getElementById(problema[0]).focus(); return; }
        const botao = document.getElementById('btnCadastrar');
        botao.disabled = true;
        try {
            const data = await apiAdm('/api/professores', { method: 'POST', body: JSON.stringify(payload) });
            mensagem(`${data.mensagem} Senha inicial: ${payload.senha}`, 'ok');
            e.target.reset();
            document.getElementById('senhaProf').type = 'password';
            montarSeletor(document.getElementById('seletorNovo'), []);
            await carregarCadastroProf();
        } catch (err) { mensagem(err.message, 'erro'); }
        finally { botao.disabled = false; }
    });
});
