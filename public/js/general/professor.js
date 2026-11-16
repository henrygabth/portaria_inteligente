const API_PROF = '/api/professores';
const tokenProfessor = () => localStorage.getItem('token');
const escProf = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const horarioProf = valor => valor ? new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
let turmas = [];
let alunos = [];
let telaAtual = 'tela-painel';
let paginaAtual = 1;
let naoLidosAnterior = null;

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
    if (id === 'tela-comunicados' && 'Notification' in window && Notification.permission === 'default') {
        try { Notification.requestPermission(); } catch (_) { /* ignora */ }
    }
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
const estados = { SEM_SAIDA: 'Sem saída hoje', DENTRO: 'Sem saída hoje', AUTORIZADO: 'Saída autorizada', SAIU: 'Fora da escola', ATRASADO: 'Atrasado', NAO_RETORNOU: 'Não voltou', RETORNOU: 'Voltou', RETORNOU_ATRASADO: 'Voltou atrasado', FOI_PARA_CASA: 'Foi para casa' };
const classeSituacao = { SEM_SAIDA: 'sem_saida', DENTRO: 'sem_saida', AUTORIZADO: 'aprovada', SAIU: 'saiu', ATRASADO: 'atrasado', NAO_RETORNOU: 'nao_retornou', RETORNOU: 'dentro', RETORNOU_ATRASADO: 'retornou_atrasado', FOI_PARA_CASA: 'foi_para_casa' };
// Hoje mostra só a hora; outro dia mostra data + hora.
const horaProf = valor => {
    if (!valor) return '-';
    const d = new Date(valor);
    const hoje = new Date().toDateString() === d.toDateString();
    return hoje ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : horarioProf(valor);
};
const atrasoProf = min => min ? `<strong class="texto-atraso">${min} min</strong>` : '-';
const tipos = { APROVADA: 'Saída autorizada', SAIDA: 'Saiu', RETORNO: 'Voltou', ATRASADO: 'Atrasado', NAO_RETORNOU: 'Não voltou', CASA: 'Foi para casa', RECUSADA: 'Recusada', CANCELADA: 'Cancelada' };
const rotuloTipo = t => tipos[t] || t || 'Comunicado';

// O sistema não registra a chegada dos alunos: ele só sabe das saídas e retornos.
// Por isso não existe "na escola"; quem não tem pedido hoje aparece como "sem saída hoje".
const FORA = ['SAIU', 'ATRASADO', 'NAO_RETORNOU'];
const SEM_MOVIMENTO = ['SEM_SAIDA', 'DENTRO'];
const ABAS = [
    ['hoje', 'Com movimentação hoje', 'fa-arrow-right-arrow-left', 'azul'],
    ['autorizados', 'Saída autorizada', 'fa-clipboard-check', 'verde'],
    ['fora', 'Fora da escola', 'fa-person-walking-arrow-right', 'amarelo'],
    ['atrasados', 'Atrasados agora', 'fa-triangle-exclamation', 'vermelho'],
    ['casa', 'Foram para casa', 'fa-house', 'roxo'],
    ['todos', 'Todos os alunos', 'fa-users', 'cinza']
];
let abaPainel = 'hoje';
const LEGENDAS = {
    hoje: 'Alunos que tiveram saída autorizada, saíram, voltaram ou foram para casa hoje.',
    autorizados: 'A secretaria autorizou a saída, mas o aluno ainda não passou pela portaria.',
    fora: 'Saíram pela portaria e ainda não voltaram.',
    atrasados: 'Passaram mais de 5 minutos do horário previsto de retorno.',
    casa: 'Liberados pela portaria para ir para casa; não voltam hoje.',
    todos: 'Todos os alunos ativos das suas turmas. “Sem saída hoje” quer dizer que não há pedido de saída para o aluno hoje (o sistema não registra a chegada).'
};

function noFiltro(a, aba) {
    switch (aba) {
        case 'hoje': return !SEM_MOVIMENTO.includes(a.situacao);
        case 'autorizados': return a.situacao === 'AUTORIZADO';
        case 'fora': return FORA.includes(a.situacao);
        case 'atrasados': return ['ATRASADO', 'NAO_RETORNOU'].includes(a.situacao);
        case 'casa': return a.situacao === 'FOI_PARA_CASA';
        default: return true;
    }
}

function rotuloSituacao(a) {
    if (a.situacao === 'AUTORIZADO') return a.tipo === 'CASA' ? 'Liberação para casa autorizada' : 'Saída autorizada';
    return estados[a.situacao] || 'Sem saída hoje';
}

function celulaSaida(a) {
    if (!a.pedido_id) return '-';
    const previsto = `<small class="pp-sub">previsto ${horaProf(a.hora_prevista_saida)}</small>`;
    return a.hora_saida_real ? `${horaProf(a.hora_saida_real)}${previsto}` : previsto;
}
function celulaRetorno(a) {
    if (!a.pedido_id) return '-';
    if (a.tipo === 'CASA') return '<small class="pp-sub">não volta</small>';
    const previsto = `<small class="pp-sub">previsto ${horaProf(a.hora_prevista_retorno)}</small>`;
    const atraso = a.minutos_atraso ? `<small class="pp-sub">${atrasoProf(a.minutos_atraso)} de atraso</small>` : '';
    return (a.hora_retorno_real ? horaProf(a.hora_retorno_real) : '') + previsto + atraso;
}

function desenharResumo(dados) {
    document.getElementById('resumoProfessor').innerHTML = ABAS.map(([id, titulo, icone, cor]) => {
        const n = dados.filter(a => noFiltro(a, id)).length;
        const alerta = id === 'atrasados' && n > 0;
        return `<button type="button" role="tab" aria-selected="${abaPainel === id}" data-aba="${id}"
            class="pp-resumo-card ${cor} ${abaPainel === id ? 'ativa' : ''} ${alerta ? 'tem-atraso' : ''}">
            <span class="pp-resumo-icone"><i class="fas ${icone}"></i></span>
            <strong>${n}</strong><span>${titulo}</span></button>`;
    }).join('');
}

async function carregarPainel() {
    const tabela = document.getElementById('tabelaPainel');
    try {
        alunos = await consultarProf('/painel');
        atualizarFiltroAlunos();
        const filtro = document.getElementById('filtroTurmaPainel').value;
        const termo = (document.getElementById('buscaAlunoPainel')?.value || '').trim().toLowerCase();
        const daTurma = alunos.filter(a => !filtro || String(a.id_turma) === filtro);
        desenharResumo(daTurma);
        document.getElementById('ppLegenda').textContent = LEGENDAS[abaPainel] || '';

        const dados = daTurma.filter(a => noFiltro(a, abaPainel) && (!termo || String(a.nome).toLowerCase().includes(termo)));
        tabela.innerHTML = dados.length ? dados.map(a => `<tr class="${['ATRASADO','NAO_RETORNOU'].includes(a.situacao) ? 'linha-atrasada' : ''}">
           <td><strong class="pp-nome">${escProf(a.nome)}</strong><small class="pp-sub">${escProf(a.turma)}</small></td>
           <td><span class="prof-tag ${classeSituacao[a.situacao] || 'sem_saida'}">${escProf(rotuloSituacao(a))}</span></td>
           <td>${celulaSaida(a)}</td>
           <td>${celulaRetorno(a)}</td>
           <td>${escProf(a.motivo || '-')}</td></tr>`).join('') :
           `<tr><td colspan="5" class="pp-vazio">${!turmas.length ? 'Você ainda não possui turmas vinculadas. Solicite o vínculo à secretaria.'
                : termo ? 'Nenhum aluno com esse nome neste filtro.'
                : abaPainel === 'hoje' ? 'Nenhuma saída nas suas turmas hoje.'
                : 'Nenhum aluno nesta situação agora.'}</td></tr>`;
        const marcador = document.getElementById('ppAtualizado');
        if (marcador) marcador.innerHTML = `<i class="fas fa-circle"></i> Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (err) { tabela.innerHTML = `<tr><td colspan="5">${escProf(err.message)}</td></tr>`; }
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
        document.title = (dados.naoLidos ? `(${dados.naoLidos}) ` : '') + 'Professor - Portaria Inteligente';
        if (naoLidosAnterior !== null && dados.naoLidos > naoLidosAnterior) avisarNovoComunicado(dados.naoLidos - naoLidosAnterior, dados.comunicados.find(c => !c.lido));
        naoLidosAnterior = dados.naoLidos;
        tbody.innerHTML = dados.comunicados.length ? dados.comunicados.map(c => `<tr class="${c.lido ? '' : 'comunicado-novo'}">
          <td>${horarioProf(c.data_evento)}</td><td>${escProf(c.aluno || c.mensagem.split(':')[0])}${c.motivo ? `<br><small class="campo-ajuda">${escProf(c.motivo)}</small>` : ''}</td>
          <td>${escProf(c.turma)}</td><td><span class="prof-tag ${escProf(String(c.tipo || '').toLowerCase())}">${escProf(rotuloTipo(c.tipo))}</span> ${escProf(c.mensagem.includes(': ') ? c.mensagem.slice(c.mensagem.indexOf(': ') + 2) : c.mensagem)}</td>
          <td>${c.lido ? 'Lido' : 'Não lido'}</td><td>${c.lido ? '-' : `<button class="btn-professor" data-lido="${c.comunicado_id}">Marcar lido</button>`}</td>
        </tr>`).join('') : '<tr><td colspan="6">Nenhum comunicado para estes filtros.</td></tr>';
        tbody.querySelectorAll('[data-lido]').forEach(btn => btn.addEventListener('click', () => marcarLido(btn.dataset.lido)));
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6">${escProf(err.message)}</td></tr>`; }
}
function avisarNovoComunicado(qtd, ultimo) {
    // Aba em segundo plano: notificação do navegador (só se o usuário já permitiu).
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(qtd === 1 ? 'Novo comunicado sobre seus alunos' : `${qtd} novos comunicados sobre seus alunos`, { body: ultimo ? `${ultimo.aluno || ''}: ${rotuloTipo(ultimo.tipo)}` : '', tag: 'pi-comunicado', icon: './img/logo_pi.png' }); } catch (_) { /* sem suporte */ }
    }
    const aviso = document.createElement('div');
    aviso.setAttribute('role', 'alert');
    aviso.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:3000;background:#0052cc;color:#fff;padding:14px 18px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);cursor:pointer;font-weight:600';
    aviso.textContent = qtd === 1 ? 'Novo comunicado sobre seus alunos' : `${qtd} novos comunicados sobre seus alunos`;
    aviso.addEventListener('click', () => { aviso.remove(); mostrarTela('tela-comunicados'); });
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 10000);
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
    document.getElementById('resumoProfessor').addEventListener('click', e => {
        const card = e.target.closest('[data-aba]');
        if (!card) return;
        abaPainel = card.dataset.aba;
        carregarPainel();
    });
    let esperaBusca;
    document.getElementById('buscaAlunoPainel').addEventListener('input', () => { clearTimeout(esperaBusca); esperaBusca = setTimeout(carregarPainel, 150); });
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
    // Tempo real: o comunicado novo aparece na lista na hora; a consulta periódica fica só como
    // rede de segurança (a cada 15 s sem tempo real, a cada 60 s com ele).
    let tique = 0;
    setInterval(() => { if (!document.hidden && (!(window.PITempoReal && PITempoReal.conectado()) || ++tique % 4 === 0)) atualizarProfessor(); }, 15000);
    if (window.PITempoReal) {
        let espera;
        const recarregar = () => { clearTimeout(espera); espera = setTimeout(atualizarProfessor, 300); };
        PITempoReal.on('comunicado', recarregar);
        PITempoReal.on('reconectado', recarregar);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizarProfessor(); });
});
