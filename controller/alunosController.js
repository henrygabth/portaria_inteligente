//Alunos controller
// Chamar o Model
const alunos = require('../model/alunosModel');
const responsaveisAlunosModel = require('../model/responsaveisAlunosModel');

// A foto chega já recortada em 3x4 e comprimida pelo navegador (JPEG, poucas dezenas de KB).
// Aqui o servidor só confere o tamanho e o tipo REAL do arquivo (assinatura JPEG), sem confiar
// no cabeçalho enviado.
const LIMITE_FOTO_BYTES = 400 * 1024;
const ehJpeg = b => Buffer.isBuffer(b) && b.length > 4 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
// Quem pode VER a foto: secretaria/admin, portaria (identifica o aluno) e o responsável vinculado.
// Professor não vê (não faz parte do fluxo de identificação).
const PAPEIS_VEEM_FOTO = ['SECRETARIA', 'ADMIN', 'PORTARIA', 'PORTEIRO'];

const alunosController = {
    cadastrar: async (req, res) => {
        try {
            const { nome, matricula, turma_id, data_nascimento, status, data_criacao } = req.body;
            if (!nome || !matricula || !turma_id || !data_nascimento || !status || !data_criacao) {
                return res.status(400).json({ "erro": "Todos os campos são obrigatórios" });
            }
            const aluno_id = await alunos.cadastrar(
                nome, matricula, turma_id, data_nascimento, status, data_criacao
            );
            return res.status(200).json({ "mensagem": `Aluno ${aluno_id} cadastrado com sucesso` });
        } catch (error) {
            console.log(error);
            return res.status(500).json({ "erro": "Erro ao cadastrar aluno" });
        }
    },

    enviarFoto: async (req, res) => {
        try {
            const aluno_id = Number(req.params.id);
            if (!Number.isInteger(aluno_id) || aluno_id <= 0) return res.status(400).json({ erro: 'Aluno inválido.' });
            const dados = req.body;
            if (!Buffer.isBuffer(dados) || dados.length === 0) return res.status(400).json({ erro: 'Envie a foto do aluno.' });
            if (dados.length > LIMITE_FOTO_BYTES) return res.status(413).json({ erro: 'A foto é grande demais (máximo 400 KB).' });
            if (!ehJpeg(dados)) return res.status(400).json({ erro: 'Formato inválido. Envie uma imagem JPG, PNG ou WEBP.' });
            const [aluno] = await alunos.buscarPorId(aluno_id);
            if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
            await alunos.salvarFoto(aluno_id, 'image/jpeg', dados, req.usuario.id_usuario);
            return res.status(200).json({ mensagem: 'Foto salva com sucesso.' });
        } catch (error) {
            console.error('Erro ao salvar foto do aluno:', error);
            return res.status(500).json({ erro: 'Erro ao salvar a foto do aluno.' });
        }
    },

    obterFoto: async (req, res) => {
        try {
            const aluno_id = Number(req.params.id);
            if (!Number.isInteger(aluno_id) || aluno_id <= 0) return res.status(400).json({ erro: 'Aluno inválido.' });
            const papel = String(req.usuario.tipo_usuario || '').toUpperCase();
            if (papel === 'PAI') {
                if (!(await responsaveisAlunosModel.pertence(req.usuario.id_usuario, aluno_id))) {
                    return res.status(403).json({ erro: 'Este aluno não está vinculado à sua conta.' });
                }
            } else if (!PAPEIS_VEEM_FOTO.includes(papel)) {
                return res.status(403).json({ erro: 'Sem permissão para ver a foto.' });
            }
            const foto = await alunos.buscarFoto(aluno_id);
            if (!foto) return res.status(404).json({ erro: 'Aluno sem foto.' });
            res.set({
                'Content-Type': foto.mime || 'image/jpeg',
                'Cache-Control': 'private, max-age=60',
                'X-Content-Type-Options': 'nosniff'
            });
            return res.status(200).send(foto.dados);
        } catch (error) {
            console.error('Erro ao buscar foto do aluno:', error);
            return res.status(500).json({ erro: 'Erro ao buscar a foto do aluno.' });
        }
    },

    listarTodos: async (req, res) => {
        try {
            const resultado = await alunos.buscarTodos();
            return res.status(200).json(resultado);
        } catch (error) {
            console.log(error);
            return res.status(500).json({ "erro": "Erro ao buscar os alunos" });
        }
    },

    atualizar: async (req, res) => {
        try {
            const { nome, matricula, turma_id, data_nascimento, status, data_criacao } = req.body;
            const aluno_id = req.params.id;
            const resultado = await alunos.atualizar(
                nome, matricula, turma_id, data_nascimento, status, data_criacao, aluno_id
            );
            if (resultado > 0) {
                return res.status(200).json({ "mensagem": `Aluno ${aluno_id} atualizado com sucesso` });
            } else {
                return res.status(404).json({ "erro": "Aluno não encontrado" });
            }
        } catch (error) {
            return res.status(500).json({ "erro": "Erro ao atualizar aluno" });
        }
    },

    apagar: async (req, res) => {
        try {
            const id = req.params.id;
            const resultado = await alunos.apagar(id);
            if (resultado) {
                res.status(200).json({ "resultado": "Removido" });
            } else {
                res.status(204).send();
            }
        } catch (error) {
            res.status(500).json({ "erro": "Erro ao apagar." });
        }
    },

    // Tela "Gerenciar Alunos" da secretaria: troca de turma (virada de ano
    // letivo) e/ou ativar/desativar o aluno, sem precisar reenviar o cadastro inteiro.
    atualizarTurmaEStatus: async (req, res) => {
        try {
            const aluno_id = req.params.id;
            const { turma_id, status } = req.body;

            if (!turma_id && !status) {
                return res.status(400).json({ erro: "Informe turma_id e/ou status para atualizar." });
            }

            const ok = await alunos.atualizarTurmaEStatus(aluno_id, turma_id || null, status || null);
            if (!ok) return res.status(404).json({ erro: "Aluno não encontrado." });
            res.json({ mensagem: "Aluno atualizado com sucesso." });
        } catch (error) {
            console.error('Erro ao atualizar turma/status do aluno:', error);
            res.status(500).json({ erro: "Erro ao atualizar aluno." });
        }
    },

    buscarPorNome: async (req, res) => {
        try {
            const { nome } = req.body;
            const resultado = await alunos.buscarPorNome(nome);
            if (!resultado) {
                res.status(404).json({ "resultado": "Aluno não encontrado" });
            }
            res.status(200).json(resultado);
        } catch (error) {
            res.status(500).json({ "erro": "Erro ao buscar" });
        }
    },

    buscarPorId: async (req, res) => {
        try {
            const { id } = req.body;
            const resultado = await alunos.buscarPorId(id);
            if (!resultado) {
                res.status(404).json({ "resultado": "Aluno não encontrado" });
            }
            res.status(200).json(resultado);
        } catch (error) {
            res.status(500).json({ "erro": "Erro ao buscar" });
        }
    },

    buscarPorMatricula: async (req, res) => {
        try {
            const { matricula } = req.body;
            const resultado = await alunos.buscarPorMatricula(matricula);
            if (!resultado) {
                res.status(404).json({ "resultado": "Aluno não encontrado" });
            }
            res.status(200).json({ resultado });
        } catch (error) {
            res.status(500).json({ "erro": "Erro ao buscar" });
        }
    },

    buscarPorTurma: async (req, res) => {
        try {
            const { turma_id } = req.body;
            const resultado = await alunos.buscarPorTurma(turma_id);
            if (!resultado) {
                res.status(404).json({ "resultado": "Turma não encontrada" });
            }
            res.status(200).json({ resultado });
        } catch (error) {
            res.status(500).json({ "erro": "Erro ao buscar" });
        }
    },

    buscarPorStatus: async (req, res) => {
        try {
            const { status } = req.body;
            const resultado = await alunos.buscarPorStatus(status);
            if (!resultado) {
                res.status(404).json({ "erro": "Status inválido" });
            }
            res.status(200).json({ resultado });
        } catch (error) {
            res.status(500).json({ "erro": "Erro ao buscar" });
        }
    }
};

module.exports = alunosController;
