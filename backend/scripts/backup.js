const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 7;

function hacerBackup() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const fecha = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archivo = path.join(BACKUP_DIR, `backup_${fecha}.sql`);

    const host = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost';
    const port = process.env.DB_PORT || process.env.MYSQLPORT || 3306;
    const user = process.env.DB_USER || process.env.MYSQLUSER || 'root';
    const pass = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '';
    const db   = process.env.DB_NAME || process.env.MYSQLDATABASE || 'pos_galletas';

    const cmd = `mysqldump -h${host} -P${port} -u${user} ${pass ? `-p${pass}` : ''} ${db} > "${archivo}"`;

    exec(cmd, (err) => {
        if (err) {
            console.error('❌ Error en backup:', err.message);
            return;
        }
        console.log(`✅ Backup guardado: ${path.basename(archivo)}`);
        limpiarBackupsViejos();
    });
}

function limpiarBackupsViejos() {
    const archivos = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.sql'))
        .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);

    archivos.slice(MAX_BACKUPS).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f.name));
        console.log(`🗑️  Backup antiguo eliminado: ${f.name}`);
    });
}

module.exports = { hacerBackup };

// Si se ejecuta directamente: node scripts/backup.js
if (require.main === module) hacerBackup();
