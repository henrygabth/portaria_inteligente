// utils/importarAlunos.js — confere as linhas da planilha de alunos antes de gravar.
// A planilha é lida no navegador (Excel .xlsx ou .csv) e chega aqui como lista de objetos.
const LIMITE_LINHAS = 2000;

const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Aceita 25/03/2012, 25-03-2012, 2012-03-25 e número de série do Excel (ex.: 40993).
function lerData(valor) {
    if (valor === null || valor === undefined || String(valor).trim() === '') return { ok: true, valor: null };
    const t = String(valor).trim();
    let a, m, d;
    let r = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (r) { d = +r[1]; m = +r[2]; a = +r[3]; }
    else if ((r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { a = +r[1]; m = +r[2]; d = +r[3]; }
    else if (/^\d{4,5}(\.\d+)?$/.test(t)) {
        const base = new Date(Date.UTC(1899, 11, 30));
        const dt = new Date(base.getTime() + Math.floor(Number(t)) * 86400000);
        a = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    } else return { ok: false };
    const dt = new Date(Date.UTC(a, m - 1, d));
    if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { ok: false };
    if (a < 1990 || dt > new Date()) return { ok: false };
    return { ok: true, valor: `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

// Cada linha vira { linha, nome, matricula, turma_id, turma, data_nascimento, situacao, motivo }.
// situacao: 'novo' | 'existe' | 'erro'
function conferir(linhas, turmas, { matriculasExistentes = new Set(), nomesExistentes = new Set(), criarTurmas = false } = {}) {
    if (!Array.isArray(linhas) || !linhas.length) throw Object.assign(new Error('A planilha está vazia.'), { status: 400 });
    if (linhas.length > LIMITE_LINHAS) throw Object.assign(new Error(`Envie no máximo ${LIMITE_LINHAS} alunos por vez.`), { status: 400 });
    const porNome = new Map(turmas.map(t => [semAcento(t.sala_turma), t]));
    const vistasMatricula = new Set(), vistosNomeTurma = new Set();
    const turmasNovas = new Set();
    return linhas.map((l, i) => {
        const linha = Number(l?.linha) || i + 2; // linha 1 = cabeçalho na planilha
        const nome = String(l?.nome ?? '').replace(/\s+/g, ' ').trim();
        const matricula = String(l?.matricula ?? '').trim();
        const turmaTxt = String(l?.turma ?? '').replace(/\s+/g, ' ').trim();
        const base = { linha, nome, matricula: matricula || null, turma: turmaTxt, data_nascimento: null, turma_id: null };
        const erro = motivo => ({ ...base, situacao: 'erro', motivo });

        if (nome.length < 3) return erro('Nome do aluno vazio ou muito curto.');
        if (nome.length > 150) return erro('Nome com mais de 150 caracteres.');
        if (/[<>{}=]/.test(nome)) return erro('Nome com caracteres inválidos.');
        if (matricula && (matricula.length > 50 || !/^[\w./-]+$/.test(matricula))) return erro('Matrícula inválida (use letras, números, ponto, barra ou traço).');
        if (!turmaTxt) return erro('Turma não informada.');
        const turma = porNome.get(semAcento(turmaTxt));
        if (!turma && !criarTurmas) return erro(`Turma "${turmaTxt}" não existe. Cadastre a turma ou marque "criar turmas que faltarem".`);
        if (!turma) { if (turmaTxt.length > 100) return erro('Nome da turma muito longo.'); turmasNovas.add(turmaTxt); }
        const data = lerData(l?.data_nascimento);
        if (!data.ok) return erro('Data de nascimento inválida (use dd/mm/aaaa).');

        const chaveNome = `${semAcento(nome)}|${semAcento(turmaTxt)}`;
        if (matricula && vistasMatricula.has(matricula.toLowerCase())) return erro('Matrícula repetida na própria planilha.');
        if (vistosNomeTurma.has(chaveNome)) return erro('Aluno repetido na própria planilha (mesmo nome e turma).');
        if (matricula) vistasMatricula.add(matricula.toLowerCase());
        vistosNomeTurma.add(chaveNome);

        const pronto = { ...base, turma: turma ? turma.sala_turma : turmaTxt, turma_id: turma ? turma.id_turma : null, data_nascimento: data.valor, turma_nova: !turma };
        if ((matricula && matriculasExistentes.has(matricula.toLowerCase())) || nomesExistentes.has(chaveNome)) {
            return { ...pronto, situacao: 'existe', motivo: 'Já cadastrado: será mantido como está.' };
        }
        return { ...pronto, situacao: 'novo', motivo: turma ? null : 'Turma nova será criada.' };
    });
}

module.exports = { conferir, lerData, semAcento, LIMITE_LINHAS };
