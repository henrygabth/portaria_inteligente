USE projetocodemasters;

-- 1) Alerta de atraso no retorno
-- Precisa saber QUANDO o aluno era esperado de volta (não só a hora de saída)
-- para poder calcular atraso, e evitar mandar o mesmo alerta várias vezes.
ALTER TABLE pedidos_saida
    ADD COLUMN hora_prevista_retorno DATETIME NULL AFTER hora_prevista_saida,
    ADD COLUMN alerta_atraso_enviado TINYINT(1) NOT NULL DEFAULT 0;

-- 2) Pedidos recorrentes ("sempre nesse horário")
-- Guarda o "molde" do pedido (aluno, dia da semana, horários). Todo dia, o
-- servidor cria automaticamente o pedido normal (PENDENTE) a partir dos
-- moldes ativos daquele dia da semana — a Secretaria segue aprovando como
-- qualquer outro pedido.
CREATE TABLE IF NOT EXISTS pedidos_recorrentes (
    recorrente_id   INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id        INT NOT NULL,
    usuario_id      INT NOT NULL,  -- responsável (Pai) dono do molde
    dia_semana      TINYINT NOT NULL, -- 0=domingo ... 6=sábado (igual Date.getDay() do JS)
    hora_saida      TIME NOT NULL,
    hora_retorno    TIME NULL,
    motivo          VARCHAR(255),
    ativo           TINYINT(1) NOT NULL DEFAULT 1,
    data_criacao    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

-- Liga o pedido gerado automaticamente ao molde que o originou (rastreabilidade
-- e para o gerador não criar o mesmo pedido duas vezes no mesmo dia).
ALTER TABLE pedidos_saida
    ADD COLUMN recorrente_id INT NULL AFTER aluno_id,
    ADD CONSTRAINT fk_pedidos_saida_recorrente
        FOREIGN KEY (recorrente_id) REFERENCES pedidos_recorrentes(recorrente_id) ON DELETE SET NULL;
