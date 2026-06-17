// DOM Elements
const el = document.querySelector('#alphaTab');
let playPause = document.querySelector('#play-pause-btn');
const loaderContainer = document.getElementById('loader-container');
const loadingText = document.getElementById('loading-text');
const volumenSlider = document.getElementById('volumen-slider');

// --- 1. CONFIGURACIÓN DE MOTOR ---
const atSettings = {
    player: {
        enablePlayer: true,
        enableCursor: true,
        enableWorker: true,
        workerScript: './alphaTab.min.js',  
        soundFont: 'https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/fonts/GeneralUser-GS.sf2'
    },
    display: {
        engine: 'svg',
        layoutMode: 'page',
        autoScroll: 1,
        resources: { staffLineColor: '#222', barLineColor: '#444', fretNumberColor: '#111', standardNotationNoteHeadColor: '#111', tablatureRestColor: 'transparent' },
        elements: { scoreTitle: false, scoreSubTitle: false, scoreWords: false, scoreMusic: true }
    },
    notation: { staveTypes: [0, 1], rhythmMode: 'Hidden', extendBendArrowsOnTiedNotes: true }
};

// --- 2. VARIABLES DE ESTADO ---
let currentTrackIndex = 0;
let isPlaying = false; // estado de reproducción actual (sincronizado con playerStateChanged)
const at = new alphaTab.AlphaTabApi(el, atSettings);

// --- 3. LISTENER DEL SLIDER ---
if (volumenSlider) {
    volumenSlider.addEventListener('input', (e) => {
        const nuevoVolumen = parseInt(e.target.value);
        cambiarVolumen(currentTrackIndex, nuevoVolumen);
    });
}

// --- 4. CARGA DE PARTITURA ---
at.scoreLoaded.on((score) => {
    const trackList = document.getElementById('track-list');
    if (!trackList) return;
    trackList.innerHTML = '';

    score.tracks.forEach((track, index) => {
        // Contenedor para agrupar botón y slider de esta pista
// Contenedor principal con la clase para el Grid
const trackContainer = document.createElement('div');
trackContainer.className = "instrument-row"; 

// Botón de selección de pista
const btn = document.createElement('button');
btn.className = "btn-instrument instrument-label"; // "instrument-label" activa el Grid
btn.innerText = (track.name || `Pista ${index + 1}`).toUpperCase();

// Slider individual
const trackSlider = document.createElement('input');
trackSlider.type = "range";
trackSlider.className = "slider"; // Clase común para todos los sliders
trackSlider.min = "0";
trackSlider.max = "1";
trackSlider.step = "0.01";
trackSlider.value = (track.playbackInfo.volume / 16).toString();
 
trackContainer.appendChild(btn);
trackContainer.appendChild(trackSlider);
trackListContainer.appendChild(trackContainer);
        
        trackSlider.oninput = (e) => {
            const vol = parseFloat(e.target.value);
            // Llamada directa a la API documentada
            at.changeTrackVolume([track], vol);
        };

        btn.onclick = async () => {
            currentTrackIndex = index;
            // Si se estaba reproduciendo, detener para evitar duplicados/velocidades
            const wasPlaying = !!isPlaying;
            try {
                // Intento de parada segura
                if (wasPlaying && at && typeof at.stop === 'function') {
                    at.stop();
                }

                // Reinicio exhaustivo del estado de reproducción para evitar acumulación
                if (at && at.player) {
                    // Forzar playbackSpeed neutral (1)
                    try { if (typeof at.player.playbackSpeed !== 'undefined') at.player.playbackSpeed = 1; } catch(e) { console.warn('No se pudo normalizar playbackSpeed', e); }

                    // Resetear buffers de salida si la API lo expone
                    try { if (at.player.api && at.player.api.output && typeof at.player.api.output.resetSamples === 'function') at.player.api.output.resetSamples(); } catch(e) { console.warn('No se pudo resetear output samples', e); }

                    // Llamada genérica a reset si está disponible
                    try { if (at.player.api && typeof at.player.api.reset === 'function') at.player.api.reset(); } catch(e) { console.warn('No se pudo ejecutar player.api.reset()', e); }
                }
            } catch (e) {
                console.warn('No se pudo detener antes de cambiar pista:', e);
            }

            // Renderizar la nueva pista en un estado limpio
            at.renderTracks([track]);
            
            // Lógica de instrumentos (mantenida)
            const name = btn.innerText.toLowerCase();
            if (name.includes("bass") || name.includes("bajo")) track.playbackInfo.program = 34;
            else if (name.includes("guitar") || name.includes("gtr") || name.includes("lead")) track.playbackInfo.program = 29;
            else track.playbackInfo.program = 25;

            // Nota: Si rebuildSynthesizer falla en tu versión, comenta la siguiente línea
            if (at.player && typeof at.player.rebuildSynthesizer === 'function') {
                at.player.rebuildSynthesizer();
            }

            // Si antes estaba sonando, intentar reanudar reproducción limpia
            try {
                if (wasPlaying) {
                    if (at && typeof at.play === 'function') at.play();
                    else if (at && typeof at.playPause === 'function') at.playPause();
                    else if (at.player && typeof at.player.play === 'function') at.player.play();
                }
            } catch (e) { console.warn('No se pudo reanudar automáticamente:', e); }

            document.querySelectorAll('.btn-instrument').forEach(b => b.style.background = "#2D333F");
            btn.style.background = "#E63946";
        };

        trackContainer.appendChild(btn);
        trackContainer.appendChild(trackSlider);
        trackList.appendChild(trackContainer);
    });

    if(score.tracks.length > 0) {
        at.renderTracks([score.tracks[0]]);
    }
    aplicarColoresNegros(score);
});
// Bind master slider safely: supports new `master-volume-slider` (0-100) and legacy `master-volume` (0-1)
const masterSlider = document.getElementById('master-volume-slider') || document.getElementById('master-volume');
if (masterSlider) {
    masterSlider.addEventListener('input', (e) => {
        const raw = e.target.value;
        // If this is the visible slider in ver.html it provides 0-100 and calls setMasterVolume
        if (masterSlider.id === 'master-volume-slider') {
            if (typeof setMasterVolume === 'function') setMasterVolume(raw);
        } else {
            const vol = parseFloat(raw);
            if (at && typeof at.masterVolume !== 'undefined') at.masterVolume = vol;
        }
    });
}

// A. Control de Volumen Maestro (Global)
function setMasterVolume(porcentaje) {
    // La documentación dice que acepta 0 a 1
    const vol = parseFloat(porcentaje) / 100;
    at.masterVolume = vol; 
    console.log(`Volumen maestro ajustado a: ${vol}`);
}

// B. Control de Volumen por Pista (Track específico)
function setTrackVolume(track, porcentaje) {
    // La documentación requiere un array de pistas y el valor 0 a 1
    const vol = parseFloat(porcentaje) / 100;
    at.changeTrackVolume([track], vol);
    console.log(`Volumen de pista ${track.name} ajustado a: ${vol}`);
}

function cambiarVolumen(trackIndex, valorPorcentaje) {
    if (!at || !at.score) return;
     
    const vol = valorPorcentaje / 100;
     
    const track = at.score.tracks[trackIndex];
    if (track) {
        
        at.changeTrackVolume([track], vol);
        
        console.log(`Pista ${trackIndex} volumen ajustado a ${vol}`);
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
        playPause.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
});

at.playerStateChanged.on(e => {
    // e.state === 1 => playing
    isPlaying = (e.state === 1);
    if (playPause) {
        playPause.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }
});
 
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
         
        let base64Data = await response.text();
 
        let binary = atob(base64Data);
        base64Data = null;  

        let rawBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) rawBytes[i] = binary.charCodeAt(i);
        binary = null;  
        const iv = rawBytes.slice(0, 8);
        let encrypted = rawBytes.slice(8);
        rawBytes = null;  
        let seed = 0;
        for (let i = 0; i < iv.length; i++) seed = (seed * 31 + iv[i]) >>> 0;
 
        let decrypted = new Uint8Array(encrypted.length);
        for (let i = 0; i < encrypted.length; i++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const k = keyBytes[i % keyBytes.length] ^ (seed & 255);
            decrypted[i] = encrypted[i] ^ k;
        }
        
        encrypted = null;  

        //  VALIDACIÓN DUAL (GP6: 42 43 | GP7/8: 50 4B)
        const isPK = decrypted[0] === 0x50 && decrypted[1] === 0x4B; 
        const isBC = decrypted[0] === 0x42 && decrypted[1] === 0x43; 

        if (!(isPK || isBC)) {
            const hex = decrypted[0].toString(16) + decrypted[1].toString(16);
            decrypted = null;
            throw new Error(`Firma inválida: 0x${hex}`);
        }
 
        api.load(decrypted);
        decrypted = null; 

    } catch (e) {
        console.error("Error técnico:", e.message);
        if (typeof loadingText !== 'undefined' && loadingText) {
            loadingText.innerText = "Error: Llave o formato incorrecto.";
        }
    }
}

// --- 5. INTERACCIONES DEL DOM ---
if (typeof document !== 'undefined') {
    // Play / Pause
    playPause = document.getElementById('play-pause-btn');
    if (playPause) {
        playPause.onclick = async e => {
            e.preventDefault();
            try {
                if (at?.player?.api?.audioContext?.state === 'suspended') {
                    await at.player.api.audioContext.resume();
                }
            } catch (err) { console.warn('No se pudo reanudar AudioContext automáticamente:', err); }
            if (typeof at?.playPause === 'function') at.playPause();
        };

        window.addEventListener('keydown', e => {
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                playPause.click();
            }
        });
    }

    // Stop
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) stopBtn.onclick = () => { if (at?.player) at.stop(); };

    // Lock scroll footer
    const lockBtnFooter = document.getElementById('lock-scroll-footer');
    let isScrollLocked = false;
    if (lockBtnFooter) {
        lockBtnFooter.onclick = () => {
            isScrollLocked = !isScrollLocked;
            if (at && at.settings) at.settings.display.autoScroll = isScrollLocked ? 0 : 1;
            if (at && typeof at.updateSettings === 'function') at.updateSettings();
            lockBtnFooter.innerText = isScrollLocked ? '🔒\uFE0E' : '🔓\uFE0E';
        };
    }
}

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
 
// Inicializar cuando el DOM esté listo (solo si existe el contenedor `#alphaTab`)
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('#alphaTab')) {
        // Llamada segura a `init` (si no existe, definimos un handler mínimo abajo)
        try { init(); } catch (e) { console.error('Error al iniciar AlphaTab:', e); }
    }
});

// Función de inicialización mínima: vincula handlers que pudieron no encontrarse
// durante la carga si el DOM aún no estaba listo. Es deliberadamente conservadora.
function init() {
    try {
        // Vincular botón Play/Pause si no se vinculó antes
        if (!playPause) playPause = document.getElementById('play-pause-btn');
        if (playPause && !playPause.dataset?.bound) {
            playPause.onclick = async e => {
                e.preventDefault();
                try {
                    if (at?.player?.api?.audioContext?.state === 'suspended') {
                        await at.player.api.audioContext.resume();
                    }
                } catch (err) { console.warn('No se pudo reanudar AudioContext automáticamente:', err); }
                if (typeof at?.playPause === 'function') at.playPause();
            };
            playPause.dataset.bound = '1';
            window.addEventListener('keydown', e => {
                if (e.code === 'Space' || e.key === ' ') {
                    e.preventDefault();
                    playPause.click();
                }
            });
        }

        // Ocultar loader si ya está listo
        if (loaderContainer) loaderContainer.style.display = 'none';
    } catch (err) {
        console.error('init() fallo:', err);
    }
}
 
