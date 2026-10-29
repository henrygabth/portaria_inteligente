USE projetocodemasters;

-- A tabela alunos exigia data_nascimento obrigatória, mas ao vincular um
-- responsável (secretaria.js -> criarResponsavel) o aluno pode ser criado
-- automaticamente sem essa informação ainda. Tornando a coluna opcional.
ALTER TABLE alunos MODIFY COLUMN data_nascimento DATE NULL;
