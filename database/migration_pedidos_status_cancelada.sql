-- Adiciona o status CANCELADA ao fluxo de pedidos_saida.
-- RECUSADA já existia e continua sendo usado pela Secretaria (antes de aprovar).
-- CANCELADA é novo: usado pela Portaria quando um pedido já aprovado precisa
-- ser cancelado (ex: responsável não apareceu, aluno não foi encontrado etc.),
-- sempre com motivo obrigatório e notificação por e-mail ao responsável.

ALTER TABLE pedidos_saida
    MODIFY COLUMN status ENUM('PENDENTE', 'APROVADA', 'RECUSADA', 'EM_SAIDA', 'CONCLUIDA', 'CANCELADA')
        NOT NULL DEFAULT 'PENDENTE';
