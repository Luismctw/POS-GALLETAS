-- ============================================================
--  MIGRACIÓN GRUPO A  ·  INGU
--  Cambios ADITIVOS — no borra ni modifica datos existentes.
--  Ejecutar en phpMyAdmin (pestaña SQL) sobre la base u623330139_ingu
-- ============================================================

-- #12 · Describir el gasto "otro": columna opcional de descripción
ALTER TABLE `gastos`
  ADD COLUMN `descripcion` VARCHAR(255) DEFAULT NULL AFTER `categoria`;
