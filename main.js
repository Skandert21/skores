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
         // Limpiamos la memoria de la partitura anterior antes de cargar la nueva
        if(api.score) {
            api.load(null); 
        }
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
// --- CONFIGURACIÓN TIPO SONGSTERR ---
const atSettings = {
    player: {
        enablePlayer: true,
        soundFont: 'https://pub-5ff3fea08b3544d9a17ded7a90ef2c9b.r2.dev/fonts/GeneralUser-GS.sf2',
        enableCursor: true
    },
    display: {
        engine: 'canvas',
        layoutMode: 'page',
        staveProfile: 'Score', // Layout más compacto
        upscale: 2, // Mejora nitidez en pantallas Retina/4K
        resources: {
            staffLineColor: '#222222',
            barLineColor: '#222222',
            fretNumberColor: '#000000',
            fretNumberFont: 'bold 12px "Roboto", "Arial"',
            standardNotationNoteHeadColor: '#000000'
        }
    },
    notation: {
        staveTypes: [0, 1],
        rhythmMode: 'Hidden',
        voiceColor: '#000000'
    }
};

const at = new alphaTab.AlphaTabApi(el, atSettings);

// --- GESTIÓN DE INSTRUMENTOS (V3) ---
at.scoreLoaded.on(score => {
    score.tracks.forEach(track => {
        const info = track.playbackInfo;
        const name = (track.name || "").toLowerCase();
        
        info.bank = 0;
        // Mapeo forzado por palabras clave
        if (name.includes("drum") || name.includes("perc")) {
            info.program = 0; 
            info.channel = 9; // El canal 9 es sagrado para percusión
        } else if (name.includes("bass")) {
            info.program = 34;
        } else if (name.includes("guitar")) {
            // 29: Overdrive, 27: Clean, 24: Acoustic
            info.program = name.includes("dist") ? 29 : 27; 
        }

        // Si el archivo viene mal mapeado y todo es 0 (piano), forzamos guitarra eléctrica
        if(info.program === 0 && info.channel !== 9) {
            info.program = 27; 
        }
    });

    // Sincronización inmediata del motor de audio
    if(at.player) {
        at.player.rebuildSynthesizer();
    }

    // Generar UI de pistas
    const trackList = document.getElementById('track-list');
    if (trackList) {
        trackList.innerHTML = '';
        score.tracks.forEach((track) => {
            const btn = document.createElement('button');
            btn.className = 'btn-inst';
            btn.innerText = track.name || `Track ${track.index + 1}`;
            btn.onclick = () => {
                at.renderTracks([track]);
                document.querySelectorAll('.btn-inst').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
            trackList.appendChild(btn);
        });
    }
});
// 3. GESTIÓN DE CARGA (Sustituye a tu updateLoadingIndicator manual)
at.playerReady.on(() => {
    console.log("Sintetizador y SoundFont listos.");
    if (loaderContainer) loaderContainer.style.display = 'none';
    if (playPause) {
        playPause.style.opacity = "1";
        playPause.innerText = "▶ PLAY";
    }
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


const iconLocked = '🔒\uFE0E';
const iconUnlocked = '🔓\uFE0E';
let isScrollLocked = false;
 

lockBtnFooter.onclick = () => {

    isScrollLocked = !isScrollLocked;

    at.settings.display.autoScroll = isScrollLocked ? 0 : 1;

    at.updateSettings();

    lockBtnFooter.innerText = isScrollLocked ? iconLocked : iconUnlocked;
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

 
 
 