// Assistente de primeira execução: cria/atualiza .env somente no computador do usuário.
// Nunca presume que a senha do Windows seja a senha do MySQL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');

const NECESSARIOS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

function valorConfigurado(valor) {
    const texto = String(valor || '').trim();
    return Boolean(texto) && !/^(COLOQUE_|SUBSTITUA_|SUA_SENHA|SEU_HOST|SEU_USUARIO|SEU_BANCO|GERE_)/i.test(texto);
}

function faltamCredenciais(env = process.env) {
    return NECESSARIOS.some(nome => !valorConfigurado(env[nome])) ||
        !valorConfigurado(env.JWT_SECRET);
}

function salvarConfiguracao(destino, valores) {
    let conteudo = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : '';
    for (const [chave, valor] of Object.entries(valores)) {
        if (!/^[A-Z0-9_]+$/.test(chave)) throw new Error('Variável inválida');
        // Mantém o restante do .env intacto, mas atualiza valores antigos se existirem.
        const linha = `${chave}=${valor}`;
        const re = new RegExp(`^${chave}=.*$`, 'm');
        conteudo = re.test(conteudo) ? conteudo.replace(re, linha) : `${conteudo.trimEnd()}\n${linha}\n`;
    }
    fs.writeFileSync(destino, conteudo.trimStart(), { mode: 0o600 });
}

function perguntarSenhaOculta(rotulo) {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
        return Promise.reject(new Error('Terminal interativo necessário para informar a senha do MySQL.'));
    }
    process.stdout.write(rotulo);
    return new Promise((resolve, reject) => {
        let senha = '';
        const entrada = process.stdin;
        const anterior = entrada.isRaw;
        function finalizar() {
            entrada.off('data', processar);
            entrada.setRawMode(Boolean(anterior));
            entrada.pause();
            process.stdout.write('\n');
        }
        function processar(buffer) {
            for (const char of buffer.toString('utf8')) {
                if (char === '\r' || char === '\n') {
                    finalizar();
                    resolve(senha);
                    return;
                }
                if (char === '\u0003') {
                    finalizar();
                    reject(new Error('Configuração cancelada.'));
                    return;
                }
                if (char === '\u007f' || char === '\b') {
                    if (senha.length) {
                        senha = senha.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                    continue;
                }
                if (char >= ' ' && char !== '\u007f') {
                    senha += char;
                    process.stdout.write('*');
                }
            }
        }
        entrada.setRawMode(true);
        entrada.resume();
        entrada.on('data', processar);
    });
}

async function configurarSeNecessario() {
    if (!faltamCredenciais()) return;
    if (process.env.RENDER === 'true') {
        throw new Error('Variáveis DB_HOST, DB_USER, DB_PASSWORD, DB_NAME e JWT_SECRET devem ser definidas em Render > Environment. O assistente local não roda no Render.');
    }
    if (!process.stdin.isTTY) {
        throw new Error('Faltam credenciais MySQL/JWT no .env. Abra o PowerShell e execute node index.js para configurar, ou edite .env.local.example e salve como .env.');
    }
    console.log('\n[PRIMEIRA EXECUÇÃO] Vamos configurar o acesso ao MySQL.');
    console.log('A conta do Windows (aluno) não é necessariamente uma conta MySQL.');
    console.log('Por segurança, os e-mails reais e o agendador ficarão desligados.\n');
    const entrada = readline.createInterface({ input: process.stdin, output: process.stdout });
    let host, porta, usuario, nome, confirmacao;
    try {
        host = (await entrada.question(`IP do servidor MySQL [${process.env.DB_HOST || '10.87.100.6'}]: `)).trim() || process.env.DB_HOST || '10.87.100.6';
        porta = (await entrada.question(`Porta MySQL [${process.env.DB_PORT || '3306'}]: `)).trim() || process.env.DB_PORT || '3306';
        usuario = (await entrada.question(`Usuário do MySQL [${process.env.DB_USER || 'root'}]: `)).trim() || process.env.DB_USER || 'root';
        nome = (await entrada.question(`Nome do banco [${process.env.DB_NAME || 'projetocodemasters_novo'}]: `)).trim() || process.env.DB_NAME || 'projetocodemasters_novo';
        if (!/^\d{1,5}$/.test(porta) || Number(porta) < 1 || Number(porta) > 65535) {
            throw new Error('Porta MySQL inválida.');
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(nome)) throw new Error('Nome do banco inválido.');
        if (!['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) {
            console.log('\nATENÇÃO: o MySQL informado está em outra máquina. Use apenas banco de TESTES.');
            confirmacao = (await entrada.question('Confirma que NÃO é o banco de produção? Digite SIM: ')).trim();
            if (confirmacao !== 'SIM') throw new Error('Configuração cancelada para proteger os dados de produção.');
        }
    } finally {
        entrada.close();
    }
    let senha = valorConfigurado(process.env.DB_PASSWORD) ? process.env.DB_PASSWORD : '';
    if (!senha) senha = await perguntarSenhaOculta('Senha do MySQL (os caracteres ficam ocultos): ');
    if (!senha) throw new Error('Senha MySQL vazia. Use um usuário MySQL com senha configurada.');
    const valores = {
        DB_HOST: host,
        DB_PORT: porta,
        DB_USER: usuario,
        DB_PASSWORD: JSON.stringify(senha),
        DB_NAME: nome,
        JWT_SECRET: valorConfigurado(process.env.JWT_SECRET) ? process.env.JWT_SECRET : crypto.randomBytes(48).toString('hex'),
        MODO_TESTE_LOCAL: '1',
        PORTA: process.env.PORTA || '3000',
        MIGRACAO_AUTOMATICA: '0',
        AGENDADOR_ATIVO: '0',
        TZ_ESCOLA: 'America/Sao_Paulo',
        PERMITIR_BANCO_REMOTO_TESTE: ['localhost','127.0.0.1','::1'].includes(host.toLowerCase()) ? '0' : '1'
    };
    salvarConfiguracao(path.join(__dirname, '..', '.env'), valores);
    for (const [chave, valor] of Object.entries(valores)) {
        process.env[chave] = chave === 'DB_PASSWORD' ? senha : valor;
    }
    console.log('\n[configuração] .env criado/atualizado no seu computador (não enviar ao GitHub).');
}

module.exports = { configurarSeNecessario, faltamCredenciais, salvarConfiguracao };
