# Sistema de Liberação de Alunos

> Projeto desenvolvido no **SENAI** para organizar solicitações de saída no horário de almoço, aprovação pela secretaria, registro de saída/retorno pela portaria e acompanhamento pelos professores.

---

## Sobre o Projeto

Atualmente, o controle de saída de alunos em muitas escolas ainda é feito de forma manual, o que gera brechas de segurança e sobrecarrega os funcionários. Este sistema resolve esse problema ao integrar a autorização dos responsáveis em tempo real com a liberação da portaria.

**Fluxo principal:**
1. O **Responsável** solicita a saída do aluno.
2. A **Secretaria** analisa e **aprova ou recusa** a solicitação.
3. O **Professor** recebe comunicados sobre aprovação, saída, retorno, atraso e não retorno dos alunos das turmas às quais está vinculado.
4. A **Portaria não aprova nem recusa**: apenas registra a saída de um pedido já aprovado e, depois, o retorno do aluno.
5. Em atraso (+5 min) ou não retorno (+15 min), o sistema avisa por e-mail **responsáveis, secretaria, professores da turma e portaria** e registra a rastreabilidade dos avisos.

> Os limites de 5 e 15 minutos são parâmetros operacionais adotados nesta versão e devem ser validados com a escola. Consulte `VALIDACAO_FLUXO_IVONE.md`.

---

## Status do Projeto

**EM DESENVOLVIMENTO** — novas funcionalidades e melhorias estão sendo implementadas continuamente.

---

## Funcionalidades

- Cadastro de alunos, turmas e usuários  
- Autenticação e autorização de usuários  
- Solicitação de saída por responsáveis  
- Validação de pedidos pela secretaria  
- Registro de saída e retorno na portaria, sem poder de aprovação/recusa
- Perfil de professor com escopo por turma
- Comunicados ao professor sobre aprovação, saída, retorno, atraso e não retorno
- Alertas de atraso/não retorno para responsáveis, secretaria, professores e portaria
- Rastreabilidade dos alertas enviados e das ocorrências automáticas
- Histórico de pedidos e saídas

---

## Responsabilidades operacionais no sistema

| Perfil | Papel no fluxo |
|---|---|
| Responsável | Solicita a saída e recebe os avisos |
| Secretaria/Admin | Decide aprovação/recusa e coordena o acompanhamento quando houver ocorrência |
| Portaria | Confere pedido já aprovado e registra saída/retorno |
| Professor | Acompanha somente suas turmas e recebe comunicados de movimentação |

A definição de responsabilidade **institucional/legal** não é decidida pelo software. Ela deve seguir o protocolo da escola. O sistema fornece comunicação, histórico e rastreabilidade para apoiar esse procedimento.


---

## Tecnologias Utilizadas

- **Back-end:** Node.js  
- **Front-end:** HTML5, CSS3, JavaScript  
- **Banco de Dados:** MySQL (MySQL Workbench)  
- **Outras dependências:** ver `package.json`  

---

## Estrutura do Projeto

```
projeto-liberacao-aluno/
│
├── api/
├── config/
├── controller/
├── middlewares/
├── model/
├── public/
│   ├── css/
│   ├── img/
│   ├── js\general/
│   ├── home.html
│   ├── index.html
│   ├── login.html
│   ├── recover_password.html
│   └── register.html
│
├── index.js
├── package-lock.json
└── package.json
```


---

## Como Rodar o Projeto

### Pré-requisitos

- [Node.js](https://nodejs.org/) instalado  
- [MySQL Workbench](https://www.mysql.com/products/workbench/) (recomendado)  

### Passo a passo

**1. Clone o repositório**
```bash
git clone https://github.com/henrygabth/proj_liberacaoAluno
```


**2. Instale as dependências**
```bash
npm install
```

**3. Configure com seu banco de dados**

Abra o MySQL Workbench, crie um banco de dados.
No projeto, entre na pasta:
```
config/banco.js
```
Em DB_HOST, troque para seu servidor IP.
Faça o mesmo para DB_USER, DB_PASSWORD e DB_NAME.

**4. Inicie o servidor**
```bash
node index.js
```

**5. Acesse no navegador**
```
http://localhost:3000
```

---

## 🗄️ Banco de Dados

O banco foi modelado e gerenciado com **MySQL Workbench**.

Principais tabelas:

| Tabela | Descrição |
|--------|-----------|
| `alunos` | Cadastro dos alunos, incluindo matrícula, turma e dados pessoais |
| `historico_pedidos` |Registro histórico de todas as solicitações de saída realizadas|
| `pedidos_saida` |Solicitações de saída feitas pelos responsáveis|
| `pessoas_autorizadas` |Lista de pessoas autorizadas a retirar os alunos|
| `responsaveis_alunos` |Relação entre alunos e seus responsáveis|
| `turmas` |Cadastro das turmas, com sala e turno|
| `usuarios` | Usuários do sistema (responsáveis, secretaria, portaria, administração e professores) |
| `professores_turmas` | Vínculo N:N entre professores e turmas |
| `comunicados_professores` | Comunicados do painel do professor |
| `alertas_email_envios` | Fila/auditoria dos e-mails de atraso e não retorno |
| `ocorrencias_pedidos` | Registro automático de atraso, não retorno e chegada atrasada |

---

# Como Contribuir

Obrigado por considerar contribuir com o projeto **Portaria Inteligente**!  
Este guia explica como você pode colaborar com melhorias, correções e novas funcionalidades.

---

## Passos para Contribuir

1. **Faça um fork do repositório**  
   Crie uma cópia do projeto na sua conta GitHub.

2. **Crie uma branch para sua feature ou correção**  
   ```bash
   git checkout -b minha-feature
   ```
3. **Implemente suas alterações**
   
    - Mantenha o código limpo e organizado.
    - Siga o padrão de nomenclatura já utilizado no projeto.
    - Documente suas mudanças quando necessário.
   
4.Commit suas alterações 
```bash
git commit -m "Adiciona nova funcionalidade X"
```

## 👥 Equipe
Desenvolvido por alunos do **SENAI** — Curso de Desenvolvimento de Sistemas.
E com apoio dos docentes: Douglas de Cassio Quinzani Gaspar e Renato de Mattos Onofre

---

## 📄 Licença

Este projeto foi desenvolvido para fins educacionais no SENAI.
