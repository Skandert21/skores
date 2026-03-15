const el = document.querySelector('#alphaTab');
const playPause = document.querySelector('#play-pause-btn');
const loaderContainer = document.getElementById('loader-container'); 
const loadingText = document.getElementById('loading-text');

// --- 1. LÓGICA DE DESCIFRADO Y CARGA ---

function decryptXOR(input, keyBytes) { // ahora keyBytes es Uint8Array
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
        console.log("Iniciando descarga protegida...");
        const response = await fetch(url);
        if (!response.ok) throw new Error("No se pudo obtener el archivo de R2");
        
        const textoCifrado = await response.text();
        
        // Desciframos
        const xmlLimpio = decryptXOR(textoCifrado.trim(), key); 
        const xmlTrimmed = xmlLimpio.trim();

        if (!xmlTrimmed.startsWith('<?xml') && !xmlTrimmed.startsWith('<score')) {
            throw new Error("El contenido descifrado no parece un XML válido.");
        }

        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(xmlTrimmed);

        console.log("¡Descifrado exitoso! Renderizando...");
        
        // Cargamos los bytes en AlphaTab
        api.load(dataBytes);

    } catch (e) {
        console.error("Fallo en la carga:", e.message);
        if (loadingText) loadingText.innerText = "Error al invocar la partitura.";
    }
}

// --- 2. CONFIGURACIÓN DE ALPHATAB ---

const at = new alphaTab.AlphaTabApi(el, {


    player: {
        enablePlayer: true,
        enableCursor: true, 
        enableUserInteraction: true
    },
    ui: {
        cursorColor: "#e63946" 
    },
    display: {
        engine: 'svg',
       layoutMode: 'page',
        autoScroll: 1,
        // No usamos staveProfile para que no sobreescriba nuestros ajustes
        elements: {
            scoreTitle: true,
            scoreSubTitle: false,
        }
    },
    notation: {
        // 1. Forzamos Pentagrama y Tablatura
        staveTypes: [0, 1], 
        
        // 2. Quitamos los silencios negros de la TAB (se verán en el pentagrama)
        rhythmMode: 'Hidden', 
        
        // 3. LA SOLUCIÓN AL GRIS: Forzamos opacidad total en voces inactivas
        inactiveVoiceAlpha: 1.0, 
        
        // 4. Forzamos a que todas las voces sean negras
        voiceColor: '#000000',

        // 5. Intentamos colapsar voces para evitar que se peleen
        enableAllVoices: true,
        minimizeAllVoices: true,
        extendBendArrowsOnTiedNotes: false,
        rhythmMode: 'Hidden'
    }
});
 
const progress = new Map();

function updateLoadingIndicator() {
    let loaded = 0;
    let total = 0;
    progress.forEach(value => {
        loaded += value.loaded;
        total += value.total;
    });

    const percent = Math.floor((loaded / total) * 100);
    const progressVal = isNaN(percent) ? 0 : percent;

    if (loadingText) {
        loadingText.innerText = `Sincronizando instrumentos... ${progressVal}%`;
    }

    if(total === loaded && total > 0) {
        console.log('--- Instrumentos listos ---');
        if (loaderContainer) loaderContainer.style.display = 'none'; 
        playPause.style.opacity = "1";
        playPause.innerText = "▶ PLAY";
    }
}

function loadSoundFont(url) {
    if(progress.has(url)) return; 
    progress.set(url, { loaded: 0, total: 1024 * 1024 }); 
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => {
        if (request.status === 200) {
            const buffer = new Uint8Array(request.response);
            at.loadSoundFont(buffer, true);
        }
    };
    request.onprogress = e => {
        if (e.lengthComputable) {
            progress.set(url, { loaded: e.loaded, total: e.total });
            updateLoadingIndicator();
        }
    };
    request.send();
}

// --- 4. EVENTOS DE ALPHATAB ---

at.scoreLoaded.on(score => {
    aplicarColoresNegros(score);
    loadSoundFont('https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/fonts/GeneralUser-GS.sf2');
    
      enableSmoothCursorScroll(at);

    const trackList = document.getElementById('track-list');
    trackList.innerHTML = '';
    score.tracks.forEach((track) => {
        const btn = document.createElement('button');
        btn.className = 'btn-inst';
        btn.innerText = track.name || `Pista ${track.index + 1}`;
        btn.onclick = () => {
            at.renderTracks([track]);
            document.querySelectorAll('.btn-inst').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        trackList.appendChild(btn);
    });
});

at.playerStateChanged.on((args) => {
    playPause.innerText = args.state === 1 ? "⏸ PAUSE" : "▶ PLAY";
});

// --- 5. CONTROLES DE INTERFAZ ---

playPause.onclick = async e => {
    e.preventDefault();

    if (at.player?.api?.audioContext?.state === 'suspended') {
        await at.player.api.audioContext.resume();
    }

    at.playPause();
};

document.getElementById('stop-btn').onclick = () => {
    if (at.player) {
        at.stop(); 
        playPause.innerText = "▶ PLAY";
    }
};

const lockBtnFooter = document.getElementById('lock-scroll-footer');
let autoScrollEnabled = true;

const iconLocked = '🔒\uFE0E';
const iconUnlocked = '🔓\uFE0E';

lockBtnFooter.onclick = () => {

    autoScrollEnabled = !autoScrollEnabled;

    at.settings.display.autoScroll = autoScrollEnabled ? 1 : 0;

    at.updateSettings();

    lockBtnFooter.innerText = autoScrollEnabled ? iconUnlocked : iconLocked;
    lockBtnFooter.style.color = autoScrollEnabled ? "#666" : "#e63946";
    lockBtnFooter.style.opacity = autoScrollEnabled ? "0.5" : "1";

};

window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        playPause.click(); 
    }
});

const urlParams = new URLSearchParams(window.location.search);
const trackId = urlParams.get('track');

 
async function buildKey(trackId){

    const response = await fetch(
        `https://skores-back.onrender.com/api/request-key/${encodeURIComponent(trackId)}`
    );

    if(!response.ok){
        throw new Error("No se pudo obtener la key del servidor");
    }

    const data = await response.json();

    const binary = atob(data.k);
    const key = new Uint8Array(binary.length);

    for(let i=0;i<binary.length;i++){
        key[i] = binary.charCodeAt(i);
    }

    return key;
}
    
 
(async () => {
    if (trackId) {
        try {
            // 1. Definimos la URL de tu archivo en R2 (Sigue igual)
            const urlR2 = `https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/${encodeURIComponent(trackId)}.xml.bin`;
 
            const keyBytes = await buildKey(trackId); 
            
            // 3. Ejecutamos la carga con la llave que nos dio el servidor
            cargarPartituraProtegida(urlR2, keyBytes, at);
            
        } catch (error) {
            console.error("Error en el flujo de inicio:", error);
            if (loadingText) loadingText.innerText = "Error de autenticación con el servidor.";
        }
    }
})();

 
function aplicarColoresNegros(score) {
    const black = alphaTab.model.Color.fromJson("#000000");
    const transparent = alphaTab.model.Color.fromJson("#00000000");

    score.tracks.forEach(track => {
        track.staves.forEach(staff => {
            staff.bars.forEach(bar => {
                bar.voices.forEach(voice => {
                    voice.beats.forEach(beat => {
                        beat.style = beat.style || new alphaTab.model.BeatStyle();
                        // Silencios transparentes en TAB
                        beat.style.colors.set(alphaTab.model.BeatSubElement.GuitarTabRests, transparent);
                        beat.notes.forEach(note => {
                            note.style = note.style || new alphaTab.model.NoteStyle();
                            // Números y cabezas de nota negros
                            note.style.colors.set(alphaTab.model.NoteSubElement.GuitarTabFretNumber, black);
                            note.style.colors.set(alphaTab.model.NoteSubElement.StandardNotationNoteHead, black);
                        });
                    });
                });
            });
        });
    });
}