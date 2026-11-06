const API_PROF = '/api/professores';
const tokenProfessor = () => localStorage.getItem('token');
const escProf = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const horarioProf = valor => valor ? new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
let turmas = [];
let alunos = [];
let telaAtual = 'tela-painel';
let paginaAtual = 1;

async function consultarProf(caminho, opcoes = {}) {
    const resp = await fetch(`${API_PROF}${caminho}`, {
        ...opcoes,
        headers: { 'Authorization': `Bearer ${tokenProfessor()}`, ...(opcoes.headers || {}) }
    });
    if (!resp.ok) {
        if ([401, 403].includes(resp.status)) throw new Error('Acesso não autorizado. Entre com o perfil de professor.');
        const dados = await resp.json().catch(() => ({}));
        throw new Error(dados.erro || 'Falha ao consultar informações.');
    }
    return resp.json();
}
function mostrarTela(id) {
    telaAtual = id;
    for (const tela of ['tela-painel', 'tela-comunicados']) document.getElementById(tela).style.display = tela === id ? 'block' : 'none';
    if (typeof fecharMenuNoCelular === 'function') fecharMenuNoCelular();
    atualizarProfessor();
}
function popularTurmas() {
    for (const id of ['filtroTurmaPainel', 'filtroTurmaCom']) {
        const select = document.getElementById(id);
        const atual = select.value;
        select.innerHTML = `<option value="">${id === 'filtroTurmaPainel' ? 'Todas as minhas turmas' : 'Todas'}</option>` +
            turmas.map(t => `<option value="${t.id_turma}">${escProf(t.sala_turma)}</option>`).join('');
        if (turmas.some(t => String(t.id_turma) === atual)) select.value = atual;
    }
}
function atualizarFiltroAlunos() {
    const turmaId = document.getElementById('filtroTurmaCom').value;
    const sel = document.getElementById('filtroAlunoCom');
    const antigo = sel.value;
    const filtrados = alunos.filter(a => !turmaId || String(a.id_turma) === turmaId);
    sel.innerHTML = '<option value="">Todos</option>' + filtrados.map(a => `<option value="${a.aluno_id}">${escProf(a.nome)}</option>`).join('');
    if (filtrados.some(a => String(a.aluno_id) === antigo)) sel.value = antigo;
}
const estados = { DENTRO: 'Na escola', AUTORIZADO: 'Saída autorizada', SAIU: 'Fora da escola', ATRASADO: 'Atrasado', NAO_RETORNOU: 'Não voltou', RETORNOU: 'Voltou', RETORNOU_ATRASADO: 'Voltou atrasado' };
const classeSituacao = { DENTRO: 'dentro', AUTORIZADO: 'aprovada', SAIU: 'saiu', ATRASADO: 'atrasado', NAO_RETORNOU: 'nao_retornou', RETORNOU: 'dentro', RETORNOU_ATRASADO: 'retornou_atrasado' };
// Hoje mostra só a hora; outro dia mostra data + hora.
const horaProf = valor => {
    if (!valor) return '-';
    const d = new Date(valor);
    const hoje = new Date().toDateString() === d.toDateString();
    return hoje ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : horarioProf(valor);
};
const atrasoProf = min => min ? `<strong class="texto-atraso">${min} min</strong>` : '-';
const tipos = { APROVADA: 'Saída autorizada', SAIDA: 'Saiu', RETORNO: 'Voltou', ATRASADO: 'Atrasado', NAO_RETORNOU: 'Não voltou' };

async function carregarPainel() {
    const tabela = document.getElementById('tabelaPainel');
    try {
        alunos = await consultarProf('/painel');
        atualizarFiltroAlunos();
        const filtro = document.getElementById('filtroTurmaPainel').value;
        const dados = alunos.filter(a => !filtro || String(a.id_turma) === filtro);
        const n = (...ss) => dados.filter(a => ss.includes(a.situacao)).length;
        const cards = [
            ['Na escola', n('DENTRO', 'RETORNOU', 'RETORNOU_ATRASADO', 'AUTORIZADO'), ''],
            ['Saída autorizada', n('AUTORIZADO'), 'card-pendente'],
            ['Fora da escola', n('SAIU', 'ATRASADO', 'NAO_RETORNOU'), 'card-info'],
            ['Atrasados agora', n('ATRASADO', 'NAO_RETORNOU'), 'card-atrasado' + (n('ATRASADO', 'NAO_RETORNOU') ? ' tem-atraso' : '')],
            ['Voltaram atrasados', n('RETORNOU_ATRASADO'), 'card-atrasado']
        ];
        document.getElementById('resumoProfessor').innerHTML = cards.map(([t, v, c]) =>
            `<div class="resumo-card ${c}"><h3>${v}</h3><p>${t}</p></div>`).join('');
        tabela.innerHTML = dados.length ? dados.map(a => `<tr class="${['ATRASADO','NAO_RETORNOU'].includes(a.situacao) ? 'linha-atrasada' : ''}">
           <td>${escProf(a.nome)}</td><td>${escProf(a.turma)}</td>
           <td><span class="prof-tag ${classeSituacao[a.situacao] || 'dentro'}">${estados[a.situacao] || 'Na escola'}</span></td>
           <td>${a.pedido_id ? horaProf(a.hora_prevista_saida) : '-'}</td><td>${horaProf(a.hora_saida_real)}</td>
           <td>${horaProf(a.hora_prevista_retorno)}</td><td>${horaProf(a.hora_retorno_real)}</td>
           <td>${atrasoProf(a.minutos_atraso)}</td><td>${escProf(a.motivo || '-')}</td></tr>`).join('') :
           `<tr><td colspan="9">${turmas.length ? 'Nenhum aluno nessa turma.' : 'Você ainda não possui turmas vinculadas. Solicite o vínculo à secretaria.'}</td></tr>`;
    } catch (err) { tabela.innerHTML = `<tr><td colspan="9">${escProf(err.message)}</td></tr>`; }
}
async function carregarComunicados() {
    const tbody = document.getElementById('tabelaComunicados');
    const p = new URLSearchParams();
    for (const [id, chave] of [['filtroTurmaCom','turma_id'],['filtroAlunoCom','aluno_id'],['filtroTipoCom','tipo'],['filtroDataCom','data']]) {
        const v = document.getElementById(id).value;
        if (v) p.set(chave, v);
    }
    p.set('pagina', paginaAtual);
    try {
        const dados = await consultarProf(`/comunicados?${p}`);
        document.getElementById('paginaAnterior').disabled = paginaAtual <= 1;
        document.getElementById('paginaProxima').disabled = !dados.temMais;
        document.getElementById('numeroPagina').textContent = `Página ${paginaAtual}`;
        for (const id of ['contadorPagina','contadorMenu']) document.getElementById(id).textContent = dados.naoLidos;
        tbody.innerHTML = dados.comunicados.length ? dados.comunicados.map(c => `<tr class="${c.lido ? '' : 'comunicado-novo'}">
          <td>${horarioProf(c.data_evento)}</td><td>${escProf(c.aluno || c.mensagem.split(':')[0])}${c.motivo ? `<br><small class="campo-ajuda">${escProf(c.motivo)}</small>` : ''}</td>
          <td>${escProf(c.turma)}</td><td><span class="prof-tag ${c.tipo.toLowerCase()}">${tipos[c.tipo]}</span> ${escProf(c.mensagem.includes(': ') ? c.mensagem.slice(c.mensagem.indexOf(': ') + 2) : c.mensagem)}</td>
          <td>${c.lido ? 'Lido' : 'Não lido'}</td><td>${c.lido ? '-' : `<button class="btn-professor" data-lido="${c.comunicado_id}">Marcar lido</button>`}</td>
        </tr>`).join('') : '<tr><td colspan="6">Nenhum comunicado para estes filtros.</td></tr>';
        tbody.querySelectorAll('[data-lido]').forEach(btn => btn.addEventListener('click', () => marcarLido(btn.dataset.lido)));
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6">${escProf(err.message)}</td></tr>`; }
}
async function marcarLido(id) {
    try { await consultarProf(`/comunicados/${id}/lido`, { method: 'PUT' }); await carregarComunicados(); }
    catch (err) { alert(err.message); }
}
// O painel carrega sempre: ele também alimenta o filtro de alunos da tela de comunicados.
function atualizarProfessor() { carregarPainel(); carregarComunicados(); }

document.addEventListener('DOMContentLoaded', async () => {
    if (!tokenProfessor()) { location.href = 'login.html'; return; }
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    // As rotas do professor só aceitam o perfil PROFESSOR; o ADMIN gerencia professores em "Professores e Turmas".
    const tipo = (usuario.tipo_usuario || '').toUpperCase();
    if (tipo === 'ADMIN') { location.href = 'selecionar-painel.html'; return; }
    if (tipo !== 'PROFESSOR') { location.href = 'login.html'; return; }
    // Menu, tema, logout e fundo de pontinhos vêm do layout.js e do particulas.js (padrão de todas as telas).
    for (const id of ['filtroTurmaPainel','filtroTurmaCom','filtroAlunoCom','filtroTipoCom','filtroDataCom']) {
        document.getElementById(id).addEventListener('change', () => {
            if (id === 'filtroTurmaCom') atualizarFiltroAlunos();
            if (id !== 'filtroTurmaPainel') paginaAtual = 1;
            atualizarProfessor();
        });
    }
    document.getElementById('limparFiltros').addEventListener('click', () => {
        for (const id of ['filtroTurmaCom','filtroAlunoCom','filtroTipoCom','filtroDataCom']) document.getElementById(id).value = '';
        paginaAtual = 1;
        atualizarProfessor();
    });
    for (const [id, passo] of [['paginaAnterior', -1], ['paginaProxima', 1]]) {
        document.getElementById(id).addEventListener('click', () => {
            paginaAtual += passo;
            carregarComunicados();
        });
    }
    try { turmas = await consultarProf('/minhas-turmas'); popularTurmas(); }
    catch (err) { alert(err.message); }
    const telaPedida = new URLSearchParams(location.search).get('tela');
    if (['tela-painel', 'tela-comunicados'].includes(telaPedida)) mostrarTela(telaPedida);
    else atualizarProfessor();
    setInterval(() => { if (!document.hidden) atualizarProfessor(); }, 15000);
});
