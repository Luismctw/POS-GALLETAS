const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host:     process.env.DB_HOST     || process.env.MYSQLHOST     || 'localhost',
    user:     process.env.DB_USER     || process.env.MYSQLUSER     || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME     || process.env.MYSQLDATABASE || 'pos_galletas',
    port:     process.env.DB_PORT     || process.env.MYSQLPORT     || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
});

pool.getConnection()
    .then(conn => { console.log('📦 Conectado a la base de datos MySQL'); conn.release(); })
    .catch(err => console.error('❌ Error al conectar a la BD:', err.message));

module.exports = pool;
