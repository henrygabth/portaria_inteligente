# Sistema de Liberação de Alunos

> Projeto desenvolvido no **SENAI** para automatizar e controlar a saída de alunos, integrando a autorização dos responsáveis diretamente com a liberação na portaria — eliminando conferências manuais e aumentando a segurança escolar.

---

## Sobre o Projeto

Atualmente, o controle de saída de alunos em muitas escolas ainda é feito de forma manual, o que gera brechas de segurança e sobrecarrega os funcionários. Este sistema resolve esse problema ao integrar a autorização dos responsáveis em tempo real com a liberação da portaria.

**Fluxo principal:**
1. O **Responsável** acessa o sistema e envia a autorização de saída  
2. A **Secretaria** valida a solicitação  
3. A **Portaria** recebe a liberação e registra a saída do aluno  
4. O **Responsável** recebe uma notificação confirmando a saída  

---

## Status do Projeto

**EM DESENVOLVIMENTO** — novas funcionalidades e melhorias estão sendo implementadas continuamente.

---

## Funcionalidades

- Cadastro de alunos, turmas e usuários  
- Autenticação e autorização de usuários  
- Solicitação de saída por responsáveis  
- Validação de pedidos pela secretaria  
- Registro de entrada e saída na portaria  
- Histórico de pedidos e saídas  
- Notificações para responsáveis  

---

## Tecnologias Utilizadas

- **Back-end:** Node.js  
- **Template Engine:** EJS  
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
| `usuarios` |Usuários do sistema (responsáveis, secretaria e portaria)|

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
