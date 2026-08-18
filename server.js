const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({limit:'100kb'}));
app.use(express.static(path.join(__dirname,'public')));

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 12;
const rateMap = new Map();
function rateLimit(req,res,next){
  const ip=req.ip||req.socket.remoteAddress||'unknown';
  const now=Date.now();
  const current=rateMap.get(ip)||{count:0,start:now};
  if(now-current.start>WINDOW_MS){current.count=0;current.start=now;}
  current.count++;rateMap.set(ip,current);
  if(current.count>MAX_REQUESTS) return res.status(429).json({error:'Demasiados intentos. Espera un momento antes de volver a publicar.'});
  next();
}

const PALABRAS_PROHIBIDAS = [
  'puta','puto','mierda','pendejo','pendeja','idiota','imbecil','imbécil','estupido','estúpido','estupida','estúpida','cabron','cabrón','cerote','cerota','culero','culera','maricon','maricón','jodete','jódete','joder','chingar','chingada','chingado','verga','coño','zorra','perra','perro','mamaguevo','mamagueva','hijueputa','hijo de puta','maldito','maldita'
];
function normalizarTexto(texto=''){return texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function contieneOfensas(texto){const limpio=normalizarTexto(texto);return PALABRAS_PROHIBIDAS.some(p=>new RegExp(`(^|\\s)${normalizarTexto(p).replace(/ /g,'\\s+')}($|\\s)`).test(limpio));}
function limpiarDuplicadosEstudiantes(next){
  db.run(`DELETE FROM estudiantes WHERE id NOT IN (SELECT MIN(id) FROM estudiantes GROUP BY lower(trim(nombre_completo)), lower(trim(carrera)), lower(trim(coalesce(fotografia,''))))`,err=>{if(err) console.error('No se pudieron limpiar duplicados:',err.message);next();});
}

app.get('/api/estado',(req,res)=>res.json({mensaje:'Servidor del Anuario Digital IPC activo.',version:'2026'}));

app.get('/api/estudiantes',(req,res)=>{
  const carrera=(req.query.carrera||'').trim();
  const params=[];let where='';
  if(carrera){where='WHERE carrera = ?';params.push(carrera);}
  const query=`SELECT MIN(id) AS id,nombre,apellido,nombre_completo,fotografia,carrera FROM estudiantes ${where} GROUP BY lower(trim(nombre_completo)),lower(trim(carrera)),lower(trim(coalesce(fotografia,''))) ORDER BY apellido COLLATE NOCASE ASC,nombre COLLATE NOCASE ASC`;
  db.all(query,params,(err,rows)=>err?res.status(500).json({error:'Error al consultar estudiantes.'}):res.json(rows));
});

app.get('/api/estudiantes/buscar',(req,res)=>{
  const termino=(req.query.q||'').trim();if(!termino)return res.json([]);
  const q=`%${termino}%`;
  const query=`SELECT MIN(id) AS id,nombre,apellido,nombre_completo,fotografia,carrera FROM estudiantes WHERE nombre LIKE ? OR apellido LIKE ? OR nombre_completo LIKE ? OR carrera LIKE ? GROUP BY lower(trim(nombre_completo)),lower(trim(carrera)),lower(trim(coalesce(fotografia,''))) ORDER BY apellido COLLATE NOCASE ASC`;
  db.all(query,[q,q,q,q],(err,rows)=>err?res.status(500).json({error:'Error al buscar estudiantes.'}):res.json(rows));
});

app.get('/api/recuerdos',(req,res)=>{db.all(`SELECT id,nombre,email,seccion,mensaje,fecha FROM recuerdos WHERE aprobado = 1 ORDER BY fecha DESC`,[],(err,rows)=>err?res.status(500).json({error:'Error al consultar mensajes.'}):res.json(rows));});

app.post('/api/recuerdos',rateLimit,(req,res)=>{
  const {nombre,email,seccion,mensaje,website}=req.body||{};
  if(website) return res.status(400).json({error:'No fue posible publicar el mensaje.'});
  if(!nombre||!email||!mensaje)return res.status(400).json({error:'Nombre, correo y mensaje son obligatorios.'});
  const n=String(nombre).trim(),em=String(email).trim(),s=String(seccion||'').trim(),m=String(mensaje).trim();
  if(n.length>100||em.length>150||s.length>100||m.length>1000)return res.status(400).json({error:'Uno de los campos supera el límite permitido.'});
  if(!/^\S+@\S+\.\S+$/.test(em))return res.status(400).json({error:'El correo electrónico no es válido.'});
  if(contieneOfensas(n+' '+m))return res.status(400).json({error:'El mensaje contiene lenguaje ofensivo o no permitido. Modifica el texto e inténtalo nuevamente.'});
  const duplicateCheck=`SELECT id FROM recuerdos WHERE lower(email)=lower(?) AND mensaje=? AND fecha >= datetime('now','-10 minutes') LIMIT 1`;
  db.get(duplicateCheck,[em,m],(checkErr,found)=>{
    if(checkErr)return res.status(500).json({error:'No se pudo validar el mensaje.'});
    if(found)return res.status(409).json({error:'Ya existe un mensaje igual publicado recientemente.'});
    db.run(`INSERT INTO recuerdos(nombre,email,seccion,mensaje,aprobado) VALUES(?,?,?,?,1)`,[n,em,s,m],function(err){if(err)return res.status(500).json({error:'No se pudo guardar el mensaje.'});res.status(201).json({mensaje:'Mensaje publicado correctamente.',id:this.lastID});});
  });
});

app.delete('/api/recuerdos/:id',(req,res)=>{
  const adminKey=req.get('x-admin-key');
  if(!process.env.ADMIN_KEY || adminKey!==process.env.ADMIN_KEY)return res.status(403).json({error:'No autorizado.'});
  db.run(`DELETE FROM recuerdos WHERE id=?`,[req.params.id],function(err){if(err)return res.status(500).json({error:'Error al eliminar el mensaje.'});if(!this.changes)return res.status(404).json({error:'Mensaje no encontrado.'});res.json({mensaje:'Mensaje eliminado.'});});
});

app.get('/api/cargar-datos-prueba',(req,res)=>res.status(410).json({error:'Esta ruta fue deshabilitada para evitar duplicados. Los estudiantes se cargan automáticamente cuando la base de datos está vacía.'}));

function iniciarServidor(){app.listen(PORT,()=>console.log(`Servidor del Anuario IPC corriendo en http://localhost:${PORT}`));}

function seedIfEmpty(){
  db.get('SELECT COUNT(*) AS total FROM estudiantes',(err,row)=>{
    if(err){console.error(err);return iniciarServidor();}
    if(row.total>0){console.log(`Base de datos lista: ${row.total} registro(s) de estudiantes.`);return iniciarServidor();}
    console.log('La tabla de estudiantes está vacía. Cargando datos base...');
    const stmt = db.prepare(`
                INSERT INTO estudiantes (nombre, apellido, nombre_completo, fotografia, carrera, frase_personal)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            // URL base por defecto para alumnos sin foto aún
            const fotoDefault = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400";

            // 1. PERITO EN ADMINISTRACIÓN DE EMPRESAS
            const c6toAdmon = "6to Perito en Administración de Empresas";
            stmt.run("Anderson Gabriel", "Chachalac Santos", "Anderson Gabriel Chachalac Santos", "img/admon6/Anderson Gabriel Chachalac Santos .png", c6toAdmon);
            stmt.run("Anthony Fabian", "Hidalgo Tomas", "Anthony Fabian Hidalgo Tomas", "img/admon6/Anthony Fabian Hidalgo Tomas .png", c6toAdmon);
            stmt.run("Blanca Isabela", "Vasquez Chay", "Blanca Isabela Vasquez Chay", "img/admon6/Blanca Isabela Vasquez Chay .png", c6toAdmon);
            stmt.run("Carol Haydee", "Rosales Gómez", "Carol Haydee Rosales Gómez", "img/admon6/Carol Haydee Rosales Gómez .png", c6toAdmon);
            stmt.run("Cristel Anelisse", "López González", "Cristel Anelisse López González", "img/admon6/Cristel .png", c6toAdmon);
            stmt.run("Cristian Joel", "Carballo Recinos", "Cristian Joel Carballo Recinos", "img/admon6/cristian .png", c6toAdmon);
            stmt.run("Estefani Yajaira", "Figueroa Aquino", "Estefani Yajaira Figueroa Aquino", "img/admon6/Estefani Yajaira Figueroa Aquino .png", c6toAdmon);
            stmt.run("Jefferson Stiven", "Cosajay Cruz", "Jefferson Stiven Cosajay Cruz", "img/admon6/Jefferson Stiven Cosa Cosajay Cruz .png", c6toAdmon);
            stmt.run("Limny Melissa Alexandra", "Orellana Garcia", "Limny Melissa Alexandra Orellana Garcia", "img/admon6/Limny Melissa Alexandra Orellana Garcia .png", c6toAdmon);
            stmt.run("María Luisa", "Tiño Macario", "María Luisa Tiño Macario", "img/admon6/María Luisa Tiño Macario .png", c6toAdmon);
            stmt.run("Maynor Tomás Jorge", "Pol", "Maynor Tomás Jorge Pol", "img/admon6/Maynor Tomás Jorge Pol .png", c6toAdmon);

            const c5toAdmon = "5to Perito en Administración de Empresas";
            stmt.run("Alisson Saraí", "Nolasco Yool", "Alisson Saraí Nolasco Yool", "img/admon5/Alisson Saraí Nolasco Yool.jpg", c5toAdmon);
            stmt.run("Allison Rosmery", "Noj González", "Allison Rosmery Noj González", "img/admon5/Allíson Rosmery Noj González.jpg", c5toAdmon);
            stmt.run("Allisson Saraí", "González Ortega", "Allisson Saraí González Ortega", "img/admon5/Allisson Saraí González Ortega.jpg", c5toAdmon);
            stmt.run("Antony Rafael Oscar", "Mansilla", "Antony Rafael Oscar Mansilla", "img/admon5/Antony Rafael Oscal Mansilla.jpg", c5toAdmon);
            stmt.run("Astrid Selena", "García Godoy", "Astrid Selena García Godoy", "img/admon5/Astrid Selena García Godoy.jpg", c5toAdmon);
            stmt.run("Aylin Jimena", "Coj Velásquez", "Aylin Jimena Coj Velásquez", "img/admon5/Aylin Jimena Coj Velásquez.PNG", c5toAdmon);
            stmt.run("Brenda Sucely", "Tul Vicente", "Brenda Sucely Tul Vicente", "img/admon5/Brenda Sucely Tiul Vicente4.PNG", c5toAdmon);
            stmt.run("Brittany Esperanza", "Castro Conde", "Brittany Esperanza Castro Conde", "img/admon5/Brittany Esperanza Castro Conde.PNG", c5toAdmon);
            stmt.run("Bryan Alexander", "Puzul Cochë", "Bryan Alexander Puzul Cochë", "img/admon5/Bryan Alexander Puzul Coché.PNG", c5toAdmon);
            stmt.run("Daine Daniela", "Vásquez Velásquez", "Daine Daniela Vásquez Velásquez", "img/admon5/Daine Daniela Vásquez Velásquez.PNG", c5toAdmon);
            stmt.run("Edras Eduardo", "Méndez Florian", "Edras Eduardo Méndez Florian", "img/admon5/Edras Eduardo Méndez Florian.jpg", c5toAdmon);
            stmt.run("Haydin Anaí", "García López", "Haydin Anaí García López", "img/admon5/Haylin Anaí García López.jpg", c5toAdmon);
            stmt.run("Heydi Nohemí", "Rivas Herrera", "Heydi Nohemí Rivas Herrera", "img/admon5/Heydi Nohemí Rivas Herrera.jpg", c5toAdmon);
            stmt.run("Jehimy Daniela", "Barrios del Cid", "Jehimy Daniela Barrios del Cid", "img/admon5/Jehimy Daniela Barrios del Cid.jpg", c5toAdmon);
            stmt.run("Jessenia Margarita", "Méndez Batz", "Jessenia Margarita Méndez Batz", "img/admon5/Jesseni Margarita Méndez Batz.jpg", c5toAdmon);
            stmt.run("Jesús David", "Coy Girón", "Jesús David Coy Girón", "img/admon5/Jesús David Coy Girón.jpg", c5toAdmon);
            stmt.run("Katerin Clarissa", "Parada Gómez", "Katerin Clarissa Parada Gómez", "img/admon5/Katerin Clarissa Parada Gómez.jpg", c5toAdmon);
            stmt.run("Keyla Yamileth", "Cabrera Aguilar", "Keyla Yamileth Cabrera Aguilar", "img/admon5/Keyla Yamileth Cabrera Aguilar.jpg", c5toAdmon);
            stmt.run("Lizbeth Lorena", "Solís Soza", "Lizbeth Lorena Solís Soza", "img/admon5/Lizbeth Lorena Solís Sosa.jpg", c5toAdmon);
            stmt.run("Marjorie Yamilet", "Larias Sonta", "Marjorie Yamilet Larias Sonta", "img/admon5/Marjorie Yamilet Larias Sonta.jpg", c5toAdmon);
            stmt.run("Rosmery Vicenta", "Velásquez Zacarias", "Rosmery Vicenta Velásquez Zacarias", "img/admon5/Rosmery Vicenta Velásquez Zacarias.jpg", c5toAdmon);
            stmt.run("Stephanie Raquel", "Larias Sontay", "Stephanie Raquel Larias Sontay", "img/admon5/Stephanie Raquel Larias Sontay.jpg", c5toAdmon);
            stmt.run("Von Cristian", "Agbay Lorenzo", "Von Cristian Agbay Lorenzo", "img/admon5/Von Cristian Agbay Lorenzo.jpg", c5toAdmon);
            stmt.run("Yoisin Hilari", "Zetinoj", "Yoisin Hilari Zetinoj", "img/admon5/Yoisin Hilari Zetino.jpg", c5toAdmon);

            const c4toAdmon = "4to Perito en Administración de Empresas";
            stmt.run("Alisson Saraí", "Romero Rosa", "Alisson Saraí Romero Rosa", "img/admon4/Alisson Saraí Romero Rosa.jpg", c4toAdmon);
            stmt.run("Frank Yahir", "Salvador Marchoroto González", "Frank Yahir Salvador Marchoroto González", "img/admon4/Frank Yahir Salvador Marchorro González.jpg", c4toAdmon);
            stmt.run("Juan José", "Aceituno Zepeda", "Juan José Aceituno Zepeda", "img/admon4/Juan José Aceituno Zepeda.jpg", c4toAdmon);
            stmt.run("Marlin Gicelda", "Duran González", "Marlin Gicelda Duran González", "img/admon4/Marlin Gricelda Duran González .jpg", c4toAdmon);
            stmt.run("Martín Samuel", "Erazo Calderón", "Martín Samuel Erazo Calderón", "img/admon4/Martín Samuel Erazo Caldero .jpg", c4toAdmon);
            stmt.run("Marylin Pamela", "Tupul Carrera", "Marylin Pamela Tupul Carrera", "img/admon4/Marylin Pamela Tupul Carrera .jpg", c4toAdmon);
            stmt.run("Michael Antonio", "Juarros Paz", "Michael Antonio Juarros Paz", "img/admon4/Michael Antonio Juarros Paz.jpg", c4toAdmon);
            stmt.run("Yasmí Fabiola", "Fuentes Yos", "Yasmí Fabiola Fuentes Yos", "img/admon4/Yasmí Fabiola Fuentes Yos.jpg", c4toAdmon);

            // 2. CICLO BÁSICO
            const c1roBasicoA = "1ro Básico Secc. A";
            stmt.run("Abner Alberto", "Letellá Ordóñez", "Abner Alberto Letellá Ordóñez", "img/primeroa/Abner Alberto Jetellá Ordoñez.jpg", c1roBasicoA);
            stmt.run("Anderson Emanuel", "Garcia Rodriguez", "Anderson Emanuel Garcia Rodriguez", "img/primeroa/Anderson Emanuel Garcia Rodriguez.jpg", c1roBasicoA);
            stmt.run("Andruw Yeshua", "Zepeda Alvarez", "Andruw Yeshua Zepeda Alvarez", "img/primeroa/Andruw Yeshua Zepeda Alvarez.jpg", c1roBasicoA);
            stmt.run("Ashley Waleska", "Gordillo Montes", "Ashley Waleska Gordillo Montes", "img/primeroa/Ashley Waleska Gordillo Montes.jpg", c1roBasicoA);
            stmt.run("Astrid Mayerly", "Bailón Aguilar", "Astrid Mayerly Bailón Aguilar", "img/primeroa/Astrid Mayerly Bailón Aguilar.jpg", c1roBasicoA);
            stmt.run("Cristel Leonely", "Chaín García", "Cristel Leonely Chaín García", "img/primeroa/Cristel Leonely Chajón Garcia.jpg", c1roBasicoA);
            stmt.run("Dulce Marijosé", "Ajanel Chó", "Dulce Marijosé Ajanel Chó", "img/primeroa/Dulce Mariajosé Ajanel Chó.jpg", c1roBasicoA);
            stmt.run("Eboni Rachell", "Vásquez Samayoa", "Eboni Rachell Vásquez Samayoa", "img/primeroa/Eboni Rachell Vasquez Samayoa.jpg", c1roBasicoA);
            stmt.run("Esther Abigail", "Ramírez Malin", "Esther Abigail Ramírez Malin", "img/primeroa/Esther Abigail Ramirez Malín.jpg", c1roBasicoA);
            stmt.run("Estuardo Noe", "Perez Marroquín", "Estuardo Noe Perez Marroquín", "img/primeroa/Estuardo Noe Perez Marroquin.jpg", c1roBasicoA);
            stmt.run("Fatima Clara Esperanza", "Sánchez Morales", "Fatima Clara Esperanza Sánchez Morales", "img/primeroa/Fatima Clara Esperanza Sánchez Morales.jpg", c1roBasicoA);
            stmt.run("Gustavo Isaias", "Reyna Marroquín", "Gustavo Isaias Reyna Marroquín", "img/primeroa/Gustavo Isaias Reyna Marroquín.jpg", c1roBasicoA);
            stmt.run("Hánelly Yarely", "Chávez Rojas", "Hánelly Yarely Chávez Rojas", "img/primeroa/Hanelly Yarely Chavez Rojas.jpg", c1roBasicoA);
            stmt.run("Heilyn Joely", "Ordoñez Vargas", "Heilyn Joely Ordoñez Vargas", "img/primeroa/Heilyn Joely Ordoñez Vargas.jpg", c1roBasicoA);
            stmt.run("Herick Daniel", "Puac Minchez", "Herick Daniel Puac Minchez", "img/primeroa/Herick Daniel Puac Minchez.jpg", c1roBasicoA);
            stmt.run("Joshua Javier", "Bautista Jimenez", "Joshua Javier Bautista Jimenez", "img/primeroa/Joshua Javier Bautista Jimenez.jpg", c1roBasicoA);
            stmt.run("Josué Elias", "Hernandez Alonzo", "Josué Elias Hernandez Alonzo", "img/primeroa/Josué Elias Hernandez Alonzo.jpg", c1roBasicoA);
            stmt.run("Josué Emanuel", "Coyoy Hernández", "Josué Emanuel Coyoy Hernández", "img/primeroa/Josué Emanuel Coyoy Hernández.jpg", c1roBasicoA);
            stmt.run("Luis Daniel", "Vasquez Bac", "Luis Daniel Vasquez Bac", "img/primeroa/Luis Daniel Vasquez Bac.jpg", c1roBasicoA);
            stmt.run("Migdalia Angélica", "Arevalo Macal", "Migdalia Angélica Arevalo Macal", "img/primeroa/Migdalia Angélica Arevalo Macal.jpg", c1roBasicoA);
            stmt.run("Monica Ashly Mishell", "Rosales Gimenez", "Monica Ashly Mishell Rosales Gimenez", "img/primeroa/Monica Ashly Mishell Rosales Gimenez.jpg", c1roBasicoA);
            stmt.run("Nubia Nohemy", "Chel Cao", "Nubia Nohemy Chel Cao", "img/primeroa/Nubia Nohemy Chel Cao.jpg", c1roBasicoA);
            stmt.run("Pablo Sebastián", "Matías Domínguez", "Pablo Sebastián Matías Domínguez", "img/primeroa/Pablo Sebastian Matias Dominguez.jpg", c1roBasicoA);
            stmt.run("Rosmery Elizabeth", "Hernández Cervantes", "Rosmery Elizabeth Hernández Cervantes", "img/primeroa/Rosmery Elizabeth Hernández Cervantes.jpg", c1roBasicoA);
            stmt.run("Sara Gabriela", "Riz Franco", "Sara Gabriela Riz Franco", "img/primeroa/Sara Gabriela Riz Franco.jpg", c1roBasicoA);
            stmt.run("Susana Isabel", "Salguero Lorenzo", "Susana Isabel Salguero Lorenzo", "img/primeroa/Susana Isabel Salguero Lorenzo.jpg", c1roBasicoA);
            stmt.run("William Manuel", "Lopez López", "William Manuel Lopez López", "img/primeroa/William Manuel Lopez López.jpg", c1roBasicoA);
            stmt.run("Yaseliny Yaneth", "Garcia De Leon", "Yaseliny Yaneth Garcia De Leon", "img/primeroa/Yaseily Yaneth Garcia De Leon.jpg", c1roBasicoA);
            stmt.run("Yoselin Tatiana", "Medina Gutierrez", "Yoselin Tatiana Medina Gutierrez", "img/primeroa/Yoselin Tatiana Medina Gutierrez.jpg", c1roBasicoA);

            const c1roBasicoB = "1ro Básico Secc. B";
            stmt.run("Álvaro Ivan", "Gutierrez Rivera", "Álvaro Ivan Gutierrez Rivera", "img/primerob/Álvaro Ivan Gutierrez Rivera.jpg", c1roBasicoB);
            stmt.run("Angel José", "Contreras Uyun", "Angel José Contreras Uyun", "img/primerob/Angel José Contreras Uyun.jpg", c1roBasicoB);
            stmt.run("Angel Moisés", "Divas Rafael", "Angel Moisés Divas Rafael", "img/primerob/Angel Moisés Divas Rafael.jpg", c1roBasicoB);
            stmt.run("Anthony Jadiel", "Mazareiegos Vasquez", "Anthony Jadiel Mazareiegos Vasquez", "img/primerob/Anthony Jadiel Mazariegos Vasquez.jpg", c1roBasicoB);
            stmt.run("Axel Leonel", "Rivera Martinez", "Axel Leonel Rivera Martinez", "img/primerob/Axel Leonel Rivera Martinez.jpg", c1roBasicoB);
            stmt.run("Bryan Mateo", "Mejia Macario", "Bryan Mateo Mejia Macario", "img/primerob/Bryan Mateo Mejia Macario.jpg", c1roBasicoB);
            stmt.run("Christopher Antonio", "Emmanuel Pocon", "Christopher Antonio Emmanuel Pocon", "img/primerob/Christopher Antonio Emmanuel Pocon.jpg", c1roBasicoB);
            stmt.run("Dayrin Urbina", "Boctzoc Ichich", "Dayrin Urbina Boctzoc Ichich", "img/primerob/Dayrin Urbina Boctzoc Ichich.jpg", c1roBasicoB);
            stmt.run("Diego Emmanuel", "Morales López", "Diego Emmanuel Morales López", "img/primerob/Diego Emmanuel Morales López.jpg", c1roBasicoB);
            stmt.run("Dilan Estiven", "García Narváez", "Dilan Estiven García Narváez", "img/primerob/Dilan Estiven García Narváez.jpg", c1roBasicoB);
            stmt.run("Estefani Dayana", "Alvizures Sipaque", "Estefani Dayana Alvizures Sipaque", "img/primerob/Estefani Dayana Alvizures Sipaque.jpg", c1roBasicoB);
            stmt.run("Fátima Andrea", "Recinos García", "Fátima Andrea Recinos García", "img/primerob/Fátima Andrea Recinos García.jpg", c1roBasicoB);
            stmt.run("Génesis Gabriela", "Hernández Andrés", "Génesis Gabriela Hernández Andrés", "img/primerob/Génesis Gabriela Hernández Andrés.jpg", c1roBasicoB);
            stmt.run("Jhonatan David", "Ramírez Jiménez", "Jhonatan David Ramírez Jiménez", "img/primerob/Jhonatan David Ramirez Jiménez.jpg", c1roBasicoB);
            stmt.run("Jorge Luis", "Salvado López", "Jorge Luis Salvado López", "img/primerob/Jorge Luis Salvado López.jpg", c1roBasicoB);
            stmt.run("Julio Josué", "Contreras Uyun", "Julio Josué Contreras Uyun", "img/primerob/Julio Josué Contreras Uyun.jpg", c1roBasicoB);
            stmt.run("Keshler Gedeoni", "De La Roca Saldaña", "Keshler Gedeoni De La Roca Saldaña", "img/primerob/Keslher Gedeoni De La Roca Saldaña.jpg", c1roBasicoB);
            stmt.run("Maria Alejandra", "Vasquez Cadenas", "Maria Alejandra Vasquez Cadenas", "img/primerob/Maria Alejandra Vasquez Cadenas.jpg", c1roBasicoB);
            stmt.run("Melany Carolina", "Patzan Pio", "Melany Carolina Patzan Pio", "img/primerob/Melany Carolina Patzan Pio.jpg", c1roBasicoB);
            stmt.run("Melany Fabiola", "Ramirez Valenzuela", "Melany Fabiola Ramirez Valenzuela", "img/primerob/Melany Fabiola Ramirez Valenzuela.jpg", c1roBasicoB);
            stmt.run("Michael Josué", "Guerra Audon", "Michael Josué Guerra Audon", "img/primerob/Michael Josué Guerra Audon.jpg", c1roBasicoB);
            stmt.run("Osmar Alexander", "Lutin Gamarro", "Osmar Alexander Lutin Gamarro", "img/primerob/Osmar Alexander Lutin Gamarro.jpg", c1roBasicoB);
            stmt.run("Pablo Alexander", "Salgado López", "Pablo Alexander Salgado López", "img/primerob/Pablo Alexander Salgado López.jpg", c1roBasicoB);
            stmt.run("Paola Génesis", "Lancerio Romero", "Paola Génesis Lancerio Romero", "img/primerob/Paola Génesis Lancerio Romero.jpg", c1roBasicoB);
            stmt.run("Sander Gael", "Gordio Casasola", "Sander Gael Gordio Casasola", "img/primerob/Sander Gael Gordio Casasola.jpg", c1roBasicoB);
            stmt.run("Victor Alessandro", "Hernández López", "Victor Alessandro Hernández López", "img/primerob/Victor Alessandro Hernández López.jpg", c1roBasicoB);

            const c2doBasicoA = "2do Básico Secc. A";
            stmt.run("Diego Alfonso", "Ujpan López", "Diego Alfonso Ujpan López", "img/segundoa/Diego Alfonso Ujpan López.png", c2doBasicoA);
            stmt.run("Dulce Nohemí", "Pérez Pérez", "Dulce Nohemí Pérez Pérez", "img/segundoa/Dulce Nohemí Pérez Pérez.png", c2doBasicoA);
            stmt.run("Elie Jimena", "Zet Alay", "Elie Jimena Zet Alay", "img/segundoa/Elie Jimena Zet Alay.png", c2doBasicoA);
            stmt.run("Enrique Emanuel", "Cayaxón Citalán", "Enrique Emanuel Cayaxón Citalán", "img/segundoa/Enrique Emanuel Cayaxón Citalán.png", c2doBasicoA);
            stmt.run("Génesis Andrea", "Piñones Reyes", "Génesis Andrea Piñones Reyes", "img/segundoa/Génesis Andrea Piñones Reyes.png", c2doBasicoA);
            stmt.run("Jimena Nicol", "Jiménez Ramos", "Jimena Nicol Jiménez Ramos", "img/segundoa/Jimena Nicol Jiménez Ramos.png", c2doBasicoA);
            stmt.run("Jordan Isali", "Sinar Aguilar", "Jordan Isali Sinar Aguilar", "img/segundoa/Jordan Isali Sinar Aguilar.png", c2doBasicoA);
            stmt.run("Josseline Alejandra", "Pablo Leiva", "Josseline Alejandra Pablo Leiva", "img/segundoa/Josseline Alejandra Pablo Leiva.png", c2doBasicoA);
            stmt.run("Karen Marisol", "Luque Mazariegos", "Karen Marisol Luque Mazariegos", "img/segundoa/Karen Marisol Luque Mazariegos.png", c2doBasicoA);
            stmt.run("Kely Avigail", "Martinez Chay", "Kely Avigail Martinez Chay", "img/segundoa/Kely Avigail Martinez Chay.png", c2doBasicoA);
            stmt.run("Mario Josué", "Marroquín Hernández", "Mario Josué Marroquín Hernández", "img/segundoa/Mario Josué Marroquín Hernández.png", c2doBasicoA);
            stmt.run("Rosa Isabella", "Barrios Rodríguez", "Rosa Isabella Barrios Rodríguez", "img/segundoa/Rosa Isabella Barrios Rodríguez.png", c2doBasicoA);
            stmt.run("Sabrina Nicole", "Matías Martinez", "Sabrina Nicole Matías Martinez", "img/segundoa/Sabrina Nicole Matías Martinez.png", c2doBasicoA);
            stmt.run("Sergio Daniel", "Osorio Vasquez", "Sergio Daniel Osorio Vasquez", "img/segundoa/Sergio_Daniel_Osorio_Vasquez.png", c2doBasicoA);
            stmt.run("Yareli Ximena", "Hernández Alburez", "Yareli Ximena Hernández Alburez", "img/segundoa/Yareli Ximena Hernández Alburez.png", c2doBasicoA);
            stmt.run("Yostin Rigoberto", "Yanez Vasquez", "Yostin Rigoberto Yanez Vasquez", "img/segundoa/Yostin Rigoberto Yanez Vasquez.png", c2doBasicoA);
            stmt.run("Zender Johan Andre", "Ramazzin Juárez", "Zender Johan Andre Ramazzin Juárez", "img/segundoa/Zender Johan Andre Ramazzin Juárez.png", c2doBasicoA);

            const c2doBasicoB = "2do Básico Secc. B";
            stmt.run("Brandon Elian", "Gutierrez Solito", "Brandon Elian Gutierrez Solito", "img/segundob/Brandon Elian Gutierrez Solito.png", c2doBasicoB);
            stmt.run("Fernando Javier", "Mayen Cabrera", "Fernando Javier Mayen Cabrera", "img/segundob/Fernando Javier Mayen Cabrera.png", c2doBasicoB);
            stmt.run("Génesis Roxana", "Gómez Mejia", "Génesis Roxana Gómez Mejia", "img/segundob/Génesis Roxana Gómez Mejia.png", c2doBasicoB);
            stmt.run("Jannir Alejandra", "Itzol Monzon", "Jannir Alejandra Itzol Monzon", "img/segundob/Jannir Alejandra Itzol Monzon.png", c2doBasicoB);
            stmt.run("Katerine Mariné", "Martinez Obispo", "Katerine Mariné Martinez Obispo", "img/segundob/Katerine Mariné Martinez Obispo.png", c2doBasicoB);
            stmt.run("Keyli Mariana", "Ocoix Mendez", "Keyli Mariana Ocoix Mendez", "img/segundob/Keyli Mariana Ocoix Mendez.png", c2doBasicoB);
            stmt.run("Maricarmen Yohalin", "Pérez García", "Maricarmen Yohalin Pérez García", "img/segundob/Maricarmen Yohalin Pérez García.png", c2doBasicoB);
            stmt.run("Marleni Patricia", "Fuentes Tul", "Marleni Patricia Fuentes Tul", "img/segundob/Marleni Patricia Fuentes Tul.png", c2doBasicoB);
            stmt.run("Nataly Angely", "Torres García", "Nataly Angely Torres García", "img/segundob/Nataly Angely Torres García.png", c2doBasicoB);
            stmt.run("Oliver Anthoand", "López González", "Oliver Anthoand López González", "img/segundob/Oliver Anthoand López Gonzáles.png", c2doBasicoB);
            stmt.run("Perla Marisol", "De la Cruz Noj", "Perla Marisol De la Cruz Noj", "img/segundob/Perla Marisol De la Cruz Noj.png", c2doBasicoB);
            stmt.run("Rodrigo Eduardo", "Hurtado Montepeque", "Rodrigo Eduardo Hurtado Montepeque", "img/segundob/Rodrigo Eduardo Hurtado Montepeque.png", c2doBasicoB);
            stmt.run("Samuel Abdias", "Pérez López", "Samuel Abdias Pérez López", "img/segundob/Samuel Abdias Pérez López.png", c2doBasicoB);
            stmt.run("Samuel Efrain", "Pineda Paz", "Samuel Efrain Pineda Paz", "img/segundob/Samuel Efrain Pineda Paz.png", c2doBasicoB);
            stmt.run("Wendy Sofía", "López Zetino", "Wendy Sofía López Zetino", "img/segundob/Wendy Sofía López Zetino.png", c2doBasicoB);
            stmt.run("Yermi Sahir", "Guerra Audon", "Yermi Sahir Guerra Audon", "img/segundob/Yermi Sahir Guerra Audon.png", c2doBasicoB);
            stmt.run("Zeidy Maeli", "Latín Domínguez", "Zeidy Maeli Latín Domínguez", "img/segundob/Zeidy Maeli Latín Domínguez.png", c2doBasicoB);

            const c3roBasicoA = "3ro Básico Secc. A";
            stmt.run("Anderson Jasiel", "Grijalva López", "Anderson Jasiel Grijalva López", "img/terceroa/Anderson Jasiel Grijalva López.png", c3roBasicoA);
            stmt.run("Angy Vanessa", "Pérez Pascual", "Angy Vanessa Pérez Pascual", "img/terceroa/Angy Vanessa Pérez Pascual.png", c3roBasicoA);
            stmt.run("Brayan David", "Garcia Navarrez", "Brayan David Garcia Navarrez", "img/terceroa/Brayan David Garcia Navarrez.png", c3roBasicoA);
            stmt.run("Carlos Alexander", "Puac Minchez", "Carlos Alexander Puac Minchez", "img/terceroa/Carlos Alexander Puac Minchez.png", c3roBasicoA);
            stmt.run("Carlos Augusto", "Garay Perez", "Carlos Augusto Garay Perez", "img/terceroa/Carlos Augusto Garay Perez.png", c3roBasicoA);
            stmt.run("Cristofer Josue", "Rodriguez López", "Cristofer Josue Rodriguez López", "img/terceroa/Cristofer Josue Rodriguez López.png", c3roBasicoA);
            stmt.run("Dana Mishel", "Gomez Martinez", "Dana Mishel Gomez Martinez", "img/terceroa/Dana Mishel Gomez Martinez.png", c3roBasicoA);
            stmt.run("Eddy Arnoldo", "Chibalán Sosof", "Eddy Arnoldo Chibalán Sosof", "img/terceroa/Eddy Arnoldo Chibalán Sosof.png", c3roBasicoA);
            stmt.run("Heidria Josmarly", "Gonzáles Flores", "Heidria Josmarly Gonzáles Flores", "img/terceroa/Heidria Josmarly Gonzáles Flores.png", c3roBasicoA);
            stmt.run("Lourdes Asusena", "Lopez Davila", "Lourdes Asusena Lopez Davila", "img/terceroa/Lourdes Asusena Lopez Davila.png", c3roBasicoA);
            stmt.run("Luis Alejandro", "Parada Macha", "Luis Alejandro Parada Macha", "img/terceroa/Luis Alejandro Parada Macha.png", c3roBasicoA);
            stmt.run("Luis Josué", "Escobar Cruz", "Luis Josué Escobar Cruz", "img/terceroa/Luis Josué Escobar Cruz.png", c3roBasicoA);
            stmt.run("Melanie Jimena", "García López", "Melanie Jimena García López", "img/terceroa/Melanie Jimena García López.png", c3roBasicoA);
            stmt.run("Melvin Asael", "Hernández Pérez", "Melvin Asael Hernández Pérez", "img/terceroa/Melvin Asael Hernández Pérez.png", c3roBasicoA);
            stmt.run("Mydeline Nicol", "Fernández López", "Mydeline Nicol Fernández López", "img/terceroa/Mydeline Nicol Fernández López.png", c3roBasicoA);
            stmt.run("Pablo Adrian", "Siguaque Estrada", "Pablo Adrian Siguaque Estrada", "img/terceroa/Pablo Adrian Siguaque Estrada.png", c3roBasicoA);
            stmt.run("Saida Marisol", "Feliciano Miranda", "Saida Marisol Feliciano Miranda", "img/terceroa/Saida Marisol Feliciano Miranda.png", c3roBasicoA);

            const c3roBasicoB = "3ro Básico Secc. B";
            stmt.run("Angel Eduardo", "Sacalxot Cruz", "Angel Eduardo Sacalxot Cruz", "img/tercerob/Angel Eduardo Sacalxot Cruz.png", c3roBasicoB);
            stmt.run("Ariana Camila", "Tum Nolasco", "Ariana Camila Tum Nolasco", "img/tercerob/Ariana Camila Tum Nolasco.png", c3roBasicoB);
            stmt.run("Brandon Antonio", "Mendez Florian", "Brandon Antonio Mendez Florian", "img/tercerob/Brandon Antonio Mendez Florian.png", c3roBasicoB);
            stmt.run("Cesar Yadiel", "Godoy Chital", "Cesar Yadiel Godoy Chital", "img/tercerob/Cesar Yadiel Godoy Chital.png", c3roBasicoB);
            stmt.run("Dulce Daniela", "Villela Gálvez", "Dulce Daniela Villela Gálvez", "img/tercerob/Dulce Daniela Villela Gálvez.png", c3roBasicoB);
            stmt.run("Edwin Alexis", "Macha Quiñonez", "Edwin Alexis Macha Quiñonez", "img/tercerob/Edwin Alexis Macha Quiñonez.png", c3roBasicoB);
            stmt.run("Estefany Mishell", "López Tinti", "Estefany Mishell López Tinti", "img/tercerob/Estefany Mishell López Tinti.png", c3roBasicoB);
            stmt.run("Jackeline Dariana", "Torres Maldonado", "Jackeline Dariana Torres Maldonado", "img/tercerob/Jackeline Dariana Torres Maldonado.png", c3roBasicoB);
            stmt.run("Jackeline Mishell", "Mejia Macario", "Jackeline Mishell Mejia Macario", "img/tercerob/Jackeline Mishell Mejia Macario.png", c3roBasicoB);
            stmt.run("Jefferson David", "Rustrián Gómez", "Jefferson David Rustrián Gómez", "img/tercerob/Jefferson David Rustrian Gómez.png", c3roBasicoB);
            stmt.run("Jefferson Steven", "Cristales Rivera", "Jefferson Steven Cristales Rivera", "img/tercerob/Jefferson Steven Cristales Rivera.png", c3roBasicoB);
            stmt.run("Jehizel Jasiel", "Toj Rosales", "Jehizel Jasiel Toj Rosales", "img/tercerob/Jehizel Jasiel Toj Rosales.png", c3roBasicoB);
            stmt.run("Kaleb Eliazib", "Rosales García", "Kaleb Eliazib Rosales García", "img/tercerob/Kaleb Eliazib Rosales García.png", c3roBasicoB);
            stmt.run("Kenia Cristel", "Ortiz Ochaita", "Kenia Cristel Ortiz Ochaita", "img/tercerob/Kenia Cristel Ortiz Ochaita.png", c3roBasicoB);
            stmt.run("Kleiver Osvanni", "Barrillas Calderas", "Kleiver Osvanni Barrillas Calderas", "img/tercerob/Kleiver Osvanni Barrillas Calderas.png", c3roBasicoB);
            stmt.run("Lineth Naomy", "Pérez Pérez", "Lineth Naomy Pérez Pérez", "img/tercerob/Lineth Naomy Pérez Pérez.png", c3roBasicoB);
            stmt.run("Maria Concepción", "Vásquez Guzmán", "Maria Concepción Vásquez Guzmán", "img/tercerob/Maria Concepción Vásquez Guzmán.png", c3roBasicoB);
            stmt.run("Naomi Yanet", "Cuc Baten", "Naomi Yanet Cuc Baten", "img/tercerob/Naomi Yanet Cuc Baten.png", c3roBasicoB);
            stmt.run("Roxana Anahi", "Marcos Leiva", "Roxana Anahi Marcos Leiva", "img/tercerob/Roxana Anahi Marcos Leiva.png", c3roBasicoB);
            stmt.run("Yadira Betzave", "Vasquez Cutiño", "Yadira Betzave Vasquez Cutiño", "img/tercerob/Yadira Betzave Vasquez Cutiño.png", c3roBasicoB);
            stmt.run("Yuliana Yamilet", "Vasquez Dieguez", "Yuliana Yamilet Vasquez Dieguez", "img/tercerob/Yuliana Yamilet Vasquez Dieguez.png", c3roBasicoB);
            
            // 3. BACHILLERATO EN COMPUTACIÓN
            
            const c4toCompA = "4to Bachillerato en Computación Secc. A";
    stmt.run("Angel José", "Pu Martin", "Angel José Pu Martin", "img/bach4A/Angel José Pu Martin.jpg", c4toCompA);
    stmt.run("Angely Natalia", " Lorenzo", "Angely Natalia Chigüichon Lorenzo", "img/bach4A/Angely Natalia Chigüichon Lorenzo.jpg", c4toCompA);
    stmt.run("Antony Bernabé", "López Cabrera", "Antony Bernabé López Cabrera", "img/bach4A/Antony Bernabé López Cabrera.jpg", c4toCompA);
    stmt.run("Anyeliy Jimena", "Hilario Palacios", "Anyeliy Jimena Hilario Palacios", "img/bach4A/Anyeliy Jimena Hilario Palacios.jpg", c4toCompA);
    stmt.run("Bárbara Carolina", "Sánchez Rousselin", "Bárbara Carolina Sánchez Rousselin", "img/bach4A/Bárbara Carolina Sánchez Rousselin.jpg", c4toCompA);
    stmt.run("Cesar Ivan", "Marcos Leiva", "Cesar Ivan Marcos Leiva", "img/bach4A/Cesar Ivan Marcos Leiva.jpg", c4toCompA);
    stmt.run("Cristopher Isaac", "Gálvez Mijangos", "Cristopher Isaac Gálvez Mijangos", "img/bach4A/Cristopher Isaac Gálvez Mijangos.jpg", c4toCompA);
    stmt.run("David Ottoniel", "Acajabon Hilario", "David Ottoniel Acajabon Hilario", "img/bach4A/David Ottoniel Acajabon Hilario.jpg", c4toCompA);
    stmt.run("Elias Daniel", "Pérez", "Elias Daniel Pérez", "img/bach4A/Elias Daniel Pérez.jpg", c4toCompA);
    stmt.run("Elsa Jimena", "Cordón Cruz", "Elsa Jimena Cordón Cruz", "img/bach4A/Elsa Jimena Cordón Cruz.jpg", c4toCompA);
    stmt.run("Erick Alexander", "Mendoza Martinez", "Erick Alexander Mendoza Martinez", "img/bach4A/Erick Alexander Mendoza Martinez.jpg", c4toCompA);
    stmt.run("Geovani Alexander", "Godines García", "Geovani Alexander Godines García", "img/bach4A/Geovani Alexander Godines García.jpg", c4toCompA);
    stmt.run("Gunith Eduardo", "De León Sánchez", "Gunith Eduardo De León Sánchez", "img/bach4A/Gunith Eduardo De León Sánchez.jpg", c4toCompA);
    stmt.run("Jeferson Estuardo", "Chij Lucas", "Jeferson Estuardo Chij Lucas", "img/bach4A/Jeferson Estuardo Chij Lucas.jpg", c4toCompA);
    stmt.run("Jessenia Phaola", "González Carrillo", "Jessenia Phaola González Carrillo", "img/bach4A/Jessenia Phaola González Carrillo.jpg", c4toCompA);
    stmt.run("Jose Daniel", "Hernández Pérez", "Jose Daniel Hernández Pérez", "img/bach4A/Jose Daniel Hernández Pérez.jpg", c4toCompA);
    stmt.run("Joshua Raul", "Velasquez Gonzalez", "Joshua Raul Velasquez Gonzalez", "img/bach4A/Joshua Raul Velasquez Gonzalez.jpg", c4toCompA);
    stmt.run("Jostin Alexander", "Mejia Ramirez", "Jostin Alexander Mejia Ramirez", "img/bach4A/Jostin Alexander Mejia Ramírez.jpg", c4toCompA);
    stmt.run("Kevin Alejandro", "Cahuec Gallardo", "Kevin Alejandro Cahuec Gallardo", "img/bach4A/Kevin Alejandro Cahuec Gallardo.jpg", c4toCompA);
    stmt.run("Krishna Analy", "Santiago Hernández", "Krishna Analy Santiago Hernández", "img/bach4A/Krishna Analy Santiago Hernández.jpg", c4toCompA);
    stmt.run("Marielos Elizabeth", "Hernández Morente", "Marielos Elizabeth Hernández Morente", "img/bach4A/Marielos Elizabeth Hernández Morente.jpg", c4toCompA);
    stmt.run("Victor Leonel", "Vasquez López", "Victor Leonel Vasquez López", "img/bach4A/Victor Leonel Vasquez López.jpg", c4toCompA);

            const c4toCompB = "4to Bachillerato en Computación Secc. B";
    stmt.run("Anderson Yahir", "Vásquez Guzmán", "Anderson Yahir Vásquez Guzmán", "img/bach4B/Anderson Yahir Vásquez Guzmán.png", c4toCompB);
    stmt.run("Angel Gabriel", "castillo vail", "Angel Gabriel castillo vail", "img/bach4B/Angel Gabriel castillo vail.png", c4toCompB);
    stmt.run("Bryan Josué", "Cortez Pérez", "Bryan Josué Cortez Pérez", "img/bach4B/Bryan Josué Cortez Pérez.png", c4toCompB);
    stmt.run("Cristian Samuel", "Ramirez Grave", "Cristian Samuel Ramirez Grave", "img/bach4B/Cristian Samuel Ramirez Grave.png", c4toCompB);
    stmt.run("Dayana Lisseth", "López Sacap", "Dayana Lisseth López Sacap", "img/bach4B/Dayana Lisseth López Sacap.png", c4toCompB);
    stmt.run("Esmeralda Eunice", "Arreaza Najera", "Esmeralda Eunice Arreaza Najera", "img/bach4B/Esmeralda Eunice Arreaza Najera.png", c4toCompB);
    stmt.run("José Manuel", "Raymundo Guansin", "José Manuel Raymundo Guansin", "img/bach4B/José Manuel Raymundo Guansin.png", c4toCompB);
    stmt.run("Josue David", "Robledo Villela", "Josue David Robledo Villela", "img/bach4B/Josue David Robledo Villela.png", c4toCompB);
    stmt.run("Junior alexis", "Hernández Escobar", "Junior alexis Hernández Escobar", "img/bach4B/Junior alexis Hernández Escobar.png", c4toCompB);
    stmt.run("Kenet Agusto", "Sanchinelli Ramirez", "Kenet Agusto Sanchinelli Ramirez", "img/bach4B/Kenet Agusto Sanchinelli Ramirez.png", c4toCompB);
    stmt.run("Kimberly Noemi", "Hernández González", "Kimberly Noemi Hernández González", "img/bach4B/Kimberly Noemí Hernández González.png", c4toCompB);
    stmt.run("Kleyver Estuardo", "Marroquín Quel", "Kleyver Estuardo Marroquín Quel", "img/bach4B/Kleyver Estuardo Marroquín Quel.png", c4toCompB);
    stmt.run("Iliana Pamela", "Hernández Saban", "Iliana Pamela Hernández Saban", "img/bach4B/lliana pamela Hernández saban.png", c4toCompB);
    stmt.run("Marcos Rubén", "Gómez Godínez", "Marcos Rubén Gómez Godínez", "img/bach4B/Marcos Rubén Gómez Godínez.png", c4toCompB);
    stmt.run("Marilin Dayana", "Velasquez Pineda", "Marilin Dayana Velasquez Pineda", "img/bach4B/Marilin Dayana Velasquez Pineda.png", c4toCompB);
    stmt.run("Melany Fabiola", "Cancax Corominar", "Melany Fabiola Cancax Corominar", "img/bach4B/Melany Fabiola Cancax Corominar.png", c4toCompB);
    stmt.run("Miguel Angel", "Lobos Vasquez", "Miguel Angel Lobos Vasquez", "img/bach4B/Miguel Angel Lobos Vasquez.png", c4toCompB);
    stmt.run("Ruth Azucena Noemí", "Juarez Ramírez", "Ruth Azucena Noemí Juarez Ramírez", "img/bach4B/Ruth Azucena Noemí Juarez Ramírez.png", c4toCompB);
    stmt.run("Yamileth Ashly", "Lobos Martinez", "Yamileth Ashly Lobos Martinez", "img/bach4B/Yamileth Ashly Lobos Martinez.png", c4toCompB);
    stmt.run("Yasmin Emily", "Villanueva Mendez", "Yasmin Emily Villanueva Mendez", "img/bach4B/Yasmin Emily Villanueva Mendez_.png", c4toCompB);

            const c5toCompA = "5to Bachillerato en Computación Secc. A";
    stmt.run("Adriana Esther", "Pineda Paz", "Adriana Esther Pineda Paz", "img/bach5A/Adriana Esther Pineda Paz.png", c5toCompA);
    stmt.run("Anthony Edin", "Gómez Alvarado", "Anthony Edin Gómez Alvarado", "img/bach5A/Anthony Edin Gómez Alvarado_.png", c5toCompA);
    stmt.run("Britani Jhanyli", "Castillo Jiménez", "Britani Jhanyli Castillo Jiménez", "img/bach5A/Britani Jhanyli Castillo Jiménez_.png", c5toCompA);
    stmt.run("Byron Estuardo", "Luna Luna", "Byron Estuardo Luna Luna", "img/bach5A/Byron Estuardo Luna Luna.png", c5toCompA);
    stmt.run("Carlos Andrés", "Orantes Arroyo", "Carlos Andrés Orantes Arroyo", "img/bach5A/Carlos Andrés Orantes Arroyo.png", c5toCompA);
    stmt.run("Carmen Lisset", "Herrera Ramírez", "Carmen Lisset Herrera Ramírez", "img/bach5A/Carmen Lisset Herrera Ramírez_.png", c5toCompA);
    stmt.run("Daniel de Jesús Agustín", "Guevara", "Daniel de Jesús Agustín Guevara", "img/bach5A/Daniel de Jesús Agustín Guevara.png", c5toCompA);
    stmt.run("Dayrin Dayana", "Pérez García", "Dayrin Dayana Pérez García", "img/bach5A/Dayrin Dayana Pérez García.png", c5toCompA);
    stmt.run("Estrella Noemi", "Puac Minchez", "Estrella Noemi Puac Minchez", "img/bach5A/Estrella Noemi Puac Minchez.png", c5toCompA);
    stmt.run("Henry Eliud", "García Rodríguez", "Henry Eliud García Rodríguez", "img/bach5A/Henry Eliud García Arodriguez.png", c5toCompA);
    stmt.run("Ingrid Noemí", "Ramos Sosa", "Ingrid Noemí Ramos Sosa", "img/bach5A/Ingrid Noemí Ramos Sosa.png", c5toCompA);
    stmt.run("Jeison Fernando", "Concua Cuevas", "Jeison Fernando Concua Cuevas", "img/bach5A/Jeison Fernando Concua Cuevas.png", c5toCompA);
    stmt.run("Jerber Elias", "Velasquez Cumes", "Jerber Elias Velasquez Cumes", "img/bach5A/Jerber Elias Velasquez Cumes.png", c5toCompA);
    stmt.run("Jeremy Tardelí", "Alfaro Mezquite", "Jeremy Tardelí Alfaro Mezquite", "img/bach5A/Jeremy Tardelí Alfaro Mezquite.png", c5toCompA);
    stmt.run("Jony Leonel", "Rodríguez Brito", "Jony Leonel Rodríguez Brito", "img/bach5A/Jony Leonel Rodríguez Brito.png", c5toCompA);
    stmt.run("Jorge Julio", "Monroy Ordóñez", "Jorge Julio Monroy Ordóñez", "img/bach5A/Jorge Julio Monroy Ordóñez_.png", c5toCompA);
    stmt.run("José Francisco", "González De Jesús", "José Francisco González De Jesús", "img/bach5A/José Francisco González De Jesús_.png", c5toCompA);
    stmt.run("Kimberly Gabriela", "Barrera Monroy", "Kimberly Gabriela Barrera Monroy", "img/bach5A/Kimberly Gabriela Barrera Monroy_.png", c5toCompA);
    stmt.run("Luis Isaac", "Alvarado Rodríguez", "Luis Isaac Alvarado Rodríguez", "img/bach5A/Luis Isaac Alvarado Rodríguez_.png", c5toCompA);
    stmt.run("Maria Daniela", "Garay Pérez", "Maria Daniela Garay Pérez", "img/bach5A/Maria Daniela Garay Pérez.png", c5toCompA);
    stmt.run("Mario André", "Revolorio Cardona", "Mario André Revolorio Cardona", "img/bach5A/Mario André Revolorio Cardona_.png", c5toCompA);
    stmt.run("Rudy José", "Coy", "Rudy José Coy", "img/bach5A/Rudy José Coy.png", c5toCompA);

            const c5toCompB = "5to Bachillerato en Computación Secc. B";
    stmt.run("Ana Gabriela", "Martínez Pérez", "Ana Gabriela Martínez Pérez", "img/bach5B/Ana Gabriela Martínez Pérez.png", c5toCompB);
    stmt.run("Angel Ismael", "rosales reyes", "Angel Ismael rosales reyes", "img/bach5B/Angel Ismael rosales reyes.png", c5toCompB);
    stmt.run("Angelo Abysai", "Pelaez Tul", "Angelo Abysai Pelaez Tul", "img/bach5B/Angelo Abysai Pelaez Tul_.png", c5toCompB);
    stmt.run("Carlos Francisco Antonio", "Contreras", "Carlos Francisco Antonio Contreras", "img/bach5B/Carlos Francisco Antonio Contreras.png", c5toCompB);
    stmt.run("Cristopher Alexander", "Solano Rivera", "Cristopher Alexander Solano Rivera", "img/bach5B/Cristopher Alexander Solano Rivera.png", c5toCompB);
    stmt.run("David Alejandro", "Ordóñez Itzol", "David Alejandro Ordóñez Itzol", "img/bach5B/David Alejandro Ordóñez Itzol.png", c5toCompB);
    stmt.run("Dayana Nicol", "Batres Alvarado", "Dayana Nicol Batres Alvarado", "img/bach5B/Dayana Nicol Batres Alvarado.png", c5toCompB);
    stmt.run("Eduardo Antonio", "Arrecis Gómez", "Eduardo Antonio Arrecis Gómez", "img/bach5B/Eduardo Antonio Arrecis Gómez.png", c5toCompB);
    stmt.run("Jeferson Abimael", "Ramírez Donis", "Jeferson Abimael Ramírez Donis", "img/bach5B/Jeferson Abimael Ramírez Donis.png", c5toCompB);
    stmt.run("Jeimy Aída", "Herrarte Rodríguez", "Jeimy Aída Herrarte Rodríguez", "img/bach5B/Jeimy Aída Herrarte Rodríguez.png", c5toCompB);
    stmt.run("Kevin Omar", "Alvizures Espinoza", "Kevin Omar Alvizures Espinoza", "img/bach5B/Kevin Omar Alvizures Espinoza_.png", c5toCompB);
    stmt.run("Laura Sofía", "Cashun Urízar", "Laura Sofía Cashun Urízar", "img/bach5B/Laura Sofía Cashun Urízar.png", c5toCompB);
    stmt.run("Marvin Sebastián", "Aguilar Mateo", "Marvin Sebastián Aguilar Mateo", "img/bach5B/Marvin Sebástian Aguilar Mateo.png", c5toCompB);
    stmt.run("Mary Melisa", "Mejía Macario", "Mary Melisa Mejía Macario", "img/bach5B/Mary Melisa Mejía Macario.png", c5toCompB);
    stmt.run("Maylyn Gimena", "Lutín Gamarro", "Maylyn Gimena Lutín Gamarro", "img/bach5B/Maylyn Gimena Lutín Gamarro.png", c5toCompB);
    stmt.run("Rodrigo Alejandro", "Castellanos Morales", "Rodrigo Alejandro Castellanos Morales", "img/bach5B/Rodrigo Alejandro Castellanos Morales.png", c5toCompB);
    stmt.run("Rudy Moisés", "Morales Sucuquí", "Rudy Moisés Morales Sucuquí", "img/bach5B/Rudy Moisés Morales Sucuquí_.png", c5toCompB);
    stmt.run("Sayra Vanesa", "Coz Jorge", "Sayra Vanesa Coz Jorge", "img/bach5B/Sayra Vanesa Coz Jorge.png", c5toCompB);
    stmt.run("Selvin Emanuel", "Herrera Enríquez", "Selvin Emanuel Herrera Enríquez", "img/bach5B/Selvin Emanuel Herrera Enríquez.png", c5toCompB);
    stmt.run("Sherly Vanessa", "Sosa", "Sherly Vanessa Sosa", "img/bach5B/Sherly Vanessa Sosa.png", c5toCompB);
    stmt.run("Yeny Yesenia", "Chivalan Sosof", "Yeny Yesenia Chivalan Sosof", "img/bach5B/Yeny Yesenia Chivalan Sosof.png", c5toCompB);

            // =========================================================================
            // 4. BACHILLERATO EN DISEÑO GRÁFICO
            // =========================================================================
            const c4toDiseno = "4to Bachillerato en Diseño Gráfico";
    stmt.run("Alex Giovanni", "Jiménez Ramos", "Alex Giovanni Jiménez Ramos", "img/diseño4/Alex Giovanni Jiménez Ramos.jpg", c4toDiseno);
    stmt.run("Alisson Nohemi", "Mejia Garcia", "Alisson Nohemi Mejia Garcia", "img/diseño4/Alisson Nohemi Mejia Garcia.jpg", c4toDiseno);
    stmt.run("Allison Yamileth", "Serrano Parada", "Allison Yamileth Serrano Parada", "img/diseño4/Allison Yamileth Serrano Parada.jpg", c4toDiseno);
    stmt.run("Daniela Sarai", "Villatoro Ramirez", "Daniela Sarai Villatoro Ramirez", "img/diseño4/Daniela Sarai Villatoro Ramirez_.jpg", c4toDiseno);
    stmt.run("Daphne Sofía", "Orantes Arroyo", "Daphne Sofía Orantes Arroyo", "img/diseño4/Daphne Sofía Orantes Arroyo.jpg", c4toDiseno);
    stmt.run("Emily Alessandra", "Aquino Herrera", "Emily Alessandra Aquino Herrera", "img/diseño4/Emily Alessandra Aquino Herrera.jpg", c4toDiseno);
    stmt.run("Eunice Abigail", "Riso Dionicio", "Eunice Abigail Riso Dionicio", "img/diseño4/Eunice Abigail Riso Dionicio.jpg", c4toDiseno);
    stmt.run("Fernando Daniel", "Carillo Ramírez", "Fernando Daniel Carillo Ramírez", "img/diseño4/Fernando Daniel Carillo Ramírez_.jpg", c4toDiseno);
    stmt.run("Flor de María", "Velasquez Gómez", "Flor de María Velasquez Gómez", "img/diseño4/Flor de María Velasquez Gömez.jpg", c4toDiseno);
    stmt.run("Génesis Adriana Estrella", "Pérez Ruiz", "Génesis Adriana Estrella Pérez Ruiz", "img/diseño4/Génesis Adriana Estrella Pérez Ruiz_.jpg", c4toDiseno);
    stmt.run("Ingrid Fabiola", "Vasquez Vasquez", "Ingrid Fabiola Vasquez Vasquez", "img/diseño4/Ingrid Fabiola Vasquez Vasquez_.jpg", c4toDiseno);
    stmt.run("Jennifer Abigail", "Contreras Monterroso", "Jennifer Abigail Contreras Monterroso", "img/diseño4/Jennifer Abigail Contreras Monterroso_.jpg", c4toDiseno);
    stmt.run("Margareth Rubi", "Barrios Gonzalez", "Margareth Rubi Barrios Gonzalez", "img/diseño4/Margareth Rubi Barrios Gonzalez.jpg", c4toDiseno);
    stmt.run("Rodrigo Miguel", "Velasquez Zacarías", "Rodrigo Miguel Velasquez Zacarías", "img/diseño4/Rodrigo Miguel Velasquez Zacarías_.jpg", c4toDiseno);

            const c5toDiseno = "5to Bachillerato en Diseño Gráfico";
    stmt.run("Angel Daniel", "López Noj", "Angel Daniel López Noj", "img/diseño5/Angel Daniel López Noj.jpg", c5toDiseno);
    stmt.run("Angeline Nicole", "Friely Cabrera", "Angeline Nicole Friely Cabrera", "img/diseño5/Angeline Nicole Friely Cabrera_.jpg", c5toDiseno);
    stmt.run("Dulce María", "García Güil", "Dulce María García Güil", "img/diseño5/Dulce María García Güil.jpg", c5toDiseno);
    stmt.run("Elizabeth Nicol", "Trejo De La Cruz", "Elizabeth Nicol Trejo De La Cruz", "img/diseño5/Elizabeth Nicol Trejo De La Cruz.jpg", c5toDiseno);
    stmt.run("Fabián Alejandro", "Orellana Chacon", "Fabián Alejandro Orellana Chacon", "img/diseño5/Fabián Alejandro Orellana Chacon_.jpg", c5toDiseno);
    stmt.run("Febe Rachel", "Barcenes López", "Febe Rachel Barcenes López", "img/diseño5/Febe Rachel Barcenes López_.jpg", c5toDiseno);
    stmt.run("José Emanúel", "Trujillo Cruz", "José Emanúel Trujillo Cruz", "img/diseño5/José Emanúel Trujillo Cruz.jpg", c5toDiseno);
    stmt.run("José Pablo", "García Marroquín", "José Pablo García Marroquín", "img/diseño5/José Pablo García Marroquín_.jpg", c5toDiseno);
    stmt.run("Katerine Mishel", "Rizo Dionicio", "Katerine Mishel Rizo Dionicio", "img/diseño5/Katerine Mishel Rizo Dionicio.jpg", c5toDiseno);
    stmt.run("Maryori Alondra", "Herrera García", "Maryori Alondra Herrera García", "img/diseño5/Maryori Alondra Herrera García_.jpg", c5toDiseno);
    stmt.run("Mélany Adaly", "Bravo Romeo", "Mélany Adaly Bravo Romeo", "img/diseño5/Mélany Adaly Bravo Romeo.jpg", c5toDiseno);
    stmt.run("Neitan Andre", "Peralta González", "Neitan Andre Peralta González", "img/diseño5/Neitan Andre Peralta González_.jpg", c5toDiseno);

            // =========================================================================
            // 5. PERITO CONTADOR EN COMPUTACIÓN
            // =========================================================================
            const c4toContador = "4to Perito Contador";
    stmt.run("Aylin Melisa", "Barrios Cardona", "Aylin Melisa Barrios Cardona", "img/conta4/Aylin Melisa Barrios Cardona.png", c4toContador);
    stmt.run("Claudia Elizabeth", "Sotoj Marroquin", "Claudia Elizabeth Sotoj Marroquin", "img/conta4/Claudia Elizabeth Sotoj Marroquin_.png", c4toContador);
    stmt.run("Darlyng Samanta", "Terrón Garcia", "Darlyng Samanta Terrón Garcia", "img/conta4/Darlyng Samanta Terrón Garcia.png", c4toContador);
    stmt.run("Elisabet Noemi", "González Rodas", "Elisabet Noemi González Rodas", "img/conta4/Elisabet Noemi González Rodas.png", c4toContador);
    stmt.run("Estuardo Vinicio", "Águilar Mateo", "Estuardo Vinicio Águilar Mateo", "img/conta4/Estuardo Vinicio Águilar Mateo.png", c4toContador);
    stmt.run("Kimberly Adriana", "Hernández Dimas", "Kimberly Adriana Hernández Dimas", "img/conta4/Kimberly Adriana Hernández Dimas.png", c4toContador);
    stmt.run("Kimberly Sarai", "Chuc Morales", "Kimberly Sarai Chuc Morales", "img/conta4/Kimberly Sarai Chuc Morales_.png", c4toContador);
    stmt.run("Marta Azucena", "Pirir Alvarez", "Marta Azucena Pirir Alvarez", "img/conta4/Marta Azucena Pirir Alvarez.png", c4toContador);
    stmt.run("Nayeli Fernanda", "Garcia Zuñiga", "Nayeli Fernanda Garcia Zuñiga", "img/conta4/Nayeli Fernanda Garcia Zuñiga.png", c4toContador);
    stmt.run("Obed Joselito", "Morales De la cruz", "Obed Joselito Morales De la cruz", "img/conta4/Obed Joselito Morales De la cruz_.png", c4toContador);
    stmt.run("Rigoberto Elias", "Perez Alvarez", "Rigoberto Elias Perez Alvarez", "img/conta4/Rigoberto Elias Perez Alvarez_.png", c4toContador);
    stmt.run("Vivían Elizabeth", "Gimenez Cuc", "Vivían Elizabeth Gimenez Cuc", "img/conta4/Vivían Elizabeth Gimenez Cuc.png", c4toContador);
    stmt.run("Wendy Paola", "Chitic Xirum", "Wendy Paola Chitic Xirum", "img/conta4/Wendy Paola Chitic Xirum.png", c4toContador);
    stmt.run("Wilber Ernesto", "Garcia you", "Wilber Ernesto Garcia you", "img/conta4/Wilber Ernesto Garcia you.png", c4toContador);

            const c5toContador = "5to Perito Contador";
    stmt.run("Andrea Gloricel", "Lara López", "Andrea Gloricel Lara López", "img/conta5/Andrea gloricel  Lara López.jpg", c5toContador);
    stmt.run("Bárbara Alexandra", "reyes Isep", "Bárbara Alexandra reyes Isep", "img/conta5/Bárbara Alexandra reyes Isep.jpg", c5toContador);
    stmt.run("Cinthia Analis", "Chinchilla García", "Cinthia Analis chinchilla García", "img/conta5/Cinthia Analis chinchilla García.jpg", c5toContador);
    stmt.run("Gladis luzmila", "Molina Rodas", "Gladis luzmila Molina Rodas", "img/conta5/Gladis luzmila Molina Rodas.jpg", c5toContador);
    stmt.run("Hugo Elias", "Cocon Gonzáles", "Hugo Elias Cocon Gonzáles", "img/conta5/Hugo Elias Cocon Gonzáles.jpg", c5toContador);
    stmt.run("Isaías Misael", "Sul Hernandez", "Isaías Misael Sul Hernandez", "img/conta5/Isaías Misael Sul Hernandez.jpg", c5toContador);
    stmt.run("Jaime Rubelsi", "lizandro chó fajardo", "Jaime Rubelsi lizandro chó fajardo", "img/conta5/Jaime Rubelsi lizandro chó fajardo.jpg", c5toContador);
    stmt.run("Jefferson Jancarlo", "Vega Lucas", "Jefferson Jancarlo Vega Lucas", "img/conta5/Jefferson Jancarlo Vega Lucas.jpg", c5toContador);
    stmt.run("Josué Abraham", "Hernandez Robledo", "Josué Abraham Hernandez Robledo", "img/conta5/Josué Abraham Hernandez Robledo.jpg", c5toContador);
    stmt.run("Kenia Fabiola", "Lares Ixtuc", "Kenia Fabiola Lares Ixtuc", "img/conta5/Kenia Fabiola Lares Ixtuc.jpg", c5toContador);
    stmt.run("Kimberly Daniela", "Rodas Pérez", "Kimberly Daniela Rodas Pérez", "img/conta5/Kimberly Daniela Rodas Pérez.jpg", c5toContador);
    stmt.run("Natali Gabriela", "de León Torres", "Natali Gabriela de León Torres", "img/conta5/Natali Gabriela de León Torres.jpg", c5toContador);

            const c6toContador = "6to Perito Contador";
    stmt.run("Abby Desirée Guadalupe", "Castellanos Acajabón", "Abby Desirée Guadalupe Castellanos Acajabón", "img/conta6/Abby Desirée Guadalupe Castellanos Acajabón.png", c6toContador);
    stmt.run("Alba Marina", "Ruiz Mendoza", "Alba Marina Ruiz Mendoza", "img/conta6/Alba Marina Ruiz Mendoza.png", c6toContador);
    stmt.run("Brando Emanuel", "Pérez Valenzuela", "Brando Emanuel Pérez Valenzuela", "img/conta6/Brando Emanuel Pérez Valenzuela.png", c6toContador);
    stmt.run("Carlos Eduardo", "Hernández López", "Carlos Eduardo Hernández López", "img/conta6/Carlos Eduardo Hernández López.jpg", c6toContador);
    stmt.run("Cristian Adolfo", "Carrillo Salazar", "Cristian Adolfo Carrillo Salazar", "img/conta6/Cristian Adolfo Carrillo Salazar.jpg", c6toContador);
    stmt.run("Cristian Josué", "Hernández López", "Cristian Josué Hernández López", "img/conta6/Cristian Josué Hernández López.jpg", c6toContador);
    stmt.run("Dayana Eunice", "Auyón Revolorio", "Dayana Eunice Auyón Revolorio", "img/conta6/Dayana Eunice Auyón Revolorio.jpg", c6toContador);
    stmt.run("Edgar Josué", "Morales Loarca", "Edgar Josué Morales Loarca", "img/conta6/Edgar Josué Morales Loarca.jpg", c6toContador);
    stmt.run("Jonathan Joel", "González Rodas", "Jonathan Joel González Rodas", "img/conta6/Jonathan Joel González Rodas.jpg", c6toContador);
    stmt.run("Josthyn Eliel", "Cabrera López", "Josthyn Eliel Cabrera López", "img/conta6/Josthyn Eliel Cabrera López.jpg", c6toContador);
    stmt.run("Marta Sofía", "Hurtado Montepeque", "Marta Sofía Hurtado Montepeque", "img/conta6/Marta Sofía Hurtado Montepeque.jpg", c6toContador);
    stmt.run("Ruth Nohemy", "Aguilón Aguilón", "Ruth Nohemy Aguilón Aguilón", "img/conta6/Ruth Nohemy Aguilón Aguilón_.jpg", c6toContador);
    stmt.run("Shayna María", "Daly Felipe Jom", "Shayna María Daly Felipe Jom", "img/conta6/Shayna María Daly Felipe Jom.jpeg", c6toContador);
    stmt.run("Susana Guadalupe", "Cabrera Pátzan", "Susana Guadalupe Cabrera Pátzan", "img/conta6/Susana Guadalupe Cabrera Pátzan .jpg", c6toContador);
    stmt.run("Williams Orlando David", "Pérez López", "Williams Orlando David Pérez López", "img/conta6/Williams Orlando David Pérez López.jpg", c6toContador);
    stmt.run("Yeylin Marely", "Vázquez Guzmán", "Yeylin Marely Vázquez Guzmán", "img/conta6/Yeylin Marely Vázquez Guzmán.jpg", c6toContador);

            // =========================================================================
            // 6. SECRETARIADO BILINGÜE
            // =========================================================================
            const c4toSecre = "4to Secretariado Bilingüe";
    stmt.run("Angielyn Melissa", "González García", "Angielyn Melissa González García", "img/secre4/Angielyn Melissa González García.jpg", c4toSecre);
    stmt.run("Jaqueline Amisadai", "Chicoj Sián", "Jaqueline Amisadai Chicoj Sián", "img/secre4/Jaquelinne Amisadaí Chicoj Sián.jpg", c4toSecre);
    stmt.run("Kimberly Brisheth", "Monzón Pérez", "Kimberly Brisheth Monzón Pérez", "img/secre4/Kimberly Brisheth Monzón Pérez.jpg", c4toSecre);
    stmt.run("Leyli Mariela Beatriz", "Suar Larias", "Leyli Mariela Beatriz Suar Larias", "img/secre4/Leyli Mariela Beatriz Suar Larias.jpg", c4toSecre);
    stmt.run("Nataly Pamela Gabriel", "Sánchez", "Nataly Pamela Gabriel Sánchez", "img/secre4/Nataly Pamela Gabriel Sánchez.jpg", c4toSecre);
    stmt.run("Sandra Carolina", "de Leon Ramírez", "Sandra Carolina de Leon Ramírez", "img/secre4/Sandra Carolina de Leon Ramírez.jpg", c4toSecre);
    stmt.run("Sulema Nicol", "Godínez Muñoz", "Sulema Nicol Godínez Muñoz", "img/secre4/Sulema Nicol Godínez Muñoz.jpg", c4toSecre);

            const c5toSecre = "5to Secretariado Bilingüe";
    stmt.run("Blanca Josefa", "García Vasquez", "Blanca Josefa García Vasquez", "img/secre5/Blanca Josefa García Vasquez.jpg", c5toSecre);
    stmt.run("Lesly Adaly", "López Juárez", "Lesly Adaly López Juárez", "img/secre5/Lesly Adaly López Juárez.jpg", c5toSecre);
    stmt.run("Madelyn Yojana", "ajanel Celso", "Madelyn Yojana ajanel Celso", "img/secre5/Madelyn Yojana ajanel Celso.jpg", c5toSecre);
    stmt.run("Wendy Esperanza", "Jorge Pol", "Wendy Esperanza Jorge Pol", "img/secre5/Wendy Esperanza Jorge Pol.jpg", c5toSecre);

            const c6toSecre = "6to Secretariado Bilingüe";
    stmt.run("Brissel Andrea", "Jiménez Batres", "Brissel Andrea Jiménez Batres", "img/secre6/Brissel Andrea Jiménez Batres.png", c6toSecre);
    stmt.run("Cindy Paola", "Cabrera Palma", "Cindy Paola Cabrera Palma", "img/secre6/Cindy Paola Cabrera Palma.png", c6toSecre);
    stmt.run("Gabriela Paola", "Martínez Chiguichon", "Gabriela Paola Martínez Chiguichon", "img/secre6/Gabriela Paola Martínez Chiguichon.png", c6toSecre);
    stmt.run("Ilsi Elisabet", "Méndez Ortiz", "Ilsi Elisabet Méndez Ortiz", "img/secre6/Ilsi Elisabet Méndez Ortiz.png", c6toSecre);
    stmt.run("Karla Matilde", "Yol Quejiú", "Karla Matilde Yol Quejiú", "img/secre6/karlamatilde.png", c6toSecre);
    stmt.run("Lilian Melisa", "Pascual Pedro", "Lilian Melisa Pascual Pedro", "img/secre6/Lilian Melisa Pascual Pedro.png", c6toSecre);
    stmt.run("Nancy Paola", "Zepeda Vásquez", "Nancy Paola Zepeda Vásquez", "img/secre6/Nancy Paola Zepeda Vásquez.png", c6toSecre);

            // =========================================================================
            // 7. CLAUSTRO DOCENTE Y CATEDRÁTICOS
            // =========================================================================
            
    stmt.finalize(err2=>{if(err2)console.error('Error al cargar estudiantes:',err2.message);else console.log('Datos base cargados correctamente.');iniciarServidor();});
  });
}

// Elimina duplicados históricos y garantiza que no vuelvan a aparecer.
limpiarDuplicadosEstudiantes(()=>{
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_estudiante_unico ON estudiantes(lower(trim(nombre_completo)),lower(trim(carrera)),lower(trim(coalesce(fotografia,''))))`,err=>{if(err)console.error('No se pudo crear índice anti-duplicados:',err.message);seedIfEmpty();});
});
