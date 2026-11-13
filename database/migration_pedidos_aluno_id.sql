-- Adiciona a coluna aluno_id em pedidos_saida, ligando o pedido ao cadastro
-- real do aluno (tabela alunos) em vez de depender só do texto digitado
-- pelo responsável em nome_aluno.
--
-- nome_aluno e turma_id são mantidos (histórico e compatibilidade com
-- pedidos antigos), mas a partir de agora são preenchidos pelo servidor
-- com base no aluno_id, não mais digitados livremente pelo Pai.

ALTER TABLE pedidos_saida
    ADD COLUMN aluno_id INT NULL AFTER pedidos_saida_id,
    ADD CONSTRAINT fk_pedidos_saida_aluno
        FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE SET NULL;

-- Backfill best-effort para pedidos já existentes, casando pelo nome exato
-- do aluno (não é garantido cobrir 100% dos casos antigos, mas não deixa
-- nada pior do que já estava).
UPDATE pedidos_saida p
JOIN alunos a ON a.nome = p.nome_aluno
SET p.aluno_id = a.aluno_id
WHERE p.aluno_id IS NULL;
