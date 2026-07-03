-- ============================================================
--  MIGRACIÓN GRUPO F  ·  INGU  ·  Cajas combinadas (#11)
--  Aditiva: agrega el valor 'combinada' al enum de tipo de producto.
--  No cambia ningún dato existente.
--  Ejecutar en phpMyAdmin sobre la base u623330139_ingu
-- ============================================================

ALTER TABLE `productos`
  MODIFY COLUMN `tipo` ENUM('propio','tercero','combinada') DEFAULT 'propio';
