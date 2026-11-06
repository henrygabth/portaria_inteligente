-- Reversão isolada da fila de alertas, sem perder dados.
-- Se houver registros, faça backup/arquivamento antes de tentar novamente.
DELIMITER $$
CREATE PROCEDURE rollback_alertas_email_seguro()
BEGIN
  IF (SELECT COUNT(*) FROM alertas_email_envios) > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Rollback bloqueado: há registros de envio de alertas.';
  END IF;
  DROP TABLE alertas_email_envios;
END$$
DELIMITER ;
CALL rollback_alertas_email_seguro();
DROP PROCEDURE rollback_alertas_email_seguro;
