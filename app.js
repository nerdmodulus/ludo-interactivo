// ==========================================
// CONFIGURACIÓN DE FIREBASE (REEMPLAZA ESTO)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBr5OcwH9jKdoBVr6Dp_hJto5oNHEbJGtI",
    authDomain: "ludo-preguntas.firebaseapp.com,
    databaseURL: "https://ludo-preguntas-default-rtdb.firebaseio.com/",
    projectId: "ludo-preguntas",
    storageBucket: "ludo-preguntas.firebasestorage.app",
    messagingSenderId: "154849132864",
    appId: "1:154849132864:web:93146bf6ad58833a58faa5"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database().ref("ludoTrivia");

// URL de tu Excel convertido a CSV automáticamente
const EXCEL_CSV_URL = "https://docs.google.com/spreadsheets/d/1kTlCWBDOSXevG3y-8EIZ5OxpRVj0pMSnCiskTRoNi9k/export?format=csv";

// variables locales de control
let bancoPreguntas = [];
let miRol = ""; 
const turnos = ["Rojo", "Verde", "Amarillo", "Azul"];
const dadosDibujo = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// Mapa de posiciones del circuito del tablero (Coordenadas en cuadricula 11x11)
const circuitoTablero = [
    {r:4, c:0}, {r:4, c:1}, {r:4, c:2}, {r:4, c:3}, {r:4, c:4},
    {r:3, c:4}, {r:2, c:4}, {r:1, c:4}, {r:0, c:4}, {r:0, c:5},
    {r:0, c:6}, {r:1, c:6}, {r:2, c:6}, {r:3, c:6}, {r:4, c:6},
    {r:4, c:7}, {r:4, c:8}, {r:4, c:9}, {r:4, c:10}, {r:5, c:10},
    {r:6, c:10}, {r:6, c:9}, {r:6, c:8}, {r:6, c:7}, {r:6, c:6},
    {r:7, c:6}, {r:8, c:6}, {r:9, c:6}, {r:10, c:6}, {r:10, c:5},
    {r:10, c:4}, {r:9, c:4}, {r:8, c:4}, {r:7, c:4}, {r:6, c:4},
    {r:6, c:3}, {r:6, c:2}, {r:6, c:1}, {r:6, c:0}, {r:5, c:0}
];

// 1. Dibujar el diseño visual del tablero en pantalla
function generarTableroHTML() {
    const board = document.getElementById("ludo-board");
    board.innerHTML = "";
    for (let r = 0; r < 11; r++) {
        for (let c = 0; c < 11; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.dataset.row = r;
            cell.dataset.col = c;

            // Pintar esquinas (Bases de salida)
            if (r < 4 && c < 4) cell.classList.add("base-rojo");
            else if (r < 4 && c > 6) cell.classList.add("base-verde");
            else if (r > 6 && c < 4) cell.classList.add("base-azul");
            else if (r > 6 && c > 6) cell.classList.add("base-amarillo");
            else if (r===5 && c===5) { cell.innerHTML = "🏁"; cell.style.background = "#fff"; }
            else { cell.classList.add("track-cell"); }

            board.appendChild(cell);
        }
    }
}

// 2. Descargar y parsear las preguntas desde tu Google Sheet
async function cargarPreguntasDesdeExcel() {
    try {
        const response = await fetch(EXCEL_CSV_URL);
        const data = await response.text();
        const filas = data.split("\n");

        // Omitimos la primera fila (Cabecera: Pregunta, Opción A, etc.)
        for (let i = 1; i < filas.length; i++) {
            if (!filas[i].trim()) continue;
            
            // Separador por comas considerando comillas
            const columnas = filas[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
            
            if (columnas.length >= 6) {
                bancoPreguntas.push({
                    pregunta: columnas[0],
                    A: columnas[1],
                    B: columnas[2],
                    C: columnas[3],
                    D: columnas[4],
                    correcta: columnas[5].toUpperCase().trim()
                });
            }
        }
        console.log(`¡Éxito! ${bancoPreguntas.length} preguntas cargadas.`);
    } catch (error) {
        console.error("Error cargando el Excel:", error);
        alert("No se pudo leer el Excel. Asegúrate de haberlo publicado web como CSV.");
    }
}

// 3. Control de Acceso (Elegir Rol)
document.getElementById("btn-enter").addEventListener("click", () => {
    miRol = document.getElementById("role-select").value;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    document.getElementById("user-role-display").innerText = miRol;
    
    if (miRol === "Espectador") {
        document.getElementById("admin-controls").classList.remove("hidden");
    }
    
    // Si la base de datos está vacía, la inicializa el primero en entrar
    db.once("value", snapshot => {
        if (!snapshot.exists()) ejecutarReinicioBase();
    });
});

// 4. Lanzar el Dado
document.getElementById("btn-roll").addEventListener("click", () => {
    const valorDado = Math.floor(Math.random() * 6) + 1;
    const indicePregunta = Math.floor(Math.random() * bancoPreguntas.length);

    db.update({
        dado: valorDado,
        preguntaActual: indicePregunta,
        estado: "respondiendo"
    });
});

// 5. Enviar Respuesta
function evaluarRespuesta(letraSeleccionada, correcta) {
    db.once("value", snapshot => {
        const data = snapshot.val();
        const jugadorActual = turnos[data.turnoIdx];
        let nuevaPos = data.posiciones[jugadorActual] || 0;

        const feedback = document.getElementById("modal-feedback");
        feedback.classList.remove("hidden");

        if (letraSeleccionada === correcta) {
            feedback.innerText = "¡CORRECTO! Avanzas " + data.dado + " casillas.";
            feedback.className = "correct";
            nuevaPos += data.dado;
            if (nuevaPos >= 40) nuevaPos = 40; // Meta fija simplificada a 40 casillas
        } else {
            feedback.innerText = `INCORRECTO. La respuesta era la ${correcta}. No te mueves.`;
            feedback.className = "incorrect";
        }

        // Bloquear clics inmediatos para dejar ver la respuesta 3 segundos
        setTimeout(() => {
            const siguienteTurno = (data.turnoIdx + 1) % 4;
            const posicionesActualizadas = {...data.posiciones};
            posicionesActualizadas[jugadorActual] = nuevaPos;

            db.update({
                posiciones: posicionesActualizadas,
                estado: "esperando_tiro",
                turnoIdx: siguienteTurno,
                preguntaActual: -1
            });
            feedback.classList.add("hidden");
        }, 3500);
    });
}

// 6. Escuchar cambios de Firebase (Sincronización en Vivo)
db.on("value", snapshot => {
    const data = snapshot.val();
    if (!data) return;

    const jugadorDeTurno = turnos[data.turnoIdx];
    
    // Actualizar Interfaz de Turnos e Indicadores
    const indicador = document.getElementById("turn-indicator");
    indicador.innerText = `Turno de: ${jugadorDeTurno}`;
    indicador.style.backgroundColor = obtenerCodigoColor(jugadorDeTurno);
    indicador.style.color = jugadorDeTurno === "Amarillo" ? "#000" : "#fff";

    // Habilitar/Deshabilitar botón de dado
    document.getElementById("btn-roll").disabled = !(data.estado === "esperando_tiro" && miRol === jugadorDeTurno);
    document.getElementById("dice-view").innerText = dadosDibujo[data.dado - 1] || "⚀";

    // Actualizar marcadores numéricos
    turnos.forEach(col => {
        document.getElementById(`pos-${col}`).innerText = data.posiciones[col];
    });

    // Dibujar Fichas en el tablero
    reubicarFichasTablero(data.posiciones);

    // Control del Modal de Preguntas
    const modal = document.getElementById("question-modal");
    if (data.estado === "respondiendo" && data.preguntaActual >= 0 && bancoPreguntas.length > 0) {
        const qData = bancoPreguntas[data.preguntaActual];
        document.getElementById("question-text").innerText = qData.pregunta;
        document.getElementById("optA").innerText = qData.A;
        document.getElementById("optB").innerText = qData.B;
        document.getElementById("optC").innerText = qData.C;
        document.getElementById("optD").innerText = qData.D;
        document.getElementById("modal-turn-title").innerText = `Pregunta para el Jugador ${jugadorDeTurno}`;

        // Activar opciones solo si es TU turno
        const botonesOpcion = document.querySelectorAll(".opt-btn");
        botonesOpcion.forEach(btn => {
            btn.disabled = (miRol !== jugadorDeTurno);
            btn.onclick = () => evaluarRespuesta(btn.dataset.opt, qData.correcta);
        });

        modal.classList.remove("hidden");
    } else {
        modal.classList.add("hidden");
    }
});

function reubicarFichasTablero(posiciones) {
    // Eliminar fichas anteriores
    document.querySelectorAll(".token").forEach(t => t.remove());

    turnos.forEach(color => {
        const casillaIndex = posiciones[color];
        let celdaDestino;

        if (casillaIndex === 0) {
            // Se queda en su base respectiva de salida si no ha avanzado
            if (color === "Rojo") celdaDestino = document.querySelector(`[data-row='1'][data-col='1']`);
            if (color === "Verde") celdaDestino = document.querySelector(`[data-row='1'][data-col='9']`);
            if (color === "Amarillo") celdaDestino = document.querySelector(`[data-row='9'][data-col='9']`);
            if (color === "Azul") celdaDestino = document.querySelector(`[data-row='9'][data-col='1']`);
        } else if (casillaIndex >= 40) {
            // Llegó a la meta central
            celdaDestino = document.querySelector(`[data-row='5'][data-col='5']`);
        } else {
            // Se mueve por el circuito
            const coord = circuitoTablero[casillaIndex - 1];
            celdaDestino = document.querySelector(`[data-row='${coord.r}'][data-col='${coord.c}']`);
        }

        if (celdaDestino) {
            const tokenHTML = document.createElement("div");
            tokenHTML.className = `token ${color}`;
            celdaDestino.appendChild(tokenHTML);
        }
    });
}

function obtenerCodigoColor(c) {
    if(c==="Rojo") return "#ff4d4d";
    if(c==="Verde") return "#2ecc71";
    if(c==="Amarillo") return "#f1c40f";
    if(c==="Azul") return "#3498db";
    return "#eee";
}

// Botón de reinicio para el Admin/Espectador
document.getElementById("btn-reset").addEventListener("click", ejecutarReinicioBase);

function ejecutarReinicioBase() {
    db.set({
        turnoIdx: 0,
        estado: "esperando_tiro",
        dado: 1,
        preguntaActual: -1,
        posiciones: { Rojo: 0, Verde: 0, Amarillo: 0, Azul: 0 }
    });
}

// Inicialización al cargar la página
generarTableroHTML();
cargarPreguntasDesdeExcel();
