// DOM Elements (will be queried after DOM ready)
let el;
let playPause;
let loaderContainer;
let loadingText;

// Global AlphaTab instance placeholder
let at;

// Ensure alphaTab script is loaded before initializing
async function waitForAlphaTab(timeout = 5000) {
    const start = Date.now();
    while (typeof window.alphaTab === 'undefined') {
        if (Date.now() - start > timeout) throw new Error('alphaTab not available after timeout');
        await new Promise(r => setTimeout(r, 100));
    }
}

async function init() {
    el = document.querySelector('#alphaTab');
    playPause = document.querySelector('#play-pause-btn');
    loaderContainer = document.getElementById('loader-container');
    loadingText = document.getElementById('loading-text');

    try {
        await waitForAlphaTab(8000);
    } catch (e) {
        console.error('alphaTab library failed to load:', e);
        if (loadingText) loadingText.innerText = 'Error: AlphaTab no disponible.';
        return;
    }

// --- 1. CONFIGURACIÓN DE MOTOR (VISUAL Y AUDIO) ---
const atSettings = {
    player: {
        enablePlayer: true, // enable player so playback API is available (resume handled on user gesture)
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

    // Instancia global del motor (creada después de asegurar alphaTab)
    try {
        at = new alphaTab.AlphaTabApi(el, atSettings);
    } catch (err) {
        console.error('No se pudo crear AlphaTabApi:', err);
        if (loadingText) loadingText.innerText = 'Error: No se pudo inicializar el motor.';
        return;
    }

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
        // --- Control de Volumen por Pista ---
        const volWrap = document.createElement('div');
        volWrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';

        const volLabel = document.createElement('label');
        volLabel.innerText = 'Vol';
        volLabel.style.cssText = 'font-size:11px;color:#AAB2BE;min-width:28px;';

        const volSlider = document.createElement('input');
        volSlider.type = 'range';
        volSlider.min = 0;
        volSlider.max = 200;
        volSlider.value = 100; // 100% por defecto
        volSlider.style.cssText = 'width:120px;';

        const volVal = document.createElement('span');
        volVal.innerText = '100%';
        volVal.style.cssText = 'font-size:11px;color:#AAB2BE;min-width:36px;text-align:right;';

        volSlider.oninput = (e) => {
            const pct = parseInt(e.target.value, 10);
            volVal.innerText = pct + '%';
            setTrackVolume(index, pct / 100);
        };

        volWrap.appendChild(volLabel);
        volWrap.appendChild(volSlider);
        volWrap.appendChild(volVal);
        trackList.appendChild(volWrap);
    });
 
    if(score.tracks.length > 0) {
        at.renderTracks([score.tracks[0]]);
    }
    
    aplicarColoresNegros(score);
    // Sincronizar sliders con el motor si está disponible
    refreshSlidersFromPlayer();
});

    // Registrar eventos del player (después de crear `at`)
    if (at.playerReady && typeof at.playerReady.on === 'function') {
        at.playerReady.on(() => {
            console.log("Audio listo. Verificando estado del sintetizador...");

            if (at.player && at.player.api) {
                try {
                    if (typeof at.player.api.reset === 'function') at.player.api.reset();
                    at.player.api.rebuildSynthesizer();
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
            refreshSlidersFromPlayer();
        });
    }

    if (at.playerStateChanged && typeof at.playerStateChanged.on === 'function') {
        at.playerStateChanged.on(e => {
            if (playPause) {
                playPause.innerText = (e.state === 1) ? "⏸ PAUSE" : "▶ PLAY";
            }
        });
    }

}

    // --- Mapa local de volúmenes por pista (estado)
    const trackVolumes = {};
    /**
     * Ajusta el volumen por pista usando las APIs internas de AlphaTab cuando están disponibles.
     * Se intenta: api.setChannelVolume / api.setChannelMixVolume / api._synthesizer.channelSetMixVolume
     * Si no hay API disponible, hace fallback a `playbackInfo.volume` y rebuildea el sintetizador.
     */
    function setTrackVolume(trackIndex, gain) {
        trackVolumes[trackIndex] = gain;
        if (!at || !at.player) return;

        const api = at.player.api || at.player;
        // Determinar canal MIDI asociado a la pista (si existe)
        let channel = trackIndex;
        try {
            if (at.score && at.score.tracks && at.score.tracks[trackIndex] && at.score.tracks[trackIndex].playbackInfo) {
                const p = at.score.tracks[trackIndex].playbackInfo;
                if (Number.isFinite(p.primaryChannel)) channel = p.primaryChannel;
                else if (Number.isFinite(p.secondaryChannel)) channel = p.secondaryChannel;
            }

            // Rutas posibles según versiones internas
            if (api && typeof api.setChannelVolume === 'function') {
                api.setChannelVolume(channel, gain);
                return;
            }

            if (api && typeof api.setChannelMixVolume === 'function') {
                api.setChannelMixVolume(channel, gain);
                return;
            }

            if (api && api._synthesizer && typeof api._synthesizer.channelSetMixVolume === 'function') {
                api._synthesizer.channelSetMixVolume(channel, gain);
                return;
            }

            // Fallback: escribir en playbackInfo.volume y reconstruir
            if (at.score && at.score.tracks && at.score.tracks[trackIndex]) {
                const t = at.score.tracks[trackIndex];
                if (!t.playbackInfo) t.playbackInfo = {};
                t.playbackInfo.volume = Math.round((gain || 1) * 100);
                if (api && typeof api.rebuildSynthesizer === 'function') api.rebuildSynthesizer();
                else if (api && typeof api.reset === 'function') { api.reset(); api.rebuildSynthesizer && api.rebuildSynthesizer(); }
                return;
            }
        } catch (e) {
            console.warn('No se pudo asignar volumen por pista con los métodos conocidos:', e);
        }
    }

    /** Sincroniza los sliders del DOM con el estado actual del motor (si soporta lectura) */
    function refreshSlidersFromPlayer() {
        if (!at || !at.player) return;
        const api = at.player.api || at.player;
        const sliders = document.querySelectorAll('#track-list input[type=range]');
        if (!sliders || sliders.length === 0) return;

        sliders.forEach((s, idx) => {
            try {
                let channel = idx;
                if (at.score && at.score.tracks && at.score.tracks[idx] && at.score.tracks[idx].playbackInfo) {
                    const p = at.score.tracks[idx].playbackInfo;
                    if (Number.isFinite(p.primaryChannel)) channel = p.primaryChannel;
                }

                let current = null;
                if (api && typeof api.getChannelVolume === 'function') current = api.getChannelVolume(channel);
                else if (api && typeof api.channelGetMixVolume === 'function') current = api.channelGetMixVolume(channel);
                else if (api && api._synthesizer && typeof api._synthesizer.channelGetMixVolume === 'function') current = api._synthesizer.channelGetMixVolume(channel);

                if (current != null && !isNaN(current)) {
                    s.value = Math.round(current * 100);
                    const label = s.nextSibling;
                    if (label && label.tagName === 'SPAN') label.innerText = Math.round(current * 100) + '%';
                }
            } catch (e) {
                // noop
            }
        });
    }

    /** Auto-ajusta volúmenes por pista usando la máxima velocidad de nota encontrada */
    function autoLevelAllTracks() {
        if (!at || !at.score) return;
        const reference = 100; // objetivo en % relativo a velocidad
        at.score.tracks.forEach((track, idx) => {
            let maxV = 0;
            if (track.staves) {
                track.staves.forEach(staff => {
                    staff.bars.forEach(bar => {
                        bar.voices.forEach(voice => {
                            voice.beats.forEach(beat => {
                                if (beat.notes) beat.notes.forEach(n => {
                                    const v = n.velocity || n.velocityFactor || 0;
                                    if (v > maxV) maxV = v;
                                });
                            });
                        });
                    });
                });
            }

            // Si no encontramos velocity, intentar buscar en eventos (fallback)
            if (maxV === 0 && track.events) {
                track.events.forEach(ev => { if (ev.velocity && ev.velocity > maxV) maxV = ev.velocity; });
            }

            // Si aún 0, usamos 100 como fallback
            if (maxV === 0) maxV = 100;

            const gain = Math.min(3, reference / maxV); // evitar ganancias extremas
            setTrackVolume(idx, gain);
            // Actualizar UI si existe
            const sliders = document.querySelectorAll('#track-list input[type=range]');
            if (sliders && sliders[idx]) sliders[idx].value = Math.round(gain * 100);
        });
    }

    // Crear botón Auto-Level dentro del contenedor de instrumentos (si existe)
    document.addEventListener('DOMContentLoaded', () => {
        const instrumentBar = document.getElementById('track-list');
        if (!instrumentBar) return;
        const autoBtn = document.createElement('button');
        autoBtn.className = 'btn-main';
        autoBtn.innerText = 'Auto-Level';
        autoBtn.style.cssText = 'margin-left:8px;background:#3b4653;border:1px solid #444;';
        autoBtn.onclick = () => {
            autoLevelAllTracks();
        };
        instrumentBar.insertAdjacentElement('beforebegin', autoBtn);
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
if (playPause) {
    playPause.onclick = async e => {
        e.preventDefault();
        try {
            if (at.player?.api?.audioContext?.state === 'suspended') {
                await at.player.api.audioContext.resume();
            }
        } catch (err) {
            console.warn('No se pudo reanudar AudioContext automáticamente:', err);
        }
        if (typeof at.playPause === 'function') at.playPause();
    };

    // Key binding solo si existe el botón
    window.addEventListener('keydown', e => {
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            playPause.click(); 
        }
    });
}

const stopBtn = document.getElementById('stop-btn');
if (stopBtn) {
    stopBtn.onclick = () => { if (at.player) at.stop(); };
}

const lockBtnFooter = document.getElementById('lock-scroll-footer');
let isScrollLocked = false;
if (lockBtnFooter) {
    lockBtnFooter.onclick = () => {
        isScrollLocked = !isScrollLocked;
        at.settings.display.autoScroll = isScrollLocked ? 0 : 1;
        at.updateSettings();
        lockBtnFooter.innerText = isScrollLocked ? '🔒\uFE0E' : '🔓\uFE0E';
    };
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
// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    init();
});
 
 