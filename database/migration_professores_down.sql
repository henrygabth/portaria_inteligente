-- DOWN conservador: nunca apaga registros existentes.
-- Se existirem vínculos, comunicados ou contas PROFESSOR, ABORTA: exporte/arquive
-- e migre os dados conscientemente antes de executar um rollback estrutural.
DELIMITER $$
CREATE PROCEDURE rollback_professores_seguro()
BEGIN
  IF (SELECT COUNT(*) FROM alertas_email_envios) > 0
    OR (SELECT COUNT(*) FROM professores_turmas) > 0
    OR (SELECT COUNT(*) FROM comunicados_professores) > 0
    OR (SELECT COUNT(*) FROM usuarios WHERE tipo_usuario = 'PROFESSOR') > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Rollback impedido: existem dados do modulo de professores.';
  END IF;
  DROP TABLE alertas_email_envios;
  DROP TABLE comunicados_professores;
  DROP TABLE professores_turmas;
  ALTER TABLE usuarios MODIFY COLUMN tipo_usuario
    ENUM('PAI','SECRETARIA','PORTARIA','PORTEIRO','ADMIN') NOT NULL;
END$$
DELIMITER ;
CALL rollback_professores_seguro();
DROP PROCEDURE rollback_professores_seguro;
