-- OPCIONAL - rode UMA ÚNICA VEZ, só se já existirem pedidos gravados antes da correção de fuso.
--
-- Antes: o servidor (Render) gravava NOW() em UTC (3h à frente de Brasília).
-- Agora: o servidor usa America/Sao_Paulo. Os registros antigos feitos com NOW()
-- ficariam 3h adiantados; este script os acerta. (hora_prevista_* já estavam
-- em horário de Brasília e NÃO são alteradas.)
-- Se o banco só tem dados de teste, pode ignorar este arquivo.

UPDATE pedidos_saida SET
    data_criacao      = data_criacao      - INTERVAL 3 HOUR,
    data_atualizacao  = data_atualizacao  - INTERVAL 3 HOUR,
    hora_saida_real   = hora_saida_real   - INTERVAL 3 HOUR,
    hora_retorno_real = hora_retorno_real - INTERVAL 3 HOUR;

UPDATE historico_pedidos SET data_mudanca = data_mudanca - INTERVAL 3 HOUR;
