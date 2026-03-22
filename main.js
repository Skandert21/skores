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
        enableWorker: false,
        soundFont: 'https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/fonts/GeneralUser-GS.sf2'
    },
    display: {
        engine: 'svg',
        layoutMode: 'page',
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
    }
};

// Instancia global del motor
const at = new alphaTab.AlphaTabApi(el, atSettings);

// --- 2. REGISTRO DE EVENTOS (LISTENERS) ---
// Obligatorio: Declarar antes de cualquier función de carga (api.load)

at.scoreLoaded.on((score) => {
    console.log("Score cargado, aplicando mapeo de instrumentos...");
    let nextChannel = 0;

    score.tracks.forEach(track => {
        const info = track.playbackInfo;
        const name = (track.name || "").toLowerCase();

        // Forzar banco 0 para SoundFont GeneralUser-GS
        info.bank = 0;

        // Batería: Canal 10 MIDI (Índice 9 interno)
        if (name.includes("drum") || name.includes("percussion")) {
            info.program = 0;
            info.channel = 9; 
            return;
        }

        // Prevenir colisión con el canal rítmico
        if (nextChannel === 9) nextChannel++;
        info.channel = nextChannel++;

        // Mapeo basado en ID Decimal
        if (name.includes("bass")) {
            info.program = 34; // [0000:22] Pick Bass
        } else if (name.includes("guitar")) {
            info.program = 29; // [0000:1D] Overdrive Guitar
        } else {
            info.program = 0;  // Piano genérico fallback
        }
        
        console.log(`Mapeado: ${track.name} -> Program: ${info.program} en Canal: ${info.channel}`);
    });

if (at.player) {
        // Forzamos a que el sintetizador recargue los programas desde el modelo 'score'
        at.player.api.rebuildSynthesizer(); 
    }
    aplicarColoresNegros(score);
});

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

 
async function cargarPartituraProtegida(url, key, api) {
    try {
        if(api.score) api.load(null); 
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Error en conexión a bucket R2");
        
        const textoCifrado = await response.text();
        const xmlLimpio = decryptXOR(textoCifrado.trim(), key); 
        const xmlTrimmed = xmlLimpio.trim();

      if (!xmlTrimmed.includes('FICHIER') && !xmlTrimmed.startsWith('PK')) {
    throw new Error("El archivo descifrado no es un formato Guitar Pro válido.");
}

        const encoder = new TextEncoder();
        api.load(encoder.encode(xmlTrimmed));
    } catch (e) {
        console.error("Abortado:", e.message);
        if (loadingText) loadingText.innerText = "Error crítico de partitura.";
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