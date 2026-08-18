let cacheEstudiantes = [];
let filtroActual = 'TODOS';
let busquedaTimer;

const normalizarClave = (texto = '') =>
  texto.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

const escapeHTML = (texto = '') =>
  String(texto).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));

const FRASES_SECCIONES = {
  "1ro Básico Secc. A": "Cada día es una nueva oportunidad para mejorar y crecer.",
  "1ro Básico Secc. B": "Los sueños se cumplen cuando nunca dejas de creer en ti.",
  "2do Básico Secc. A": "No hay pregunta tonta, sino el tonto que no pregunta.",
  "2do Básico Secc. B": "Nunca dejes para mañana lo que puedes hacer hoy.",
  "3ro Básico Secc. A": "El éxito llega cuando decides actuar.",
  "3ro Básico Secc. B": "No importa lo lento que vayas, siempre y cuando no te detengas.",
  "4to Bachillerato en Computación Secc. A": "Cada hora dedicada al estudio hoy es una herramienta para construir el mañana.",
  "4to Bachillerato en Computación Secc. B": "El algoritmo más bonito de este año fue encontrarnos y formar este gran grupo.",
  "5to Bachillerato en Computación Secc. A": "El futuro pertenece a quienes creen en la belleza de sus sueños.",
  "5to Bachillerato en Computación Secc. B": "No se trata de ser perfectos, sino de dejar una huella que nadie pueda borrar.",
  "4to Perito en Administración de Empresas": "Cada uno es diferente, pero juntos somos únicos.",
  "5to Perito en Administración de Empresas": "Aprendimos que cada reto nos prepara para alcanzar metas más grandes.",
  "6to Perito en Administración de Empresas": "Durante este camino aprendimos a planificar con estrategia, liderar con valores y superar cada reto como equipo.",
  "4to Bachillerato en Diseño Gráfico": "Convertimos nuestras ideas en creatividad y cada diseño en un recuerdo que permanecerá.",
  "5to Bachillerato en Diseño Gráfico": "En los momentos más difíciles, hay que ver para arriba, encomendarse a Dios y pedirle ayuda.",
  "4to Perito Contador": "Dónde 2+2 a veces es 3.99 y hay que ajustar.",
  "5to Perito Contador": "El conocimiento abre puertas, pero la determinación las derriba todas.",
  "6to Perito Contador": "El peor grupo, las risas no faltaron, pero los puntos sí.",
  "4to Secretariado Bilingüe": "Siempre con una sonrisa y lista para lo que venga.",
  "5to Secretariado Bilingüe": "Nunca valoras lo que tienes, hasta que lo pierdes.",
  "6to Secretariado Bilingüe": "Un año lleno de nostalgia, esfuerzo y momentos que siempre recordaré."
};

const HISTORIA_TIMELINE = [
  { year:"2024", title:"El inicio de nuestro camino", text:"Iniciamos como 4to Perito en Administración de Empresas, dando nuestros primeros pasos en una carrera llena de aprendizajes, retos y nuevas amistades." },
  { year:"2025", title:"Creciendo como promoción", text:"Continuamos como 5to Perito en Administración de Empresas, superando nuevos desafíos y acercándonos cada vez más a nuestra meta." },
  { year:"2026", title:"Nuestro último año", text:"Llegamos a 6to Perito en Administración de Empresas, culminando tres años de esfuerzo, aprendizaje, experiencias y momentos inolvidables." },
  { year:"2026", title:"Nuestra graduación", text:"Culminamos nuestra carrera preparados para enfrentar nuevos desafíos y construir nuestro propio futuro." }
];

const GALERIA_FOTOS = [
  { src:"img/WhatsApp Image 2026-08-16 at 8.23.01 PM.jpeg", title:"Nuestra promoción", text:"16/02/2026 · Fotografía grupal de todo el grado." },
  { src:"img/WhatsApp Image 2026-08-16 at 8.24.38 PM.jpeg", title:"Bailando juntos", text:"16/02/2026 · Participación en el baile del colegio." },
  { src:"img/WhatsApp Image 2026-08-16 at 8.32.08 PM.jpeg", title:"Semana Artística", text:"03/06/2026 · Participación en el concurso de canto." },
  { src:"img/WhatsApp Image 2026-08-16 at 8.20.51 PM.jpeg", title:"Nuestro acto cívico", text:"21/07/2026 · Fotografía grupal al finalizar nuestro acto cívico." },
  { src:"img/WhatsApp Image 2026-08-16 at 8.22.28 PM.jpeg", title:"Rock en el escenario", text:"21/07/2026 · Baile de rock durante nuestro acto cívico." },
  { src:"img/WhatsApp Image 2026-08-16 at 8.25.40 PM.jpeg", title:"Una salida con amigos", text:"30/07/2026 · Salida con nuestros amigos de 6to Contador." },
  { src:"img/WhatsApp Image 2026-08-16 at 8.24.59 PM.jpeg", title:"Preparándonos para el futuro", text:"2026 · Fotografía grupal con nuestro traje de prácticas." }
];

const ACTIVIDADES = [
  { icon:"bi-grid-3x3-gap-fill", title:"Torneo de Ajedrez IPC", date:"2026", text:"Participación en el torneo de ajedrez organizado por el Instituto Profesional de Computación." },
  { icon:"bi-flag-fill", title:"Actos Cívicos", date:"2026", text:"Participación en los actos cívicos realizados por los diferentes grados." },
  { icon:"bi-speedometer2", title:"Jornada Deportiva de Carrera", date:"2026", text:"Participación en una jornada deportiva de carrera." },
  { icon:"bi-trophy-fill", title:"Torneo de Quemados IPC", date:"2026", text:"Participación en el torneo de quemados del IPC." },
  { icon:"bi-dribbble", title:"Torneo de Basketball", date:"2026", text:"Participación en el torneo de basketball organizado por el colegio." },
  { icon:"bi-music-note-beamed", title:"Semana Artística IPC", date:"03/06/2026", text:"Participación en actividades de baile, canto, doblaje, declamación y arte." },
  { icon:"bi-cpu-fill", title:"Google I/O Extended Guatemala 2026", date:"2026", text:"Participación en Google I/O Extended Guatemala 2026." },
  { icon:"bi-mortarboard-fill", title:"Visita Académica a la USAC", date:"2026", text:"Visita a la Universidad de San Carlos de Guatemala para conocer sus instalaciones y oferta académica." }
];

const LOGROS = [
  { icon:"bi-mortarboard-fill", title:"Culminación de la Carrera", text:"Culminamos nuestra formación como Peritos en Administración de Empresas." },
  { icon:"bi-people-fill", title:"Trabajo en Equipo", text:"Fortalecimos nuestra capacidad de trabajar juntos mediante actividades académicas, deportivas y artísticas." },
  { icon:"bi-trophy-fill", title:"Participación Deportiva", text:"Representamos a nuestra promoción en diferentes actividades y torneos deportivos." },
  { icon:"bi-palette-fill", title:"Talento y Creatividad", text:"Participamos en actividades artísticas que nos permitieron expresar nuestro talento." },
  { icon:"bi-cpu-fill", title:"Experiencias Tecnológicas", text:"Ampliamos nuestros conocimientos mediante actividades relacionadas con tecnología e innovación." },
  { icon:"bi-building-fill", title:"Proyección Profesional", text:"Conocimos instituciones universitarias y espacios profesionales que nos ayudaron a visualizar nuevas oportunidades." }
];

const RECUERDOS_INFO = [
  { icon:"bi-heart-fill", title:"Momentos que nunca olvidaremos", text:"Cada actividad, convivencia y experiencia que compartimos como promoción." },
  { icon:"bi-chat-heart-fill", title:"Frases de nuestra promoción", text:"Palabras que representan nuestros recuerdos, esfuerzo y amistad." },
  { icon:"bi-camera-fill", title:"Detrás de cámaras", text:"Momentos espontáneos que forman parte de nuestra historia." }
];

const CREDITOS = [
  { icon:"bi-kanban-fill", title:"Gestión del proyecto y recopilación de información", text:"Jefferson Cosajay · Anthony Hidalgo · Cristel López" },
  { icon:"bi-palette-fill", title:"Diseño gráfico y experiencia de usuario (UX/UI)", text:"Limny Orellana · Estefani Figueroa · Carol Rosales" },
  { icon:"bi-code-slash", title:"Desarrollo Front-End", text:"Anderson Chachalac · Anthony Hidalgo · Luisa Tiño" },
  { icon:"bi-server", title:"Desarrollo Back-End", text:"Jefferson Cosajay · Maynor Jorge · Blanca Vásquez" },
  { icon:"bi-check2-circle", title:"Contenido, pruebas y control de calidad", text:"Anderson Chachalac · Cristel López" },
  { icon:"bi-cloud-upload-fill", title:"Publicación y documentación", text:"Maynor Jorge · Cristian Carballo · Luisa Tiño" },
  { icon:"bi-mortarboard-fill", title:"Promoción", text:"6to Perito en Administración de Empresas · Promoción 2026" },
  { icon:"bi-building-fill", title:"Institución", text:"Instituto Profesional de Computación (IPC)" }
];

const DOCENTES = [
  { nombre:"MILVIA ARENAS", cargo:"Docente · Maestro guía de 6to Administración", destacado:true },
  { nombre:"ELMER ACEITUNO", cargo:"Director Jornada Matutina y Vespertina", destacado:true },
  { nombre:"JOSE ZET", cargo:"Director Jornada Sabatina" },
  { nombre:"VALESCA HERNÁNDEZ", cargo:"PEM Historia del Arte" },
  { nombre:"ANGEL PÉREZ", cargo:"PEM Informática" },
  { nombre:"MAGNOLIA TOBAR", cargo:"PEM Inglés" },
  { nombre:"MAYNOR DONADO", cargo:"Docente" },
  { nombre:"NOÉ MELECIO REYES HERNÁNDEZ", cargo:"PEM Informática" },
  { nombre:"MARIA PATRICIA AGUIN", cargo:"PEM Ciencias Sociales y Formación Ciudadana" },
  { nombre:"RONALDO BERTILLO", cargo:"Docente" },
  { nombre:"LOURDES CUC", cargo:"Docente" },
  { nombre:"DIANA ROSALES", cargo:"Docente · Educación Física" },
  { nombre:"CARLOS CHEGUEN", cargo:"Docente" }
];

function cargarDocentes(){
  const contenedor=document.getElementById('contenedorDocentes');
  if(!contenedor)return;

  const destacados=DOCENTES.filter(d=>d.destacado);
  const docentes=DOCENTES.filter(d=>!d.destacado);

  const crearDocente=(d,index,esDestacado=false)=>{
    const iniciales=d.nombre.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase();

    return `
      <div class="col-md-6 ${esDestacado?'col-xl-6':'col-xl-4'}">
        <article class="teacher-card ${esDestacado?'teacher-featured':''}">
          <div class="teacher-card-header">
            <span class="teacher-number">${String(index+1).padStart(2,'0')}</span>
            ${esDestacado?'<span class="teacher-badge"><i class="bi bi-star-fill"></i> DOCENTE DESTACADO</span>':''}
          </div>

          <div class="teacher-profile">
            <div class="teacher-avatar">${escapeHTML(iniciales)}</div>
            <div class="teacher-main-info">
              <span class="teacher-label"><i class="bi bi-mortarboard-fill"></i> PERSONAL DOCENTE</span>
              <h3>${escapeHTML(d.nombre)}</h3>
              <p>${escapeHTML(d.cargo)}</p>
            </div>
          </div>

          <div class="teacher-card-footer">
            <span><i class="bi bi-building"></i> Instituto Profesional de Computación</span>
            <span><i class="bi bi-calendar3"></i> 2026</span>
          </div>
        </article>
      </div>
    `;
  };

  let html=`
    <div class="col-12">
      <div class="teachers-intro">
        <div class="teachers-intro-icon"><i class="bi bi-people-fill"></i></div>
        <div>
          <span class="teachers-intro-label">EQUIPO ACADÉMICO</span>
          <h3>Personas que dejaron huella</h3>
          <p>Docentes y autoridades que acompañaron nuestra formación durante la promoción 2026.</p>
        </div>
        <div class="teachers-total">
          <strong>${DOCENTES.length}</strong>
          <span>Docentes</span>
        </div>
      </div>
    </div>
  `;

  if(destacados.length){
    html+=`
      <div class="col-12">
        <div class="teachers-section-title">
          <span><i class="bi bi-award-fill"></i> DOCENTES DESTACADOS</span>
          <small>Personas que acompañaron especialmente nuestra promoción</small>
        </div>
      </div>
      ${destacados.map((d,i)=>crearDocente(d,i,true)).join('')}
    `;
  }

  html+=`
    <div class="col-12 mt-3">
      <div class="teachers-section-title">
        <span><i class="bi bi-person-lines-fill"></i> EQUIPO DOCENTE</span>
        <small>Nuestros profesores y formadores</small>
      </div>
    </div>
    ${docentes.map((d,i)=>crearDocente(d,i+destacados.length)).join('')}
  `;

  contenedor.innerHTML=html;
}

function cambiarVista(vista) {
  document.querySelectorAll('.vista-seccion').forEach(v => v.classList.remove('activa'));

  const destino = document.getElementById(`vista-${vista}`);
  if (destino) destino.classList.add('activa');

  document.querySelectorAll('[data-navegar]').forEach(n => {
    n.classList.toggle('active', n.dataset.navegar === vista);
  });

  window.scrollTo({ top:0, behavior:'smooth' });
}

function renderStaticSections() {
  const timeline = document.getElementById('timelineHistoria');
  const galeria = document.getElementById('contenedorGaleria');
  const actividades = document.getElementById('contenedorActividades');
  const logros = document.getElementById('contenedorLogros');
  const recuerdos = document.getElementById('contenedorRecuerdosInfo');
  const creditos = document.getElementById('contenedorCreditos');

  if (timeline) {
    timeline.innerHTML = HISTORIA_TIMELINE.map(x => `
      <article class="timeline-item">
        <div class="timeline-year">${escapeHTML(x.year)}</div>
        <div class="timeline-content">
          <h4>${escapeHTML(x.title)}</h4>
          <p>${escapeHTML(x.text)}</p>
        </div>
      </article>
    `).join('');
  }

  if (galeria) {
    galeria.innerHTML = GALERIA_FOTOS.map(x => `
      <article class="gallery-card">
        <img src="${escapeHTML(x.src)}" alt="${escapeHTML(x.title)}" loading="lazy" onerror="this.style.display='none'">
        <div class="gallery-caption">
          <strong>${escapeHTML(x.title)}</strong>
          <span>${escapeHTML(x.text)}</span>
        </div>
      </article>
    `).join('');
  }

  if (actividades) {
    actividades.innerHTML = ACTIVIDADES.map(x => `
      <div class="col-md-6 col-lg-4">
        <article class="content-card">
          <div class="content-icon"><i class="bi ${escapeHTML(x.icon)}"></i></div>
          <h3>${escapeHTML(x.title)}</h3>
          <small>${escapeHTML(x.date)}</small>
          <p>${escapeHTML(x.text)}</p>
        </article>
      </div>
    `).join('');
  }

  if (logros) {
    logros.innerHTML = LOGROS.map(x => `
      <div class="col-md-6 col-lg-4">
        <article class="content-card">
          <div class="content-icon"><i class="bi ${escapeHTML(x.icon)}"></i></div>
          <h3>${escapeHTML(x.title)}</h3>
          <p>${escapeHTML(x.text)}</p>
        </article>
      </div>
    `).join('');
  }

  if (recuerdos) {
    recuerdos.innerHTML = RECUERDOS_INFO.map(x => `
      <div class="col-md-6 col-lg-4">
        <article class="content-card">
          <div class="content-icon"><i class="bi ${escapeHTML(x.icon)}"></i></div>
          <h3>${escapeHTML(x.title)}</h3>
          <p>${escapeHTML(x.text)}</p>
        </article>
      </div>
    `).join('');
  }

  if (creditos) {
    creditos.innerHTML = CREDITOS.map(x => `
      <article class="credit-card">
        <i class="bi ${escapeHTML(x.icon)}"></i>
        <h3>${escapeHTML(x.title)}</h3>
        <p>${escapeHTML(x.text)}</p>
      </article>
    `).join('');
  }
}

function deduplicarEstudiantes(lista) {
  const mapa = new Map();

  lista.forEach(e => {
    const key = `${normalizarClave(e.nombre_completo || '')}|${normalizarClave(e.carrera || '')}|${e.fotografia || ''}`;
    if (!mapa.has(key)) mapa.set(key, e);
  });

  return [...mapa.values()];
}

async function cargarEstudiantes() {
  try {
    const respuesta = await fetch('/api/estudiantes');
    if (!respuesta.ok) throw new Error('No se pudo cargar la lista de estudiantes.');

    cacheEstudiantes = deduplicarEstudiantes(await respuesta.json());

    renderEstudiantes(
      cacheEstudiantes,
      'TODOS',
      'Todos los estudiantes'
    );
  } catch(error) {
    console.error(error);

    const contenedor = document.getElementById('contenedorEstudiantes');

    if (contenedor) {
      contenedor.innerHTML = `
        <div class="col-12">
          <div class="alert alert-danger">
            No se pudo cargar la lista de estudiantes.
            Verifica que el servidor esté funcionando.
          </div>
        </div>
      `;
    }
  }
}

function obtenerEstudiantesPorFiltro(filtro) {
  const clave = normalizarClave(filtro);

  if (clave === 'todos') return cacheEstudiantes;

  if (clave === 'basico' || clave === 'ciclo basico') {
    return cacheEstudiantes.filter(e =>
      normalizarClave(e.carrera).includes('basico')
    );
  }

  if (clave === 'computacion') {
    return cacheEstudiantes.filter(e =>
      normalizarClave(e.carrera).includes('bachillerato en computacion')
    );
  }

  if (clave === 'administracion' || clave === 'administracion de empresas') {
    return cacheEstudiantes.filter(e =>
      normalizarClave(e.carrera).includes('administracion de empresas')
    );
  }

  if (clave === 'diseno grafico') {
    return cacheEstudiantes.filter(e =>
      normalizarClave(e.carrera).includes('diseno grafico')
    );
  }

  if (clave === 'contador' || clave === 'perito contador') {
    return cacheEstudiantes.filter(e =>
      normalizarClave(e.carrera).includes('perito contador')
    );
  }

  if (clave === 'secretariado' || clave === 'secretariado bilingue') {
    return cacheEstudiantes.filter(e =>
      normalizarClave(e.carrera).includes('secretariado')
    );
  }

  return [];
}

function obtenerNombreFiltro(filtro) {
  const nombres = {
    TODOS:'Todos los estudiantes',
    Básico:'Ciclo Básico',
    Computación:'Computación',
    'Administración de Empresas':'Administración',
    'Diseño Gráfico':'Diseño Gráfico',
    'Perito Contador':'Contador',
    Secretariado:'Secretariado',
    Docente:'Docentes'
  };

  return nombres[filtro] || 'Todos los estudiantes';
}

function renderEstudiantes(estudiantes,carrera='TODOS',titulo='Todos los estudiantes') {
  const contenedor = document.getElementById('contenedorEstudiantes');
  if (!contenedor) return;

  const lista = deduplicarEstudiantes(estudiantes);
  const tituloElemento = document.getElementById('tituloSeccion');
  const contador = document.getElementById('contadorEstudiantes');
  const botonVolver = document.getElementById('btnVolverInicio');

  if (tituloElemento) tituloElemento.textContent = titulo;

  if (contador) {
    contador.textContent = `${lista.length} estudiante${lista.length === 1 ? '' : 's'}`;
  }

  if (botonVolver) {
    botonVolver.classList.toggle('d-none',carrera === 'TODOS');
  }

  const fraseBox = document.getElementById('fraseSeccion');

  if (fraseBox) {
    if (carrera !== 'TODOS' && FRASES_SECCIONES[carrera]) {
      fraseBox.classList.remove('d-none');
      fraseBox.innerHTML = `
        <div class="quote-label">Frase general de la sección</div>
        <blockquote>“${escapeHTML(FRASES_SECCIONES[carrera])}”</blockquote>
      `;
    } else {
      fraseBox.classList.add('d-none');
      fraseBox.innerHTML = '';
    }
  }

  if (!lista.length) {
    contenedor.innerHTML = `
      <div class="col-12">
        <div class="student-empty">
          No encontramos estudiantes en esta categoría.
        </div>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = lista.map(e => `
    <div class="col-sm-6 col-md-4 col-lg-3">
      <article class="student-card">
        <img
          class="student-photo"
          src="${escapeHTML(e.fotografia || 'img/principal.png')}"
          alt="${escapeHTML(e.nombre_completo || '')}"
          onerror="this.onerror=null;this.src='img/principal.png';"
        >

        <div class="student-info">
          <span class="student-grade">${escapeHTML(e.carrera || '')}</span>
          <h5>${escapeHTML(e.nombre_completo || '')}</h5>
        </div>
      </article>
    </div>
  `).join('');
}

function buscarEstudiantes() {
  const input = document.getElementById('inputBuscador');
  if (!input) return;

  clearTimeout(busquedaTimer);

  busquedaTimer = setTimeout(() => {
    const termino = normalizarClave(input.value);

    if (!termino) {
      renderEstudiantes(
        obtenerEstudiantesPorFiltro(filtroActual),
        filtroActual,
        obtenerNombreFiltro(filtroActual)
      );
      return;
    }

    const resultados = cacheEstudiantes.filter(e =>
      normalizarClave(
        `${e.nombre || ''} ${e.apellido || ''} ${e.nombre_completo || ''} ${e.carrera || ''}`
      ).includes(termino)
    );

    renderEstudiantes(
      resultados,
      'BUSQUEDA',
      'Resultados de búsqueda'
    );
  },100);
}

function configurarFiltros() {
  document.querySelectorAll('[data-carrera]').forEach(btn => {
    btn.addEventListener('click',() => {
      const filtro = btn.dataset.carrera;
      filtroActual = filtro;

      document.querySelectorAll('[data-carrera]').forEach(b =>
        b.classList.remove('active')
      );

      btn.classList.add('active');

      if (normalizarClave(filtro) === 'docente') {
        cambiarVista('docentes');
        return;
      }

      cambiarVista('estudiantes');

      renderEstudiantes(
        obtenerEstudiantesPorFiltro(filtro),
        filtro,
        obtenerNombreFiltro(filtro)
      );

      const badge = document.getElementById('badgeFiltroActivo');

      if (badge) {
        badge.textContent =
          filtro === 'TODOS'
            ? 'VISTA GENERAL'
            : btn.textContent.trim().toUpperCase();
      }
    });
  });
}

async function cargarRecuerdos() {
  try {
    const respuesta = await fetch('/api/recuerdos');

    if (!respuesta.ok) {
      throw new Error('No se pudieron cargar los mensajes.');
    }

    const lista = await respuesta.json();

    const contador = document.getElementById('contadorMensajes');
    const contenedor = document.getElementById('contenedorRecuerdos');

    if (contador) contador.textContent = lista.length;
    if (!contenedor) return;

    if (!lista.length) {
      contenedor.innerHTML = `
        <div class="col-12">
          <div class="student-empty">
            Aún no hay mensajes. ¡Sé el primero en dejar uno!
          </div>
        </div>
      `;
      return;
    }

    contenedor.innerHTML = lista.map(rec => `
      <div class="col-md-6">
        <article class="message-card">
          <div class="message-author">${escapeHTML(rec.nombre || '')}</div>
          <div class="message-meta">${escapeHTML(rec.seccion || 'Promoción 2026')}</div>
          <p class="message-text">${escapeHTML(rec.mensaje || '')}</p>
        </article>
      </div>
    `).join('');

  } catch(error) {
    console.error('Error cargando mensajes:',error);
  }
}

function mostrarAlertaMensaje(texto,tipo='danger') {
  const alerta = document.getElementById('alertaMensaje');
  if (!alerta) return;

  alerta.className = `alert alert-${tipo}`;
  alerta.textContent = texto;

  alerta.scrollIntoView({
    behavior:'smooth',
    block:'center'
  });
}

function configurarFormularioRecuerdos() {
  const formulario = document.getElementById('formRecuerdo');
  if (!formulario) return;

  const nombre = document.getElementById('nombreRecuerdo');
  const email = document.getElementById('emailRecuerdo');
  const seccion = document.getElementById('seccionRecuerdo');
  const mensaje = document.getElementById('mensajeRecuerdo');
  const website = document.getElementById('websiteRecuerdo');
  const acepto = document.getElementById('aceptoMensaje');
  const contador = document.getElementById('contadorMensaje');
  const boton = formulario.querySelector('button[type="submit"]');

  if (mensaje && contador) {
    mensaje.addEventListener('input',() => {
      contador.textContent = mensaje.value.length;
    });
  }

  formulario.addEventListener('submit',async e => {
    e.preventDefault();

    if (!nombre.value.trim()) {
      mostrarAlertaMensaje('Escribe tu nombre completo.');
      nombre.focus();
      return;
    }

    if (!email.value.trim()) {
      mostrarAlertaMensaje('Escribe tu correo electrónico.');
      email.focus();
      return;
    }

    if (!email.checkValidity()) {
      mostrarAlertaMensaje('Escribe un correo electrónico válido.');
      email.focus();
      return;
    }

    if (!mensaje.value.trim()) {
      mostrarAlertaMensaje('Escribe tu mensaje.');
      mensaje.focus();
      return;
    }

    if (!acepto.checked) {
      mostrarAlertaMensaje('Debes aceptar que tu mensaje sea publicado en el anuario.');
      return;
    }

    if (boton) {
      boton.disabled = true;
      boton.innerHTML =
        '<i class="bi bi-hourglass-split me-2"></i>Publicando...';
    }

    try {
      const respuesta = await fetch('/api/recuerdos',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          nombre:nombre.value.trim(),
          email:email.value.trim(),
          seccion:seccion ? seccion.value.trim() : '',
          mensaje:mensaje.value.trim(),
          website:website ? website.value.trim() : ''
        })
      });

      let datos = {};

      try {
        datos = await respuesta.json();
      } catch {}

      if (!respuesta.ok) {
        throw new Error(
          datos.error || 'No fue posible publicar el mensaje.'
        );
      }

      mostrarAlertaMensaje(
        '¡Tu mensaje fue publicado correctamente! 🎉',
        'success'
      );

      formulario.reset();

      if (contador) contador.textContent = '0';

      await cargarRecuerdos();

    } catch(error) {

      console.error(
        'Error publicando mensaje:',
        error
      );

      mostrarAlertaMensaje(
        error.message ||
        'Ocurrió un error al publicar el mensaje.'
      );

    } finally {

      if (boton) {
        boton.disabled = false;
        boton.innerHTML =
          '<i class="bi bi-send-fill me-2"></i>Publicar mensaje';
      }

    }
  });
}

function configurarBotonesGrados() {
  document.querySelectorAll('[data-carrera-sub]').forEach(btn => {

    btn.addEventListener('click',() => {

      const grado = btn.dataset.carreraSub;
      const modal = document.getElementById('modalGrados');

      if (
        modal &&
        typeof bootstrap !== 'undefined'
      ) {
        bootstrap.Modal
          .getOrCreateInstance(modal)
          .hide();
      }

      if (normalizarClave(grado) === 'docente') {
        cambiarVista('docentes');
        return;
      }

      cambiarVista('estudiantes');

      const estudiantes = cacheEstudiantes.filter(e =>
        normalizarClave(e.carrera || '') ===
        normalizarClave(grado)
      );

      renderEstudiantes(
        estudiantes,
        grado,
        grado
      );
    });
  });
}

document.addEventListener('DOMContentLoaded',async () => {

  renderStaticSections();

  document.querySelectorAll('[data-navegar]').forEach(el => {
    el.addEventListener('click',e => {
      e.preventDefault();
      cambiarVista(el.dataset.navegar);
    });
  });

  document
    .getElementById('inputBuscador')
    ?.addEventListener('input',buscarEstudiantes);

  document
    .getElementById('btnLimpiarBusqueda')
    ?.addEventListener('click',() => {

      const input =
        document.getElementById('inputBuscador');

      if (input) input.value = '';

      filtroActual = 'TODOS';

      renderEstudiantes(
        cacheEstudiantes,
        'TODOS',
        'Todos los estudiantes'
      );
    });

  document
    .getElementById('btnVolverInicio')
    ?.addEventListener('click',() => {

      const input =
        document.getElementById('inputBuscador');

      if (input) input.value = '';

      filtroActual = 'TODOS';

      document
        .querySelectorAll('[data-carrera]')
        .forEach(btn => {
          btn.classList.toggle(
            'active',
            btn.dataset.carrera === 'TODOS'
          );
        });

      renderEstudiantes(
        cacheEstudiantes,
        'TODOS',
        'Todos los estudiantes'
      );
    });

  configurarFiltros();
  configurarBotonesGrados();
  configurarFormularioRecuerdos();

  await cargarEstudiantes();

  cargarDocentes();

  await cargarRecuerdos();

  console.log('Anuario IPC 2026 cargado correctamente.');
  console.log(`Docentes cargados: ${DOCENTES.length}`);
});



