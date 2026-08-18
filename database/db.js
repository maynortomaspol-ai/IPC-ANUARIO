const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname,'anuario.db');
const db = new sqlite3.Database(dbPath,err=>{if(err)console.error('Error SQLite:',err.message);else console.log('Conectado a SQLite.');});

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS estudiantes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    nombre_completo TEXT NOT NULL,
    fotografia TEXT,
    carrera TEXT NOT NULL,
    frase_personal TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS recuerdos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    seccion TEXT,
    mensaje TEXT NOT NULL,
    aprobado INTEGER NOT NULL DEFAULT 1,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.all(`PRAGMA table_info(recuerdos)`,(err,cols)=>{
    if(err)return console.error(err.message);
    const names=cols.map(c=>c.name);
    if(!names.includes('email')) db.run(`ALTER TABLE recuerdos ADD COLUMN email TEXT NOT NULL DEFAULT ''`);
    if(!names.includes('aprobado')) db.run(`ALTER TABLE recuerdos ADD COLUMN aprobado INTEGER NOT NULL DEFAULT 1`);
  });
});

module.exports=db;
