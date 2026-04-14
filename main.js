// DOM Elements
const el = document.querySelector('#alphaTab');
const playPause = document.querySelector('#play-pause-btn');
const loaderContainer = document.getElementById('loader-container');
const loadingText = document.getElementById('loading-text');

// --- 1. CONFIGURACIÓN DE MOTOR (VISUAL Y AUDIO) ---
const atSettings = {
    player: {
        enablePlayer: true,
        enableCursor: true,
        enableWorker: true,
        soundFont: 'https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/fonts/GeneralUser-GS.sf2'
    },
    display: {
        engine: 'canvas',
        layoutMode: 'horizontal',
        autoScroll: 1,
        resources: {
            staffLineColor: '#222',
            barLineColor: '#444',
            fretNumberColor: '#111',
            standardNotationNoteHeadColor: '#111',
            tablatureRestColor: 'transparent'
        },
        elements: {
            scoreTitle: false,
            scoreSubTitle: false,
            scoreWords: false,
            scoreMusic: true  
        }
    },
    notation: {
        staveTypes: [0, 1],
        rhythmMode: 'Hidden',
        extendBendArrowsOnTiedNotes: true
    },
    core: {
        engine: 'canvas',
        useWorkers: true // <--- OBLIGATORIO: Mueve el parseo del archivo GP a un Web Worker
    }
};

// Instancia global del motor
const at = new alphaTab.AlphaTabApi(el, atSettings);

// --- 2. REGISTRO DE EVENTOS (LISTENERS) ---
// Obligatorio: Declarar antes de cualquier función de carga (api.load)

 
 at.scoreLoaded.on((score) => {
    const trackList = document.getElementById('track-list');
    if (!trackList) return;

    trackList.innerHTML = ''; // Limpieza total de renderizados previos

    score.tracks.forEach((track, index) => {
        const trackName = (track.name || `Pista ${index + 1}`).toUpperCase();
        
        // Crear el botón de instrumento
        const btn = document.createElement('button');
        btn.className = "btn-instrument"; // Define estilos en tu CSS
        btn.innerText = trackName;
        btn.style.cssText = "margin-right: 8px; padding: 8px 12px; background: #2D333F; color: #FFFFFF; border: 1px solid #444; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; transition: 0.2s;";

        // Efecto Hover / Active
        btn.onmouseover = () => btn.style.borderColor = "#E63946";
        btn.onmouseout = () => btn.style.borderColor = "#2D333F";

        btn.onclick = () => {
            // 1. CAMBIO DE VISTA: Renderizar solo esta pista
            at.renderTracks([track]); 

            // 2. CAMBIO DE AUDIO: Asignar programa según el nombre (Lógica Senior)
            const name = trackName.toLowerCase();
            if (name.includes("bass") || name.includes("bajo")) track.playbackInfo.program = 34;
            else if (name.includes("guitar") || name.includes("gtr") || name.includes("lead")) track.playbackInfo.program = 29;
            else track.playbackInfo.program = 25;

            if (at.player && at.player.api) {
                at.player.api.rebuildSynthesizer();
            }

            // 3. UI Feedback: Resaltar botón activo
            document.querySelectorAll('.btn-instrument').forEach(b => b.style.background = "#2D333F");
            btn.style.background = "#E63946";
        };

        trackList.appendChild(btn);
    });

    // Por defecto, renderizar la primera pista al cargar
    if(score.tracks.length > 0) {
        at.renderTracks([score.tracks[0]]);
    }
    
    aplicarColoresNegros(score);
});

 
// FUNCIÓN GLOBAL (Asegúrate de tenerla fuera de cualquier bloque)
function cambiarInstrumento(trackIndex, newProgram) {
    if(!at.score) return;
    const track = at.score.tracks[trackIndex];
    track.playbackInfo.program = parseInt(newProgram);
    
    if (at.player && at.player.api) {
        at.player.api.rebuildSynthesizer();
        console.log(`Track ${trackIndex} actualizado a programa ${newProgram}`);
    }
}

at.playerReady.on(() => {
    console.log("Audio listo. Verificando estado del sintetizador...");

    if (at.player && at.player.api) {
        try {
            // 1. Resetear el mixer interno
            if (typeof at.player.api.reset === 'function') at.player.api.reset();
            
            // 2. Forzar la reconstrucción con los nuevos programas (29, 34, etc.)
            at.player.api.rebuildSynthesizer();
            
            // 3. LOG DE VERIFICACIÓN: Ver qué cargó el motor realmente
            at.score.tracks.forEach((t, i) => {
                console.log(`Verificación Final - Track ${i}: Program ${t.playbackInfo.program}`);
            });

        } catch(e) {
            console.error("Error en parches finales:", e);
        }
    }

    if (loaderContainer) loaderContainer.style.display = 'none';
    if (playPause) {
        playPause.style.opacity = "1";
        playPause.innerText = "▶ PLAY";
    }
});

at.playerStateChanged.on(e => {
    if (playPause) {
        playPause.innerText = (e.state === 1) ? "⏸ PAUSE" : "▶ PLAY";
    }
});

// --- 3. LÓGICA DE CRIPTOGRAFÍA Y ESTILIZADO ---
function decryptXOR(input, keyBytes) {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const iv = bytes.slice(0, 8);
    const encrypted = bytes.slice(8);

    let seed = 0;
    for (let i = 0; i < iv.length; i++) seed = (seed * 31 + iv[i]) >>> 0;

    const output = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const k = keyBytes[i % keyBytes.length] ^ (seed & 255);
        output[i] = encrypted[i] ^ k;
    }
    return new TextDecoder().decode(output);
}

function aplicarColoresNegros(score) {
    const black = alphaTab.model.Color.fromJson("#000000");
    const transparent = alphaTab.model.Color.fromJson("#00000000");

    score.tracks.forEach(track => {
        track.staves.forEach(staff => {
            staff.bars.forEach(bar => {
                bar.voices.forEach(voice => {
                    voice.beats.forEach(beat => {
                        if (!beat.style) beat.style = new alphaTab.model.BeatStyle();
                        beat.style.colors.set(alphaTab.model.BeatSubElement.GuitarTabRests, transparent);
                        beat.notes.forEach(note => {
                            if (!note.style) note.style = new alphaTab.model.NoteStyle();
                            note.style.colors.set(alphaTab.model.NoteSubElement.GuitarTabFretNumber, black);
                            note.style.colors.set(alphaTab.model.NoteSubElement.StandardNotationNoteHead, black);
                        });
                    });
                });
            });
        });
    });
}

// --- 4. CONTROLADORES DE CARGA DE DATOS ---
async function buildKey(trackId){
    const response = await fetch(`https://skores-back.onrender.com/api/request-key/${encodeURIComponent(trackId)}`);
    if(!response.ok) throw new Error("Fallo en la obtención de clave en servidor");
    const data = await response.json();
    const binary = atob(data.k);
    const key = new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) key[i] = binary.charCodeAt(i);
    return key;
}

 
async function cargarPartituraProtegida(url, keyBytes, api) {
    try {
        if(api.score) api.load(null); 
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Error en conexión a bucket R2");
        
        // 1. El archivo en R2 es un Base64 (según tu cifrador), lo leemos como texto
        const base64Cifrado = await response.text();

        // 2. Usamos tu lógica de descifrado con IV y Seed (Simétrica a tu cifrador)
        const binary = atob(base64Cifrado);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const iv = bytes.slice(0, 8);
        const encrypted = bytes.slice(8);

        // Reconstrucción de la semilla idéntica al cifrador
        let seed = 0;
        for (let i = 0; i < iv.length; i++) seed = (seed * 31 + iv[i]) >>> 0;

        const decrypted = new Uint8Array(encrypted.length);
        for (let i = 0; i < encrypted.length; i++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const k = keyBytes[i % keyBytes.length] ^ (seed & 255);
            decrypted[i] = encrypted[i] ^ k;
        }

        // 3. VALIDACIÓN (Ahora sí debería dar 50 4B...)
        const isGP = decrypted[0] === 0x50 && decrypted[1] === 0x4B; 
        if (!isGP) throw new Error("Firma inválida tras descifrado complejo.");

        // 4. CARGA
        api.load(decrypted);

    } catch (e) {
        console.error("Error de descifrado:", e.message);
        if (loadingText) loadingText.innerText = "Error: Llave o formato incorrecto.";
    }
}

// --- 5. INTERACCIONES DEL DOM ---
playPause.onclick = async e => {
    e.preventDefault();
    if (at.player?.api?.audioContext?.state === 'suspended') {
        await at.player.api.audioContext.resume();
    }
    at.playPause();
};

document.getElementById('stop-btn').onclick = () => {
    if (at.player) at.stop(); 
};

const lockBtnFooter = document.getElementById('lock-scroll-footer');
let isScrollLocked = false;
lockBtnFooter.onclick = () => {
    isScrollLocked = !isScrollLocked;
    at.settings.display.autoScroll = isScrollLocked ? 0 : 1;
    at.updateSettings();
    lockBtnFooter.innerText = isScrollLocked ? '🔒\uFE0E' : '🔓\uFE0E';
};

window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        playPause.click(); 
    }
});

// --- 6. BOOTSTRAP (PUNTO DE ENTRADA PRINCIPAL) ---
 
(async () => {
    const trackId = new URLSearchParams(window.location.search).get('track');
    if (trackId) {
        try {
            const keyBytes = await buildKey(trackId); 
            const urlR2 = `https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/${encodeURIComponent(trackId)}.gp.bin`;
            
            // Ya no hay await initSoundFont(). Directo a cargar la partitura.
            cargarPartituraProtegida(urlR2, keyBytes, at);
        } catch (error) {
            console.error("Falla de ejecución:", error);
            if (loadingText) loadingText.innerText = "Error en el pipeline de inicialización.";
        }
    }
})();
 
 