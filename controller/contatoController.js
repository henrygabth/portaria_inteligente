// Formulário público "Peça uma demonstração" (página conheca.html, usada no link da bio).
// Salva o pedido e avisa os administradores por e-mail. Não exige login.
const contatos = require('../model/contatosModel');
const { emailValido, escaparHtml } = require('../utils/seguranca');
const { enviarEmail } = require('../utils/email');
const { montarEmailHtml } = require('../utils/emailTemplate');

const CARGOS = ['Direção', 'Coordenação', 'Secretaria', 'Mantenedor(a)', 'Professor(a)', 'Pai, mãe ou responsável', 'Outro'];
const FAIXAS = ['Até 200', '201 a 500', '501 a 1.000', 'Mais de 1.000', 'Não sei'];
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

module.exports = {
    CARGOS, FAIXAS,
    enviar: async (req, res) => {
        try {
            const b = req.body || {};
            // Campo invisível: pessoas não preenchem, robôs sim. Finge que deu certo.
            if (String(b.site ?? '').trim()) return res.status(201).json({ mensagem: 'Recebemos o seu pedido. Em breve entraremos em contato.' });
            const c = {
                nome: texto(b.nome, 120), escola: texto(b.escola, 150), cargo: texto(b.cargo, 40),
                email: String(b.email ?? '').trim().toLowerCase().slice(0, 150),
                telefone: String(b.telefone ?? '').replace(/\D/g, '').slice(0, 13),
                alunos: texto(b.alunos, 20), mensagem: String(b.mensagem ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 1000)
            };
            if (c.nome.length < 3) return res.status(400).json({ erro: 'Informe o seu nome.' });
            if (c.escola.length < 3) return res.status(400).json({ erro: 'Informe o nome da escola.' });
            if (!CARGOS.includes(c.cargo)) return res.status(400).json({ erro: 'Escolha o seu cargo.' });
            if (!emailValido(c.email)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
            if (c.telefone && (c.telefone.length < 10 || c.telefone.length > 13)) return res.status(400).json({ erro: 'Telefone inválido (DDD + número) ou deixe em branco.' });
            if (!FAIXAS.includes(c.alunos)) return res.status(400).json({ erro: 'Escolha o número de alunos.' });
            if (b.aceite !== true) return res.status(400).json({ erro: 'Confirme que podemos usar estes dados para responder ao seu pedido.' });

            const id = await contatos.cadastrar(c);
            avisarAdmins(id, c).catch(err => console.error('[contato] Falha ao avisar os administradores:', err.message));
            return res.status(201).json({ mensagem: 'Recebemos o seu pedido. Em breve entraremos em contato.' });
        } catch (err) {
            console.error('Erro ao salvar contato:', err);
            return res.status(500).json({ erro: 'Não foi possível enviar agora. Tente de novo em alguns minutos.' });
        }
    }
};

async function avisarAdmins(id, c) {
    const destinos = await contatos.emailsAdmins();
    const linhas = [['Nome', c.nome], ['Escola', c.escola], ['Cargo', c.cargo], ['E-mail', c.email],
        ['Telefone', c.telefone || '—'], ['Alunos', c.alunos], ['Mensagem', c.mensagem || '—']];
    for (const to of destinos) {
        await enviarEmail({
            to, tag: 'contato-comercial', tentativas: 2,
            subject: `Novo pedido de demonstração: ${c.escola}`,
            text: `Pedido nº ${id}\n` + linhas.map(([k, v]) => `${k}: ${v}`).join('\n'),
            html: montarEmailHtml({
                titulo: 'Novo pedido de demonstração',
                saudacao: 'Olá,',
                paragrafos: [`Alguém pediu uma demonstração pela página de apresentação (pedido nº ${id}).`],
                destaque: linhas.map(([k, v]) => `<p style="margin:0 0 6px 0;color:#2d3748;font-size:13px;"><strong>${k}:</strong> ${escaparHtml(v)}</p>`).join(''),
                rodape: `Responda direto para ${escaparHtml(c.email)}.`
            })
        });
    }
}
