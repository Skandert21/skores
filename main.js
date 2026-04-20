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
        workerScript: './alphaTab.min.js',  
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

 
 at.scoreLoaded.on((score) => {
    const trackList = document.getElementById('track-list');
    if (!trackList) return;

    trackList.innerHTML = ''; // Limpieza total de renderizados previos

    score.tracks.forEach((track, index) => {
        const trackName = (track.name || `Pista ${index + 1}`).toUpperCase();
        
        // Crear el botón de instrumento
        const btn = document.createElement('button');
        btn.className = "btn-instrument"; 
        btn.innerText = trackName;
        btn.style.cssText = "margin-right: 8px; padding: 8px 12px; background: #2D333F; color: #FFFFFF; border: 1px solid #444; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; transition: 0.2s;";

        // Efecto Hover / Active
        btn.onmouseover = () => btn.style.borderColor = "#E63946";
        btn.onmouseout = () => btn.style.borderColor = "#2D333F";

        btn.onclick = () => { 
            at.renderTracks([track]); 
 
            const name = trackName.toLowerCase();
            if (name.includes("bass") || name.includes("bajo")) track.playbackInfo.program = 34;
            else if (name.includes("guitar") || name.includes("gtr") || name.includes("lead")) track.playbackInfo.program = 29;
            else track.playbackInfo.program = 25;

            if (at.player && at.player.api) {
                at.player.api.rebuildSynthesizer();
            }
 
            document.querySelectorAll('.btn-instrument').forEach(b => b.style.background = "#2D333F");
            btn.style.background = "#E63946";
        };

        trackList.appendChild(btn);
    });
 
    if(score.tracks.length > 0) {
        at.renderTracks([score.tracks[0]]);
    }
    
    aplicarColoresNegros(score);
});

  
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
 
 