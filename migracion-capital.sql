-- ============================================================
--  MIGRACIÓN CAPITAL / CAJA · INGU
--  Guarda las entradas y salidas manuales de capital. El saldo
--  disponible se calcula restando también los gastos de repartidores
--  y las compras de materia prima.
--  Aditiva: crea una tabla nueva, no toca datos existentes.
--  Ejecutar en phpMyAdmin sobre la base u623330139_ingu
-- ============================================================

CREATE TABLE IF NOT EXISTS `capital_movimientos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tipo` ENUM('entrada','salida') NOT NULL,
  `monto` DECIMAL(10,2) NOT NULL,
  `concepto` VARCHAR(255) DEFAULT NULL,
  `fecha` DATE DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
