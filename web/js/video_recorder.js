/**
 * deathstarv2/web/js/video_recorder.js
 * 
 * Three.js Canvas 60 FPS Gerçek Zamanlı Video Kayıt Motoru (MediaRecorder API).
 * - canvas.captureStream(60) ile 60 FPS akış yakalar.
 * - MediaRecorder API ile VP9/VP8 webm formatında video kaydeder.
 * - 'V' klavye kısayolu veya Director Mode ile otomatik başlar.
 * - Kayıt bitince (Ölüm Yıldızı patladığında veya 'V' tuşuna tekrar basıldığında)
 *   Blob'u .webm dosyası olarak otomatik indirir.
 */

export class VideoRecorder {
    constructor(canvas, app) {
        this.canvas = canvas;
        this.app = app;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.stream = null;
        this.indicatorEl = null;

        this.initIndicator();
        this.initKeyListeners();
    }

    initIndicator() {
        let el = document.getElementById('hud-rec-indicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'hud-rec-indicator';
            el.className = 'hud-rec-indicator';
            el.innerHTML = '<span class="rec-dot-live"></span> <span id="rec-status-text">REC ● 60 FPS [V]</span>';
            el.style.display = 'none';
            document.body.appendChild(el);
        }
        this.indicatorEl = el;
    }

    initKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            if (e.key === 'v' || e.key === 'V') {
                e.preventDefault();
                this.toggleRecording();
            }
        });
    }

    startRecording() {
        if (this.isRecording) {
            console.log('[VideoRecorder] Kayıt zaten aktif.');
            return;
        }

        if (!this.canvas) {
            console.error('[VideoRecorder] Canvas bulunamadı!');
            return;
        }

        this.recordedChunks = [];

        try {
            // Three.js Render Canvasından 60 FPS Akış Yakala
            this.stream = this.canvas.captureStream(60);

            // Desteklenen en yüksek kaliteli codec'i seç
            const candidates = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp8',
                'video/webm'
            ];

            let selectedMime = '';
            for (const mime of candidates) {
                if (window.MediaRecorder && MediaRecorder.isTypeSupported(mime)) {
                    selectedMime = mime;
                    break;
                }
            }

            const options = {
                videoBitsPerSecond: 8000000 // 8 Mbps yüksek kaliteli video
            };
            if (selectedMime) {
                options.mimeType = selectedMime;
            }

            this.mediaRecorder = new MediaRecorder(this.stream, options);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.exportVideo();
            };

            // Her 1000 milisaniyede veri parçasını topla
            this.mediaRecorder.start(1000);
            this.isRecording = true;

            if (this.indicatorEl) {
                this.indicatorEl.style.display = 'flex';
            }

            console.log(`[VideoRecorder] 🎥 60 FPS Gerçek Zamanlı Video Kaydı Başlatıldı! (${selectedMime || 'standart webm'})`);
        } catch (err) {
            console.error('[VideoRecorder] Video kaydı başlatılırken hata:', err);
        }
    }

    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            return;
        }

        this.isRecording = false;
        try {
            if (this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
        } catch (err) {
            console.error('[VideoRecorder] Kayıt durdurulurken hata:', err);
        }

        if (this.indicatorEl) {
            this.indicatorEl.style.display = 'none';
        }

        console.log('[VideoRecorder] ⏹️ Video Kaydı Durduruldu, dosya derleniyor...');
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    exportVideo() {
        if (this.recordedChunks.length === 0) {
            console.warn('[VideoRecorder] Kaydedilen video verisi bulunamadı.');
            return;
        }

        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 19).replace(/[:T]/g, '_');
        a.download = `death_star_trench_run_${dateStr}.webm`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 200);

        const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        console.log(`[VideoRecorder] 💾 60 FPS Video İndirildi: ${a.download} (${sizeMB} MB)`);
    }
}
