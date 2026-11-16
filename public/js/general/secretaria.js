// Ajustado para incluir o prefixo /api que está definido no index.js
const API_URL = '/api';
let pedidoSelecionado = null;

// ==========================================
// 1. GERENCIAMENTO DE TELAS E FORMULÁRIOS
// ==========================================
function mostrarTela(idTela) {
    const telas = ['tela-inicio', 'tela-painel', 'tela-solicitacoes', 'tela-vincular', 'tela-alunos', 'tela-perfis', 'tela-historico', 'tela-mensagens', 'tela-equipe', 'tela-auditoria', 'tela-saude'];
    telas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const telaAtiva = document.getElementById(idTela);
    if (telaAtiva) telaAtiva.style.display = 'block';

    if (typeof fecharMenuNoCelular === 'function') fecharMenuNoCelular();

    if (window.PIChat) window.PIChat.aoMudarTela(idTela);
    if (window.PIEquipe) window.PIEquipe.aoMudarTela(idTela);
    if (window.PIAdmin) window.PIAdmin.aoMudarTela(idTela);

    if (idTela === 'tela-painel') {
        carregarPainelEstatisticas();
    } else if (idTela === 'tela-solicitacoes') {
        carregarPendentes();
    } else if (idTela === 'tela-vincular') {
        carregarTurmasVinculo();
    } else if (idTela === 'tela-alunos') {
        carregarGerenciarAlunos();
    } else if (idTela === 'tela-perfis') {
        carregarPerfis();
    } else if (idTela === 'tela-historico') {
        carregarHistoricoSecretaria();
    }
}

async function salvarVinculo(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');

    // Garante que o e-mail foi conferido (mesmo que a pessoa não tenha saído do campo).
    const emailConferido = await verificarEmailVinculo();
    if (emailConferido === false) {
        document.getElementById('emailNovoResponsavel').focus();
        return;
    }

    const campoFoto = document.getElementById('fotoAlunoVinculo');
    const fotoPronta = campoFoto ? campoFoto._fotoPronta : null;
    if (!fotoPronta && !confirm('Nenhuma foto 3x4 foi escolhida. Sem foto, o porteiro não consegue identificar o aluno. Continuar mesmo assim?')) {
        campoFoto?.focus();
        return;
    }

    const corpo = {
        nome: document.getElementById('nomeResponsavelVinculo').value.trim(),
        cpf: document.getElementById('cpfResponsavelVinculo').value.trim(),
        telefone: document.getElementById('telefoneResponsavelVinculo').value.trim(),
        email: document.getElementById('emailNovoResponsavel').value.trim(),
        nome_aluno: document.getElementById('nomeAlunoVinculo').value.trim(),
        turma_id: document.getElementById('turmaVinculo').value,
        parentesco: document.getElementById('parentescoVinculo').value
    };

    try {
        const resp = await fetch(`${API_URL}/usuarios/vincular-responsavel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(corpo)
        });

        const data = await resp.json();

        if (resp.ok) {
            let msg = data.mensagem;
            if (data.senha_temporaria) {
                msg += `\n\nSenha temporária (o e-mail não pôde ser enviado): ${data.senha_temporaria}`;
            }
            if (fotoPronta && data.aluno_id) {
                try { await PIFoto.enviar(data.aluno_id, fotoPronta); msg += '\n\nFoto 3x4 do aluno salva.'; }
                catch (erroFoto) { msg += `\n\nA conta foi criada, mas a foto NÃO foi salva: ${erroFoto.message}\nAdicione a foto depois em Gerenciar Alunos.`; }
            }
            alert(msg);
            document.getElementById('formVincular').reset();
            const previa = document.getElementById('fotoAlunoPrevia');
            if (previa) { previa.innerHTML = '<i class="fas fa-user"></i>'; previa.classList.remove('com-foto'); }
            if (campoFoto) campoFoto._fotoPronta = null;
        } else {
            alert('Erro: ' + (data.erro || 'Falha ao criar a conta do responsável'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}


// ==========================================
// 1b. VERIFICADOR DE E-MAIL (Vincular Responsável)
// ==========================================
let ultimoEmailVerificado = { email: null, valido: null };

function mostrarMsgEmail(tipo, html) {
    const el = document.getElementById('emailVerificacaoMsg');
    if (!el) return;
    el.className = 'email-verificacao ' + tipo;
    el.innerHTML = html;
}

// Retorna true (e-mail ok), false (e-mail recusado) ou null (campo vazio).
async function verificarEmailVinculo() {
    const campo = document.getElementById('emailNovoResponsavel');
    if (!campo) return null;
    const email = campo.value.trim();

    if (!email) {
        mostrarMsgEmail('', '');
        return null;
    }
    if (ultimoEmailVerificado.email === email && ultimoEmailVerificado.valido !== null) {
        return ultimoEmailVerificado.valido;
    }

    mostrarMsgEmail('checando', '<i class="fas fa-spinner fa-spin"></i> Verificando e-mail...');

    try {
        const resp = await fetch(`${API_URL}/usuarios/verificar-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ email })
        });
        const r = await resp.json();
        if (!resp.ok) throw new Error(r.erro || 'Falha na verificação');

        // Ignora a resposta se a pessoa já alterou o campo enquanto verificava.
        if (campo.value.trim() !== email) return null;

        if (!r.valido) {
            let html = `<i class="fas fa-circle-xmark"></i> ${esc(r.motivo)}`;
            if (r.sugestao) {
                html += ` <button type="button" id="usarSugestaoEmail">Usar ${esc(r.sugestao)}</button>`;
            }
            mostrarMsgEmail('erro', html);
            const btn = document.getElementById('usarSugestaoEmail');
            if (btn) btn.addEventListener('click', () => {
                campo.value = r.sugestao;
                ultimoEmailVerificado = { email: null, valido: null };
                verificarEmailVinculo();
            });
            ultimoEmailVerificado = { email, valido: false };
            return false;
        }

        if (r.jaCadastrado) {
            mostrarMsgEmail('aviso', '<i class="fas fa-circle-info"></i> Este e-mail já tem conta: o aluno será vinculado a ela.');
        } else if (r.verificado) {
            mostrarMsgEmail('ok', '<i class="fas fa-circle-check"></i> E-mail válido.');
        } else {
            mostrarMsgEmail('aviso', '<i class="fas fa-triangle-exclamation"></i> Formato válido, mas não foi possível confirmar o domínio agora.');
        }
        ultimoEmailVerificado = { email, valido: true };
        return true;
    } catch (err) {
        // Falha de rede/servidor na verificação não impede o cadastro; o servidor valida de novo.
        mostrarMsgEmail('aviso', '<i class="fas fa-triangle-exclamation"></i> Não foi possível verificar o e-mail agora.');
        return null;
    }
}

(function iniciarVerificadorEmail() {
    const campo = document.getElementById('emailNovoResponsavel');
    if (!campo) return;
    campo.addEventListener('blur', verificarEmailVinculo);
    campo.addEventListener('input', () => {
        ultimoEmailVerificado = { email: null, valido: null };
        mostrarMsgEmail('', '');
    });
})();

async function carregarTurmasVinculo() {
    const token = localStorage.getItem('token');
    const select = document.getElementById('turmaVinculo');
    if (!select) return;

    try {
        const resp = await fetch(`${API_URL}/turmas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error('Falha ao buscar turmas');

        const turmas = await resp.json();
        select.innerHTML = '<option value="" disabled selected>Selecione a turma</option>';
        turmas.forEach(turma => {
            const option = document.createElement('option');
            option.value = turma.id_turma;
            option.textContent = `${turma.sala_turma} (${turma.turno})`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Erro ao carregar turmas:', err);
        select.innerHTML = '<option value="" disabled selected>Erro ao carregar turmas</option>';
    }
}

// ==========================================
// 2. CONFIGURAÇÃO DE TEMA E PARTÍCULAS
// ==========================================
// As partículas de fundo vêm do js/general/particulas.js (igual em todas as telas).
function aplicarTema(theme) {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;

    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeIcon) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (themeIcon) {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    }
    iniciarParticulas(theme);
}

// ==========================================
// 3. REQUISIÇÕES DA SECRETARIA (API)
// ==========================================

function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Só a hora quando é hoje; dia/mês + hora quando é outro dia.
// Etiqueta roxa para pedidos de liberação para casa (o aluno não volta).
function etiquetaCasa(pedido) {
    return pedido.tipo === 'CASA' ? '<span class="etiqueta-casa">Ir para casa</span>' : '';
}

function formatarHorario(valor) {
    if (!valor) return '-';
    const d = new Date(valor);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (mesmoDia(d, new Date())) return hora;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

// Carregar solicitações pendentes
async function carregarPendentes() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('lista-pendentes');
    if (!tbody) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/listarPorStatus?status=PENDENTE`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao buscar solicitações');

        const dados = await resp.json();
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">Nenhuma solicitação pendente.</td></tr>';
        } else {
            dados.forEach(pedido => {
                const tr = document.createElement('tr');
                const dataHora = pedido.data_criacao
                    ? new Date(pedido.data_criacao).toLocaleString('pt-BR')
                    : '-';
                const etiqueta = pedido.recorrente_id ? '<span class="etiqueta-aluno">Horário fixo</span>' : '';

                tr.innerHTML = `
                    <td>${dataHora}</td>
                    <td><div class="celula-aluno">${PIFoto.html(pedido.aluno_id, { tamanho: 'm', nome: pedido.nome_aluno })}<div class="aluno-info"><span>${esc(pedido.nome_aluno || 'Aluno')}${etiqueta}${etiquetaCasa(pedido)}</span></div></div></td>
                    <td>${esc(pedido.turma || '-')}</td>
                    <td>${formatarHorario(pedido.hora_prevista_saida)}</td>
                    <td>${pedido.tipo === 'CASA' ? 'Não volta' : formatarHorario(pedido.hora_prevista_retorno)}</td>
                    <td>${esc(pedido.responsavel || '-')}</td>
                    <td>${esc(pedido.motivo || '-')}</td>
                    <td>
                        <button class="btn-action btn-accept" onclick="decidir(${pedido.pedidos_saida_id}, 'aceitar')" aria-label="Aprovar a saída de ${esc(pedido.nome_aluno || 'aluno')}" title="Aprovar">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-action btn-deny" onclick="abrirModalNegar(${pedido.pedidos_saida_id})" aria-label="Recusar a saída de ${esc(pedido.nome_aluno || 'aluno')}" title="Recusar">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const elemCount = document.getElementById('count-pendentes');
        if (elemCount) elemCount.textContent = dados.length;
    } catch (err) {
        console.error('Erro ao carregar pendentes:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="color:red;">Erro ao carregar pendentes.</td></tr>';
    }
}

// Aprovar ou rejeitar pedido
async function decidir(id, acao, observacao = null) {
    if (acao === 'aceitar' && !confirm("Deseja realmente APROVAR esta saída?")) return;

    const token = localStorage.getItem('token');
    let url = '';
    if (acao === 'aceitar') url = `${API_URL}/pedidos/aprovar/${id}`;
    if (acao === 'negar') url = `${API_URL}/pedidos/rejeitar/${id}`;

    try {
        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: observacao ? JSON.stringify({ observacao }) : null
        });

        if (resp.ok) {
            alert(`Pedido ${acao === 'aceitar' ? 'aprovado' : 'negado'} com sucesso!`);
            carregarPendentes();
            carregarHistoricoSecretaria();
        } else {
            const erro = await resp.json();
            alert('Erro: ' + (erro.erro || 'Falha na operação'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}

// Controles do Modal de Recusa
function abrirModalNegar(id) {
    pedidoSelecionado = id;
    const modal = document.getElementById('modalNegar');
    if (modal) modal.style.display = 'flex';
}

function fecharModal() {
    const modal = document.getElementById('modalNegar');
    if (modal) modal.style.display = 'none';
    const campoMotivo = document.getElementById('motivoNegativa');
    if (campoMotivo) campoMotivo.value = '';
}

function confirmarNegativa() {
    const campoMotivo = document.getElementById('motivoNegativa');
    const motivo = campoMotivo ? campoMotivo.value.trim() : '';
    if (!motivo) {
        alert('Informe o motivo da negativa.');
        return;
    }
    decidir(pedidoSelecionado, 'negar', motivo);
    fecharModal();
}

// Histórico geral da secretaria: tudo que já saiu da fila de pendentes
// (antes só aparecia "Aprovada" e o pedido sumia quando a portaria liberava o aluno).
const ROTULO_STATUS_SECRETARIA = {
    APROVADA: 'Aprovada - aguardando portaria',
    RECUSADA: 'Recusada',
    EM_SAIDA: 'Aluno fora da escola',
    CONCLUIDA: 'Concluída',
    CANCELADA: 'Cancelada pela secretaria'
};

let historicoSecretariaCache = [];

function dentroDoPeriodo(valor, periodo) {
    if (periodo === 'todos' || !valor) return true;
    const d = new Date(valor);
    const agora = new Date();
    if (periodo === 'semana') {
        const inicio = new Date(agora);
        inicio.setHours(0, 0, 0, 0);
        inicio.setDate(inicio.getDate() - 6);
        return d >= inicio;
    }
    if (periodo === 'mes') return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
    if (periodo === 'ano') return d.getFullYear() === agora.getFullYear();
    return true;
}

function renderizarHistoricoSecretaria() {
    const tbody = document.getElementById('tabelaHistoricoSecretariaBody');
    if (!tbody) return;

    const periodo = document.getElementById('filtroTempo')?.value || 'todos';
    const dados = historicoSecretariaCache.filter(p => dentroDoPeriodo(p.data_criacao, periodo));

    tbody.innerHTML = '';

    if (dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nenhum registro encontrado.</td></tr>';
        return;
    }

    dados.forEach(pedido => {
        const tr = document.createElement('tr');
        const dataHora = pedido.data_criacao ? new Date(pedido.data_criacao).toLocaleString('pt-BR') : '-';
        const classe = `status-${String(pedido.status).toLowerCase()}`;
        const etiqueta = pedido.recorrente_id ? '<span class="etiqueta-aluno">Horário fixo</span>' : '';

        tr.innerHTML = `
            <td>${dataHora}</td>
            <td>${esc(pedido.nome_aluno || 'Aluno')}${etiqueta}${etiquetaCasa(pedido)}</td>
            <td>${esc(pedido.turma || '-')}</td>
            <td>${formatarHorario(pedido.hora_prevista_saida)}</td>
            <td><span class="status ${classe}">${pedido.tipo === 'CASA' && pedido.status === 'CONCLUIDA' ? 'Liberado - foi para casa' : (ROTULO_STATUS_SECRETARIA[pedido.status] || esc(pedido.status))}</span></td>
            <td>${esc(pedido.secretario || pedido.aprovador || '-')}
                ${pedido.status === 'APROVADA' ? `<button type="button" class="btn-perfil desativar"
                    onclick="cancelarPedidoSecretaria(${pedido.pedidos_saida_id})">Cancelar</button>` : ''}</td>
            <td><button type="button" class="btn-perfil reativar" onclick="abrirOcorrencias(${pedido.pedidos_saida_id})">Ver alertas</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function cancelarPedidoSecretaria(id) {
    const motivo = prompt('Motivo do cancelamento da solicitação aprovada:');
    if (motivo === null) return;
    if (!motivo.trim() || motivo.trim().length > 500) return alert('Informe um motivo de até 500 caracteres.');
    try {
        const resposta = await fetch(`${API_URL}/pedidos/cancelar/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ observacao: motivo.trim() })
        });
        const dados = await resposta.json();
        alert(dados.mensagem || dados.erro || 'Não foi possível cancelar.');
        if (resposta.ok) carregarHistoricoSecretaria();
    } catch (_) { alert('Erro de conexão com o servidor.'); }
}

function fecharOcorrencias() {
    const modal = document.getElementById('modalOcorrencias');
    if (modal) modal.style.display = 'none';
}

const ROTULO_OCORRENCIA = {
    ATRASADO: 'Atraso detectado (+5 min)',
    NAO_RETORNOU: 'Não retorno detectado (+15 min)',
    CHEGOU_ATRASADO: 'Retorno registrado com atraso'
};
const ROTULO_CATEGORIA_ALERTA = {
    RESPONSAVEL: 'Responsável', SECRETARIA: 'Secretaria', PORTARIA: 'Portaria', PROFESSOR: 'Professor'
};

async function abrirOcorrencias(id) {
    const registro = historicoSecretariaCache.find(p => Number(p.pedidos_saida_id) === Number(id));
    const aluno = registro?.nome_aluno || 'Aluno';
    const modal = document.getElementById('modalOcorrencias');
    const conteudo = document.getElementById('conteudoOcorrencias');
    if (!modal || !conteudo) return;
    modal.style.display = 'flex';
    conteudo.innerHTML = `<p><strong>${esc(aluno)}</strong></p><p>Carregando rastreabilidade...</p>`;
    try {
        const resp = await fetch(`${API_URL}/pedidos/ocorrencias/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const dados = await resp.json();
        if (!resp.ok) throw new Error(dados.erro || 'Falha ao consultar rastreabilidade.');
        const ocorrencias = dados.ocorrencias || [];
        const envios = dados.envios || [];
        const blocoOcorrencias = ocorrencias.length ? ocorrencias.map(o => `
            <div style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                <strong>${esc(ROTULO_OCORRENCIA[o.tipo_evento] || o.tipo_evento)}</strong><br>
                <small>Detectado: ${formatarHorario(o.data_evento)}${o.resolvida_em ? ` · Resolvido: ${formatarHorario(o.resolvida_em)}` : ''}</small><br>
                <span>${esc(o.detalhe || '')}</span>
            </div>`).join('') : '<p>Nenhuma ocorrência automática registrada para este pedido.</p>';
        const blocoEnvios = envios.length ? `<div class="table-responsive" style="margin-top:12px;"><table class="history-table"><thead><tr><th>Evento</th><th>Grupo</th><th>Destino</th><th>Status</th><th>Enviado</th></tr></thead><tbody>${envios.map(e => `<tr><td>${esc(ROTULO_OCORRENCIA[e.tipo_evento] || e.tipo_evento)}</td><td>${esc(ROTULO_CATEGORIA_ALERTA[e.categoria] || e.categoria)}</td><td>${esc(e.email_destino)}</td><td>${esc(e.status)}</td><td>${formatarHorario(e.enviado_em)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhum e-mail de alerta registrado para este pedido.</p>';
        conteudo.innerHTML = `<p><strong>${esc(aluno)}</strong></p><h3 style="margin-top:14px;">Ocorrências</h3>${blocoOcorrencias}<h3 style="margin-top:18px;">Avisos enviados / pendentes</h3>${blocoEnvios}`;
    } catch (err) {
        conteudo.innerHTML = `<p style="color:#b42318;">${esc(err.message)}</p>`;
    }
}

async function carregarHistoricoSecretaria() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('tabelaHistoricoSecretariaBody');
    if (!tbody) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/historico-geral`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao carregar histórico');

        historicoSecretariaCache = await resp.json();
        renderizarHistoricoSecretaria();

        // "Aprovadas hoje": pedidos de hoje que a secretaria aprovou e que seguiram adiante
        const hoje = new Date();
        const aprovadasHoje = historicoSecretariaCache.filter(p =>
            ['APROVADA', 'EM_SAIDA', 'CONCLUIDA'].includes(p.status) &&
            p.hora_prevista_saida && mesmoDia(new Date(p.hora_prevista_saida), hoje)
        ).length;
        const elemCountHoje = document.getElementById('count-hoje');
        if (elemCountHoje) elemCountHoje.textContent = aprovadasHoje;
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="color:red;">Erro ao carregar histórico.</td></tr>';
    }
}

// ==========================================
// 3b. GERENCIAR ALUNOS (troca de turma / status)
// ==========================================
let turmasCache = [];
let alunosCache = [];

async function carregarGerenciarAlunos() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('tabelaGerenciarAlunosBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6">Carregando alunos...</td></tr>';

    try {
        const [respAlunos, respTurmas] = await Promise.all([
            fetch(`${API_URL}/alunos/buscarTodos`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/turmas`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (!respAlunos.ok || !respTurmas.ok) throw new Error('Falha ao buscar alunos/turmas');

        alunosCache = await respAlunos.json();
        turmasCache = await respTurmas.json();

        const selectFiltroTurma = document.getElementById('filtroAlunoTurma');
        if (selectFiltroTurma && selectFiltroTurma.options.length <= 1) {
            turmasCache.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id_turma;
                option.textContent = `${t.sala_turma} (${t.turno})`;
                selectFiltroTurma.appendChild(option);
            });
        }

        renderizarGerenciarAlunos(alunosCache);
    } catch (err) {
        console.error('Erro ao carregar gerenciamento de alunos:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Erro ao carregar alunos.</td></tr>';
    }
}

function renderizarGerenciarAlunos(alunos) {
    const tbody = document.getElementById('tabelaGerenciarAlunosBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (alunos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Nenhum aluno encontrado para os filtros selecionados.</td></tr>';
        return;
    }

    const opcoesTurma = turmasCache
        .map(t => `<option value="${t.id_turma}">${t.sala_turma} (${t.turno})</option>`)
        .join('');

    alunos.forEach(aluno => {
        const tr = document.createElement('tr');
        const temFoto = aluno.tem_foto === 1 || aluno.tem_foto === true || aluno.tem_foto === '1';
        tr.innerHTML = `
            <td>
                ${PIFoto.html(aluno.aluno_id, { tamanho: 'm', nome: aluno.nome })}
                <button type="button" class="btn-foto-aluno" data-id="${aluno.aluno_id}">${temFoto ? 'Trocar foto' : 'Adicionar foto'}</button>
            </td>
            <td>${esc(aluno.nome)}${temFoto ? '' : '<span class="badge-sem-foto">sem foto</span>'}</td>
            <td>${esc(aluno.matricula || '-')}</td>
            <td>
                <select class="select-turma-aluno" data-id="${aluno.aluno_id}" aria-label="Turma de ${esc(aluno.nome)}">
                    <option value="" disabled>Selecione</option>
                    ${opcoesTurma}
                </select>
            </td>
            <td>
                <select class="select-status-aluno" data-id="${aluno.aluno_id}" aria-label="Situação de ${esc(aluno.nome)}">
                    <option value="ATIVO">ATIVO</option>
                    <option value="INATIVO">INATIVO</option>
                </select>
            </td>
            <td>
                <button type="button" class="btn-action btn-accept btn-salvar-aluno" data-id="${aluno.aluno_id}" aria-label="Salvar alterações de ${esc(aluno.nome)}" title="Salvar">
                    <i class="fas fa-save"></i>
                </button>
            </td>
        `;
        tr.querySelector('.select-turma-aluno').value = aluno.turma_id || '';
        tr.querySelector('.select-status-aluno').value = (aluno.status || 'ATIVO').toUpperCase();
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-salvar-aluno').forEach(btn => {
        btn.addEventListener('click', () => salvarAlteracaoAluno(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-foto-aluno').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('inputFotoGerenciar');
            input.dataset.alunoId = btn.dataset.id;
            input.value = '';
            input.click();
        });
    });
}

// Escolhida a foto em Gerenciar Alunos: recorta em 3x4, envia e atualiza a linha.
document.getElementById('inputFotoGerenciar')?.addEventListener('change', async e => {
    const input = e.target;
    const alunoId = input.dataset.alunoId;
    const arquivo = input.files && input.files[0];
    if (!alunoId || !arquivo) return;
    try {
        const blob = await PIFoto.preparar(arquivo);
        await PIFoto.enviar(alunoId, blob);
        const aluno = alunosCache.find(a => String(a.aluno_id) === String(alunoId));
        if (aluno) aluno.tem_foto = 1;
        aplicarFiltrosAlunos();
    } catch (err) {
        alert(err.message);
    } finally {
        input.value = '';
    }
});

function aplicarFiltrosAlunos() {
    const busca = (document.getElementById('filtroAlunoBusca')?.value || '').trim().toLowerCase();
    const turmaId = document.getElementById('filtroAlunoTurma')?.value || '';
    const status = document.getElementById('filtroAlunoStatus')?.value || '';

    const filtrados = alunosCache.filter(aluno => {
        const bateBusca = !busca
            || (aluno.nome || '').toLowerCase().includes(busca)
            || (aluno.matricula || '').toLowerCase().includes(busca);
        const bateTurma = !turmaId || String(aluno.turma_id) === String(turmaId);
        const bateStatus = !status || (aluno.status || '').toUpperCase() === status;
        return bateBusca && bateTurma && bateStatus;
    });

    renderizarGerenciarAlunos(filtrados);
}

['filtroAlunoTurma', 'filtroAlunoStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', aplicarFiltrosAlunos);
});
const filtroAlunoBuscaInput = document.getElementById('filtroAlunoBusca');
if (filtroAlunoBuscaInput) filtroAlunoBuscaInput.addEventListener('input', aplicarFiltrosAlunos);

async function salvarAlteracaoAluno(aluno_id) {
    const token = localStorage.getItem('token');
    const selectTurma = document.querySelector(`.select-turma-aluno[data-id="${aluno_id}"]`);
    const selectStatus = document.querySelector(`.select-status-aluno[data-id="${aluno_id}"]`);

    const corpo = {
        turma_id: selectTurma ? selectTurma.value : null,
        status: selectStatus ? selectStatus.value : null
    };

    try {
        const resp = await fetch(`${API_URL}/alunos/turma-status/${aluno_id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(corpo)
        });

        const data = await resp.json();

        if (resp.ok) {
            alert('Aluno atualizado com sucesso!');
        } else {
            alert('Erro: ' + (data.erro || 'Falha ao atualizar aluno'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}

// ==========================================
// 3a. GERENCIAR PERFIS (ativar / desativar acesso)
// ==========================================
let perfisCache = [];
const ROTULO_TIPO_PERFIL = { PAI: 'Responsável', PORTARIA: 'Portaria', PORTEIRO: 'Portaria', SECRETARIA: 'Secretaria', PROFESSOR: 'Professor', ADMIN: 'Admin' };

async function carregarPerfis() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('tabelaPerfisBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6">Carregando perfis...</td></tr>';
    try {
        const resp = await fetch(`${API_URL}/usuarios/perfis`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!resp.ok) throw new Error('Falha ao buscar perfis');
        perfisCache = await resp.json();
        aplicarFiltrosPerfis();
    } catch (err) {
        console.error('Erro ao carregar perfis:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Erro ao carregar perfis.</td></tr>';
    }
}

function aplicarFiltrosPerfis() {
    const busca = (document.getElementById('filtroPerfilBusca')?.value || '').trim().toLowerCase();
    const tipo = document.getElementById('filtroPerfilTipo')?.value || '';
    const status = document.getElementById('filtroPerfilStatus')?.value || '';

    const filtrados = perfisCache.filter(p => {
        const tipoNorm = p.tipo_usuario === 'PORTEIRO' ? 'PORTARIA' : p.tipo_usuario;
        const bateBusca = !busca
            || (p.nome || '').toLowerCase().includes(busca)
            || (p.email || '').toLowerCase().includes(busca)
            || (p.alunos || '').toLowerCase().includes(busca);
        const bateTipo = !tipo || tipoNorm === tipo;
        const bateStatus = !status || (status === 'ativo' ? p.ativo : !p.ativo);
        return bateBusca && bateTipo && bateStatus;
    });
    renderizarPerfis(filtrados);
}

function renderizarPerfis(perfis) {
    const tbody = document.getElementById('tabelaPerfisBody');
    if (!tbody) return;

    if (perfis.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Nenhum perfil encontrado para os filtros selecionados.</td></tr>';
        return;
    }

    tbody.innerHTML = perfis.map(p => `
        <tr class="${p.ativo ? '' : 'perfil-desativado'}">
            <td>${esc(p.nome)}${p.eu ? ' <small>(você)</small>' : ''}</td>
            <td>${esc(p.email)}</td>
            <td>${ROTULO_TIPO_PERFIL[p.tipo_usuario] || esc(p.tipo_usuario)}</td>
            <td>${esc(p.alunos || '-')}</td>
            <td><span class="status ${p.ativo ? 'status-ativo' : 'status-desativado'}">${p.ativo ? 'Ativo' : 'Desativado'}</span></td>
            <td>
                <button type="button" class="btn-perfil ${p.ativo ? 'desativar' : 'reativar'}"
                        data-id="${p.id_usuario}" data-ativo="${p.ativo ? '0' : '1'}" ${p.eu ? 'disabled title="Você não pode desativar o próprio perfil"' : ''}>
                    ${p.ativo ? '<i class="fas fa-user-slash"></i> Desativar' : '<i class="fas fa-user-check"></i> Reativar'}
                </button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.btn-perfil').forEach(btn => {
        btn.addEventListener('click', () => alterarStatusPerfil(Number(btn.dataset.id), btn.dataset.ativo === '1'));
    });
}

async function alterarStatusPerfil(id, ativar) {
    const perfil = perfisCache.find(p => p.id_usuario === id);
    if (!perfil) return;

    const pergunta = ativar
        ? `Reativar o perfil de ${perfil.nome}? Ele voltará a poder entrar no sistema.`
        : `Desativar o perfil de ${perfil.nome}? Ele perderá o acesso ao sistema imediatamente.`;
    if (!confirm(pergunta)) return;

    try {
        const resp = await fetch(`${API_URL}/usuarios/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ ativo: ativar })
        });
        const data = await resp.json();
        if (!resp.ok) {
            alert('Erro: ' + (data.erro || 'Falha ao alterar o perfil'));
            return;
        }
        perfil.ativo = ativar;
        perfil.status = ativar ? '1' : '0';
        aplicarFiltrosPerfis();
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}

['filtroPerfilTipo', 'filtroPerfilStatus'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', aplicarFiltrosPerfis);
});
document.getElementById('filtroPerfilBusca')?.addEventListener('input', aplicarFiltrosPerfis);

// ==========================================
// 3b. RELATÓRIOS — a tela inteira fica em js/general/relatorio.js (PIRelatorio)
// ==========================================
function carregarPainelEstatisticas() {
    if (window.PIRelatorio) window.PIRelatorio.abrir();
}

// ==========================================
// 4. AUTENTICAÇÃO E INICIALIZAÇÃO
// ==========================================
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) {
        window.location.href = 'login.html';
        return;
    }

    const usuarioLogado = JSON.parse(localStorage.getItem('usuario') || '{}');
    if ((usuarioLogado.tipo_usuario || '').toUpperCase() === 'ADMIN') {
        const linkTrocarPainel = document.getElementById('linkTrocarPainel');
        if (linkTrocarPainel) linkTrocarPainel.style.display = 'block';
    }


    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            aplicarTema(newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    const savedTheme = localStorage.getItem('theme') || 'light';
    aplicarTema(savedTheme);

    // Links da sidebar das telas avulsas (ex.: professores-admin.html -> secretaria.html?tela=tela-painel)
    const telaPedida = new URLSearchParams(window.location.search).get('tela');
    if (telaPedida && document.getElementById(telaPedida)) mostrarTela(telaPedida);

    document.getElementById('filtroTempo')?.addEventListener('change', renderizarHistoricoSecretaria);

    carregarPendentes();
    carregarHistoricoSecretaria();

    // Atualização automática: solicitações novas dos pais aparecem sozinhas, sem recarregar a página.
    setInterval(() => {
        if (document.hidden) return;
        carregarPendentes();
        carregarHistoricoSecretaria();
    }, 15000);

    // Tempo real: pedido novo, aprovado, recusado ou liberado atualiza a lista na hora.
    if (window.PITempoReal) {
        let espera;
        const recarregar = () => { clearTimeout(espera); espera = setTimeout(() => { carregarPendentes(); carregarHistoricoSecretaria(); }, 300); };
        PITempoReal.on('pedido', recarregar);
        PITempoReal.on('reconectado', recarregar);
    }
});
// Campo de foto 3x4 da tela Vincular Responsável: recorta e mostra a prévia ao escolher o arquivo.
(function () {
    const campo = document.getElementById('fotoAlunoVinculo');
    const previa = document.getElementById('fotoAlunoPrevia');
    if (campo && previa && window.PIFoto) PIFoto.ligarCampo(campo, previa);
})();
