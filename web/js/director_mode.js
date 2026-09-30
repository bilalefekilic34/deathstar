/**
 * deathstarv2/web/js/director_mode.js
 * 
 * "Project Pigeon / Death Star v2" Sinematik Yönetmen Modu (Director Mode).
 * 
 * Star Wars: A New Hope (1977) "Ölüm Yıldızı Siper Koşusu (Trench Run)" sekansını
 * baz alan, simüle edilmiş Drosophila melanogaster (meyve sineği) beyni kontrollü
 * 4 sahneli tam otomatik, GÖRÜNMEZ arka plan Durum Makinesi (State Machine Sequencer).
 * 
 * - Ekranda hiçbir medya oynatıcı UI butonu veya paneli yer almaz.
 * - Sahnede yalnızca Sineğin Canlı Nöral Telemetrisi ve Canlı Konektom Hologramı kalır.
 * - Başlatıldığında MediaRecorder ile 60 FPS video kaydını otomatik başlatır.
 * - Ölüm Yıldızı patladığında kaydı durdurup .webm video dosyasını otomatik indirir.
 * 
 * Kronolojik Storyboard Akışı:
 * - Sahne 1: Siper Koşusuna Giriş [Film TC: 00:00 - 00:30]
 *   (Yüksekten siper dalışı, omuz üstü "Stay on target" takibi, kokpit içi sineğe yakın çekim, LC10a görsel takip parlaması)
 * - Sahne 2: İt Dalaşı ve Sıkıştırma [Film TC: 00:31 - 02:20]
 *   (Siper içi dinamik pan, arkadan kovalayan X-Wing'ler, öne geçen looming tehdit, Giant Fiber DNp01 refleksi, 360° fıçı tonosu ve karşı lazer taarruzu)
 * - Sahne 3: Hedefe Yaklaşma ve Otonom Kilitlenme [Film TC: 03:14 - 05:20]
 *   (Termal egzoz deliği belirir, kamera hedefe zoom yapar, "Luke hedefleme bilgisayarını kapattı" anı: elektronik sistem kapanır, sadece biyolojik feromon içgüdüsü aktif)
 * - Sahne 4: Atış ve Patlama [Film TC: 05:21 - 07:28]
 *   (Gövde altı yakın plan, sinek Proboscis refleksiyle hedefi ısırır, proton torpidoları ateşlenir ve kuyuya dalar, Mushroom Body +40 mV dopamin patlaması, Ölüm Yıldızı süpernova patlaması)
 */

import * as THREE from 'three';

export class DirectorMode {
    constructor(app) {
        this.app = app;
        this.scene = app.scene;
        this.camera = app.camera;

        this.isActive = false;

        // Toplam Süre: 68.0 saniye
        this.totalDuration = 68.0;
        this.currentTime = 0.0;

        // Sahne Zaman Aralıkları (Saniye cinsinden)
        this.scenes = [
            { id: 1, name: 'SİPER KOŞUSUNA GİRİŞ', tc: '00:00 - 00:30', start: 0.0, end: 16.0 },
            { id: 2, name: 'İT DALAŞI & SIKIŞTIRMA', tc: '00:31 - 02:20', start: 16.0, end: 36.0 },
            { id: 3, name: 'HEDEFE YAKLAŞMA & KİLİTLENME', tc: '03:14 - 05:20', start: 36.0, end: 52.0 },
            { id: 4, name: 'ATIŞ & SÜPERNOVA PATLAMASI', tc: '05:21 - 07:28', start: 52.0, end: 68.0 }
        ];

        // Kamera yumuşatma vektörleri
        this.currentCamPos = new THREE.Vector3();
        this.currentLookAt = new THREE.Vector3();
        this.targetCamPos = new THREE.Vector3();
        this.targetLookAt = new THREE.Vector3();

        // Tetiklenmiş tek seferlik olaylar tablosu (Idempotent trigger set)
        this.triggeredEvents = new Set();
    }

    start(startSceneNum = 1) {
        if (this.isActive) return;
        this.isActive = true;
        this.triggeredEvents.clear();

        // Yönetmen modunda sadece Nöral Telemetri ve Hologram kalacak şekilde arayüzü ayarla
        document.body.classList.add('director-active');

        // Kamera başlangıç pozisyonunu sabitle
        const ship = (this.app.latestData && this.app.latestData.ship) ? this.app.latestData.ship : { x: 0, y: 32, z: 0 };
        this.currentCamPos.copy(this.camera.position);
        this.currentLookAt.set(ship.x, ship.y + 2, ship.z + 10);

        // Sahne başlangıç zamanına sar
        const sc = this.scenes.find(s => s.id === startSceneNum) || this.scenes[0];
        this.currentTime = sc.start;

        console.log(`🎬 [DIRECTOR MODE] Başlatıldı! Sahne ${sc.id}: ${sc.name} (${sc.tc})`);

        // OTOMATİK GERÇEK ZAMANLI 60 FPS VİDEO KAYDI BAŞLAT
        if (this.app.videoRecorder && !this.app.videoRecorder.isRecording) {
            this.app.videoRecorder.startRecording();
        }
    }

    stop() {
        if (!this.isActive) return;
        this.isActive = false;

        document.body.classList.remove('director-active');

        // Hedefleme bilgisayarı arayüzünü normale döndür
        const crosshair = document.getElementById('hud-crosshair');
        if (crosshair) {
            crosshair.classList.remove('disengaged');
            crosshair.style.borderColor = 'rgba(0, 240, 255, 0.4)';
            crosshair.style.boxShadow = 'none';
        }

        // Otomatik Video Kaydını Sonlandır ve .webm İndir
        if (this.app.videoRecorder && this.app.videoRecorder.isRecording) {
            this.app.videoRecorder.stopRecording();
        }

        // Normal takip kamerasına yumuşak geçiş
        this.app.setCameraMode(1);
        console.log('🎬 [DIRECTOR MODE] Kapatıldı. Standart uçuş kamerasına dönüldü.');
    }

    toggle() {
        if (this.isActive) this.stop();
        else this.start(1);
    }

    triggerOnce(eventId, callback) {
        if (!this.triggeredEvents.has(eventId)) {
            this.triggeredEvents.add(eventId);
            try {
                callback();
            } catch (err) {
                console.warn(`[Director Event Error: ${eventId}]`, err);
            }
        }
    }

    update(dt) {
        if (!this.isActive) return;

        this.currentTime += dt;
        if (this.currentTime >= this.totalDuration) {
            this.currentTime = this.totalDuration;
        }

        const t = this.currentTime;
        const ship = (this.app.latestData && this.app.latestData.ship) ? this.app.latestData.ship : { x: 0, y: 32, z: 0 };

        // -------------------------------------------------------------
        // SAHNE 1: SİPER KOŞUSUNA GİRİŞ (0.0s - 16.0s) [Film TC: 00:00 - 00:30]
        // -------------------------------------------------------------
        if (t >= 0.0 && t < 16.0) {
            if (t < 5.5) {
                // Shot 1A: Yüksek İrtifa Siper Dalışı (Trench High Dive)
                const diveFactor = t / 5.5;
                this.targetCamPos.set(
                    ship.x + Math.sin(t * 0.8) * 8.0,
                    ship.y + 42.0 - diveFactor * 14.0,
                    ship.z - 72.0 + diveFactor * 22.0
                );
                this.targetLookAt.set(ship.x, ship.y + 2.0, ship.z + 30.0);
            } else if (t < 11.5) {
                // Shot 1B: Omuz Üstü Takip ("Stay on target" hissi)
                this.targetCamPos.set(
                    ship.x - 3.8,
                    ship.y + 3.2,
                    ship.z - 11.5
                );
                this.targetLookAt.set(ship.x + 0.5, ship.y + 1.2, ship.z + 55.0);
            } else {
                // Shot 1C: Kokpit İçi Sinek Pilot Yakın Çekimi & LC10a Görsel Kitleme
                this.targetCamPos.set(
                    ship.x,
                    ship.y + 1.35,
                    ship.z + 4.9
                );
                this.targetLookAt.set(ship.x, ship.y - 0.1, ship.z + 0.3);

                // LC10a görsel takip devresi heyecanlanır ve parlar
                this.triggerOnce('s1_lc10a_spike_12.0', () => {
                    if (this.app.hologram) {
                        this.app.hologram.update({
                            spikes: ['LC10a'],
                            dopamine_mv: 12.0,
                            is_barrel_rolling: false
                        });
                    }
                });
            }
        }

        // -------------------------------------------------------------
        // SAHNE 2: İT DALAŞI VE SIKIŞTIRMA (16.0s - 36.0s) [Film TC: 00:31 - 02:20]
        // -------------------------------------------------------------
        else if (t >= 16.0 && t < 36.0) {
            if (t < 23.0) {
                // Shot 2A: Siper Duvarı Boyunca Dinamik Pan & Çapraz Lazerler
                const panPhase = (t - 16.0) / 7.0;
                this.targetCamPos.set(
                    ship.x + Math.sin(panPhase * Math.PI) * 16.0,
                    ship.y + 3.8 + Math.cos(panPhase * Math.PI * 2) * 2.0,
                    ship.z - 28.0 + panPhase * 18.0
                );
                this.targetLookAt.set(ship.x, ship.y + 1.2, ship.z + 8.0);

                // Arka planda lazer ateşlemeleri
                this.triggerOnce('s2_laser_volley_18.0', () => {
                    this.app.spawnLaser(false);
                    setTimeout(() => this.app.spawnLaser(true), 350);
                    setTimeout(() => this.app.spawnLaser(false), 700);
                });
            } else if (t < 29.0) {
                // Shot 2B: Öne Geçen X-Wing & Looming Çarpışma Tehdidi
                this.targetCamPos.set(
                    ship.x * 0.8,
                    ship.y + 3.2,
                    ship.z + 18.0
                );
                this.targetLookAt.set(ship.x, ship.y + 0.8, ship.z - 25.0);
            } else {
                // Shot 2C: Giant Fiber Kaçış Refleksi & Fıçı Tonosu + Karşı Lazer Taarruzu
                const rollProgress = (t - 29.0) / 7.0;
                this.targetCamPos.set(
                    ship.x + Math.sin(rollProgress * 6.28) * 6.0,
                    ship.y + 4.5,
                    ship.z - 16.0
                );
                this.targetLookAt.set(ship.x, ship.y + 1.0, ship.z + 18.0);

                this.triggerOnce('s2_giant_fiber_roll_30.0', () => {
                    // Giant Fiber (DNp01) Spikeları ve Fıçı Tonosu
                    if (this.app.latestData && this.app.latestData.neural) {
                        this.app.latestData.neural.is_barrel_rolling = true;
                        this.app.latestData.neural.spikes = ['DNp01_L', 'DNp01_R'];
                    }
                    if (this.app.hologram) {
                        this.app.hologram.update({
                            spikes: ['DNp01_L', 'DNp01_R'],
                            dopamine_mv: 25.0,
                            is_barrel_rolling: true
                        });
                    }

                    try {
                        if (this.app.barrelRollSound) {
                            if (this.app.barrelRollSound.isPlaying) this.app.barrelRollSound.stop();
                            this.app.barrelRollSound.play();
                        }
                    } catch (e) {}

                    // Tono çıkışında Kahraman X-Wing kırmızı lazerlerini ateşleyip önündeki düşman TIE Fighter'ı vurur
                    setTimeout(() => {
                        if (this.app.fireHeroLasers) {
                            this.app.fireHeroLasers();
                        } else if (this.app.fireTieLasers) {
                            this.app.fireTieLasers();
                        }
                        if (this.app.enemyTieSquadron) {
                            const enemyPos = new THREE.Vector3(ship.x, ship.y + 0.5, ship.z + 28.0);
                            this.app.enemyTieSquadron.triggerTieExplosion(enemyPos.x, enemyPos.y, enemyPos.z, 'xwing_laser_hit');
                        }
                    }, 800);
                });
            }
        }

        // -------------------------------------------------------------
        // SAHNE 3: HEDEFE YAKLAŞMA & OTONOM KİLİTLENME (36.0s - 52.0s) [Film TC: 03:14 - 05:20]
        // -------------------------------------------------------------
        else if (t >= 36.0 && t < 52.0) {
            // Egzoz çukuru ve terminusu hazırla
            this.triggerOnce('s3_setup_exhaust_36.0', () => {
                const targetZ = ship.z + 160.0;
                this.app.triggerFinale(targetZ);
            });

            if (t < 44.0) {
                // Shot 3A: Egzoz Çukuru Ufukta Beliriyor & Telefoto Yakınlaşma
                this.targetCamPos.set(
                    ship.x * 0.7,
                    ship.y + 5.5,
                    ship.z - 36.0
                );
                const exhaustZ = this.app.finalTargetZ || (ship.z + 120.0);
                this.targetLookAt.set(0, 14.0, exhaustZ);
            } else {
                // Shot 3B: "Luke Hedefleme Bilgisayarını Kapattı" Homage
                this.targetCamPos.set(
                    ship.x - 2.8,
                    ship.y + 2.5,
                    ship.z - 8.5
                );
                const exhaustZ = this.app.finalTargetZ || (ship.z + 90.0);
                this.targetLookAt.set(0, 12.0, exhaustZ);

                // Elektronik hedefleme arayüzü kapanır, biyolojik içgüdü devreye girer
                this.triggerOnce('s3_targeting_computer_off_44.0', () => {
                    const crosshair = document.getElementById('hud-crosshair');
                    if (crosshair) {
                        crosshair.classList.add('disengaged');
                        crosshair.style.borderColor = '#ff3344';
                        crosshair.style.boxShadow = '0 0 20px #ff3344';
                    }
                });
            }
        }

        // -------------------------------------------------------------
        // SAHNE 4: PROBOSCIS ATIŞI & SÜPERNOVA PATLAMASI (52.0s - 68.0s) [Film TC: 05:21 - 07:28]
        // -------------------------------------------------------------
        else if (t >= 52.0) {
            if (t < 57.0) {
                // Shot 4A: Gövde Altı Yakın Planı & Egzoz Ağzına Giriş (Proboscis Hamlesi)
                this.targetCamPos.set(
                    ship.x,
                    ship.y - 1.8,
                    ship.z - 5.5
                );
                const exhaustZ = this.app.finalTargetZ || (ship.z + 40.0);
                this.targetLookAt.set(0, 10.0, exhaustZ);
            } else if (t < 61.5) {
                // Shot 4B: İkiz Proton Torpido Ateşlemesi & Kuyuya Dikiş Açısı
                this.targetCamPos.set(
                    ship.x + 4.2,
                    ship.y + 4.0,
                    ship.z - 12.0
                );
                const exhaustZ = this.app.finalTargetZ || (ship.z + 25.0);
                this.targetLookAt.set(0, 8.0, exhaustZ);

                // Proton torpidolarını fırlat!
                this.triggerOnce('s4_fire_torpedoes_57.5', () => {
                    this.app.fireProtonTorpedoes();
                });
            } else {
                // Shot 4C: Mushroom Body +40 mV Dopamin Patlaması & Ölüm Yıldızı Süpernovası!
                const orbitT = (t - 61.5) / 6.5;
                const orbitAngle = orbitT * 1.4;
                const orbitDist = 180.0 + orbitT * 140.0;

                this.targetCamPos.set(
                    ship.x + Math.sin(orbitAngle) * orbitDist,
                    ship.y + 60.0 + orbitT * 40.0,
                    ship.z - Math.cos(orbitAngle) * orbitDist
                );
                this.targetLookAt.set(ship.x, ship.y + 10.0, ship.z + 50.0);

                // Nihai Süpernova Patlaması & Dopamin Enjeksiyonu
                this.triggerOnce('s4_supernova_explosion_61.8', () => {
                    const exhaustPos = (this.app.exhaustPort && this.app.exhaustPort.group)
                        ? this.app.exhaustPort.group.position
                        : new THREE.Vector3(0, 12, ship.z + 50);

                    // 1. Ekranı kaplayan kör edici beyaz flaş
                    const flashEl = document.getElementById('white-flash');
                    if (flashEl) {
                        flashEl.style.opacity = '1.0';
                        setTimeout(() => { flashEl.style.opacity = '0.0'; }, 400);
                    }

                    // 2. Kamera devasa sarsıntı (Supernova Trauma)
                    this.app.cameraTrauma = 2.5;

                    // 3. Devasa parçacık patlaması
                    if (this.app.exhaustPort?.triggerEpicExplosion) {
                        this.app.exhaustPort.triggerEpicExplosion(exhaustPos);
                    }

                    // 4. İkonik Ölüm Yıldızı Patlama Ses Efekti
                    try {
                        if (this.app.deathStarExplosionSound) {
                            if (this.app.deathStarExplosionSound.isPlaying) this.app.deathStarExplosionSound.stop();
                            this.app.deathStarExplosionSound.play();
                        }
                        if (this.app.dopamineSound) {
                            this.app.dopamineSound.play();
                        }
                    } catch (e) {}

                    // 5. Biyolojik Dopamin Patlaması: +40 mV Dopamin enjeksiyonu
                    if (this.app.latestData && this.app.latestData.neural) {
                        this.app.latestData.neural.dopamine_mv = 100.0;
                        if (this.app.latestData.learning) {
                            this.app.latestData.learning.level = 5;
                            this.app.latestData.learning.level_title = 'Seviye 5: Sith Lordu Drosophila';
                            this.app.latestData.learning.score = 1000;
                            this.app.latestData.learning.progress_pct = 100.0;
                        }
                        this.app.updateHUD(this.app.latestData);
                    }

                    if (this.app.hologram) {
                        this.app.hologram.update({
                            spikes: ['PAM', 'MBON_alpha', 'MBON_beta'],
                            dopamine_mv: 100.0,
                            is_barrel_rolling: false
                        });
                    }

                    this.app.isVictory = true;
                    this.app.finalePhase = 3;

                    // Patlamayı 4.5 saniye kaydettikten sonra videoyu otomatik olarak derleyip indir
                    setTimeout(() => {
                        if (this.app.videoRecorder && this.app.videoRecorder.isRecording) {
                            this.app.videoRecorder.stopRecording();
                        }
                    }, 4500);
                });
            }
        }

        // -------------------------------------------------------------
        // Kamera İnterpolasyonu (Smooth Cinematic Spline Lerp)
        // -------------------------------------------------------------
        const smoothRate = Math.min(1.0, 8.5 * dt);
        this.currentCamPos.lerp(this.targetCamPos, smoothRate);
        this.currentLookAt.lerp(this.targetLookAt, smoothRate);

        this.camera.position.copy(this.currentCamPos);
        this.camera.lookAt(this.currentLookAt);
    }
}
