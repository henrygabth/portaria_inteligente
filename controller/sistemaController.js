// Tela "Saúde do sistema" e backup do banco (administração).
const os = require('os');
const backup = require('../utils/backup');
const { registrar: auditar } = require('../utils/auditoria');

async function medir(fn) {
    const ini = process.hrtime.bigint();
    try { const valor = await fn(); return { ok: true, ms: Number(process.hrtime.bigint() - ini) / 1e6, valor }; }
    catch (err) { return { ok: false, ms: Number(process.hrtime.bigint() - ini) / 1e6, erro: err.message }; }
}
const consulta = (db, sql, p) => db.query(sql, p).then(([r]) => r);

// Situação geral: 'ok' (verde), 'atencao' (amarelo) ou 'erro' (vermelho).
function nivel(itens) {
    if (itens.some(i => i.situacao === 'erro')) return 'erro';
    if (itens.some(i => i.situacao === 'atencao')) return 'atencao';
    return 'ok';
}

module.exports = {
    saude: async (req, res) => {
        const db = require('../config/banco');
        const itens = [];

        const ping = await medir(() => consulta(db, 'SELECT 1'));
        itens.push({ chave: 'banco', titulo: 'Banco de dados', situacao: !ping.ok ? 'erro' : ping.ms > 500 ? 'atencao' : 'ok',
            detalhe: ping.ok ? `Respondendo em ${Math.round(ping.ms)} ms` : `Sem conexão: ${ping.erro}` });

        const tamanho = await medir(() => consulta(db, `SELECT COUNT(*) AS tabelas, ROUND(SUM(data_length + index_length) / 1048576, 1) AS mb
            FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`));
        if (tamanho.ok) itens.push({ chave: 'tamanho', titulo: 'Tamanho do banco', situacao: 'ok', detalhe: `${tamanho.valor[0].mb || 0} MB em ${tamanho.valor[0].tabelas} tabelas` });

        const { estado } = require('../utils/agendador');
        const minutos = estado.ultimaVerificacao ? (Date.now() - estado.ultimaVerificacao.getTime()) / 60000 : null;
        itens.push({ chave: 'agendador', titulo: 'Rotinas automáticas (atrasos, horários fixos)', situacao: minutos === null ? 'erro' : minutos > 3 ? 'atencao' : 'ok',
            detalhe: minutos === null ? 'Ainda não rodaram desde que o servidor ligou.' : `Última verificação há ${minutos < 1 ? 'menos de 1 minuto' : Math.round(minutos) + ' min'}` });

        const fila = await medir(() => consulta(db, `SELECT
            SUM(status = 'PENDENTE') AS pendentes, SUM(status = 'ENVIADO' AND enviado_em > DATE_SUB(NOW(), INTERVAL 1 DAY)) AS enviados,
            SUM(status = 'PENDENTE' AND tentativas >= 3) AS travados FROM alertas_email_envios`));
        const emailConfig = !!((process.env.BREVO_API_KEY || '').trim() || (process.env.EMAIL_USER || '').trim());
        const f = fila.ok ? fila.valor[0] : {};
        itens.push({ chave: 'email', titulo: 'E-mails de aviso', situacao: !emailConfig ? 'erro' : Number(f.travados) > 0 ? 'atencao' : 'ok',
            detalhe: !emailConfig ? 'Nenhum serviço de e-mail configurado (BREVO_API_KEY ou EMAIL_USER).'
                : `${Number(f.enviados) || 0} enviados nas últimas 24h · ${Number(f.pendentes) || 0} na fila${Number(f.travados) ? ` · ${f.travados} com falhas repetidas` : ''}` });

        const push = await medir(() => require('../model/pushModel').contarTodas());
        itens.push({ chave: 'push', titulo: 'Notificações no celular', situacao: push.ok ? 'ok' : 'atencao',
            detalhe: push.ok ? `${push.valor.aparelhos} aparelho(s) de ${push.valor.usuarios} pessoa(s) recebendo avisos` : 'Tabela de notificações indisponível.' });

        const arquivos = backup.listarArquivos();
        const ultimoRegistro = await medir(() => consulta(db, "SELECT valor FROM config_sistema WHERE chave IN ('ultimo_backup', 'ultimo_backup_erro') ORDER BY atualizado_em DESC LIMIT 1"));
        let infoBackup = null; try { infoBackup = ultimoRegistro.ok && ultimoRegistro.valor[0] ? JSON.parse(ultimoRegistro.valor[0].valor) : null; } catch (_) { /* ignora */ }
        const ultimo = arquivos[0];
        const horas = ultimo ? (Date.now() - new Date(ultimo.criado_em).getTime()) / 3600000 : null;
        itens.push({ chave: 'backup', titulo: 'Backup automático', situacao: infoBackup && infoBackup.erro ? 'erro' : horas === null || horas > 30 ? 'atencao' : 'ok',
            detalhe: infoBackup && infoBackup.erro ? `Último backup falhou: ${infoBackup.erro}`
                : ultimo ? `Último: ${new Date(ultimo.criado_em).toLocaleString('pt-BR')} (${Math.round(ultimo.bytes / 1024)} KB) · ${arquivos.length} guardado(s) no servidor`
                    : 'Nenhum backup guardado no servidor ainda. Baixe um agora pelo botão abaixo.' });

        const seguranca = await medir(() => consulta(db, `SELECT SUM(acao = 'LOGIN_FALHOU') AS falhas, SUM(acao = 'LOGIN_2FA_FALHOU') AS codigos,
            SUM(acao = 'IDENTIFICACAO_NAO_CONFERE') AS identificacao FROM auditoria WHERE criado_em > DATE_SUB(NOW(), INTERVAL 1 DAY)`));
        if (seguranca.ok) {
            const s = seguranca.valor[0];
            const falhas = Number(s.falhas) || 0;
            itens.push({ chave: 'seguranca', titulo: 'Segurança (últimas 24h)', situacao: falhas > 30 || Number(s.identificacao) ? 'atencao' : 'ok',
                detalhe: `${falhas} senha(s) errada(s) · ${Number(s.codigos) || 0} código(s) errado(s) · ${Number(s.identificacao) || 0} aluno(s) que não conferiram com a foto` });
        }

        const mem = process.memoryUsage();
        const servidor = {
            no_ar_desde: new Date(Date.now() - process.uptime() * 1000).toISOString(),
            uptime_horas: Math.round(process.uptime() / 360) / 10,
            memoria_mb: Math.round(mem.rss / 1048576),
            node: process.version,
            fuso: process.env.TZ,
            hora_servidor: new Date().toISOString(),
            conexoes_tempo_real: require('../utils/tempoReal').totalConexoes(),
            carga: os.loadavg()[0].toFixed(2)
        };
        res.json({ situacao: nivel(itens), itens, servidor, backups: arquivos.slice(0, 10) });
    },

    // Download do backup na hora (ADMIN). Vai direto do banco para o navegador, compactado.
    baixarBackup: async (req, res) => {
        const nome = backup.nomeArquivo();
        auditar(req, 'BACKUP_BAIXADO', { descricao: `Baixou o backup ${nome}` });
        res.set({ 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
        try { await backup.escreverBackup(res); }
        catch (err) {
            console.error('[backup] Falha no download:', err.message);
            if (!res.headersSent) res.status(500).json({ erro: 'Não foi possível gerar o backup.' }); else res.destroy(err);
        }
    },

    // Gera agora um backup no servidor (além do diário).
    gerarBackup: async (req, res) => {
        try {
            const r = await backup.backupEmArquivo();
            await require('../config/banco').query("INSERT INTO config_sistema (chave, valor) VALUES ('ultimo_backup', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
                [JSON.stringify({ ...r, em: new Date().toISOString(), tipo: 'manual' })]).catch(() => {});
            auditar(req, 'BACKUP_GERADO', { descricao: `Gerou o backup ${r.arquivo} no servidor` });
            res.status(201).json({ mensagem: `Backup ${r.arquivo} gerado (${Math.round(r.bytes / 1024)} KB).`, ...r });
        } catch (err) {
            console.error('[backup] Falha ao gerar:', err.message);
            res.status(500).json({ erro: `Não foi possível gerar o backup: ${err.message}` });
        }
    },
    _nivel: nivel
};
