-- ============================================================
--  MIGRACIÓN GRUPO B  ·  INGU  ·  Bodegas dinámicas
--  Aditiva + normalización controlada. No borra datos.
--  Ejecutar en phpMyAdmin sobre la base u623330139_ingu
-- ============================================================

-- 1) Tabla de bodegas
CREATE TABLE IF NOT EXISTS `bodegas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(100) NOT NULL,
  `activa` TINYINT DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_bodega_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Sembrar las bodegas actuales (no duplica si ya existen)
INSERT IGNORE INTO `bodegas` (`nombre`) VALUES
  ('Bodega Materia Prima'),
  ('Bodega 1'),
  ('Bodega 2'),
  ('Bodega 3'),
  ('Bodega de Tránsito');

-- 3) Normalizar productos existentes: bodega por número -> por nombre
--    (los productos se guardaban como '1','2','3'; ahora usan el nombre)
UPDATE `productos` SET `bodega_asignada` = 'Bodega 1' WHERE `bodega_asignada` = '1';
UPDATE `productos` SET `bodega_asignada` = 'Bodega 2' WHERE `bodega_asignada` = '2';
UPDATE `productos` SET `bodega_asignada` = 'Bodega 3' WHERE `bodega_asignada` = '3';
