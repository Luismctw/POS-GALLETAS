-- ============================================================
--  MIGRACIÓN INVENTARIO · INGU
--  Guarda qué productos lleva cada pedido, para poder descontar
--  el stock de la bodega cuando el pedido se marca ENTREGADO.
--  Aditiva: crea una tabla nueva, no toca datos existentes.
--  Ejecutar en phpMyAdmin sobre la base u623330139_ingu
-- ============================================================

CREATE TABLE IF NOT EXISTS `pedido_productos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `pedido_id` INT NOT NULL,
  `producto_id` INT NOT NULL,
  `cantidad` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `pp_pedido` (`pedido_id`),
  KEY `pp_producto` (`producto_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
