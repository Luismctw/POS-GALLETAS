-- Schema POS Galletas
-- Ejecutar esto en Railway (MySQL) antes de iniciar el servidor

CREATE TABLE IF NOT EXISTS `repartidores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `pin` varchar(4) NOT NULL,
  `estatus` enum('activo','inactivo') DEFAULT 'activo',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `limite_credito` decimal(10,2) DEFAULT '0.00',
  `saldo_deudor` decimal(10,2) DEFAULT '0.00',
  `estatus` enum('activo','bloqueado') DEFAULT 'activo',
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `insumos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `stock_actual` decimal(10,2) DEFAULT '0.00',
  `unidad_medida` varchar(20) NOT NULL,
  `stock_minimo` decimal(10,2) DEFAULT '10.00',
  `ubicacion` varchar(100) DEFAULT 'Bodega Central',
  `costo_unitario` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `productos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `precio_caja` decimal(10,2) DEFAULT NULL,
  `tipo` enum('propio','tercero','combinada') DEFAULT 'propio',
  `bodega_asignada` varchar(100) DEFAULT 'Bodega Central',
  `stock_actual` int DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `bodegas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `activa` tinyint DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_bodega_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `bodegas` (`nombre`) VALUES
  ('Bodega Materia Prima'), ('Bodega 1'), ('Bodega 2'), ('Bodega 3'), ('Bodega de Tránsito');

CREATE TABLE IF NOT EXISTS `producto_insumo` (
  `producto_id` int DEFAULT NULL,
  `insumo_id` int DEFAULT NULL,
  `cantidad_necesaria` decimal(10,4) NOT NULL,
  KEY `producto_id` (`producto_id`),
  KEY `insumo_id` (`insumo_id`),
  CONSTRAINT `pi_prod` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `pi_ins`  FOREIGN KEY (`insumo_id`)  REFERENCES `insumos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `pedidos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente_id` int DEFAULT NULL,
  `repartidor_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL,
  `monto_cobrado` decimal(10,2) DEFAULT '0.00',
  `contenido` varchar(255) DEFAULT NULL,
  `piezas` int DEFAULT '0',
  `fecha_creacion` date DEFAULT NULL,
  `veces_reagendado` int DEFAULT '0',
  `estatus` enum('creado','pendiente','entregado','reagendado','cancelado') NOT NULL DEFAULT 'creado',
  `reagendado_de` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `cliente_id` (`cliente_id`),
  KEY `repartidor_id` (`repartidor_id`),
  KEY `reagendado_de` (`reagendado_de`),
  CONSTRAINT `ped_cli` FOREIGN KEY (`cliente_id`)   REFERENCES `clientes` (`id`),
  CONSTRAINT `ped_rep` FOREIGN KEY (`repartidor_id`) REFERENCES `repartidores` (`id`),
  CONSTRAINT `ped_rea` FOREIGN KEY (`reagendado_de`) REFERENCES `pedidos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `gastos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `repartidor_id` int DEFAULT NULL,
  `fecha` date NOT NULL,
  `categoria` enum('gasolina','comida','caseta','otro') NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `monto` decimal(10,2) NOT NULL,
  `foto_ticket` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `repartidor_id` (`repartidor_id`),
  CONSTRAINT `gas_rep` FOREIGN KEY (`repartidor_id`) REFERENCES `repartidores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `produccion` (
  `id` int NOT NULL AUTO_INCREMENT,
  `producto_id` int DEFAULT NULL,
  `fecha` date NOT NULL,
  `cantidad_cajas` int NOT NULL,
  `lote` varchar(50) DEFAULT NULL,
  `costo_total` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `producto_id` (`producto_id`),
  CONSTRAINT `prod_prod` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `compras_insumo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `insumo_id` int DEFAULT NULL,
  `proveedor` varchar(255) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `costo_unitario` decimal(10,2) DEFAULT '0.00',
  `costo_total` decimal(10,2) NOT NULL,
  `fecha` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `insumo_id` (`insumo_id`),
  CONSTRAINT `comp_ins` FOREIGN KEY (`insumo_id`) REFERENCES `insumos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `deudas_negocio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proveedor` varchar(150) NOT NULL,
  `concepto` varchar(255) NOT NULL,
  `monto_total` decimal(10,2) NOT NULL,
  `monto_pagado` decimal(10,2) DEFAULT '0.00',
  `fecha` date NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `estatus` enum('pendiente','parcial','pagada') DEFAULT 'pendiente',
  `notas` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `historial_cobros` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente_id` int NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `tipo` enum('cobro_repartidor','abono_admin') DEFAULT 'abono_admin',
  `pedido_id` int DEFAULT NULL,
  `fecha` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `notas` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `cliente_id` (`cliente_id`),
  CONSTRAINT `hc_cli` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `retornos_repartidor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `repartidor_id` int NOT NULL,
  `fecha` date NOT NULL,
  `piezas_regresadas` int NOT NULL DEFAULT '0',
  `notas` varchar(255) DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `una_por_dia` (`repartidor_id`,`fecha`),
  CONSTRAINT `ret_rep` FOREIGN KEY (`repartidor_id`) REFERENCES `repartidores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
