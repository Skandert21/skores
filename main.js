const el = document.querySelector('#alphaTab');
const playPause = document.querySelector('#play-pause-btn');
const loaderContainer = document.getElementById('loader-container'); 
const loadingText = document.getElementById('loading-text');

// --- 1. LÓGICA DE DESCIFRADO ---
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

async function cargarPartituraProtegida(url, key, api) {
    try {
        if(api.score) api.load(null); 
        console.log("Iniciando descarga protegida...");
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("No se pudo obtener el archivo de R2");
        
        const textoCifrado = await response.text();
        const xmlLimpio = decryptXOR(textoCifrado.trim(), key); 
        const xmlTrimmed = xmlLimpio.trim();

        if (!xmlTrimmed.startsWith('<?xml') && !xmlTrimmed.startsWith('<score')) {
            throw new Error("El contenido descifrado no parece un XML válido.");
        }

        const encoder = new TextEncoder();
        api.load(encoder.encode(xmlTrimmed));

    } catch (e) {
        console.error("Fallo en la carga:", e.message);
        if (loadingText) loadingText.innerText = "Error al invocar la partitura.";
    }
}

// --- 2. CONFIGURACIÓN DE MOTOR (VISUAL Y AUDIO) ---
const atSettings = {
    player: {
        enablePlayer: true,
        soundFont: 'https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/fonts/GeneralUser-GS.sf2', // URL estable
        enableCursor: true,
        enableWorker: false 
    },
    display: {
        engine: 'canvas',
        layoutMode: 'page',
     
        resources: {
            // NEGRO ABSOLUTO Y ALTO CONTRASTE
            staffLineColor: '#000000',
            barLineColor: '#000000',
            fretNumberColor: '#000000',
           
            standardNotationNoteHeadColor: '#000000',
            tablatureRestColor: 'transparent' 
        }
    },
    notation: {
        staveTypes: [0, 1],
        rhythmMode: 'Hidden', // Limpieza de silencios
        elements: {
            scoreTitle: false,
            scoreSubTitle: false,
            scoreWords: false,
            scoreMusic: false
        }
    }
};

const at = new alphaTab.AlphaTabApi(el, atSettings);

function aplicarColoresNegros(score) {
    // Usamos el namespace seguro de la v1.8.x
    const black = alphaTab.model.Color.fromJson("#000000");
    const transparent = alphaTab.model.Color.fromJson("#00000000");

    score.tracks.forEach(track => {
        track.staves.forEach(staff => {
            staff.bars.forEach(bar => {
                bar.voices.forEach(voice => {
                    voice.beats.forEach(beat => {
                        // Inyectamos el estilo si no existe
                        if (!beat.style) beat.style = new alphaTab.model.BeatStyle();
                        
                        // Silencios transparentes en TAB
                        beat.style.colors.set(alphaTab.model.BeatSubElement.GuitarTabRests, transparent);
                        
                        beat.notes.forEach(note => {
                            if (!note.style) note.style = new alphaTab.model.NoteStyle();
                            
                            // Forzado de Negro Absoluto en Números y Cabezas
                            note.style.colors.set(alphaTab.model.NoteSubElement.GuitarTabFretNumber, black);
                            note.style.colors.set(alphaTab.model.NoteSubElement.StandardNotationNoteHead, black);
                        });
                    });
                });
            });
        });
    });
}
// --- 3. CICLO DE VIDA: CARGA DE PARTITURA ---
at.scoreLoaded.on(score => {
    aplicarColoresNegros(score);
    // 1. Forzar Programas MIDI (Quitar Piano)
    score.tracks.forEach(track => {
        const info = track.playbackInfo;
        const name = (track.name || "").toLowerCase();
        
        info.bank = 0;
        if (name.includes("drum") || name.includes("perc")) {
            info.program = 0;
            info.channel = 9;
        } else {
            info.program = 27; // Guitarra Clean
        }
    });

    // 2. Renderizar visual para aplicar los colores negros
    at.renderTracks([score.tracks[0]]);

    // 3. Reconstruir Sintetizador (Bypass seguro de interfaz)
    const playerApi = at.player?.api || at.player;
    if (playerApi && typeof playerApi.rebuildSynthesizer === 'function') {
        try { playerApi.rebuildSynthesizer(); } catch(e) { console.warn("Rebuild falló en scoreLoaded"); }
    }
});

// --- 4. CICLO DE VIDA: REPRODUCTOR LISTO ---
at.playerReady.on(() => {
    console.log("Audio listo, aplicando parches finales...");
    
    // Si el primer rebuild falló, lo forzamos al estar listos
    const playerApi = at.player?.api || at.player;
    if (playerApi && typeof playerApi.rebuildSynthesizer === 'function') {
        try { playerApi.rebuildSynthesizer(); } catch(e) {}
    }

    if (loaderContainer) loaderContainer.style.display = 'none';
    if (playPause) {
        playPause.style.opacity = "1";
        playPause.innerText = "▶ PLAY";
    }
});

// Evento para cambiar el texto del botón dinámicamente
at.playerStateChanged.on(e => {
    if (playPause) {
        // e.state: 0 = Stopped, 1 = Playing, 2 = Paused
        playPause.innerText = (e.state === 1) ? "⏸ PAUSE" : "▶ PLAY";
    }
});

// --- 5. CONTROLES DE INTERFAZ Y AUDIO CONTEXT ---
playPause.onclick = async e => {
    e.preventDefault();
    // Desbloqueo del AudioContext exigido por los navegadores
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

// --- 6. INICIALIZACIÓN DE DATOS ---
async function buildKey(trackId){
    const response = await fetch(`https://skores-back.onrender.com/api/request-key/${encodeURIComponent(trackId)}`);
    if(!response.ok) throw new Error("No se pudo obtener la key del servidor");
    
    const data = await response.json();
    const binary = atob(data.k);
    const key = new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) key[i] = binary.charCodeAt(i);
    
    return key;
}

(async () => {
    const trackId = new URLSearchParams(window.location.search).get('track');
    if (trackId) {
        try {
            const urlR2 = `https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/${encodeURIComponent(trackId)}.xml.bin`;
            const keyBytes = await buildKey(trackId); 
            cargarPartituraProtegida(urlR2, keyBytes, at);
        } catch (error) {
            console.error("Error en el flujo de inicio:", error);
            if (loadingText) loadingText.innerText = "Error de autenticación con el servidor.";
        }
    }
})();