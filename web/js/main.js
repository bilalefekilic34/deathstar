/**
 * deathstarv2/web/js/main.js
 * 
 * Project Pigeon / Death Star v2: Üst Düzey Nöro-Biyolojik Uzay Simülasyonu.
 * - Three.js WebGL Sahnesi, Işıklandırma, Post-Processing.
 * - 60 Hz Python WebSocket Çift Yönlü Köprüsü.
 * - GLTF Siperler, Şeffaf Kokpitli Biyolojik TIE Fighter, Termal Egzoz Çukuru.
 * - Rebel X-Wing Lazerleri (Dinamik Hız & Açı, Çarpışma, Otonom Dodge, 3 Can).
 * - Biyolojik Torpido (Proboscis Extension Reflex / PER) İkiz Proton Torpido Ateşlemesi.
 * - Ölüm Yıldızı Reaktör Süpernova Patlaması & Parçacık Sistemi (ParticleSystem).
 * - Kamera Modları (Chase Cam, Cockpit Zoom, Fly Pilot POV).
 */

import * as THREE from 'three';
import { SpacewarsTrench } from './spacewars_trench.js?v=6.0';
import { HeroXWing } from './hero_x_wing.js?v=9.0';
import { ExhaustPort } from './exhaust_port.js?v=6.0';
import { NeuralHologram } from './neural_hologram.js?v=6.0';
import { ProtonTorpedoSystem } from './proton_torpedoes.js?v=6.0';
import { DeathStarStation } from './death_star.js?v=6.0';
import { StarfieldSystem } from './starfield.js?v=6.0';
import { EnemyTieSquadron } from './enemy_tie_squadron.js?v=9.0';
import { DirectorMode } from './director_mode.js?v=9.0';
import { VideoRecorder } from './video_recorder.js?v=1.0';

window.THREE = THREE;

class SpacewarsSimulation {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1320); // Derin uzay laciverti / koyu gri-mavi
        // Derinlik algısını artıran yumuşak sis:
        this.scene.fog = new THREE.Fog(0x0b1320, 200, 1600);

        this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.5, 2500);
        this.camera.position.set(0, 42.0, -35.0);
        this.camera.lookAt(0, 33.0, 15.0);
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
            preserveDrawingBuffer: true // 60 FPS Video kaydı için WebGL tamponunu koru
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.container.appendChild(this.renderer.domElement);

        // 60 FPS Gerçek Zamanlı Video Kaydedici (MediaRecorder API)
        this.videoRecorder = new VideoRecorder(this.renderer.domElement, this);

        // Dinamik Çevre Haritası (PMREMGenerator HDRI) & PBR Panel/Bump Yüzey Dokuları
        this.envMap = null;
        this.trenchBumpMap = null;
        this.tieBumpMap = null;
        this.tieRoughnessMap = null;
        this.tieSolarBumpMap = null;
        this.setupEnvironmentMap();
        this.createTrenchTextures();
        this.createTieFighterTextures();

        // Alt Sistemler
        this.trench = new SpacewarsTrench(this.scene);

        // 1. Ana Gemi: Biyolojik Sinek Kontrollü Kahraman X-Wing (Red Five)
        this.heroXWing = new HeroXWing(this.scene);
        this.playerShip = this.heroXWing; // Birincil Oyuncu Gemisi Referansı
        this.tieFighter = this.heroXWing; // Geriye dönük uyumluluk takma adı
        this.isPlayerAlive = true;

        this.exhaustPort = new ExhaustPort(this.scene);
        this.hologram = new NeuralHologram('hologram-container');
        this.torpedoes = new ProtonTorpedoSystem(this.scene);
        this.deathStar = new DeathStarStation(this.scene);
        this.starfield = new StarfieldSystem(this.scene);

        // 2. Çoklu-Ajan Düşman İmparatorluk TIE Fighter Filosu (Multi-Agent SNN)
        this.enemyTieSquadron = new EnemyTieSquadron(
            this.scene,
            this.audioListener,
            (spawnPos, speed, agentId) => {
                this.spawnTieLaser(spawnPos, speed, agentId);
            },
            (agentId, reason) => {
                this.onTieDestroyed(agentId, reason);
            }
        );
        this.enemyShip = this.enemyTieSquadron; // Birincil Düşman Filosu Referansı
        this.enemySquadron = this.enemyTieSquadron;
        this.darkXWingManager = this.enemyTieSquadron; // Geriye dönük uyumluluk takma adı

        // Sinematik Yönetmen Modu (Star Wars: A New Hope Trench Run Storyboard)
        this.directorMode = new DirectorMode(this);

        // Dinamik Gözlemci Modu & Kamera Yönetim Sistemi (Spectator Camera Switcher)
        this.spectatorTargetId = 'hero_xwing'; // 'hero_xwing' veya 'tie_1', 'tie_2' vb.
        this.activeAgents = [];
        this.lastAgentsHash = '';

        this.dirLight = null;

        // Lazerler & Tehditler
        this.lasers = [];
        this.laserSpawnTimer = 0;
        this.lives = 3;
        this.isGameOver = false;
        this.isVictory = false;

        // Paylaşılan Lazer Geometrisi ve Materyalleri (Zero Memory Leak & Zero Dynamic Lights)
        // 1. Düşman İmparatorluk TIE Fighter Zümrüt Yeşili Lazerleri (#10b981)
        this.sharedLaserGeo = new THREE.CylinderGeometry(0.16, 0.16, 5.5, 6);
        this.sharedLaserGeo.rotateX(Math.PI / 2);
        this.sharedTieLaserEnemyMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        this.sharedXWingLaserMat = this.sharedTieLaserEnemyMat; // Geriye dönük uyumluluk
        this.sharedTurretLaserMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });

        // 2. Kahraman X-Wing (Red Five) Kırmızı Plazma Dörtlü Lazerleri (#ef4444)
        this.sharedHeroLaserGeo = new THREE.CylinderGeometry(0.18, 0.18, 5.8, 6);
        this.sharedHeroLaserGeo.rotateX(Math.PI / 2);
        this.sharedHeroLaserMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        this.sharedTieLaserGeo = this.sharedHeroLaserGeo; // Geriye dönük uyumluluk
        this.sharedTieLaserMat = this.sharedHeroLaserMat; // Geriye dönük uyumluluk
        this.heroLasers = [];
        this.tieLasers = this.heroLasers; // Geriye dönük uyumluluk
        this.lastHeroLaserFireTime = 0;
        this.lastTieLaserFireTime = 0;
        this.lastDodgeTime = 0;
        this.visualFeedbackFrameCounter = 0;

        // 1 Dakikalık Hayatta Kalma Sistemi & Ölüm Yıldızı Spawn Sayacı
        this.survivalTimer = 0.0;
        this.requiredSurvivalTime = 60.0; // 1 Dakika (60 saniye) boyunca hayatta kalma kuralı

        // Final Sekansı Durum Makinesi
        this.isFinaleActive = false;
        this.finalePhase = 0; // 0 = Normal, 1 = Approach, 2 = Torpedoes Fired, 3 = Destroyed
        this.flightTime = 0.0;
        this.finalTargetZ = 0.0;
        this.cameraTrauma = 0.0;
        this.deathStarMaxHp = 5;
        this.deathStarHp = 5;
        this.firingRange = 38.0; // Biyolojik Atış / Kilitlenme Menzili (PER optimum proboscis menzili)
        this.isVelocitySynced = false;

        // Kamera Modu: 1 = Chase, 2 = Cockpit Zoom, 3 = Fly POV
        this.cameraMode = 1;
        const urlParams = new URLSearchParams(window.location.search);
        const camParam = urlParams.get('cam');
        if (camParam === 'cockpit' || camParam === '2') {
            this.cameraMode = 2;
        } else if (camParam === 'pilot' || camParam === '3') {
            this.cameraMode = 3;
        }

        // Son Gelen Telemetri
        this.latestData = {
            ship: { x: 0, y: 32, z: 0, roll: 0, pitch: 0, yaw: 0, speed: 35 },
            enemies: [],
            fly: { wing_l: 0, wing_r: 0, delta_phi: 0, freq: 200.0 },
            neural: {
                dopamine_mv: 0,
                is_barrel_rolling: false,
                spikes: [],
                potentials: { v_dnp01: -70.0, v_lc10a: -70.0, v_proboscis: -70.0 }
            },
            ommatidia: { active_count: 0 },
            learning: { successful_dodges: 0, dodge_rate_pct: 100, progress_pct: 6, score: 60 }
        };

        // Zamanlayıcı
        this.clock = new THREE.Clock();
        this.ws = null;

        // Three.js Ses Sistemi (AudioListener ve Audio sınıfları)
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);

        this.damageSound = new THREE.Audio(this.audioListener);
        this.barrelRollSound = new THREE.Audio(this.audioListener);
        this.dopamineSound = new THREE.Audio(this.audioListener);
        this.torpedoSound = new THREE.Audio(this.audioListener);
        this.deathStarExplosionSound = new THREE.Audio(this.audioListener);
        this.tieLaserSound = new THREE.Audio(this.audioListener);
        this.initProceduralSounds();

        this.init();
    }

    initProceduralSounds() {
        try {
            const ctx = this.audioListener.context;
            const sampleRate = ctx.sampleRate || 44100;

            // 1. Hasar / Acı Ses Efekti (Metalik Patlama ve Şok)
            const dmgDuration = 0.45;
            const dmgBuffer = ctx.createBuffer(1, Math.floor(sampleRate * dmgDuration), sampleRate);
            const dmgData = dmgBuffer.getChannelData(0);
            for (let i = 0; i < dmgData.length; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * 11.0);
                const noise = (Math.random() * 2 - 1) * 0.75;
                const lowBoom = Math.sin(2 * Math.PI * (140 - t * 180) * t) * 0.7;
                dmgData[i] = (noise + lowBoom) * env;
            }
            this.damageSound.setBuffer(dmgBuffer);
            this.damageSound.setVolume(0.85);

            // 2. Fıçı Tonosu (Barrel Roll) Kaçış Sesi (Aerodinamik Rüzgar / Whoosh)
            const rollDuration = 0.6;
            const rollBuffer = ctx.createBuffer(1, Math.floor(sampleRate * rollDuration), sampleRate);
            const rollData = rollBuffer.getChannelData(0);
            for (let i = 0; i < rollData.length; i++) {
                const t = i / rollDuration;
                const env = Math.sin(Math.PI * t);
                const noise = (Math.random() * 2 - 1) * 0.4;
                const sweep = Math.sin(2 * Math.PI * (280 + Math.sin(t * Math.PI) * 200) * (i / sampleRate));
                rollData[i] = (noise * 0.5 + sweep * 0.5) * env * 0.7;
            }
            this.barrelRollSound.setBuffer(rollBuffer);
            this.barrelRollSound.setVolume(0.8);

            // 3. Dopamin / Ödül Zili (Kristal Harmonik Akor)
            const dopaDuration = 1.0;
            const dopaBuffer = ctx.createBuffer(1, Math.floor(sampleRate * dopaDuration), sampleRate);
            const dopaData = dopaBuffer.getChannelData(0);
            for (let i = 0; i < dopaData.length; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * 3.8);
                const s1 = Math.sin(2 * Math.PI * 528 * t);
                const s2 = Math.sin(2 * Math.PI * 660 * t);
                const s3 = Math.sin(2 * Math.PI * 792 * t);
                dopaData[i] = (s1 * 0.5 + s2 * 0.3 + s3 * 0.2) * env * 0.4;
            }
            this.dopamineSound.setBuffer(dopaBuffer);
            this.dopamineSound.setVolume(0.8);

            // 4. Proton Torpido Ateşleme Sesi (İkiz Yüksek Enerjili Plazma Whistle/Chirp)
            const torpDuration = 0.55;
            const torpBuffer = ctx.createBuffer(1, Math.floor(sampleRate * torpDuration), sampleRate);
            const torpData = torpBuffer.getChannelData(0);
            for (let i = 0; i < torpData.length; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * 6.5);
                const freq = 980 * Math.exp(-t * 8.0) + 180;
                const wave = Math.sin(2 * Math.PI * freq * t) + 0.4 * Math.sin(4 * Math.PI * freq * t);
                const noise = (Math.random() * 2 - 1) * 0.25;
                torpData[i] = (wave * 0.75 + noise * 0.25) * env * 0.9;
            }
            this.torpedoSound.setBuffer(torpBuffer);
            this.torpedoSound.setVolume(0.9);

            // 5. İkonik Devasa Ölüm Yıldızı Patlama Ses Efekti (3.2 Saniye Süper-Bas ve Termonükleer Gürültü)
            const boomDuration = 3.2;
            const boomBuffer = ctx.createBuffer(1, Math.floor(sampleRate * boomDuration), sampleRate);
            const boomData = boomBuffer.getChannelData(0);
            for (let i = 0; i < boomData.length; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * 1.25);
                const subBass = Math.sin(2 * Math.PI * (48 - t * 9.0) * t); // 48Hz -> 20Hz derin rezonans
                const midBoom = Math.sin(2 * Math.PI * (95 - t * 25.0) * t);
                const noise = (Math.random() * 2 - 1) * (t < 0.3 ? 0.9 : 0.4 * Math.exp(-t * 1.5));
                boomData[i] = (subBass * 0.65 + midBoom * 0.35 + noise * 0.5) * env * 0.95;
            }
            this.deathStarExplosionSound.setBuffer(boomBuffer);
            this.deathStarExplosionSound.setVolume(1.0);

            // 6. Hedef Kilitleme Sesi (Bip-bip-bip hedef kilit melodisi)
            const lockDuration = 0.55;
            const lockBuffer = ctx.createBuffer(1, Math.floor(sampleRate * lockDuration), sampleRate);
            const lockData = lockBuffer.getChannelData(0);
            for (let i = 0; i < lockData.length; i++) {
                const t = i / sampleRate;
                const beep = Math.sin(2 * Math.PI * 940 * t) * (Math.sin(2 * Math.PI * 14 * t) > 0 ? 1 : 0);
                lockData[i] = beep * 0.45;
            }
            this.targetLockSound = new THREE.Audio(this.audioListener);
            this.targetLockSound.setBuffer(lockBuffer);
            this.targetLockSound.setVolume(0.85);

            // 7. TIE Fighter İkiz Lazer Sesi (Yüksek enerjili keskin plazma atış sesi)
            const tieLaserDuration = 0.28;
            const tieLaserBuffer = ctx.createBuffer(1, Math.floor(sampleRate * tieLaserDuration), sampleRate);
            const tieLaserData = tieLaserBuffer.getChannelData(0);
            for (let i = 0; i < tieLaserData.length; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * 15.0);
                const freq = 1280 * Math.exp(-t * 12.0) + 260;
                const wave = Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(4 * Math.PI * freq * t);
                tieLaserData[i] = wave * env * 0.75;
            }
            this.tieLaserSound.setBuffer(tieLaserBuffer);
            this.tieLaserSound.setVolume(0.8);

            console.log('[Audio] ✓ Three.js AudioListener, Torpido, TIE Lazer ve Süpernova Ses Efektleri Hazır!');
        } catch (e) {
            console.warn('[Audio] Ses motoru başlatma uyarısı:', e);
        }
    }

    async init() {
        this.setupLights();
        this.setupEventListeners();

        // 1. Asenkron Ön Yükleme (Pre-loading) Mimarisi:
        // GLTFLoader kullanarak Death Star, Termal Egzoz Deliği, TIE Fighter ve Siperler
        // oyunun en başında arka planda önceden yüklenir (pre-load) ve sahneye eklenip gizlenir (-50,000m).
        await this.preloadAllAssets();

        // WebSocket Bağlantısını Başlat
        this.connectWebSocket();

        // Ana Render Döngüsü
        this.animate();
    }

    async preloadAllAssets() {
        console.log('[Preload] 🚀 Asenkron model ön yükleme mimarisi başlatılıyor...');
        const loadTasks = [
            { name: 'Trench Modülleri & Terminus', task: () => this.trench.init() },
            { name: 'Kahraman X-Wing (Red Five) & Biyo-Pilot', task: () => this.heroXWing.init() },
            { name: 'Düşman İmparatorluk TIE Filosu', task: () => this.enemyTieSquadron.init() },
            { name: 'Termal Egzoz Çukuru', task: () => this.exhaustPort.init() },
            { name: '3D Sinek Beyni Hologramı', task: () => this.hologram.init() },
            { name: 'Death Star İstasyonu', task: () => this.deathStar.init() }
        ];

        await Promise.all(
            loadTasks.map(async (item) => {
                try {
                    await item.task();
                    console.log(`[Preload] ✓ ${item.name} arka planda yüklendi ve sahneye gizlendi (z = -50000).`);
                } catch (err) {
                    console.warn(`[Preload] ⚠️ ${item.name} ön yükleme uyarısı (Fallback ile devam):`, err);
                }
            })
        );

        // 1. Kahraman X-Wing İçin Parlak Beyaz/Platin Metalik PBR Materyalleri & Uzay envMap Yansıması
        if (this.heroXWing) {
            this.applyMetallicXWingMaterials(this.heroXWing.xWingMesh || this.heroXWing.shipGroup);
            this.heroXWing.applyEnvMap(this.envMap || this.scene.environment);
        }

        // 2. Siper (Trench) Modelleri İçin Açık Gri Metalik Kaplama & Mavi -> İmparatorluk Kırmızısı Vurgular
        if (this.trench) {
            if (this.trench.baseTemplate) this.applyMetallicTrenchMaterials(this.trench.baseTemplate);
            if (this.trench.modules) this.trench.modules.forEach(m => this.applyMetallicTrenchMaterials(m));
            if (this.trench.endWall) this.applyMetallicTrenchMaterials(this.trench.endWall);
        }

        // 3. Death Star İstasyonu (Kameradan bağımsız sahnede hemen aktif, envMap & frustumCulled = false)
        if (this.deathStar) {
            this.deathStar.setSpawned(true);
            if (this.deathStar.model) {
                this.deathStar.model.traverse((child) => {
                    if (child.isMesh) {
                        child.frustumCulled = false;
                        if (child.material) {
                            child.material.envMap = this.envMap;
                            child.material.envMapIntensity = 1.6;
                            child.material.needsUpdate = true;
                        }
                    }
                });
            }
        }

        console.log('[Preload] ✓ Tüm uzay varlıkları (TIE Fighter gunmetal PBR, kırmızı siper vurguları, Ölüm Yıldızı) hazırlandı!');
    }

    /**
     * 1. Çevre Yansıması (Environment Map / HDRI) Eklenmesi
     * PMREMGenerator kullanarak dinamik uzay, nebula ve yıldız çevre haritası üretir.
     * Bu harita sahnenin environment özelliğine ve duvar materyallerine atanarak
     * metalik yüzeylerde gerçekçi PBR yansımaları oluşturur.
     */
    setupEnvironmentMap() {
        try {
            const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
            pmremGenerator.compileEquirectangularShader();

            // 1024x512 Dinamik Equirectangular Uzay/Yıldız/Nebula Çevre Dokusu
            const width = 1024;
            const height = 512;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // Arka Plan Uzay & Çelik Gradyanı (Metalin pürüzsüz yüzeyinde ışık süzülmesi oluşturur)
            const grad = ctx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0.0, '#1a2436'); // Üst gök kubbe koyu çelik laciverti
            grad.addColorStop(0.3, '#334155'); // Orta çelik grisi
            grad.addColorStop(0.48, '#64748b'); // Ufuk yaklaşımı
            grad.addColorStop(0.5, '#cbd5e1');  // Ufuk çizgisi: parlak metalik parıltı bandı
            grad.addColorStop(0.52, '#64748b');
            grad.addColorStop(0.7, '#334155');
            grad.addColorStop(1.0, '#1e293b'); // Taban
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);

            // 1. Ana parlak starlight & istasyon reflektörü (Üst sol - Soğuk gök mavisi speküler)
            const spot1 = ctx.createRadialGradient(width * 0.28, height * 0.35, 10, width * 0.28, height * 0.35, 210);
            spot1.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
            spot1.addColorStop(0.35, 'rgba(224, 242, 254, 0.78)');
            spot1.addColorStop(0.7, 'rgba(56, 189, 248, 0.35)');
            spot1.addColorStop(1, 'rgba(56, 189, 248, 0)');
            ctx.fillStyle = spot1;
            ctx.fillRect(0, 0, width, height);

            // 2. Karşı açı reflektörü (Üst sağ - Sıcak amber/reaktör ışıltısı)
            const spot2 = ctx.createRadialGradient(width * 0.72, height * 0.35, 10, width * 0.72, height * 0.35, 200);
            spot2.addColorStop(0, 'rgba(255, 255, 255, 0.94)');
            spot2.addColorStop(0.35, 'rgba(254, 243, 199, 0.72)');
            spot2.addColorStop(0.7, 'rgba(251, 191, 36, 0.32)');
            spot2.addColorStop(1, 'rgba(251, 191, 36, 0)');
            ctx.fillStyle = spot2;
            ctx.fillRect(0, 0, width, height);

            // 3. Ölüm Yıldızı Siperi Ekvatoral Işık Çizgisi (Horizon gleam streak)
            const horiz = ctx.createLinearGradient(0, height * 0.44, 0, height * 0.56);
            horiz.addColorStop(0, 'rgba(255, 255, 255, 0)');
            horiz.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
            horiz.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = horiz;
            ctx.fillRect(0, height * 0.44, width, height * 0.12);

            // 4. Yıldız Parıltıları
            let seed = 42;
            const pseudoRandom = () => {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            };

            for (let i = 0; i < 500; i++) {
                const x = pseudoRandom() * width;
                const y = pseudoRandom() * height;
                const r = pseudoRandom() * 1.8 + 0.5;
                const alpha = pseudoRandom() * 0.8 + 0.2;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
                ctx.fill();
            }

            const envTexture = new THREE.CanvasTexture(canvas);
            envTexture.mapping = THREE.EquirectangularReflectionMapping;
            envTexture.colorSpace = THREE.SRGBColorSpace;

            const envRenderTarget = pmremGenerator.fromEquirectangular(envTexture);
            this.envMap = envRenderTarget.texture;
            this.scene.environment = this.envMap;

            pmremGenerator.dispose();
            envTexture.dispose();

            console.log('[Environment] ✓ PMREMGenerator dinamik uzay & nebula Environment Map oluşturuldu ve sahneye atandı!');
        } catch (err) {
            console.error('[Environment] PMREMGenerator başlatma hatası:', err);
        }
    }

    /**
     * 3. Yüzey Detayı ve Kusurlar (Bump Map)
     * Düz ayna etkisini kırıp gerçekçi uzay istasyonu metal zırhı (panel derzleri,
     * perçinler, erişim kapakları ve fırçalanmış mikro-çizikler) oluşturan prosedürel doku.
     */
    createTrenchTextures() {
        try {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            // Taban yüksekliği: nötr orta gri (128)
            ctx.fillStyle = '#808080';
            ctx.fillRect(0, 0, size, size);

            // 1. Zırh Panel Çizgileri ve Derz Boşlukları (Koyu girintiler / Seams)
            const panelSize = 128; // 4x4 panel deseni
            ctx.lineWidth = 3;
            for (let x = 0; x <= size; x += panelSize) {
                // Girinti kanalı (Koyu gölge)
                ctx.strokeStyle = '#282828';
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, size);
                ctx.stroke();

                // Kanal pahı / Pah kenarı (Hafif aydınlık kabartı)
                ctx.strokeStyle = '#b0b0b0';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + 2, 0);
                ctx.lineTo(x + 2, size);
                ctx.stroke();
                ctx.lineWidth = 3;
            }

            for (let y = 0; y <= size; y += panelSize) {
                ctx.strokeStyle = '#282828';
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(size, y);
                ctx.stroke();

                ctx.strokeStyle = '#b0b0b0';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y + 2);
                ctx.lineTo(size, y + 2);
                ctx.stroke();
                ctx.lineWidth = 3;
            }

            // 2. Alt-paneller ve Modüler Erişim Kapakları (Access Hatches)
            const hatches = [
                { x: 28, y: 28, w: 72, h: 52 },
                { x: 156, y: 36, w: 92, h: 56 },
                { x: 284, y: 24, w: 84, h: 80 },
                { x: 412, y: 44, w: 72, h: 44 },
                { x: 32, y: 156, w: 60, h: 84 },
                { x: 164, y: 168, w: 80, h: 68 },
                { x: 292, y: 156, w: 96, h: 72 },
                { x: 416, y: 172, w: 68, h: 68 },
                { x: 36, y: 284, w: 80, h: 72 },
                { x: 160, y: 304, w: 88, h: 56 },
                { x: 288, y: 280, w: 72, h: 92 },
                { x: 408, y: 296, w: 80, h: 68 },
                { x: 32, y: 408, w: 84, h: 64 },
                { x: 156, y: 420, w: 72, h: 52 },
                { x: 284, y: 404, w: 88, h: 72 },
                { x: 420, y: 416, w: 64, h: 64 }
            ];

            hatches.forEach(h => {
                // İç girinti
                ctx.fillStyle = '#6e6e6e';
                ctx.fillRect(h.x, h.y, h.w, h.h);
                ctx.strokeStyle = '#323232';
                ctx.lineWidth = 2;
                ctx.strokeRect(h.x, h.y, h.w, h.h);
                // Üst ve sol kenarda bevel parlama
                ctx.strokeStyle = '#c0c0c0';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(h.x, h.y + h.h);
                ctx.lineTo(h.x, h.y);
                ctx.lineTo(h.x + h.w, h.y);
                ctx.stroke();
            });

            // 3. Perçinler ve Cıvata Sıraları (Rivets & Industrial Fasteners)
            ctx.fillStyle = '#3a3a3a';
            for (let p = 0; p < size; p += panelSize) {
                for (let offset = 14; offset < panelSize; offset += 20) {
                    // Yatay perçinler
                    ctx.beginPath();
                    ctx.arc(p + offset, p + 8, 1.8, 0, Math.PI * 2);
                    ctx.fill();
                    // Dikey perçinler
                    ctx.beginPath();
                    ctx.arc(p + 8, p + offset, 1.8, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // 4. Fırçalanmış Metal Çizikleri ve Mikro-Pürüzlülük (Brushed Metal Grain)
            // Işığın kusursuz ayna gibi değil, uzay istasyonu metal zırhı gibi kırılmasını sağlar
            const imgData = ctx.getImageData(0, 0, size, size);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const noise = (Math.random() - 0.5) * 26;
                data[i] = Math.min(255, Math.max(0, data[i] + noise));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
            }
            ctx.putImageData(imgData, 0, 0);

            this.trenchBumpMap = new THREE.CanvasTexture(canvas);
            this.trenchBumpMap.wrapS = THREE.RepeatWrapping;
            this.trenchBumpMap.wrapT = THREE.RepeatWrapping;
            this.trenchBumpMap.repeat.set(12, 10);

            // 5. Prosedürel PBR Roughness Map (Panel derzlerinde ve perçinlerde pürüzlülüğü artırır, plakalarda kaygan metalik parlama sağlar)
            const rCanvas = document.createElement('canvas');
            rCanvas.width = size;
            rCanvas.height = size;
            const rCtx = rCanvas.getContext('2d');
            // Zırh plakaları: düşük pürüzlülük (0.35 civarı parlak metalik yüzey)
            rCtx.fillStyle = '#555555';
            rCtx.fillRect(0, 0, size, size);
            // Derzler ve çizikler: daha yüksek pürüzlülük (mat endüstriyel kaynaklar)
            rCtx.strokeStyle = '#999999';
            rCtx.lineWidth = 3;
            for (let x = 0; x <= size; x += panelSize) {
                rCtx.beginPath();
                rCtx.moveTo(x, 0);
                rCtx.lineTo(x, size);
                rCtx.stroke();
            }
            for (let y = 0; y <= size; y += panelSize) {
                rCtx.beginPath();
                rCtx.moveTo(0, y);
                rCtx.lineTo(size, y);
                rCtx.stroke();
            }
            this.trenchRoughnessMap = new THREE.CanvasTexture(rCanvas);
            this.trenchRoughnessMap.wrapS = THREE.RepeatWrapping;
            this.trenchRoughnessMap.wrapT = THREE.RepeatWrapping;
            this.trenchRoughnessMap.repeat.set(12, 10);

            // 6. Prosedürel PBR Albedo / Panel Haritası (Star Wars Açık Uzay Grisi #a9b3bd ile Panel Çizgileri)
            const mapCanvas = document.createElement('canvas');
            mapCanvas.width = size;
            mapCanvas.height = size;
            const mCtx = mapCanvas.getContext('2d');
            // Zemin: #a9b3bd (açık uzay grisi)
            mCtx.fillStyle = '#a9b3bd';
            mCtx.fillRect(0, 0, size, size);

            // Modüler paneller arası hafif renk tonu farkı (Star Wars endüstriyel durasteel plakaları)
            for (let x = 0; x < size; x += panelSize) {
                for (let y = 0; y < size; y += panelSize) {
                    const tint = ((x / panelSize + y / panelSize) % 2 === 0) ? '#a2acb6' : '#b2bcc6';
                    mCtx.fillStyle = tint;
                    mCtx.fillRect(x + 2, y + 2, panelSize - 4, panelSize - 4);
                }
            }

            // Panel derz çizgileri (Koyu hatlar)
            mCtx.strokeStyle = '#757f8a';
            mCtx.lineWidth = 3;
            for (let x = 0; x <= size; x += panelSize) {
                mCtx.beginPath();
                mCtx.moveTo(x, 0);
                mCtx.lineTo(x, size);
                mCtx.stroke();
            }
            for (let y = 0; y <= size; y += panelSize) {
                mCtx.beginPath();
                mCtx.moveTo(0, y);
                mCtx.lineTo(size, y);
                mCtx.stroke();
            }

            // Erişim kapakları
            hatches.forEach(h => {
                mCtx.fillStyle = '#9aa4af';
                mCtx.fillRect(h.x, h.y, h.w, h.h);
                mCtx.strokeStyle = '#5d6772';
                mCtx.lineWidth = 2;
                mCtx.strokeRect(h.x, h.y, h.w, h.h);
            });

            // Perçinler
            mCtx.fillStyle = '#5c6670';
            for (let p = 0; p < size; p += panelSize) {
                for (let offset = 14; offset < panelSize; offset += 20) {
                    mCtx.beginPath();
                    mCtx.arc(p + offset, p + 8, 1.8, 0, Math.PI * 2);
                    mCtx.fill();
                    mCtx.beginPath();
                    mCtx.arc(p + 8, p + offset, 1.8, 0, Math.PI * 2);
                    mCtx.fill();
                }
            }

            this.trenchMap = new THREE.CanvasTexture(mapCanvas);
            this.trenchMap.wrapS = THREE.RepeatWrapping;
            this.trenchMap.wrapT = THREE.RepeatWrapping;
            this.trenchMap.repeat.set(12, 10);
            this.trenchMap.colorSpace = THREE.SRGBColorSpace;

            console.log('[Material] ✓ Star Wars panel çizgileri, perçinler, Albedo/Bump/Roughness Maps hazırlandı!');
        } catch (err) {
            console.error('[Material] Bump map oluşturma hatası:', err);
        }
    }

    /**
     * TIE Fighter İçin Yüksek Çözünürlüklü Prosedürel PBR Yüzey ve Güneş Paneli Dokuları:
     * - this.tieBumpMap: Fırçalanmış titanyum / durasteel mikro-çizikleri, zırh derz çizgileri ve perçinler.
     * - this.tieRoughnessMap: Parlak metalik yüzey (0.16 gloss) ve kaynak derzleri (0.35) ayrımı.
     * - this.tieSolarBumpMap: Star Wars altıgen kanat fotovoltaik hücre desenleri ve iletken mikro-hatlar.
     */
    createTieFighterTextures() {
        try {
            const size = 512;
            
            // 1. TIE Fighter Gövde ve İskelet Bump Map (Fırçalanmış Durasteel & Perçinler)
            const bCanvas = document.createElement('canvas');
            bCanvas.width = size;
            bCanvas.height = size;
            const bCtx = bCanvas.getContext('2d');
            bCtx.fillStyle = '#808080';
            bCtx.fillRect(0, 0, size, size);

            // Zırh plakaları ve derz çizgileri
            const pSize = 64;
            bCtx.lineWidth = 2;
            for (let x = 0; x <= size; x += pSize) {
                bCtx.strokeStyle = '#222222';
                bCtx.beginPath();
                bCtx.moveTo(x, 0);
                bCtx.lineTo(x, size);
                bCtx.stroke();

                bCtx.strokeStyle = '#cccccc';
                bCtx.lineWidth = 1;
                bCtx.beginPath();
                bCtx.moveTo(x + 1, 0);
                bCtx.lineTo(x + 1, size);
                bCtx.stroke();
                bCtx.lineWidth = 2;
            }
            for (let y = 0; y <= size; y += pSize) {
                bCtx.strokeStyle = '#222222';
                bCtx.beginPath();
                bCtx.moveTo(0, y);
                bCtx.lineTo(size, y);
                bCtx.stroke();

                bCtx.strokeStyle = '#cccccc';
                bCtx.lineWidth = 1;
                bCtx.beginPath();
                bCtx.moveTo(0, y + 1);
                bCtx.lineTo(size, y + 1);
                bCtx.stroke();
                bCtx.lineWidth = 2;
            }

            // Perçinler
            bCtx.fillStyle = '#333333';
            for (let p = 0; p < size; p += pSize) {
                for (let off = 10; off < pSize; off += 16) {
                    bCtx.beginPath();
                    bCtx.arc(p + off, p + 4, 1.2, 0, Math.PI * 2);
                    bCtx.fill();
                    bCtx.beginPath();
                    bCtx.arc(p + 4, p + off, 1.2, 0, Math.PI * 2);
                    bCtx.fill();
                }
            }

            // Fırçalanmış metal mikro-çizikleri (Brushed durasteel grain)
            const imgData = bCtx.getImageData(0, 0, size, size);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const noise = (Math.random() - 0.5) * 36;
                data[i] = Math.min(255, Math.max(0, data[i] + noise));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
            }
            bCtx.putImageData(imgData, 0, 0);

            this.tieBumpMap = new THREE.CanvasTexture(bCanvas);
            this.tieBumpMap.wrapS = THREE.RepeatWrapping;
            this.tieBumpMap.wrapT = THREE.RepeatWrapping;
            this.tieBumpMap.repeat.set(4, 4);

            // 2. TIE Fighter Roughness Map (Yüksek yansıtıcı parlak metal)
            const rCanvas = document.createElement('canvas');
            rCanvas.width = size;
            rCanvas.height = size;
            const rCtx = rCanvas.getContext('2d');
            rCtx.fillStyle = '#262626'; // ~0.15 pürüzlülük = kristal netliğinde ayna metal
            rCtx.fillRect(0, 0, size, size);

            rCtx.strokeStyle = '#555555';
            rCtx.lineWidth = 2;
            for (let x = 0; x <= size; x += pSize) {
                rCtx.beginPath();
                rCtx.moveTo(x, 0);
                rCtx.lineTo(x, size);
                rCtx.stroke();
            }
            for (let y = 0; y <= size; y += pSize) {
                rCtx.beginPath();
                rCtx.moveTo(0, y);
                rCtx.lineTo(size, y);
                rCtx.stroke();
            }

            this.tieRoughnessMap = new THREE.CanvasTexture(rCanvas);
            this.tieRoughnessMap.wrapS = THREE.RepeatWrapping;
            this.tieRoughnessMap.wrapT = THREE.RepeatWrapping;
            this.tieRoughnessMap.repeat.set(4, 4);

            // 3. TIE Solar Array Kanat Hücre Deseni (Fotovoltaik solar panel)
            const sCanvas = document.createElement('canvas');
            sCanvas.width = size;
            sCanvas.height = size;
            const sCtx = sCanvas.getContext('2d');
            sCtx.fillStyle = '#808080';
            sCtx.fillRect(0, 0, size, size);

            const grid = 32;
            sCtx.lineWidth = 1;
            sCtx.strokeStyle = '#181818';
            for (let x = 0; x <= size; x += grid) {
                sCtx.beginPath();
                sCtx.moveTo(x, 0);
                sCtx.lineTo(x, size);
                sCtx.stroke();
            }
            for (let y = 0; y <= size; y += grid) {
                sCtx.beginPath();
                sCtx.moveTo(0, y);
                sCtx.lineTo(size, y);
                sCtx.stroke();
            }
            // İletken mikro-çizgiler
            sCtx.strokeStyle = '#b8b8b8';
            for (let y = grid / 2; y <= size; y += grid) {
                sCtx.beginPath();
                sCtx.moveTo(0, y);
                sCtx.lineTo(size, y);
                sCtx.stroke();
            }

            this.tieSolarBumpMap = new THREE.CanvasTexture(sCanvas);
            this.tieSolarBumpMap.wrapS = THREE.RepeatWrapping;
            this.tieSolarBumpMap.wrapT = THREE.RepeatWrapping;
            this.tieSolarBumpMap.repeat.set(6, 6);

            console.log('[Material] ✓ TIE Fighter fırçalanmış çelik ve solar panel PBR dokuları hazırlandı!');
        } catch (err) {
            console.error('[Material] TIE dokuları oluşturma hatası:', err);
        }
    }

    /**
     * 1. TIE Fighter İçin Özelleştirilmiş Üst Düzey Metalik PBR Materyal Ayarları:
     * Siper duvarlarındaki açık griden (#a9b3bd / #8f8f8f) farklı ve daha koyu tonda:
     * - Gövde küresi, kanat pylon kolları, taşıyıcı iskelet kolları (spoke struts), çevre çerçevesi (rim)
     *   ve merkez göbek (hub): Lüks İmparatorluk Gunmetal Çeliği (#505c6d)
     *   metalness: 0.94, roughness: 0.16, envMapIntensity: 3.2, bumpMap: this.tieBumpMap
     * - Altıgen güneş paneli kanatları (Wings): Koyu Karbon/Titanyum (#242b35)
     *   metalness: 0.90, roughness: 0.20, envMapIntensity: 2.5, bumpMap: this.tieSolarBumpMap
     * - İkiz İyon Motoru Egzozları (Engines): Parlayan İmparatorluk Kırmızısı #ff2a2a (intensity: 3.0)
     * - Kokpit şeffaf kubbesi (glass/canopy) ve biyolojik sinek pilot organları korunur.
     */
    applyMetallicTieFighterMaterials(model) {
        if (!model) return;
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const name = (child.name || '').toLowerCase();

                // Düzgün normaller ve UV haritalaması
                if (child.geometry) {
                    if (child.geometry.index) {
                        child.geometry = child.geometry.toNonIndexed();
                    }
                    child.geometry.computeVertexNormals();
                    if (!child.geometry.attributes.uv) {
                        const pos = child.geometry.attributes.position;
                        if (pos) {
                            const uvs = new Float32Array(pos.count * 2);
                            for (let i = 0; i < pos.count; i++) {
                                const y = pos.getY(i);
                                const z = pos.getZ(i);
                                uvs[i * 2] = (y + 8) / 16;
                                uvs[i * 2 + 1] = (z + 8) / 16;
                            }
                            child.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                            child.geometry.attributes.uv.needsUpdate = true;
                        }
                    }
                }

                // 1. Şeffaf kokpit camını koru (Biyo-sinek pilotun net görünmesi için)
                if (name.includes('glass') || name.includes('canopy')) {
                    if (child.material) {
                        child.material.transparent = true;
                        child.material.opacity = 0.22;
                        child.material.depthWrite = false;
                        child.material.envMap = this.envMap;
                        child.material.envMapIntensity = 0.8;
                        child.material.needsUpdate = true;
                    }
                    return;
                }

                // 2. Biyolojik sinek pilotu organlarını koru
                if (name.includes('eye') || name.includes('thorax') || name.includes('abdomen') ||
                    name.includes('wing_fly') || name.includes('holo')) {
                    return;
                }

                // Kokpit içi biyo-pilot kaidesi / koltuğu
                if (name.includes('seat')) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x242a32,
                        roughness: 0.28,
                        metalness: 0.85,
                        envMap: this.envMap,
                        envMapIntensity: 1.8
                    });
                    return;
                }

                // 3. İkiz İyon Motoru Egzozları (Kırmızı İmparatorluk İtki Işıltısı)
                if (name.includes('engine') && !name.includes('block') && !name.includes('nozzle')) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x110000,
                        emissive: 0xff1e1e,       // Parlak İmparatorluk Kırmızı (#ff1e1e)
                        emissiveIntensity: 3.5,
                        roughness: 0.20,
                        metalness: 0.85,
                        envMap: this.envMap,
                        envMapIntensity: 1.2
                    });
                    return;
                }

                // 4. Altıgen Güneş Paneli Plakaları (Koyu Karbon / Fotovoltaik Solar Hücreler)
                // Sadece ana kanat plakaları (metalik iskelet kolları ve çerçeveler hariç)
                if ((name === 'left_wing' || name === 'right_wing') && !name.includes('strut') && !name.includes('rim') && !name.includes('hub')) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x14181f,          // Koyu Karbon/Fotovoltaik Siyah Paneller
                        roughness: 0.58,          // Dağınık mikro-ızgara yutuculuğu
                        metalness: 0.28,          // Fotovoltaik hücre yarı-iletkenliği
                        bumpMap: this.tieSolarBumpMap,
                        bumpScale: 0.04,
                        envMap: this.envMap,
                        envMapIntensity: 0.6,
                        side: THREE.DoubleSide
                    });
                    return;
                }

                // 5. Ana Gövde Küresi, Kanat Pylon Kolları, İskelet Kolları (Struts), Çerçeveler (Rims),
                // Merkez Göbek (Hub), Motor Bloğu ve Egzoz Çerçeveleri
                // (İkonik İmparatorluk Battleship/Durasteel Çeliği #8fa0b2)
                child.material = new THREE.MeshPhysicalMaterial({
                    color: 0x8fa0b2,              // İkonik İmparatorluk Battleship Çeliği (#8fa0b2)
                    roughness: 0.22,              // Pürüzsüz metalik yüzey = keskin ve göz alıcı specular parlamalar
                    metalness: 0.88,              // Yüksek metalik iletkenlik
                    clearcoat: 0.35,              // Zırh üstü metalik cila/gleam
                    clearcoatRoughness: 0.18,
                    envMap: this.envMap,
                    envMapIntensity: 2.4,         // Dinamik uzay ve nebula yansımaları
                    bumpMap: this.tieBumpMap,
                    bumpScale: 0.03,
                    roughnessMap: this.tieRoughnessMap,
                    side: THREE.DoubleSide
                });
            }
        });
        console.log('[Material] ✓ TIE Fighter gerçekçi İmparatorluk Durasteel (#8fa0b2) MeshPhysicalMaterial ve fotovoltaik solar paneller uygulandı!');
    }

    /**
     * GLTF Siper (Trench) Modelleri İçin Metalik Açık Gri PBR Kaplama ve
     * Mavi -> İmparatorluk Kırmızısı (#ff2a2a) Vurgu Renkleri Değişimi.
     * 2. Fiziksel PBR Materyal Ayarları:
     * - color: #a9b3bd (duvar açık uzay grisi), #8f8f8f (zemin)
     * - metalness: 0.85 - 0.88 (Yüksek yansıtıcılık)
     * - roughness: 0.35 - 0.40 (Işık parlamaları yüzeyde süzülsün)
     * - envMapIntensity: 1.8 (Belirgin metalik yansıma gücü)
    /**
    /**
     * Kahraman X-Wing (Red Five) Metalik Kırık Beyaz/Platin PBR Kaplama (TIE Fighter Referansı):
     * TIE Fighter'ın çalışan MeshStandardMaterial, envMap, metalness (0.88) ve roughness (0.22)
     * yapılandırması birebir kopyalanmış, renk kırık beyaz/platin (#e8eaed) olarak ayarlanmıştır.
     * SADECE preloadAllAssets() aşamasında 1 KEZ asenkron çalışır, render döngüsünde asla çağrılmaz.
     */
    applyMetallicXWingMaterials(model) {
        if (!model) return;
        const targetEnv = this.envMap || this.scene.environment;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const name = (child.name || '').toLowerCase();

                // Düzgün normaller hesaplama
                if (child.geometry) {
                    if (child.geometry.index) {
                        child.geometry = child.geometry.toNonIndexed();
                    }
                    child.geometry.computeVertexNormals();
                }

                // 1. Şeffaf kokpit camını koru (Biyo-sinek pilotun net görünmesi için)
                if (name.includes('glass') || name.includes('canopy')) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x93c5fd,
                        opacity: 0.22,
                        transparent: true,
                        roughness: 0.08,
                        metalness: 0.15,
                        envMap: targetEnv,
                        envMapIntensity: 0.8,
                        depthWrite: false
                    });
                    return;
                }

                // 2. Biyolojik sinek pilotu organlarını koru
                if (name.includes('eye') || name.includes('thorax') || name.includes('abdomen') ||
                    name.includes('wing_fly') || name.includes('holo')) {
                    return;
                }

                // 3. İkonik Red Five kırmızı filo vurguları / şeritleri
                if (name.includes('stripe') || name.includes('intake') || name.includes('ring')) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0xef4444,
                        emissive: 0xb91c1c,
                        emissiveIntensity: 0.85,
                        roughness: 0.32,
                        metalness: 0.55,
                        envMap: targetEnv,
                        envMapIntensity: 1.4
                    });
                    return;
                }

                // 4. İyon Motoru Egzozları
                if (name.includes('engine') || name.includes('glow')) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x110000,
                        emissive: 0xff4500,
                        emissiveIntensity: 3.5,
                        roughness: 0.20,
                        metalness: 0.85,
                        envMap: targetEnv,
                        envMapIntensity: 1.2
                    });
                    return;
                }

                // 5. Taim & Bak Lazer Namluları
                if (name.includes('cannon') || name.includes('barrel') || name.includes('probe')) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x1e293b,
                        roughness: 0.25,
                        metalness: 0.90,
                        envMap: targetEnv,
                        envMapIntensity: 1.8
                    });
                    return;
                }

                // 6. Ana Gövde ve Kanatlar (TIE Fighter referansı, koyu çelik yerine kırık beyaz/platin #e8eaed)
                child.material = new THREE.MeshStandardMaterial({
                    color: 0xe8eaed,
                    roughness: 0.22,
                    metalness: 0.88,
                    envMap: targetEnv,
                    envMapIntensity: 2.2,
                    side: THREE.DoubleSide
                });

                if (child.material) {
                    child.material.needsUpdate = true;
                }
            }
        });

        console.log('[HeroXWing] ✨ X-Wing metalik kırık beyaz/platin (#e8eaed) kaplama TIE Fighter referansıyla uygulandı!');
    }

    applyMetallicTrenchMaterials(model) {
        if (!model) return;
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Modelde UV koordinatları eksikse ve pürüzsüz yüzey normalleri için unindex & UV üret
                if (child.geometry) {
                    if (child.geometry.index) {
                        child.geometry = child.geometry.toNonIndexed();
                        child.geometry.computeVertexNormals();
                    }
                    if (!child.geometry.attributes.uv) {
                        const pos = child.geometry.attributes.position;
                        if (pos) {
                            const uvs = new Float32Array(pos.count * 2);
                            for (let i = 0; i < pos.count; i++) {
                                const x = pos.getX(i);
                                const y = pos.getY(i);
                                const z = pos.getZ(i);
                                if (child.name.includes('floor')) {
                                    uvs[i * 2] = (x + 58) / 116;
                                    uvs[i * 2 + 1] = (z + 60) / 120;
                                } else {
                                    uvs[i * 2] = (z + 60) / 120;
                                    uvs[i * 2 + 1] = y / 110;
                                }
                            }
                            child.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                            child.geometry.attributes.uv.needsUpdate = true;
                        }
                    }
                }

                // 2. Mavi kaplamaları ve emissive materyalleri tespit edip İmparatorluk Kırmızısına (#ff2a2a) çevir
                const origMat = child.material;
                const isBlueAccent = (
                    child.name.includes('rail') ||
                    child.name.includes('conduit') ||
                    child.name.includes('strip') ||
                    child.name.includes('blue') ||
                    child.name.includes('cyan') ||
                    (origMat && origMat.color && (origMat.color.b > origMat.color.r + 0.12)) ||
                    (origMat && origMat.emissive && (origMat.emissive.b > origMat.emissive.r + 0.12))
                );

                if (isBlueAccent) {
                    // Siper içi kırmızı imparatorluk kılavuz rayları / vurguları (#ff2a2a)
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x1f1414,
                        emissive: 0xff2a2a,       // İmparatorluk Kırmızısı (#ff2a2a)
                        emissiveIntensity: 0.85,  // Belirgin kırmızı ışıltı
                        roughness: 0.35,
                        metalness: 0.85,
                        envMap: this.envMap,
                        envMapIntensity: 1.5
                    });
                } else if (child.name.includes('floor') || child.name.includes('dock')) {
                    // Zemin için 8F8F8F HTML renk kodu - Yüksek Metalik
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x8f8f8f,       // Zemin: #8F8F8F
                        map: this.trenchMap,   // Endüstriyel zemin panelleri
                        metalness: 0.88,       // Yüksek metalik hissiyat
                        roughness: 0.40,       // Endüstriyel mat metal yansıması
                        envMap: this.envMap,
                        envMapIntensity: 1.6,
                        bumpMap: this.trenchBumpMap,
                        bumpScale: 0.10,
                        roughnessMap: this.trenchRoughnessMap
                    });
                } else if (!child.name.includes('glass') && !child.name.includes('canopy')) {
                    // Duvarlar: #a9b3bd (açık uzay grisi), metalness: 0.85, roughness: 0.35, envMapIntensity: 1.8
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0xa9b3bd,       // #a9b3bd (açık uzay grisi)
                        map: this.trenchMap,   // Panel çizgileri, modüler durasteel zırh plakaları
                        metalness: 0.85,       // Yüksek yansıtıcılık (0.85)
                        roughness: 0.35,       // Işık parlamaları yüzeyde süzülen semi-gloss PBR (0.35)
                        envMap: this.envMap,
                        envMapIntensity: 1.8,  // 1.5 - 2.0 yansıma gücü
                        bumpMap: this.trenchBumpMap,
                        bumpScale: 0.15,       // Panel çizgileri, perçinler, endüstriyel kabartı
                        roughnessMap: this.trenchRoughnessMap
                    });
                }
            }
        });
    }

    setupLights() {
        // 1. Modellerin siluet olmasını önleyen, her yeri dengeli aydınlatan AmbientLight (0.85)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        this.scene.add(this.ambientLight);

        // 2. Sağ taraftan açılı vuran, metalik duvarlarda tatmin edici specular highlight çıkaran DirectionalLight
        this.dirLight = new THREE.DirectionalLight(0xf0f6ff, 2.0);
        this.dirLight.position.set(35, 85, 35);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 1024;
        this.dirLight.shadow.mapSize.height = 1024;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 350;
        this.dirLight.shadow.camera.left = -80;
        this.dirLight.shadow.camera.right = 80;
        this.dirLight.shadow.camera.top = 80;
        this.dirLight.shadow.camera.bottom = -80;
        this.dirLight.shadow.bias = -0.0005;
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);

        // 3. Sol taraftan karşı açı DirectionalLight (Her iki duvarın da dengeli metalik parlamasını sağlar)
        this.fillLight = new THREE.DirectionalLight(0xdbeafe, 1.8);
        this.fillLight.position.set(-35, 80, 25);
        this.scene.add(this.fillLight);
        this.scene.add(this.fillLight.target);

        // 4. Kamera Feneri (Kameranın baktığı yöne vuran sinematik dolgu ışığı)
        this.camLight = new THREE.DirectionalLight(0xe2e8f0, 1.2);
        this.camLight.position.set(0, 3, 0);
        this.camLight.target.position.set(0, 0, -50);
        this.camera.add(this.camLight);
        this.camera.add(this.camLight.target);
        this.scene.add(this.camera);

        // 5. İmparatorluk atmosferik nokta ışıkları (Pastel gül & İmparatorluk kırmızısı)
        const pointRose = new THREE.PointLight(0xf472b6, 0.5, 90);
        pointRose.position.set(-20, 10, 40);
        this.scene.add(pointRose);

        const pointSky = new THREE.PointLight(0xff2a2a, 0.6, 90); // İmparatorluk kırmızı atmosfer ışığı (#ff2a2a)
        pointSky.position.set(20, 10, 40);
        this.scene.add(pointSky);
    }

    connectWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

        console.log(`[WebSocket] Bağlanılıyor: ${wsUrl}`);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('[WebSocket] ✓ Canlı SNN Sinek Beynine Bağlanıldı!');
            const statusEl = document.getElementById('val-ws-status');
            if (statusEl) {
                statusEl.innerText = 'BAĞLI (60 Hz)';
                statusEl.style.color = '#00ff66';
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.latestData = data;

                // İZAFI HIZ EŞİTLEMESİ (WebSocket anlık mikro-senkronizasyonu):
                // Telemetri paketi ulaştığı mikrosaniyede hedef Z koordinatını gemiyle birebir kilitler
                if (this.isFinaleActive && this.deathStarHp > 0 && data.ship) {
                    const distanceToTarget = this.finalTargetZ - data.ship.z;
                    if (this.isVelocitySynced || distanceToTarget <= this.firingRange) {
                        this.isVelocitySynced = true;
                        this.finalTargetZ = data.ship.z + this.firingRange;
                        this.exhaustPort.updatePosition(this.finalTargetZ);
                        this.trench.updateFinalePosition(this.finalTargetZ);
                    }
                }

                try {
                    const currentBrain = this.getCurrentBrainTelemetry();
                    this.updateHUD(currentBrain.fullData);
                } catch (hudErr) {
                    console.warn('[HUD Error]', hudErr);
                }

                // PROBOSCIS EXTENSION REFLEX (PER) İLE TORPİDO VE LAZER ATEŞLEME:
                // Sinek hedefin tam üstüne gelip besini tatmaya/ısırmaya çalıştığında WebSocket üzerinden
                // motor komut ulaşır ve Kahraman X-Wing ikiz proton torpidolarını fırlatır!
                // ZOMBİ SİNEK KORUMASI: Eğer X-Wing imha edilmişse (isAlive = false) hortum uzatma sinyalleri KESİNLİKLE yoksayılır!
                if (data.neural && data.neural.proboscis_trigger) {
                    if (!this.isPlayerAlive || (this.playerShip && !this.playerShip.isAlive) || this.isGameOver) {
                        console.warn('[ZOMBIE FLY PREVENTED] Ölü X-Wing torpido ateşleyemez! Python PER sinyali yoksayıldı.');
                    } else if (this.isFinaleActive && this.deathStarHp > 0 && !this.torpedoes.isFired) {
                        this.fireProtonTorpedoes();
                    }
                }
                // SNN Sineğin hortum/bacak refleksiyle öndeki hedeflere karşı lazer karşı saldırısı:
                if (data.neural && data.neural.tie_fire_laser) {
                    if (!this.isPlayerAlive || (this.playerShip && !this.playerShip.isAlive) || this.isGameOver) {
                        console.warn('[ZOMBIE FLY PREVENTED] Ölü X-Wing lazer ateşleyemez! Sinyal yoksayıldı.');
                    } else {
                        this.fireHeroLasers();
                    }
                }
            } catch (e) {
                console.error('[WS Parse Hatası]', e);
            }
        };

        this.ws.onclose = () => {
            console.warn('[WebSocket] Bağlantı koptu, yeniden deneniyor...');
            const statusEl = document.getElementById('val-ws-status');
            if (statusEl) {
                statusEl.innerText = 'KOPTU (Yenileniyor)';
                statusEl.style.color = '#ff1133';
            }
            setTimeout(() => this.connectWebSocket(), 1500);
        };
    }

    handleFinaleButton() {
        if (!this.isFinaleActive) {
            // Aşama 1: Hedefe Kilitlen ve Taarruz Koşusunu Başlat (<1ms Sıfır Gecikme)
            this.triggerFinale();
        } else if (this.isFinaleActive && this.deathStarHp > 0 && !this.torpedoes.isFired) {
            // Aşama 2: Proton Torpidolarını Ateşle!
            this.fireProtonTorpedoes();
        } else if (this.finalePhase === 3) {
            // Aşama 3: Ölüm Yıldızı Yok Edildi, Tekrar Başlat
            this.restartGame();
        }
    }

    triggerFinale(customTargetZ = null) {
        if (this.isFinaleActive) return;
        this.isFinaleActive = true;
        this.isVelocitySynced = false;
        this.finalePhase = 1;
        this.deathStarHp = this.deathStarMaxHp;

        const shipZ = (this.latestData && this.latestData.ship) ? this.latestData.ship.z : 0;
        this.finalTargetZ = (typeof customTargetZ === 'number' && !isNaN(customTargetZ)) ? customTargetZ : (shipZ + 140.0);

        // 1. ÖNCEDEN YÜKLENEN MODELLERİ GÖRÜNÜR KIL (Sıfır Thread Tıkanması / Sıfır Yükleme Freeze):
        // Death Star İstasyonunu göster ve hizala
        try {
            if (this.deathStar) {
                this.deathStar.setSpawned(true);
                this.deathStar.update(shipZ, 0, true, this.finalTargetZ);
            }
        } catch (e) {
            console.warn('[FINALE RECOVERY] Death Star spawn uyarısı:', e);
        }

        // Siper Terminus Duvarını göster ve hizala
        try {
            if (this.trench?.startFinale) {
                this.trench.startFinale(this.finalTargetZ);
            }
        } catch (e) {
            console.warn('[FINALE RECOVERY] Trench Terminus uyarısı:', e);
        }

        // Termal Egzoz Çukurunu göster ve TIE Fighter'ın hizasına yerleştir
        try {
            if (this.exhaustPort?.spawnFinale) {
                this.exhaustPort.spawnFinale(this.finalTargetZ);
            }
        } catch (e) {
            console.warn('[FINALE RECOVERY] Exhaust Port spawn uyarısı:', e);
        }

        // 2. HUD ve Arayüz Durum Geçişleri
        try {
            const survivalHud = document.getElementById('survival-hud');
            if (survivalHud) survivalHud.style.display = 'none';

            const bossHud = document.getElementById('boss-hud');
            if (bossHud) bossHud.style.display = 'block';
            this.updateBossHpUI();

            const banner = document.getElementById('banner-finale');
            if (banner) {
                banner.innerText = '🎯 HEDEF: TERMAL EGZOZ DELİĞİ // ARKADA: ÖLÜM YILDIZI İSTASYONU';
                banner.style.display = 'block';
                banner.style.color = '#00f0ff';
                banner.style.borderColor = '#00f0ff';
            }

            const crosshair = document.getElementById('hud-crosshair');
            if (crosshair) {
                crosshair.style.borderColor = '#ff00aa';
                crosshair.style.boxShadow = '0 0 25px #ff00aa';
            }
        } catch (e) {
            console.warn('[FINALE RECOVERY] HUD güncelleme uyarısı:', e);
        }

        // 3. Hedef Kilitleme Sesi
        try {
            if (this.targetLockSound) {
                if (this.targetLockSound.isPlaying) this.targetLockSound.stop();
                this.targetLockSound.play();
            }
        } catch (e) {}

        // 4. Buton Arayüzü: "🚀 TORPİDO ATEŞLE [5/5] (F)"
        try {
            const btn = document.getElementById('btn-finale');
            if (btn) {
                btn.innerText = `🚀 TORPİDO ATEŞLE [${this.deathStarHp}/${this.deathStarMaxHp}] (F)`;
                btn.classList.add('ready-to-fire');
                btn.style.opacity = '1.0';
                btn.setAttribute('title', `İkiz Proton Torpidolarını Ateşle (Kalan Can: ${this.deathStarHp}, Tuş: F)`);
            }
        } catch (e) {}

        console.log(`[FINALE] 🎯 triggerFinale() <1ms sıfır gecikmeyle aktifleştirildi! Kalkan: ${this.deathStarHp}/${this.deathStarMaxHp}, Hedef Z=${this.finalTargetZ.toFixed(1)}`);
    }

    startFinaleSequence(customTargetZ = null) {
        return this.triggerFinale(customTargetZ);
    }

    fireProtonTorpedoes() {
        // ZOMBİ SİNEK KORUMASI: İmha edilmiş bir X-Wing KESİNLİKLE torpido ateşleyemez!
        if (!this.isPlayerAlive || (this.playerShip && !this.playerShip.isAlive) || this.isGameOver) {
            console.warn('[ZOMBIE FLY PREVENTED] X-Wing imha edilmiş! Ölü gemi torpido ateşleyemez!');
            return;
        }
        if (!this.isFinaleActive || this.deathStarHp <= 0 || this.torpedoes.isFired) return;
        this.finalePhase = 2;

        const ship = this.latestData.ship;
        const exhaustY = (this.exhaustPort && this.exhaustPort.group) ? this.exhaustPort.group.position.y : 12.0;
        const targetPos = { x: 0, y: exhaustY, z: this.finalTargetZ };
        const bt = (this.latestData && this.latestData.boss_targeting) ? this.latestData.boss_targeting : {};
        const accuracy = (typeof bt.accuracy_pct === 'number') ? (bt.accuracy_pct / 100.0) : 0.55;

        this.torpedoes.fire(ship, targetPos, {
            accuracy: accuracy,
            isAimLocked: bt.is_locked,
            alignmentError: 1.0 - (bt.aim_lock_ratio || 0.4)
        });

        // Ses çal
        try {
            if (this.torpedoSound) {
                if (this.torpedoSound.isPlaying) this.torpedoSound.stop();
                this.torpedoSound.play();
            }
        } catch (e) {
            console.warn('[Audio] Torpido sesi çalınamadı:', e);
        }

        // Banner göster
        const probBanner = document.getElementById('banner-proboscis');
        if (probBanner) {
            probBanner.style.display = 'block';
            setTimeout(() => { probBanner.style.display = 'none'; }, 2800);
        }

        // Buton Arayüzünü Güncelle: "💥 HEDEFE GİDİYOR [X/5]..."
        const btn = document.getElementById('btn-finale');
        if (btn) {
            btn.innerText = `💥 HEDEFE GİDİYOR [${this.deathStarHp}/${this.deathStarMaxHp}]...`;
            btn.classList.remove('ready-to-fire');
            btn.style.opacity = '0.85';
        }

        console.log(`👅 [PROBOSCIS REFLEX] Sinek hortumunu uzatarak besine hamle yaptı -> İKİZ PROTON TORPİDOLARI ATEŞLENDİ! (Kalan HP: ${this.deathStarHp}, İsabet Yeteneği: %${(accuracy*100).toFixed(0)})`);
    }

    onTorpedoMiss(pos, lateralDist) {
        this.cameraTrauma = 0.8;

        try {
            if (this.damageSound) {
                if (this.damageSound.isPlaying) this.damageSound.stop();
                this.damageSound.play();
            }
        } catch (e) {}

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'torpedo_miss',
                lateral_dist: lateralDist
            }));
        }

        const finaleBanner = document.getElementById('banner-finale');
        if (finaleBanner) {
            finaleBanner.innerText = `⚠️ TORPİDO ISKA GEÇTİ (${lateralDist.toFixed(1)}m)! SİNEK HİZALAMAYI DÜZELTİYOR...`;
            finaleBanner.style.display = 'block';
            finaleBanner.style.color = '#ff3344';
            finaleBanner.style.borderColor = '#ff3344';
        }

        const btn = document.getElementById('btn-finale');
        if (btn) {
            btn.innerText = `⚠️ ISKA GEÇTİ! [${this.deathStarHp}/${this.deathStarMaxHp}]`;
            btn.classList.remove('ready-to-fire');
        }

        // 1.2 saniye sonra yeni atış için torpidoları hazırla
        setTimeout(() => {
            if (this.isFinaleActive && this.deathStarHp > 0) {
                this.torpedoes.readyForNextSalvo();
                this.finalePhase = 1;
                if (btn) {
                    btn.innerText = `🚀 TORPİDO ATEŞLE [${this.deathStarHp}/${this.deathStarMaxHp}] (F)`;
                    btn.classList.add('ready-to-fire');
                }
                if (finaleBanner) {
                    finaleBanner.innerText = `🎯 HEDEF KİLİTLENDİ: TERMAL EGZOZ DELİĞİ (LC10a OTO-KİLİTLEME AKTİF)!`;
                    finaleBanner.style.color = '#00f0ff';
                    finaleBanner.style.borderColor = '#00f0ff';
                }
            }
        }, 1200);

        console.log(`⚠️ [MISS] Torpido Dış Kalkana Çarptı / Iska Geçti! Sapma: ${lateralDist.toFixed(2)}m`);
    }

    onTorpedoImpact(pos) {
        // ZOMBİ SİNEK KORUMASI: X-Wing hayatta değilse Death Star hasar alamaz ve bölüm kazanılamaz!
        if (!this.isPlayerAlive || (this.playerShip && !this.playerShip.isAlive) || this.isGameOver) {
            console.warn('[ZOMBIE FLY PREVENTED] Ölü X-Wing torpidosu reaktöre hasar veremez!');
            return;
        }

        if (this.deathStarHp > 1) {
            // ARA DARBE (1-4): Kalkan 1 azalır, ara reaktör patlaması, dopamin ödülü, torpidolar yeniden yüklenir!
            this.deathStarHp--;
            this.updateBossHpUI();

            // 1. Reaksiyon Patlaması (350 Parçacıklı Ara Patlama) & Ölüm Yıldızı Flaş Efekti
            this.exhaustPort.triggerHitExplosion(pos);
            this.deathStar.triggerHitFlash();

            // 2. Kamera Sarsıntısı
            this.cameraTrauma = 1.0;

            // 3. Darbe & Dopamin Sesi
            try {
                if (this.damageSound) {
                    if (this.damageSound.isPlaying) this.damageSound.stop();
                    this.damageSound.play();
                }
                if (this.dopamineSound) {
                    this.dopamineSound.play();
                }
            } catch (e) {
                console.warn('[Audio] Darbe sesi hatası:', e);
            }

            // 4. WebSocket üzerinden Python SNN'e Ara Darbe Bildirimi (+40 mV Dopamin)
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'torpedo_hit',
                    hp: this.deathStarHp
                }));
            }

            // 5. Banner & Buton Güncellemesi
            const finaleBanner = document.getElementById('banner-finale');
            if (finaleBanner) {
                finaleBanner.innerText = `💥 REAKTÖR ÇEKİRDEĞİNE DARBE! KALKAN: ${this.deathStarHp} / ${this.deathStarMaxHp}`;
                finaleBanner.style.display = 'block';
                finaleBanner.style.color = '#ffaa00';
                finaleBanner.style.borderColor = '#ffaa00';
            }

            const btn = document.getElementById('btn-finale');
            if (btn) {
                btn.innerText = `⏳ ŞARJ OLUYOR [${this.deathStarHp}/${this.deathStarMaxHp}]...`;
                btn.classList.remove('ready-to-fire');
            }

            // 1.2 saniye sonra yeni salvo için torpidoları sıfırla ve yeniden kilitlen
            setTimeout(() => {
                if (this.isFinaleActive && this.deathStarHp > 0) {
                    this.torpedoes.readyForNextSalvo();
                    this.finalePhase = 1;
                    if (btn) {
                        btn.innerText = `🚀 TORPİDO ATEŞLE [${this.deathStarHp}/${this.deathStarMaxHp}] (F)`;
                        btn.classList.add('ready-to-fire');
                        btn.style.opacity = '1.0';
                        btn.setAttribute('title', `İkiz Proton Torpidolarını Ateşle (Kalan: ${this.deathStarHp}, Tuş: F)`);
                    }
                    if (finaleBanner) {
                        finaleBanner.innerText = `🎯 HEDEF KİLİTLENDİ: TERMAL EGZOZ DELİĞİ (LC10a OTO-KİLİTLEME AKTİF)!`;
                        finaleBanner.style.color = '#00f0ff';
                        finaleBanner.style.borderColor = '#00f0ff';
                    }
                }
            }, 1200);

            console.log(`💥 [HIT] Proton Torpidoları Reaktör Kalkanını Vurdu! Kalan Can: ${this.deathStarHp}/${this.deathStarMaxHp}`);
            return;
        }

        // SON DARBE (5. Atış): Ölüm Yıldızı Çöküşü (Süpernova)
        this.deathStarHp = 0;
        this.updateBossHpUI();
        this.finalePhase = 3;
        this.deathStar.triggerHitFlash();

        // 1. Ekranı Kaplayan Kör Edici Beyaz Işık Flaşı
        const flashEl = document.getElementById('white-flash');
        if (flashEl) {
            flashEl.style.opacity = '1.0';
            setTimeout(() => {
                flashEl.style.opacity = '0.0';
            }, 300);
        }

        // 2. Kamera Sarsıntısı (Devasa Cinematic Supernova Shake)
        this.cameraTrauma = 2.0;

        // 3. Devasa Parçacık Patlaması (Three.js ParticleSystem)
        this.exhaustPort.triggerEpicExplosion(pos);

        // 4. İkonik Ölüm Yıldızı Patlama Ses Efekti (AudioListener)
        try {
            if (this.deathStarExplosionSound) {
                if (this.deathStarExplosionSound.isPlaying) this.deathStarExplosionSound.stop();
                this.deathStarExplosionSound.play();
            }
            if (this.dopamineSound) {
                this.dopamineSound.play();
            }
        } catch (e) {
            console.warn('[Audio] Patlama sesi çalınamadı:', e);
        }

        // 5. Python Arka Planına Dopamin & Zafer Sinyali İlet (+100 mV Dopamin Patlaması)
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'death_star_destroyed' }));
        }

        // 6. HUD Zafer Bannerı ve Nöral Ödül
        const victoryBanner = document.getElementById('banner-victory');
        if (victoryBanner) victoryBanner.style.display = 'block';

        const finaleBanner = document.getElementById('banner-finale');
        if (finaleBanner) finaleBanner.style.display = 'none';

        if (this.latestData && this.latestData.neural) {
            this.latestData.neural.dopamine_mv = 100.0;
            if (this.latestData.learning) {
                this.latestData.learning.score = 1000.0;
                this.latestData.learning.level = 5;
                this.latestData.learning.level_title = 'Seviye 5: Sith Lordu Drosophila';
                this.latestData.learning.progress_pct = 100.0;
            }
            this.updateHUD(this.latestData);
        }

        this.isVictory = true;

        // 7. 2.2 Saniye Sonra Tam Ekran Game Over & Zafer Ekranını Göster
        setTimeout(() => {
            this.showGameOverModal(true);
        }, 2200);

        // 8. Buton Arayüzünü Güncelle: "🔄 YENİDEN BAŞLAT (F)"
        const btn = document.getElementById('btn-finale');
        if (btn) {
            btn.innerText = '🔄 YENİDEN BAŞLAT (F)';
            btn.classList.remove('ready-to-fire');
            btn.style.opacity = '1.0';
            btn.style.background = 'rgba(0, 255, 102, 0.35)';
            btn.style.borderColor = '#00ff66';
            btn.style.color = '#ffffff';
            btn.setAttribute('title', 'Simülasyonu Yeniden Başlat (Tuş: F veya R)');
        }

        console.log('💥 [SUPERNOVA] ÖLÜM YILDIZI İMHA EDİLDİ! REAKTÖR ÇÖKTÜ! NİHAİ DOPAMİN ÖDÜLÜ (+100 mV)!');
    }

    onXWingDestroyed(agentId, reason) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'enemy_destroyed', id: agentId, reason: reason }));
        }

        // 1. Fiziksel Temas / Gövde Çarpışması (Box3 Kesişimi)
        if (reason === 'tie_physical_collision' || reason === 'tie_frontal_crash') {
            this.onLaserHit();
            const banner = document.getElementById('banner-xwing-overtake') || document.getElementById('banner-xwing-threat');
            if (banner) {
                banner.innerText = '💥 [GÖVDE ÇARPIŞMASI] X-Wing ile Çarpıştın! 1 HP X-Wing Patladı, TIE Hasar Aldı!';
                banner.style.display = 'block';
                banner.style.color = '#ef4444';
                setTimeout(() => { banner.style.display = 'none'; }, 2600);
            }
            return;
        }

        // 2. TIE Fighter Lazer İsabeti (Düşman Vuruldu - Ödül)
        if (reason === 'tie_laser_hit') {
            try {
                if (this.dopamineSound) {
                    if (this.dopamineSound.isPlaying) this.dopamineSound.stop();
                    this.dopamineSound.play();
                }
            } catch (e) {}

            if (this.latestData && this.latestData.neural) {
                this.latestData.neural.dopamine_mv = Math.min(100.0, (this.latestData.neural.dopamine_mv || 0) + 25.0);
                this.updateHUD(this.latestData);
            }

            const banner = document.getElementById('banner-xwing-destroyed');
            if (banner) {
                banner.innerText = '🎯 DÜŞMAN X-WING LAZERLE VURULDU VE İMHA EDİLDİ! (+25 mV Dopamin Ödülü)';
                banner.style.display = 'block';
                banner.style.color = '#00ff88';
                setTimeout(() => { banner.style.display = 'none'; }, 2400);
            }
            return;
        }

        // 3. Fıçı Tonosu Şok Dalgası veya Siper Duvarı Çarpışması
        const banner = document.getElementById('banner-xwing-destroyed');
        if (banner) {
            banner.innerText = '💥 1 HP KURALI: DÜŞMAN TIE FIGHTER İMHA EDİLDİ! (DUVAR ÇARPIŞMASI / FIÇI TONOSU GİRDABI)';
            banner.style.display = 'block';
            banner.style.color = '#ffcc00';
            setTimeout(() => { banner.style.display = 'none'; }, 2200);
        }
    }

    onTieDestroyed(agentId, reason = 'xwing_laser_hit') {
        console.log(`[Combat] 💥 Düşman TIE Fighter İmha Edildi: ${agentId} (${reason})`);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'enemy_destroyed',
                id: agentId,
                reason: reason
            }));
        }

        const banner = document.getElementById('banner-xwing-destroyed');
        if (banner) {
            banner.innerText = `💥 1 HP KURALI: DÜŞMAN TIE FIGHTER İMHA EDİLDİ! (${reason === 'xwing_laser_hit' ? 'X-WING LAZER İSABETİ' : 'DUVAR ÇARPIŞMASI'})`;
            banner.style.display = 'block';
            setTimeout(() => { banner.style.display = 'none'; }, 2400);
        }
    }

    onXWingDestroyed(agentId, reason) {
        this.onTieDestroyed(agentId, reason);
    }

    fireHeroLasers() {
        const now = performance.now();
        if (now - this.lastHeroLaserFireTime < 240) return; // 240ms atış aralığı
        this.lastHeroLaserFireTime = now;
        this.lastTieLaserFireTime = now;

        const ship = (this.latestData && this.latestData.ship) ? this.latestData.ship : { x: 0, y: 32, z: 0 };
        const shipPos = new THREE.Vector3(ship.x, ship.y, ship.z);

        // Kahraman X-Wing Dörtlü Kanat Ucu Lazer Namluları (S-Foil Tips)
        const muzzles = [
            new THREE.Vector3(-4.8, 1.25, 2.8),
            new THREE.Vector3(4.8, 1.25, 2.8),
            new THREE.Vector3(-4.8, -1.25, 2.8),
            new THREE.Vector3(4.8, -1.25, 2.8)
        ];

        const rotEuler = new THREE.Euler(-ship.pitch || 0, -ship.yaw || 0, -ship.roll || 0, 'YXZ');
        const laserSpeed = 220.0; // Yüksek hızlı plazma salvosu (+z)

        muzzles.forEach(m => {
            const rotatedMuzzle = m.clone().applyEuler(rotEuler);
            const pos = shipPos.clone().add(rotatedMuzzle);
            const mesh = new THREE.Mesh(this.sharedHeroLaserGeo, this.sharedHeroLaserMat);
            mesh.position.copy(pos);
            this.scene.add(mesh);
            this.heroLasers.push({
                mesh: mesh,
                velocity: new THREE.Vector3(0, 0, laserSpeed),
                createdZ: pos.z
            });
        });

        try {
            if (this.tieLaserSound) {
                if (this.tieLaserSound.isPlaying) this.tieLaserSound.stop();
                this.tieLaserSound.play();
            }
        } catch (e) {}

        console.log('⚡ [HERO X-WING] Dörtlü Kırmızı Plazma Lazerleri Ateşlendi! (+220 m/s)');
    }

    fireTieLasers() {
        this.fireHeroLasers();
    }

    updateHeroLasers(dt) {
        if (!this.heroLasers || this.heroLasers.length === 0) return;
        const remaining = [];
        const shipZ = (this.latestData && this.latestData.ship) ? this.latestData.ship.z : 0;

        for (let i = 0; i < this.heroLasers.length; i++) {
            const hl = this.heroLasers[i];
            hl.mesh.position.z += hl.velocity.z * dt;

            // Düşman TIE Fighter filosuyla Box3 çarpışma tespiti
            let hitEnemyId = null;
            if (this.enemyTieSquadron && this.enemyTieSquadron.activeEnemies) {
                for (const [agentId, instance] of this.enemyTieSquadron.activeEnemies.entries()) {
                    if (!instance.isAlive) continue;

                    // Box3 Bounding Box kesişim kontrolü
                    if (instance.box && instance.box.containsPoint(hl.mesh.position)) {
                        hitEnemyId = agentId;
                        break;
                    }
                    const edx = hl.mesh.position.x - instance.group.position.x;
                    const edy = hl.mesh.position.y - instance.group.position.y;
                    const edz = hl.mesh.position.z - instance.group.position.z;
                    if (Math.abs(edx) < 5.2 && Math.abs(edy) < 5.2 && Math.abs(edz) < 4.5) {
                        hitEnemyId = agentId;
                        break;
                    }
                }
            }

            if (hitEnemyId) {
                // 1 HP Kuralı: Vurulan Düşman TIE Fighter anında patlar!
                this.onTieDestroyed(hitEnemyId, 'xwing_laser_hit');
                if (this.enemyTieSquadron) {
                    const inst = this.enemyTieSquadron.activeEnemies.get(hitEnemyId);
                    if (inst) {
                        this.enemyTieSquadron.triggerTieExplosion(inst.group.position.x, inst.group.position.y, inst.group.position.z, 'xwing_laser_hit');
                    }
                }
                this.scene.remove(hl.mesh);
                continue;
            }

            // Menzil dışı temizlik
            if (hl.mesh.position.z < shipZ + 200) {
                remaining.push(hl);
            } else {
                this.scene.remove(hl.mesh);
            }
        }
        this.heroLasers = remaining;
        this.tieLasers = remaining;
    }

    updateTieLasers(dt) {
        this.updateHeroLasers(dt);
    }

    spawnTieLaser(spawnPos, speed = 145.0, agentId = '') {
        if (this.finalePhase === 3) return;

        // Düşman TIE Fighter Canlı Zümrüt Yeşili Plazma Lazeri (Zero Memory Leak & Zero Dynamic Lights)
        const laserMesh = new THREE.Mesh(this.sharedLaserGeo, this.sharedTieLaserEnemyMat);
        laserMesh.position.copy(spawnPos);
        this.scene.add(laserMesh);

        const ship = (this.latestData && this.latestData.ship) ? this.latestData.ship : { x: 0, y: 32, z: 0 };
        this.lasers.push({
            mesh: laserMesh,
            velocity: new THREE.Vector3(0, 0, speed), // Pozitif Z hızı: arkadan gelip X-Wing'i kovalar
            previousZ: spawnPos.z - 1.0,
            prevRz: (spawnPos.z - ship.z),
            createdZ: spawnPos.z,
            dodged: false,
            wasThreat: true,
            isTieLaser: true,
            agentId: agentId
        });
    }

    spawnXWingLaser(spawnPos, speed, agentId) {
        this.spawnTieLaser(spawnPos, speed, agentId);
    }

    spawnLaser(isTwin = false) {
        // Lazerler siper boyunca kesintisiz devam eder (Yalnızca istasyon patladıktan sonra durur)
        if (this.finalePhase === 3) return;

        const ship = this.latestData.ship;
        const startZ = ship.z + (140 + Math.random() * 45) + (isTwin ? 12 : 0);
        const velocityZ = -(100 + Math.random() * 40);

        let startX = ship.x + (Math.random() - 0.5) * 14;
        let startY = ship.y + (Math.random() - 0.5) * 8;
        if (isTwin) {
            // Çiftli savunma taret ateşi: karşı kanattan veya çapraz açıyla yaklaşır
            startX = ship.x - (startX - ship.x) + (Math.random() - 0.5) * 6;
            startY = ship.y + (Math.random() - 0.5) * 6;
        }

        const laserMesh = new THREE.Mesh(this.sharedLaserGeo, this.sharedTurretLaserMat);
        laserMesh.position.set(startX, startY, startZ);
        this.scene.add(laserMesh);

        this.lasers.push({
            mesh: laserMesh,
            velocity: new THREE.Vector3(0, 0, velocityZ),
            previousZ: startZ + 1.0,
            prevRz: (startZ - ship.z),
            createdZ: ship.z,
            dodged: false,
            wasThreat: false,
            isXWingLaser: false
        });
    }

    updateLasers(dt, shipPos) {
        const remaining = [];
        const relativeBoxes = [];

        for (let i = 0; i < this.lasers.length; i++) {
            const l = this.lasers[i];
            const isForward = l.velocity.z > 0; // -z'den +z'ye (X-Wing lazeri)
            const prevZ = l.mesh.position.z;
            l.mesh.position.z += l.velocity.z * dt;
            l.previousZ = prevZ;

            const rx = l.mesh.position.x - shipPos.x;
            const ry = l.mesh.position.y - shipPos.y;
            const rz = l.mesh.position.z - shipPos.z;
            const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
            const lateralDist = Math.hypot(rx, ry);

            const prevRz = (l.prevRz !== undefined) ? l.prevRz : (prevZ - shipPos.z);
            l.prevRz = rz;

            // Yaklaşma Kontrolü:
            // İleri giden lazer (+z): rz < 2.0 iken arkadan yaklaşmaktadır
            // Geri gelen lazer (-z): rz > -2.0 iken önden yaklaşmaktadır
            const isApproaching = isForward ? (rz < 2.0) : (rz > -2.0);

            if (dist < 55.0 && isApproaching && lateralDist < 24.0) {
                l.wasThreat = true;
            }

            relativeBoxes.push({
                x: rx,
                y: ry,
                z: rz,
                speed: Math.abs(l.velocity.z),
                speed_z: l.velocity.z,
                approaching: isApproaching
            });

            // 1. Doğrudan Gövde Çarpışması
            const isDirectHit = (dist < 2.5) || (Math.abs(rz) < 2.2 && lateralDist < 2.4);

            if (isDirectHit) {
                if (this.latestData.neural && this.latestData.neural.is_barrel_rolling) {
                    if (!l.dodged) {
                        l.dodged = true;
                        this.onSuccessfulDodge();
                    }
                } else if (!this.isGameOver) {
                    this.onLaserHit();
                    if (l.isXWingLaser && this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({ type: 'enemy_laser_hit', id: l.agentId }));
                    }
                }
                this.scene.remove(l.mesh);
                continue;
            }

            // 2. Otonom Dodge (Kaçınma) Kontrolü
            const justPassedShip = isForward
                ? (prevRz <= 0.0 && rz > 0.0)
                : (prevRz >= 0.0 && rz < 0.0);

            if (justPassedShip && !l.dodged) {
                l.dodged = true;
                this.onSuccessfulDodge();
            }

            // 3. Fıçı Tonosu Sırasında Yakındaki Tehditleri Savuşturma
            if (this.latestData.neural && this.latestData.neural.is_barrel_rolling && !l.dodged) {
                if (dist < 32.0 && isApproaching) {
                    l.dodged = true;
                    this.onSuccessfulDodge();
                }
            }

            // Menzil dışı temizlik
            const inRange = isForward
                ? (l.mesh.position.z < shipPos.z + 240 && l.mesh.position.z > shipPos.z - 140)
                : (l.mesh.position.z > shipPos.z - 80 && l.mesh.position.z < shipPos.z + 220);

            if (inRange) {
                remaining.push(l);
            } else {
                this.scene.remove(l.mesh);
            }
        }

        this.lasers = remaining;
        return relativeBoxes;
    }

    onSuccessfulDodge() {
        const now = performance.now();
        if (this.lastDodgeTime && (now - this.lastDodgeTime < 280)) {
            return; // Çoklu salvo darbelerinde aynı anda 4 kez tetiklenmeyi engelle (Debounce)
        }
        this.lastDodgeTime = now;

        try {
            if (this.barrelRollSound) {
                if (this.barrelRollSound.isPlaying) this.barrelRollSound.stop();
                this.barrelRollSound.play();
            }
            if (this.dopamineSound) {
                if (this.dopamineSound.isPlaying) this.dopamineSound.stop();
                this.dopamineSound.play();
            }
        } catch (e) {
            console.warn('[Audio] Ses çalınamadı:', e);
        }

        if (this.latestData && this.latestData.neural) {
            this.latestData.neural.dopamine_mv = Math.min(50.0, Math.max(this.latestData.neural.dopamine_mv + 25.0, 30.0));
            if (this.latestData.learning) {
                this.latestData.learning.successful_dodges = (this.latestData.learning.successful_dodges || 0) + 1;
                this.latestData.learning.score = Math.min(1000.0, (this.latestData.learning.score || 60) + 45.0);
                this.latestData.learning.progress_pct = Math.min(100.0, (this.latestData.learning.score / 1000.0) * 100.0);
            }
            this.updateHUD(this.latestData);
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'dodge_success' }));
        }

        const dodgeBanner = document.getElementById('banner-dodge-success');
        if (dodgeBanner) {
            dodgeBanner.style.display = 'block';
            clearTimeout(this.dodgeBannerTimer);
            this.dodgeBannerTimer = setTimeout(() => {
                dodgeBanner.style.display = 'none';
            }, 2200);
        }

        const container = document.getElementById('canvas-container');
        if (container) {
            container.style.boxShadow = 'inset 0 0 120px #00ff66';
            setTimeout(() => { container.style.boxShadow = 'none'; }, 300);
        }
        console.log('⚡ [DODGE SUCCESS] Otonom Kaçınma Başarılı! +25 mV Otomatik Dopamin Salgılandı!');
    }

    onLaserHit() {
        if (!this.isPlayerAlive || (this.playerShip && this.playerShip.isAlive === false) || this.isGameOver) return;

        this.lives--;
        this.updateHealthUI();

        if (this.playerShip?.triggerDamageFlash) {
            this.playerShip.triggerDamageFlash();
        }

        try {
            if (this.damageSound) {
                if (this.damageSound.isPlaying) this.damageSound.stop();
                this.damageSound.play();
            }
        } catch (e) {
            console.warn('[Audio] Hasar sesi çalınamadı:', e);
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'laser_hit' }));
        }

        const container = document.getElementById('canvas-container');
        if (container) {
            container.style.boxShadow = 'inset 0 0 100px #ff0044';
            setTimeout(() => { container.style.boxShadow = 'none'; }, 250);
        }

        if (this.lives <= 0) {
            this.destroyPlayerShip('enemy_tie_laser_hit');
        }
    }

    destroyPlayerShip(reason = 'enemy_tie_laser_hit') {
        if (!this.isPlayerAlive && this.playerShip && this.playerShip.isAlive === false) return;

        this.isPlayerAlive = false;
        this.isGameOver = true;
        this.lives = 0;
        this.updateHealthUI();

        if (this.playerShip?.destroy) {
            this.playerShip.destroy(reason);
        }
        if (this.heroXWing?.destroy && this.heroXWing !== this.playerShip) {
            this.heroXWing.destroy(reason);
        }

        this.cameraTrauma = 1.0;
        try {
            if (this.damageSound) {
                if (this.damageSound.isPlaying) this.damageSound.stop();
                this.damageSound.play();
            }
            if (this.deathStarExplosionSound) {
                this.deathStarExplosionSound.play();
            }
        } catch (e) {}

        const bannerText = reason === 'trench_wall_crash'
            ? '💥 SİPER DUVARI ÇARPIŞMASI: KAHRAMAN X-WING İMHA EDİLDİ!'
            : '💀 TIE FIGHTER LAZERİ: KAHRAMAN X-WING İMHA EDİLDİ!';

        const alertEl = document.getElementById('banner-game-over');
        if (alertEl) {
            alertEl.innerText = bannerText;
            alertEl.style.display = 'block';
        }

        console.warn(`[HeroXWing Destroyed] 💀 Kahraman X-Wing İmha Edildi! (${reason}) - isAlive = false. Zombi sinek engellendi.`);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'player_destroyed', reason: reason }));
        }

        setTimeout(() => {
            if (this.isGameOver && !this.isVictory) {
                this.showGameOverModal(false);
            }
        }, 1500);
    }

    checkWallCollision(shipPos) {
        if (!this.isPlayerAlive || !this.playerShip || (this.playerShip.isAlive === false) || this.isGameOver) return;

        // Siper Duvar ve Zemin Sınırları:
        // Sol/Sağ duvarlar: Math.abs(x) > 46.5
        // Zemin: y < 1.5, Tavan: y > 108.0
        const isWallHit = (Math.abs(shipPos.x) > 46.5) || (shipPos.y < 1.5) || (shipPos.y > 108.0);
        if (isWallHit) {
            console.warn(`[Collision] 💥 Kahraman X-Wing siper duvarına çarptı! (x=${shipPos.x.toFixed(1)}, y=${shipPos.y.toFixed(1)})`);
            this.destroyPlayerShip('trench_wall_crash');
        }
    }

    updateHealthUI() {
        for (let i = 1; i <= 3; i++) {
            const pip = document.getElementById(`hp-${i}`);
            if (pip) {
                if (i <= this.lives) {
                    pip.classList.remove('lost');
                } else {
                    pip.classList.add('lost');
                }
            }
        }
    }

    updateBossHpUI() {
        const bossText = document.getElementById('val-boss-hp');
        if (bossText) {
            bossText.innerText = `REAKTÖR KALKANI: ${this.deathStarHp} / ${this.deathStarMaxHp}`;
            if (this.deathStarHp <= 1) {
                bossText.style.color = '#ff0055';
                bossText.style.textShadow = '0 0 10px #ff0055';
            } else if (this.deathStarHp <= 3) {
                bossText.style.color = '#ffaa00';
                bossText.style.textShadow = '0 0 10px #ffaa00';
            } else {
                bossText.style.color = '#00f0ff';
                bossText.style.textShadow = '0 0 10px #00f0ff';
            }
        }
        for (let i = 1; i <= this.deathStarMaxHp; i++) {
            const pip = document.getElementById(`ds-hp-${i}`);
            if (pip) {
                if (i <= this.deathStarHp) {
                    pip.classList.remove('destroyed');
                } else {
                    pip.classList.add('destroyed');
                }
            }
        }
    }

    updateHUD(data) {
        try {
            if (!data) return;
            const fly = data.fly || {};
            const neural = data.neural || {};
            const ommatidia = data.ommatidia || {};
            const learning = data.learning || {};

            // 1. Kanat Telemetrisi
            const deltaPhiEl = document.getElementById('val-deltaphi');
            if (deltaPhiEl && typeof fly.delta_phi === 'number') {
                deltaPhiEl.innerText = `${fly.delta_phi > 0 ? '+' : ''}${fly.delta_phi.toFixed(1)}°`;
            }

            const wingFreqEl = document.getElementById('val-wingfreq');
            if (wingFreqEl) {
                const freq = typeof fly.freq === 'number' ? fly.freq : 200.0;
                wingFreqEl.innerText = `${freq.toFixed(0)} Hz`;
            }

            // 2. Nöral Potansiyeller
            const dnp01El = document.getElementById('val-dnp01');
            if (dnp01El && neural.potentials && typeof neural.potentials.v_dnp01 === 'number') {
                dnp01El.innerText = `${neural.potentials.v_dnp01.toFixed(1)} mV`;
            }

            const lc10aEl = document.getElementById('val-lc10a');
            if (lc10aEl && neural.potentials && typeof neural.potentials.v_lc10a === 'number') {
                lc10aEl.innerText = `${neural.potentials.v_lc10a.toFixed(1)} mV`;
            }

            // Proboscis Extension Reflex (PER) Telemetrisi
            const probEl = document.getElementById('val-proboscis');
            if (probEl) {
                if (neural.proboscis_trigger || (this.torpedoes && this.torpedoes.isFired)) {
                    probEl.innerText = 'ATEŞLENDİ 👅';
                    probEl.style.color = '#00ff66';
                } else if (typeof neural.v_proboscis === 'number') {
                    probEl.innerText = `HAZIR (${neural.v_proboscis.toFixed(1)} mV)`;
                    probEl.style.color = (neural.v_proboscis > -55.0) ? '#ffb700' : '#ff00aa';
                }
            }

            // 3. Dopamin Göstergesi
            const dopamineValEl = document.getElementById('val-dopamine');
            if (dopamineValEl && typeof neural.dopamine_mv === 'number') {
                dopamineValEl.innerText = `+${neural.dopamine_mv.toFixed(1)} mV`;
            }

            const dopamineBar = document.getElementById('dopamine-bar');
            if (dopamineBar && typeof neural.dopamine_mv === 'number') {
                const pct = Math.min(100, (neural.dopamine_mv / (this.finalePhase === 3 ? 100.0 : 40.0)) * 100);
                dopamineBar.style.width = `${pct}%`;
            }

            // 4. Sinek Öğrenme Seviyesi & Plastisite
            const lvlTitleEl = document.getElementById('val-learning-level');
            if (lvlTitleEl) lvlTitleEl.innerText = learning.level_title || 'Seviye 1';

            const synEffEl = document.getElementById('val-synaptic-eff');
            if (synEffEl && typeof learning.synaptic_efficiency === 'number') {
                synEffEl.innerText = `${learning.synaptic_efficiency.toFixed(2)}x Güç`;
            }

            const dodgeStatsEl = document.getElementById('val-dodge-stats');
            if (dodgeStatsEl) {
                const dodges = learning.successful_dodges || 0;
                const rate = typeof learning.dodge_rate_pct === 'number' ? learning.dodge_rate_pct : 100;
                dodgeStatsEl.innerText = `${dodges} Başarılı (${rate.toFixed(0)}%)`;
            }

            const learningPctEl = document.getElementById('val-learning-pct');
            if (learningPctEl && typeof learning.progress_pct === 'number') {
                learningPctEl.innerText = `${learning.progress_pct.toFixed(0)}%`;
            }

            const learningBar = document.getElementById('learning-bar');
            if (learningBar && typeof learning.progress_pct === 'number') {
                learningBar.style.width = `${Math.max(4, learning.progress_pct)}%`;
            }

            // 5. Ommatidia
            const ommaEl = document.getElementById('val-ommatidia');
            if (ommaEl && typeof ommatidia.active_count === 'number') {
                ommaEl.innerText = `${ommatidia.active_count} / 750`;
            }

            // 6. Boss Atış & İsabet Öğrenimi Telemetrisi (LC10a & PER)
            const bt = data.boss_targeting || {};
            const accuracyEl = document.getElementById('val-boss-accuracy');
            if (accuracyEl && typeof bt.accuracy_pct === 'number') {
                accuracyEl.innerText = `%${bt.accuracy_pct.toFixed(0)}`;
                if (bt.accuracy_pct >= 85) accuracyEl.style.color = '#00ff66';
                else if (bt.accuracy_pct >= 65) accuracyEl.style.color = '#00f0ff';
                else accuracyEl.style.color = '#ffaa00';
            }

            const lockEl = document.getElementById('val-boss-lock');
            if (lockEl) {
                if (bt.is_locked) {
                    lockEl.innerText = 'KİLİTLENDİ 🎯';
                    lockEl.style.color = '#00ff66';
                } else if (typeof bt.aim_lock_ratio === 'number') {
                    const pct = (bt.aim_lock_ratio * 100).toFixed(0);
                    lockEl.innerText = `HİZALANIYOR (%${pct})`;
                    lockEl.style.color = '#ffb700';
                }
            }

            // 7. Düşman Dark X-Wing Telemetrisi (Multi-Agent SNN & Overtaking Dynamics)
            const enemies = data.enemies || [];
            const xwingStatusEl = document.getElementById('val-xwing-status');
            const xwingBanner = document.getElementById('banner-xwing-threat');
            const overtakeBanner = document.getElementById('banner-xwing-overtake');
            const shipZ = data.ship?.z || 0;

            if (xwingStatusEl) {
                const aliveEnemies = enemies.filter(e => e.is_alive !== false);
                if (aliveEnemies.length > 0) {
                    const inFront = aliveEnemies.filter(e => (e.z - shipZ) > 0.5);
                    const behind = aliveEnemies.filter(e => (e.z - shipZ) <= 0.5);
                    if (inFront.length > 0) {
                        const closestFrontDist = Math.min(...inFront.map(e => e.z - shipZ));
                        xwingStatusEl.innerText = `🚨 ${inFront.length} Solladı (+${closestFrontDist.toFixed(0)}m Ön Engel TIE!)`;
                        xwingStatusEl.style.color = '#ef4444';
                    } else {
                        const nearestDist = Math.min(...behind.map(e => Math.abs(shipZ - e.z)));
                        xwingStatusEl.innerText = `${aliveEnemies.length} Düşman TIE (${nearestDist.toFixed(0)}m - Arkada)`;
                        xwingStatusEl.style.color = '#10b981';
                    }
                } else {
                    xwingStatusEl.innerText = 'Temiz (0 Tehdit)';
                    xwingStatusEl.style.color = '#94a3b8';
                }
            }

            const hasEnemyInFront = enemies.some(e => e.is_alive !== false && (e.z - shipZ) > 0.5 && (e.z - shipZ) < 55.0);
            if (overtakeBanner) {
                overtakeBanner.style.display = hasEnemyInFront && !this.isFinaleActive ? 'block' : 'none';
            }
            if (xwingBanner) {
                const hasNearbyEnemyBehind = enemies.some(e => e.is_alive !== false && (shipZ - e.z) < 70 && (shipZ - e.z) > 0);
                xwingBanner.style.display = (!hasEnemyInFront && hasNearbyEnemyBehind && !this.isFinaleActive) ? 'block' : 'none';
            }

            // 8. Uyarı Bannerları
            const rollBanner = document.getElementById('banner-barrel-roll');
            if (rollBanner) {
                rollBanner.style.display = neural.is_barrel_rolling ? 'block' : 'none';
            }

            const dopaBanner = document.getElementById('banner-dopamine');
            if (dopaBanner && !this.isFinaleActive) {
                dopaBanner.style.display = (neural.dopamine_mv > 15.0 && neural.dopamine_mv < 80.0) ? 'block' : 'none';
            }
        } catch (e) {
            console.warn('[HUD] updateHUD hatası yakalandı:', e);
        }
    }

    // =========================================================================
    // DİNAMİK GÖZLEMCİ MODU & AKTİF AJANLAR YÖNETİM SİSTEMİ (SPECTATOR SYSTEM)
    // =========================================================================

    getActiveAgents() {
        const list = [];
        // 1. Ana Gemi (Kahraman X-Wing / Red Five)
        const isHeroAlive = Boolean(this.isPlayerAlive && this.playerShip && this.playerShip.isAlive);
        list.push({
            id: 'hero_xwing',
            type: 'hero',
            name: 'RED 5',
            fullTitle: 'KAHRAMAN X-WING (RED FIVE)',
            isAlive: isHeroAlive,
            object: this.playerShip?.shipGroup,
            speed: (this.latestData?.ship?.speed || 35.0),
            hp: this.lives || 3
        });

        // 2. Çoklu-Ajan Düşman İmparatorluk TIE Fighter Filosu
        if (this.enemyTieSquadron?.activeEnemies) {
            for (const [agentId, inst] of this.enemyTieSquadron.activeEnemies.entries()) {
                if (inst && inst.isAlive && inst.group) {
                    const cleanName = agentId.toUpperCase().replace('_', ' ');
                    list.push({
                        id: agentId,
                        type: 'enemy',
                        name: cleanName,
                        fullTitle: `İMPARATORLUK TIE (${cleanName})`,
                        isAlive: true,
                        object: inst.group,
                        speed: (inst.speed || 135.0),
                        hp: inst.hp || 1
                    });
                }
            }
        }
        return list;
    }

    updateActiveAgentsUI() {
        const container = document.getElementById('active-agents-list');
        if (!container) return;

        const agents = this.getActiveAgents();
        this.activeAgents = agents;

        // Benzersiz hash kontrolü (Zero GC & gereksiz DOM re-render engelleme)
        const currentHash = agents.map(a => `${a.id}:${a.isAlive ? 1 : 0}`).join('|') + `|target:${this.spectatorTargetId}`;
        if (currentHash === this.lastAgentsHash) {
            return;
        }
        this.lastAgentsHash = currentHash;

        // DOM Temizle ve Portreleri Dinamik Render Et
        container.innerHTML = '';

        const heroFlySvg = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="16" cy="18" rx="7" ry="8.5" fill="#0f172a" stroke="#38bdf8" stroke-width="1.6"/>
            <ellipse cx="11" cy="16" rx="4.5" ry="6" fill="#ef4444" opacity="0.95"/>
            <ellipse cx="21" cy="16" rx="4.5" ry="6" fill="#ef4444" opacity="0.95"/>
            <circle cx="10" cy="14" r="1.4" fill="#fef08a"/>
            <circle cx="20" cy="14" r="1.4" fill="#fef08a"/>
            <path d="M12 9C10 5 7 4 5 5M20 9C22 5 25 4 27 5" stroke="#38bdf8" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="16" cy="10" r="1.8" fill="#00f0ff"/>
        </svg>`;

        const enemyFlySvg = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="16" cy="18" rx="7.5" ry="8.5" fill="#090d16" stroke="#10b981" stroke-width="1.6"/>
            <ellipse cx="11" cy="16" rx="4.5" ry="6" fill="#10b981" opacity="0.95"/>
            <ellipse cx="21" cy="16" rx="4.5" ry="6" fill="#10b981" opacity="0.95"/>
            <circle cx="10" cy="15" r="1.2" fill="#a7f3d0"/>
            <circle cx="21" cy="15" r="1.2" fill="#a7f3d0"/>
            <path d="M13 10C11 6 8 5 6 6M19 10C21 6 24 5 26 6" stroke="#ef4444" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M14 24L16 26.5L18 24" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`;

        agents.forEach(agent => {
            const card = document.createElement('div');
            const isActive = (agent.id === this.spectatorTargetId);
            card.className = `agent-portrait-card ${agent.type} ${isActive ? 'active' : ''}`;
            card.setAttribute('data-agent-id', agent.id);
            card.setAttribute('title', `${agent.fullTitle} (Kamerayı Odaklamak İçin Tıkla)`);

            const badge = document.createElement('div');
            badge.className = `agent-portrait-badge ${agent.type}`;
            badge.innerText = agent.type === 'hero' ? 'XW' : 'TIE';

            const iconDiv = document.createElement('div');
            iconDiv.className = 'agent-portrait-icon';
            iconDiv.innerHTML = agent.type === 'hero' ? heroFlySvg : enemyFlySvg;

            const nameDiv = document.createElement('div');
            nameDiv.className = 'agent-portrait-name';
            nameDiv.innerText = agent.name;

            card.appendChild(badge);
            card.appendChild(iconDiv);
            card.appendChild(nameDiv);

            // Fare Tıklaması (Click) ile Spesifik Gemiyi İzleme
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setSpectatorTarget(agent.id);
            });

            container.appendChild(card);
        });
    }

    getCurrentBrainTelemetry() {
        if (!this.spectatorTargetId || this.spectatorTargetId === 'hero_xwing') {
            return {
                agentId: 'hero_xwing',
                agentTitle: 'RED 5 (KAHRAMAN X-WING)',
                agentType: 'hero',
                neural: this.latestData?.neural || {},
                fly: this.latestData?.fly || {},
                ship: this.latestData?.ship || {},
                fullData: this.latestData || {}
            };
        }

        // TIE Fighter İzleniyor: İlgili TIE Fighter'ın SNN nöral verisine yönlendir
        const enemyTelemetry = (this.latestData?.enemies || []).find(e => e.id === this.spectatorTargetId);
        if (enemyTelemetry) {
            const cleanName = enemyTelemetry.id.toUpperCase().replace('_', ' ');
            const cleanTitle = `İMPARATORLUK TIE (${cleanName})`;

            const enemyNeural = enemyTelemetry.neural || {};
            const potentials = enemyNeural.potentials || {
                v_lc10a: enemyNeural.v_lc10a ?? -70.0,
                v_proboscis: enemyNeural.v_proboscis ?? -70.0,
                v_dnp01: enemyNeural.v_dnp01 ?? -70.0,
                v_b1_l: -70.0,
                v_b1_r: -70.0
            };

            const normalizedNeural = {
                spikes: enemyNeural.spikes || [],
                potentials: potentials,
                dopamine_mv: typeof enemyNeural.dopamine_mv === 'number' ? enemyNeural.dopamine_mv : (enemyNeural.lock_ratio ? enemyNeural.lock_ratio * 35.0 : 0.0),
                is_barrel_rolling: Boolean(enemyNeural.is_barrel_rolling),
                proboscis_trigger: Boolean(enemyTelemetry.fire_laser),
                tie_fire_laser: Boolean(enemyTelemetry.fire_laser),
                v_lc10a: enemyNeural.v_lc10a ?? potentials.v_lc10a ?? -70.0,
                v_proboscis: enemyNeural.v_proboscis ?? potentials.v_proboscis ?? -70.0,
                lock_ratio: enemyNeural.lock_ratio ?? 0.0
            };

            const enemyFly = {
                wing_l: enemyTelemetry.wing_l ?? 0.0,
                wing_r: enemyTelemetry.wing_r ?? 0.0,
                delta_phi: enemyTelemetry.delta_phi ?? 0.0,
                freq: 200.0
            };

            const syntheticFull = {
                ...(this.latestData || {}),
                ship: {
                    x: enemyTelemetry.x,
                    y: enemyTelemetry.y,
                    z: enemyTelemetry.z,
                    roll: enemyTelemetry.roll,
                    pitch: enemyTelemetry.pitch,
                    yaw: enemyTelemetry.yaw,
                    speed: enemyTelemetry.speed
                },
                neural: normalizedNeural,
                fly: enemyFly
            };

            return {
                agentId: enemyTelemetry.id,
                agentTitle: cleanTitle,
                agentType: 'enemy',
                neural: normalizedNeural,
                fly: enemyFly,
                ship: syntheticFull.ship,
                fullData: syntheticFull
            };
        }

        // Fallback: Ana Gemi (X-Wing)
        return {
            agentId: 'hero_xwing',
            agentTitle: 'RED 5 (KAHRAMAN X-WING)',
            agentType: 'hero',
            neural: this.latestData?.neural || {},
            fly: this.latestData?.fly || {},
            ship: this.latestData?.ship || {},
            fullData: this.latestData || {}
        };
    }

    setSpectatorTarget(agentId) {
        const agents = this.getActiveAgents();
        const found = agents.find(a => a.id === agentId);
        if (found && found.isAlive) {
            this.spectatorTargetId = agentId;
        } else {
            this.spectatorTargetId = 'hero_xwing';
        }

        // Anında UI & Nöral Veri Yönlendirmesi (Data Routing)
        this.lastAgentsHash = '';
        this.updateActiveAgentsUI();

        const currentBrain = this.getCurrentBrainTelemetry();
        const holoLabel = document.getElementById('hologram-label');
        if (holoLabel) {
            holoLabel.innerText = `3D BEYİN: ${currentBrain.agentTitle}`;
            holoLabel.style.color = currentBrain.agentType === 'hero' ? '#38bdf8' : '#10b981';
        }

        try {
            this.updateHUD(currentBrain.fullData);
        } catch (e) {}

        console.log(`[Spectator] 🎥 Kamera & Nöral Hedef Değiştirildi: ${this.spectatorTargetId} (${currentBrain.agentTitle})`);
    }

    cycleSpectatorTarget(direction = 1) {
        const agents = this.getActiveAgents().filter(a => a.isAlive);
        if (agents.length === 0) return;

        let currentIndex = agents.findIndex(a => a.id === this.spectatorTargetId);
        if (currentIndex === -1) currentIndex = 0;

        const nextIndex = (currentIndex + direction + agents.length) % agents.length;
        this.setSpectatorTarget(agents[nextIndex].id);
    }

    updateCamera(dt = 0.016) {
        if (this.directorMode && this.directorMode.isActive) {
            this.directorMode.update(dt);
            if (this.cameraTrauma > 0) {
                this.cameraTrauma = Math.max(0, this.cameraTrauma - 0.45 * dt);
                const shake = this.cameraTrauma * this.cameraTrauma * 3.8;
                this.camera.position.x += (Math.random() - 0.5) * shake;
                this.camera.position.y += (Math.random() - 0.5) * shake;
                this.camera.position.z += (Math.random() - 0.5) * shake;
            }
            return;
        }

        // -------------------------------------------------------------
        // GÖZLEMCİ MODU & ÖLÜ AJAN GÜVENLİK KİLİDİ (DEAD ENTITY FALLBACK)
        // -------------------------------------------------------------
        const agents = this.getActiveAgents();
        let currentTarget = agents.find(a => a.id === this.spectatorTargetId);

        // Kritik Hata Koruması: Eğer oyuncu bir TIE Fighter'ın kamerasındayken
        // o TIE Fighter duvara çarpar veya imha edilirse (!target.isAlive),
        // Three.js çökmesin diye kamera otomatik olarak ana gemiye (X-Wing) döner!
        if (!currentTarget || !currentTarget.isAlive || !currentTarget.object) {
            if (this.spectatorTargetId !== 'hero_xwing') {
                console.warn(`[Spectator Fallback] ⚠️ Hedef ajan (${this.spectatorTargetId}) imha edildi! Kamera ana gemiye (X-Wing) güvenle geri döndürüldü.`);
                this.spectatorTargetId = 'hero_xwing';
                this.lastAgentsHash = '';
                this.updateActiveAgentsUI();
                const currentBrain = this.getCurrentBrainTelemetry();
                const holoLabel = document.getElementById('hologram-label');
                if (holoLabel) {
                    holoLabel.innerText = `3D BEYİN: ${currentBrain.agentTitle}`;
                    holoLabel.style.color = '#38bdf8';
                }
                try {
                    this.updateHUD(currentBrain.fullData);
                } catch (e) {}
                currentTarget = agents.find(a => a.id === 'hero_xwing') || agents[0];
            }
        }

        // Eğer bir düşman TIE Fighter izleniyorsa:
        if (this.spectatorTargetId !== 'hero_xwing' && currentTarget && currentTarget.object) {
            const enemyPos = currentTarget.object.position;
            // TIE Fighter arkasından omuz üstü chase takibi
            const targetX = enemyPos.x * 0.9;
            const targetY = enemyPos.y + 2.4;
            const targetZ = enemyPos.z - 11.5;

            const smoothFactor = Math.min(1.0, 16.0 * dt);
            this.camera.position.x += (targetX - this.camera.position.x) * smoothFactor;
            this.camera.position.y += (targetY - this.camera.position.y) * smoothFactor;
            this.camera.position.z += (targetZ - this.camera.position.z) * smoothFactor;

            // Kamera TIE Fighter'ın önüne (X-Wing'e ve siper yönüne) bakar
            this.camera.lookAt(enemyPos.x, enemyPos.y + 0.5, enemyPos.z + 45.0);

            // Patlama / Çarpışma Ekran Sarsıntısı (Camera Trauma Shake)
            if (this.cameraTrauma > 0) {
                this.cameraTrauma = Math.max(0, this.cameraTrauma - 0.45 * dt);
                const shake = this.cameraTrauma * this.cameraTrauma * 3.8;
                this.camera.position.x += (Math.random() - 0.5) * shake;
                this.camera.position.y += (Math.random() - 0.5) * shake;
                this.camera.position.z += (Math.random() - 0.5) * shake;
            }
            return;
        }

        const ship = this.latestData.ship;

        if (this.cameraMode === 1) {
            // Mode 1: Sinematik 3. Şahıs Geniş Açı Takip (Kahraman X-Wing + Kovalayan TIE Fighter'lar Kadrajda)
            // Kamera arkadan kovalayan TIE Fighter'ların (z = ship.z - 22 ~ -36) de gerisine ve yukarıya çekilir
            const targetX = ship.x * 0.75;
            const targetY = ship.y + 10.5;
            const targetZ = ship.z - 46.0;
            
            // X ve Y eksenlerinde yumuşak yaylanma, Z ekseninde senkronize takip
            const smoothFactor = Math.min(1.0, 14.0 * dt);
            this.camera.position.x += (targetX - this.camera.position.x) * smoothFactor;
            this.camera.position.y += (targetY - this.camera.position.y) * smoothFactor;
            this.camera.position.z = targetZ;
            
            // Bakış odağı: Kahraman X-Wing'in hafif önü
            const lookX = ship.x * 0.85;
            const lookY = ship.y + 1.2;
            const lookZ = ship.z + 10.0;
            this.camera.lookAt(lookX, lookY, lookZ);

        } else if (this.cameraMode === 2) {
            // Mode 2: Cockpit Zoom (Şeffaf ön kokpit camından içeriye, sineğe doğrudan bakış)
            const targetX = ship.x;
            const targetY = ship.y + 1.2;
            const targetZ = ship.z + 5.2;

            const smoothFactor = Math.min(1.0, 20.0 * dt);
            this.camera.position.x += (targetX - this.camera.position.x) * smoothFactor;
            this.camera.position.y += (targetY - this.camera.position.y) * smoothFactor;
            this.camera.position.z = targetZ;

            this.camera.lookAt(ship.x, ship.y - 0.1, ship.z + 0.2);

        } else if (this.cameraMode === 3) {
            // Mode 3: Fly Pilot First-Person (Kokpitin içinden görüş)
            this.camera.position.set(ship.x, ship.y + 0.2, ship.z + 1.1);
            this.camera.lookAt(ship.x, ship.y + 0.2, ship.z + 80.0);

        } else if (this.cameraMode === 4) {
            // Mode 4: Death Star Station Orbit Cam (Ölüm Yıldızı Modeli Detaylı Gözlem)
            if (this.deathStar && this.deathStar.isLoaded) {
                const dsPos = this.deathStar.group.position;
                const camAngle = this.flightTime * 0.25;
                const dist = 340.0;
                this.camera.position.set(
                    dsPos.x + Math.sin(camAngle) * dist,
                    dsPos.y + 35.0 + Math.sin(camAngle * 0.4) * 15.0,
                    dsPos.z + Math.cos(camAngle) * dist
                );
                this.camera.lookAt(dsPos.x, dsPos.y, dsPos.z);
            }

        } else if (this.cameraMode === 5) {
            // Mode 5: Düşman TIE Fighter Takip Kamerası (Rear Threat & Dogfight Cam)
            // Kahraman X-Wing'in hemen önünden arkaya doğru, kovalayan TIE Fighter'lara bakar
            const targetX = ship.x;
            const targetY = ship.y + 2.4;
            const targetZ = ship.z + 14.0;
            this.camera.position.set(targetX, targetY, targetZ);
            this.camera.lookAt(ship.x, ship.y + 0.8, ship.z - 45.0);
        }

        // Patlama / Çarpışma Ekran Sarsıntısı (Camera Trauma Shake)
        if (this.cameraTrauma > 0) {
            this.cameraTrauma = Math.max(0, this.cameraTrauma - 0.45 * dt);
            const shake = this.cameraTrauma * this.cameraTrauma * 3.8;
            this.camera.position.x += (Math.random() - 0.5) * shake;
            this.camera.position.y += (Math.random() - 0.5) * shake;
            this.camera.position.z += (Math.random() - 0.5) * shake;
        }
    }

    showGameOverModal(isVictory) {
        const modal = document.getElementById('game-over-modal');
        if (!modal) return;

        const card = document.getElementById('go-card');
        const icon = document.getElementById('go-icon');
        const badge = document.getElementById('go-badge');
        const title = document.getElementById('go-title');
        const subtitle = document.getElementById('go-subtitle');
        const restartBtn = document.getElementById('btn-modal-restart');

        const totalTime = this.survivalTimer.toFixed(1) + 's';
        const dodges = (this.latestData.learning ? this.latestData.learning.successful_dodges : 0);
        const accuracy = (this.latestData.boss_targeting ? this.latestData.boss_targeting.accuracy_pct : 98);
        const dopamine = (this.latestData.neural ? this.latestData.neural.dopamine_mv.toFixed(1) : '100.0') + ' mV';
        const levelTitle = (this.latestData.learning ? this.latestData.learning.level_title : 'Seviye 5: Sith Lordu Drosophila');

        const elSurv = document.getElementById('go-survival-time');
        if (elSurv) elSurv.innerText = totalTime;
        const elDodges = document.getElementById('go-dodges');
        if (elDodges) elDodges.innerText = `${dodges} Başarılı (%100)`;
        const elTorp = document.getElementById('go-torpedoes');
        if (elTorp) elTorp.innerText = isVictory ? `5 / 5 (%${accuracy} - REAKTÖR ÇÖKTÜ)` : `${Math.max(0, 5 - this.deathStarHp)} / 5 Vuruş`;
        const elLevel = document.getElementById('go-level');
        if (elLevel) elLevel.innerText = levelTitle;
        const elLtp = document.getElementById('go-ltp');
        if (elLtp) elLtp.innerText = '%100 Maksimum';
        const elDop = document.getElementById('go-dopamine');
        if (elDop) elDop.innerText = `+${dopamine}`;

        if (isVictory) {
            if (card) card.classList.remove('defeat');
            if (icon) icon.innerText = '🏆';
            if (badge) {
                badge.innerText = '[ GÖREV BAŞARILI - GAME OVER ]';
                badge.classList.remove('defeat');
            }
            if (title) {
                title.innerText = 'ÖLÜM YILDIZI İMHA EDİLDİ!';
                title.classList.remove('defeat');
            }
            if (subtitle) subtitle.innerText = 'Biyolojik Sinek Beyni (Drosophila Melanogaster) Galaksiyi Kurtardı!';
            if (restartBtn) restartBtn.innerText = '🔄 YENİDEN OYNA (R)';
        } else {
            if (card) card.classList.add('defeat');
            if (icon) icon.innerText = '💀';
            if (badge) {
                badge.innerText = '[ GÖREV BAŞARISIZ - GAME OVER ]';
                badge.classList.add('defeat');
            }
            if (title) {
                title.innerText = 'X-WING DÜŞÜRÜLDÜ!';
                title.classList.add('defeat');
            }
            if (subtitle) subtitle.innerText = `Kahraman X-Wing (Red Five) ${totalTime} hayatta kaldı. İmparatorluk TIE Filosu kazandı.`;
            if (restartBtn) restartBtn.innerText = '🔄 TEKRAR DENE (R)';
        }

        modal.style.display = 'flex';
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Klavye Kısayolları
        window.addEventListener('keydown', (e) => {
            if (e.key === '1') this.setCameraMode(1);
            if (e.key === '2') this.setCameraMode(2);
            if (e.key === '3') this.setCameraMode(3);
            if (e.key === '4') this.setCameraMode(4);
            if (e.key === '5') this.setCameraMode(5);
            // Gözlemci Modu Ok Tuşları ile Hızlı Kamera Geçişi
            if (e.key === 'ArrowRight') this.cycleSpectatorTarget(1);
            if (e.key === 'ArrowLeft') this.cycleSpectatorTarget(-1);
            if (e.key.toLowerCase() === 'd') this.injectDopamine(40.0);
            if (e.key.toLowerCase() === 'l') this.fireTieLasers();
            if (e.key.toLowerCase() === 'f') this.handleFinaleButton();
            if (e.key.toLowerCase() === 'm') this.directorMode?.toggle();
            if (e.key.toLowerCase() === 'v') this.videoRecorder?.toggleRecording();
            if (e.key.toLowerCase() === 'r' && (this.isGameOver || this.isVictory || this.finalePhase === 3)) {
                this.restartGame();
            }
        });

        // Butonlar
        document.getElementById('btn-cam-chase')?.addEventListener('click', () => this.setCameraMode(1));
        document.getElementById('btn-cam-cockpit')?.addEventListener('click', () => this.setCameraMode(2));
        document.getElementById('btn-cam-pilot')?.addEventListener('click', () => this.setCameraMode(3));
        document.getElementById('btn-cam-deathstar')?.addEventListener('click', () => this.setCameraMode(4));
        document.getElementById('btn-cam-enemy')?.addEventListener('click', () => this.setCameraMode(5));
        document.getElementById('btn-dopamine')?.addEventListener('click', () => this.injectDopamine(40.0));
        document.getElementById('btn-laser')?.addEventListener('click', () => this.fireTieLasers());
        document.getElementById('btn-record')?.addEventListener('click', () => this.videoRecorder?.toggleRecording());
        document.getElementById('btn-director')?.addEventListener('click', () => this.directorMode?.toggle());
        document.getElementById('btn-finale')?.addEventListener('click', () => this.handleFinaleButton());
        document.getElementById('btn-restart')?.addEventListener('click', () => this.restartGame());
        document.getElementById('btn-modal-restart')?.addEventListener('click', () => this.restartGame());
    }

    setCameraMode(mode) {
        this.cameraMode = mode;
        this.spectatorTargetId = 'hero_xwing';
        this.lastAgentsHash = '';
        this.updateActiveAgentsUI();
        const holoLabel = document.getElementById('hologram-label');
        if (holoLabel) {
            holoLabel.innerText = '3D SİNEK BEYNİ: RED 5 (KAHRAMAN X-WING)';
            holoLabel.style.color = '#38bdf8';
        }
        ['btn-cam-chase', 'btn-cam-cockpit', 'btn-cam-pilot', 'btn-cam-deathstar', 'btn-cam-enemy'].forEach((id, idx) => {
            const btn = document.getElementById(id);
            if (btn) {
                if (idx + 1 === mode) btn.classList.add('active');
                else btn.classList.remove('active');
            }
        });
        console.log(`[Camera] Mod Değiştirildi: ${mode}`);
    }

    injectDopamine(amount = 40.0) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'inject_dopamine', amount: amount }));
            console.log(`[Frontend] 🌟 Manuel Dopamin Talebi Gönderildi (+${amount} mV)`);
        }
    }

    restartGame() {
        if (this.directorMode && this.directorMode.isActive) {
            this.directorMode.stop();
        }

        this.lives = 3;
        this.isGameOver = false;
        this.isVictory = false;
        this.isPlayerAlive = true;
        this.spectatorTargetId = 'hero_xwing';
        this.lastAgentsHash = '';
        this.updateActiveAgentsUI();
        const holoLabel = document.getElementById('hologram-label');
        if (holoLabel) {
            holoLabel.innerText = '3D SİNEK BEYNİ: RED 5 (KAHRAMAN X-WING)';
            holoLabel.style.color = '#38bdf8';
        }
        if (this.playerShip?.reset) this.playerShip.reset();
        if (this.heroXWing?.reset && this.heroXWing !== this.playerShip) this.heroXWing.reset();
        this.updateHealthUI();
        this.isFinaleActive = false;
        this.isVelocitySynced = false;
        this.finalePhase = 0;
        this.flightTime = 0.0;
        this.survivalTimer = 0.0;
        this.cameraTrauma = 0.0;

        // Ölüm Yıldızı İstasyonu kameradan bağımsız daima aktif ve görünür kalır
        if (this.deathStar) {
            this.deathStar.setSpawned(true);
        }

        this.torpedoes.reset();
        this.trench.resetFinale();
        this.exhaustPort.reset();

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'reset_game' }));
        }

        // Game Over modalını gizle
        const modal = document.getElementById('game-over-modal');
        if (modal) modal.style.display = 'none';

        // Hayatta kalma HUD'ını geri getir ve sıfırla
        const survivalHud = document.getElementById('survival-hud');
        if (survivalHud) survivalHud.style.display = 'block';
        const fillEl = document.getElementById('survival-bar-fill');
        if (fillEl) fillEl.style.width = '0%';
        const textEl = document.getElementById('val-survival-text');
        if (textEl) textEl.innerText = 'HAYATTA KALMA: 0.0s / 60.0s (HEDEFE KALAN: 60s)';

        // Butonu sıfırla
        const btn = document.getElementById('btn-finale');
        if (btn) {
            btn.innerText = '🎯 ÖLÜM YILDIZI (60s)';
            btn.classList.remove('ready-to-fire');
            btn.style.opacity = '';
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.setAttribute('title', 'Ölüm Yıldızı Egzoz Deliği Final Koşusunu Başlat (Tuş: F)');
        }

        document.getElementById('banner-finale')?.style.setProperty('display', 'none');
        document.getElementById('banner-proboscis')?.style.setProperty('display', 'none');
        document.getElementById('banner-victory')?.style.setProperty('display', 'none');
        document.getElementById('banner-game-over')?.style.setProperty('display', 'none');

        const crosshair = document.getElementById('hud-crosshair');
        if (crosshair) {
            crosshair.style.borderColor = 'rgba(0, 240, 255, 0.4)';
            crosshair.style.boxShadow = 'none';
        }

        this.deathStarHp = this.deathStarMaxHp;
        this.updateBossHpUI();
        const bossHud = document.getElementById('boss-hud');
        if (bossHud) bossHud.style.display = 'none';

        this.updateHealthUI();
        this.lasers.forEach(l => {
            if (l.mesh) this.scene.remove(l.mesh);
        });
        this.lasers = [];

        if (this.tieLasers) {
            this.tieLasers.forEach(l => {
                if (l.mesh) this.scene.remove(l.mesh);
            });
            this.tieLasers = [];
        }

        if (this.darkXWingManager?.reset) {
            this.darkXWingManager.reset();
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'reset_proboscis' }));
        }

        console.log('[Game] Simülasyon Sıfırlandı.');
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        try {
            const dt = Math.min(this.clock.getDelta(), 0.1);
            const ship = (this.latestData && this.latestData.ship) ? this.latestData.ship : { x: 0, y: 32, z: 0, speed: 35 };
            this.flightTime += dt;

            // 1. Hayatta Kalma ve Final Sekansı Tetikleyicisi (1 Dakika Hayatta Kalma Kuralı):
            try {
                if (!this.isGameOver && !this.isVictory) {
                    this.survivalTimer += dt;

                    if (!this.isFinaleActive) {
                        const remaining = Math.max(0, this.requiredSurvivalTime - this.survivalTimer);
                        const pct = Math.min(100, (this.survivalTimer / this.requiredSurvivalTime) * 100);
                        const fillEl = document.getElementById('survival-bar-fill');
                        if (fillEl) fillEl.style.width = `${pct}%`;
                        const textEl = document.getElementById('val-survival-text');
                        if (textEl) {
                            textEl.innerText = `HAYATTA KALMA: ${this.survivalTimer.toFixed(1)}s / 60.0s (HEDEFE KALAN: ${Math.ceil(remaining)}s)`;
                        }

                        const btnFinale = document.getElementById('btn-finale');
                        if (btnFinale && !btnFinale.classList.contains('ready-to-fire')) {
                            btnFinale.innerText = `🎯 ÖLÜM YILDIZI (${Math.ceil(remaining)}s)`;
                        }

                        // 1 Dakika (60 saniye) hayatta kalındığında Ölüm Yıldızı ortaya çıkar ve hedef alınabilir olur!
                        if (this.survivalTimer >= this.requiredSurvivalTime) {
                            console.log('🚨 1 DAKİKA HAYATTA KALINDI! ÖLÜM YILDIZI ORTAYA ÇIKTI VE HEDEFE ALINDI!');
                            this.triggerFinale();
                        }
                    }
                }
            } catch (errSurv) {
                console.warn('[GameLoop Recovery] Hayatta kalma sayacı hatası:', errSurv);
            }

            // İZAFI HIZ EŞİTLEME (TARGET RELATIVE VELOCITY MATCHING):
            try {
                if (this.isFinaleActive && this.deathStarHp > 0) {
                    const distanceToTarget = this.finalTargetZ - ship.z;
                    if (this.isVelocitySynced || distanceToTarget <= this.firingRange) {
                        this.isVelocitySynced = true;
                        this.finalTargetZ = ship.z + this.firingRange;

                        if (this.exhaustPort?.updatePosition) {
                            this.exhaustPort.updatePosition(this.finalTargetZ);
                        }
                        if (this.trench?.updateFinalePosition) {
                            this.trench.updateFinalePosition(this.finalTargetZ);
                        }
                    }
                }
            } catch (errSync) {
                console.warn('[GameLoop Recovery] İzafi hız eşitleme hatası:', errSync);
            }

            // 2. Siper Akışı (Sonsuz ve kesintisiz akış)
            try {
                if (this.trench?.update) {
                    this.trench.update(ship.z);
                }
            } catch (errTrench) {
                console.warn('[GameLoop Recovery] Siper akışı hatası:', errTrench);
            }

            // 2b. Hiperspace Yıldız Alanı (Starfield Particle System):
            try {
                if (this.starfield?.update) {
                    this.starfield.update(ship.z, dt, ship.speed || 35.0);
                }
            } catch (errStar) {
                console.warn('[GameLoop Recovery] Starfield hatası:', errStar);
            }

            // 3. Kahraman X-Wing & Biyolojik Sinek Animasyonu
            try {
                if (this.heroXWing?.update) {
                    this.heroXWing.update(ship, this.latestData.fly, this.latestData.neural);
                } else if (this.tieFighter?.update) {
                    this.tieFighter.update(ship, this.latestData.fly, this.latestData.neural);
                }
            } catch (errHero) {
                console.warn('[GameLoop Recovery] Hero X-Wing animasyon hatası:', errHero);
            }

            // 3b. Kahraman X-Wing Siper Duvarı ve Taban Çarpışma Tespiti
            try {
                this.checkWallCollision(ship);
            } catch (errWall) {
                console.warn('[GameLoop Recovery] Duvar çarpışma kontrolü hatası:', errWall);
            }

            // 3b. Çoklu-Ajan Düşman İmparatorluk TIE Fighter Filosu (Multi-Agent SNN & 1 HP Glass Cannon)
            try {
                if (this.enemyTieSquadron?.update) {
                    const isHeroRolling = Boolean(this.latestData?.neural?.is_barrel_rolling);
                    this.enemyTieSquadron.update(dt, this.latestData.enemies, ship, isHeroRolling);
                } else if (this.darkXWingManager?.update) {
                    const isHeroRolling = Boolean(this.latestData?.neural?.is_barrel_rolling);
                    this.darkXWingManager.update(dt, this.latestData.enemies, ship, isHeroRolling);
                }
            } catch (errTieSq) {
                console.warn('[GameLoop Recovery] Düşman TIE Fighter filo güncelleme hatası:', errTieSq);
            }

            // 4. Termal Egzoz Çukuru Kontrolü (Görünmez Fallback Hedef ile Çökme Korumalı)
            const exhaustY = (this.exhaustPort && this.exhaustPort.group) ? this.exhaustPort.group.position.y : 12.0;
            let exhaustTargetPos = { x: 0, y: exhaustY, z: this.finalTargetZ || (ship.z + 38.0) };
            try {
                if (this.exhaustPort?.update) {
                    const exhaustRes = this.exhaustPort.update(dt, ship);
                    if (exhaustRes && exhaustRes.targetPos) {
                        exhaustTargetPos = exhaustRes.targetPos;
                    }
                }
            } catch (errExhaust) {
                console.warn('[GameLoop Recovery] Termal Egzoz Portu güncelleme hatası, görünmez fallback devrede:', errExhaust);
            }

            // 5. İkiz Proton Torpidoları Güncellemesi & Box3 Çarpışma Tespiti (İsabet ve Iska Kontrolü)
            try {
                if (this.torpedoes?.update) {
                    this.torpedoes.update(
                        dt,
                        this.exhaustPort,
                        (hitPos) => this.onTorpedoImpact(hitPos),
                        (missPos, latDist) => this.onTorpedoMiss(missPos, latDist)
                    );
                }
            } catch (errTorp) {
                console.warn('[GameLoop Recovery] Torpido güncelleme hatası:', errTorp);
            }

            // 6. Todesstern Göksel İstasyon Güncellemesi & Işık Takibi
            try {
                if (this.deathStar?.update) {
                    this.deathStar.update(ship.z, dt, this.isFinaleActive, this.finalTargetZ);
                }
            } catch (errDs) {
                console.warn('[GameLoop Recovery] Ölüm Yıldızı güncelleme hatası:', errDs);
            }

            if (this.dirLight) {
                this.dirLight.position.set(ship.x + 35, ship.y + 85, ship.z + 35);
                this.dirLight.target.position.set(ship.x, ship.y, ship.z);
            }
            if (this.fillLight) {
                this.fillLight.position.set(ship.x - 35, ship.y + 80, ship.z + 25);
                if (this.fillLight.target) {
                    this.fillLight.target.position.set(ship.x, ship.y, ship.z);
                }
            }

            // 7. Lazerler ve Görsel Geri Bildirim
            try {
                if (this.finalePhase < 3) {
                    this.laserSpawnTimer += dt;
                    const spawnInterval = this.isFinaleActive ? 0.36 : 0.85;
                    if (this.laserSpawnTimer > spawnInterval) {
                        this.laserSpawnTimer = 0;
                        this.spawnLaser();
                        if (this.isFinaleActive && Math.random() < 0.45) {
                            this.spawnLaser(true);
                        }
                    }
                }

                const relativeLasers = this.updateLasers(dt, ship);
                this.updateTieLasers(dt);

                // Python SNN Ommatidia'ya Görsel Geri Bildirim Fırlat (30 Hz Throttled & Sadece En Yakın 4 Tehdit)
                this.visualFeedbackFrameCounter = (this.visualFeedbackFrameCounter || 0) + 1;
                if (this.visualFeedbackFrameCounter % 2 === 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const topThreatLasers = relativeLasers
                        .filter(l => l.approaching)
                        .slice(0, 4);

                    this.ws.send(JSON.stringify({
                        type: 'visual_feedback',
                        lasers: topThreatLasers,
                        exhaust_target: exhaustTargetPos,
                        is_finale: Boolean(this.isFinaleActive)
                    }));
                }
            } catch (errLasers) {
                console.warn('[GameLoop Recovery] Lazer güncelleme hatası:', errLasers);
            }

            // 8. 3D Nöral Hologram (İzlenen Ajanın Gerçek Zamanlı SNN Telemetrisi & Hover Scale)
            try {
                if (this.hologram?.update) {
                    const currentBrain = this.getCurrentBrainTelemetry();
                    this.hologram.update(currentBrain.neural, currentBrain.fullData, currentBrain, dt);
                }
            } catch (errHolo) {
                console.warn('[GameLoop Recovery] Hologram güncelleme hatası:', errHolo);
            }

            // 9. Aktif Ajanlar Portre Paneli & Kamera Takibi
            try {
                this.updateActiveAgentsUI();
                this.updateCamera(dt);
            } catch (errCam) {
                console.warn('[GameLoop Recovery] Kamera veya Portre Paneli hatası:', errCam);
            }

            // 10. WebGL Render
            this.renderer.render(this.scene, this.camera);

        } catch (fatalLoopError) {
            console.error('[GameLoop Critical Lock] Render döngüsü çökmesi engellendi:', fatalLoopError);
        }
    }
}

// Uygulamayı Başlat
window.addEventListener('DOMContentLoaded', () => {
    window.sim = new SpacewarsSimulation();
    window.app = window.sim;
    window.simulationApp = window.sim;
});
