/**
 * deathstarv2/web/js/dark_x_wing.js
 * 
 * Multi-Agent Dark X-Wing Filo Yöneticisi & 1 HP Glass Cannon Çatışma Sistemi.
 * - Sketchfab Dark X-Wing referanslı GLTF modeli (/models/dark_x_wing.glb) GLTFLoader ile yüklenir.
 * - Her X-Wing arka plandaki kendi Drosophila (Meyve Sineği) SNN beyniyle yönlendirilir.
 * - Kokpit camının ardında kendi 3D sinek pilotu (200 Hz kanat çırpan Drosophila) yer alır.
 * - Uçuş Fiziği: TIE Fighter ile aynı (asimetrik kanat vuruş torku ΔΦ, Roll/Pitch/Yaw).
 * - Hedefleme: LC10a devresi öndeki TIE Fighter'a sürekli kilitlenir.
 * - Atış: Sinek menzile girdiğinde Proboscis Extension Reflex (PER) ile lazer salvosu ateşler (-z'den +z'ye).
 * - 1 HP Kuralı (Glass Cannon): Tek vuruşluk can; siper duvarına çarparsa veya TIE'nin
 *   Giant Fiber fıçı tonosu girdap şokuna yakalanırsa anında patlayarak (Particle System + Ses) sahneden silinir.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class DarkXWingManager {
    constructor(scene, audioListener, onLaserFiredCallback, onEnemyDestroyedCallback) {
        this.scene = scene;
        this.audioListener = audioListener;
        this.onLaserFiredCallback = onLaserFiredCallback;
        this.onEnemyDestroyedCallback = onEnemyDestroyedCallback;

        this.loader = new GLTFLoader();
        this.masterTemplate = null;
        this.isModelReady = false;

        // Aktif Düşman Birimleri: Map<agent_id, EnemyInstance>
        this.activeEnemies = new Map();

        // Patlama Parçacık Havuzu (Önceden Tahsis Edilmiş Bellek - Zero GC)
        this.particlePool = [];
        this.maxPoolParticles = 60;
        this.debrisGroup = new THREE.Group();
        this.scene.add(this.debrisGroup);
        this.initParticlePool();

        // Patlama Ses Efekti (Web Audio Buffer)
        this.explosionSound = null;
        this.initExplosionSound();
    }

    initParticlePool() {
        const colorPalette = [0xff4500, 0xffa500, 0xffffff, 0x181c22, 0xea580c];
        const sharedBoxGeo = new THREE.BoxGeometry(0.4, 0.2, 0.4);
        const sharedTetraGeo = new THREE.TetrahedronGeometry(0.35);
        const sharedMats = colorPalette.map(c => new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity: 1.0
        }));

        for (let i = 0; i < this.maxPoolParticles; i++) {
            const geo = (i % 2 === 0) ? sharedBoxGeo : sharedTetraGeo;
            const mat = sharedMats[i % sharedMats.length];
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            this.debrisGroup.add(mesh);
            this.particlePool.push({
                mesh: mesh,
                vel: new THREE.Vector3(),
                rotSpeed: new THREE.Vector3(),
                life: 0.0,
                decay: 1.0,
                active: false
            });
        }
    }

    initExplosionSound() {
        if (!this.audioListener) return;
        try {
            const ctx = this.audioListener.context;
            const sampleRate = ctx.sampleRate;
            const duration = 1.3;
            const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
            const data = buffer.getChannelData(0);

            // Zengin gök gürültüsü / metal parçalanma patlaması sentezi
            for (let i = 0; i < buffer.length; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * 3.8);
                // Düşük frekanslı rezonant patlama + beyaz gürültü + distorsiyon
                const noise = (Math.random() * 2 - 1) * 0.7;
                const boom = Math.sin(2 * Math.PI * (75 - t * 45) * t) * 0.6;
                const snap = Math.sin(2 * Math.PI * 340 * t) * Math.exp(-t * 22.0) * 0.5;
                data[i] = (noise + boom + snap) * env;
            }

            this.explosionSound = new THREE.Audio(this.audioListener);
            this.explosionSound.setBuffer(buffer);
            this.explosionSound.setVolume(1.0);
        } catch (err) {
            console.warn('[DarkXWing] Ses sentezleme uyarısı:', err);
        }
    }

    async init() {
        return new Promise((resolve) => {
            this.loader.load(
                '/models/dark_x_wing.glb',
                (gltf) => {
                    this.masterTemplate = gltf.scene;

                    // Yüksek Kalite PBR Malzeme İyileştirmeleri (Dark X-Wing Estetiği)
                    this.masterTemplate.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            const name = child.name.toLowerCase();

                            if (name.includes('glass') || name.includes('canopy')) {
                                // Şeffaf kokpit camı (içteki sinek pilot görünsün)
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x93c5fd,
                                    opacity: 0.28,
                                    transparent: true,
                                    roughness: 0.08,
                                    metalness: 0.20,
                                    depthWrite: false
                                });
                            } else if (name.includes('stripe') || name.includes('intake') || name.includes('panel') || name.includes('ring')) {
                                // Dark X-Wing İkonik Yarış Turuncusu (#ea580c)
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xea580c,
                                    emissive: 0xc2410c,
                                    emissiveIntensity: 0.65,
                                    roughness: 0.28,
                                    metalness: 0.35
                                });
                            } else if (name.includes('glow')) {
                                // Yüksek İtişli İyon Egzoz Alevi (#ff4500)
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x330800,
                                    emissive: 0xff4500,
                                    emissiveIntensity: 4.0,
                                    roughness: 0.15,
                                    metalness: 0.80
                                });
                            } else if (name.includes('cannon') || name.includes('barrel') || name.includes('probe')) {
                                // Taim & Bak KX9 Titanyum Silah Metali
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x2d343f,
                                    roughness: 0.22,
                                    metalness: 0.90,
                                    clearcoat: 0.35
                                });
                            } else if (name.includes('droid_head')) {
                                // Astromech Droid Gümüş Kubbesi
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xd1d5db,
                                    roughness: 0.18,
                                    metalness: 0.88
                                });
                            } else if (name.includes('sensor_eye')) {
                                // Kırmızı Droid Sensör Gözü
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xff0000,
                                    emissive: 0xff1e1e,
                                    emissiveIntensity: 3.0
                                });
                            } else {
                                // Koyu Karbon/Titanyum Mat Gövde (#181c22)
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x181c22,
                                    roughness: 0.34,
                                    metalness: 0.88,
                                    clearcoat: 0.30,
                                    clearcoatRoughness: 0.18
                                });
                            }
                        }
                    });

                    this.isModelReady = true;
                    console.log('[DarkXWing] ✓ Dark X-Wing GLTF Modeli Başarıyla Yüklendi ve PBR Malzemelerle Hazırlandı!');
                    resolve();
                },
                undefined,
                (err) => {
                    console.warn('[DarkXWing] GLTF yükleme hatası, prosedürel X-Wing hazırlanıyor:', err);
                    this.masterTemplate = this.createFallbackXWingMesh();
                    this.isModelReady = true;
                    resolve();
                }
            );
        });
    }

    createFallbackXWingMesh() {
        const root = new THREE.Group();
        const matHull = new THREE.MeshStandardMaterial({ color: 0x181c22, roughness: 0.35, metalness: 0.85 });
        const matOrange = new THREE.MeshStandardMaterial({ color: 0xea580c, emissive: 0xc2410c, emissiveIntensity: 0.5 });
        const matGlass = new THREE.MeshStandardMaterial({ color: 0x93c5fd, opacity: 0.3, transparent: true });

        const bodyGeo = new THREE.BoxGeometry(1.8, 1.2, 7.0);
        root.add(new THREE.Mesh(bodyGeo, matHull));

        const noseStripeGeo = new THREE.BoxGeometry(0.4, 0.05, 5.0);
        const stripe = new THREE.Mesh(noseStripeGeo, matOrange);
        stripe.position.set(0, 0.62, 1.0);
        root.add(stripe);

        const canopyGeo = new THREE.BoxGeometry(1.1, 0.6, 2.0);
        const canopy = new THREE.Mesh(canopyGeo, matGlass);
        canopy.position.set(0, 0.8, 0.8);
        root.add(canopy);

        // 4 Kanat
        const wingGeo = new THREE.BoxGeometry(5.0, 0.15, 2.2);
        for (const [sx, sy, rz] of [[-1, 1, 0.2], [-1, -1, -0.2], [1, 1, 0.2], [1, -1, -0.2]]) {
            const w = new THREE.Mesh(wingGeo, matHull);
            w.position.set(sx * 3.0, sy * 0.4, -1.8);
            w.rotation.z = rz * sx;
            root.add(w);
        }

        return root;
    }

    createEnemyInstance(agentId, spawnData) {
        if (!this.masterTemplate) return null;

        const group = new THREE.Group();
        group.name = `enemy_${agentId}`;

        // GLTF Modelini derin kopyala (clone)
        const shipMesh = this.masterTemplate.clone(true);
        group.add(shipMesh);

        // 3D Drosophila Sinek Pilotunu kokpit içine inşa et
        const flyRig = this.buildFlyPilot(group);

        group.position.set(spawnData.x, spawnData.y, spawnData.z);
        this.scene.add(group);

        const instance = {
            id: agentId,
            group: group,
            flyRig: flyRig,
            hp: 1,
            isAlive: true,
            lastZ: spawnData.z
        };

        this.activeEnemies.set(agentId, instance);
        console.log(`[DarkXWing] 👾 Sahneye Yeni Biyolojik Pilotlu X-Wing Eklendi: ${agentId}`);
        return instance;
    }

    buildFlyPilot(parentGroup) {
        const flyGroup = new THREE.Group();
        // Kokpitin içi (Z: 0.8, Y: 0.55)
        flyGroup.position.set(0, 0.48, 0.85);
        flyGroup.scale.set(0.42, 0.42, 0.42);

        // 1. Toraks & Abdomen
        const thoraxGeo = new THREE.SphereGeometry(0.7, 12, 12);
        thoraxGeo.scale(1.0, 1.1, 1.4);
        const thoraxMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.4 });
        flyGroup.add(new THREE.Mesh(thoraxGeo, thoraxMat));

        const abdomenGeo = new THREE.SphereGeometry(0.8, 12, 12);
        abdomenGeo.scale(0.85, 0.85, 1.7);
        const abdomenMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.35 });
        const abdomen = new THREE.Mesh(abdomenGeo, abdomenMat);
        abdomen.position.set(0, -0.25, -1.4);
        abdomen.rotation.x = -0.15;
        flyGroup.add(abdomen);

        // 2. Baş & Kırmızı Petek Gözler (750 Ommatidia)
        const headGeo = new THREE.SphereGeometry(0.5, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x1f140e });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 0.2, 1.1);
        flyGroup.add(head);

        const eyeGeo = new THREE.SphereGeometry(0.32, 10, 10);
        eyeGeo.scale(1.0, 1.25, 1.1);
        const eyeMat = new THREE.MeshStandardMaterial({
            color: 0xff1e1e,
            emissive: 0xbb0000,
            roughness: 0.2,
            metalness: 0.4
        });

        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.32, 0.3, 1.2);
        flyGroup.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.32, 0.3, 1.2);
        flyGroup.add(rightEye);

        // 3. Kanatlar (200 Hz Asimetrik Strok Pivotları)
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0);
        wingShape.quadraticCurveTo(1.0, 0.35, 2.2, 0.1);
        wingShape.quadraticCurveTo(2.4, -0.35, 1.6, -0.6);
        wingShape.quadraticCurveTo(0.5, -0.5, 0, 0);

        const wingGeo = new THREE.ShapeGeometry(wingShape);
        const wingMat = new THREE.MeshStandardMaterial({
            color: 0xddf4ff,
            opacity: 0.65,
            transparent: true,
            roughness: 0.2,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        const leftPivot = new THREE.Group();
        leftPivot.position.set(-0.4, 0.5, 0.2);
        const leftWing = new THREE.Mesh(wingGeo, wingMat);
        leftWing.rotation.set(-Math.PI / 2, 0, Math.PI * 0.9);
        leftPivot.add(leftWing);
        flyGroup.add(leftPivot);

        const rightPivot = new THREE.Group();
        rightPivot.position.set(0.4, 0.5, 0.2);
        const rightWing = new THREE.Mesh(wingGeo, wingMat);
        rightWing.rotation.set(-Math.PI / 2, 0, Math.PI * 0.1);
        rightWing.scale.set(-1, 1, 1);
        rightPivot.add(rightWing);
        flyGroup.add(rightPivot);

        parentGroup.add(flyGroup);

        return {
            leftPivot: leftPivot,
            rightPivot: rightPivot,
            flyGroup: flyGroup
        };
    }

    triggerXWingExplosion(x, y, z, reason = 'hitbox_wall_crash') {
        // 1. Havuzdan Parçacık Patlaması (Önceden Tahsis Edilmiş - Zero GC)
        let activated = 0;
        const targetCount = 30;

        for (let i = 0; i < this.particlePool.length; i++) {
            const p = this.particlePool[i];
            if (!p.active) {
                p.mesh.position.set(
                    x + (Math.random() - 0.5) * 1.8,
                    y + (Math.random() - 0.5) * 1.8,
                    z + (Math.random() - 0.5) * 1.8
                );
                const speed = 20.0 + Math.random() * 35.0;
                const theta = Math.random() * Math.PI * 2;
                const phi = (Math.random() - 0.5) * Math.PI;
                p.vel.set(
                    Math.cos(phi) * Math.cos(theta) * speed,
                    Math.sin(phi) * speed * 0.7,
                    Math.cos(phi) * Math.sin(theta) * speed
                );
                p.rotSpeed.set(
                    (Math.random() - 0.5) * 12,
                    (Math.random() - 0.5) * 12,
                    (Math.random() - 0.5) * 12
                );
                p.life = 1.0;
                p.decay = 1.0 + Math.random() * 0.8;
                p.mesh.material.opacity = 1.0;
                p.mesh.visible = true;
                p.active = true;
                activated++;
                if (activated >= targetCount) break;
            }
        }

        // 2. Ses Efekti Oynat
        if (this.explosionSound) {
            try {
                if (this.explosionSound.isPlaying) this.explosionSound.stop();
                this.explosionSound.play();
            } catch (err) {
                console.warn('[DarkXWing] Patlama sesi hatası:', err);
            }
        }

        console.log(`[DarkXWing] 💥 1 HP KURALI: X-Wing Patlatıldı (${reason})! Konum: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
    }

    update(dt, enemiesTelemetry, tiePos, isTieBarrelRolling) {
        if (!this.isModelReady) return;

        // A. Havuzlanmış Parçacık Sistemini Güncelle (Zero GC)
        for (let i = 0; i < this.particlePool.length; i++) {
            const p = this.particlePool[i];
            if (p.active) {
                p.mesh.position.addScaledVector(p.vel, dt);
                p.mesh.rotation.x += p.rotSpeed.x * dt;
                p.mesh.rotation.y += p.rotSpeed.y * dt;
                p.mesh.rotation.z += p.rotSpeed.z * dt;
                p.life -= p.decay * dt;

                if (p.life > 0) {
                    p.mesh.material.opacity = p.life;
                } else {
                    p.active = false;
                    p.mesh.visible = false;
                }
            }
        }

        // B. Telemetri ile X-Wing Birimlerini Senkronize Et
        if (!enemiesTelemetry || !Array.isArray(enemiesTelemetry)) return;

        // TIE Fighter Bounding Box (Kabin + devasa dikey altıgen güneş panelleri: W: 8.5m, H: 8.8m, D: 7.2m)
        if (!this.tieBox) this.tieBox = new THREE.Box3();
        this.tieBox.setFromCenterAndSize(
            new THREE.Vector3(tiePos.x, tiePos.y, tiePos.z),
            new THREE.Vector3(8.5, 8.8, 7.2)
        );

        const currentTelemetryIds = new Set();

        for (const enemyData of enemiesTelemetry) {
            const agentId = enemyData.id;
            currentTelemetryIds.add(agentId);

            let instance = this.activeEnemies.get(agentId);
            if (!instance) {
                // Sahneye yeni X-Wing spawn et
                instance = this.createEnemyInstance(agentId, enemyData);
                if (!instance) continue;
            }

            const ex = enemyData.x;
            const ey = enemyData.y;
            const ez = enemyData.z;

            // Konum ve 6-DoF Rotasyon (Önce pozisyon ve rotasyonu güncelle)
            instance.group.position.set(ex, ey, ez);
            instance.group.rotation.z = -enemyData.roll;   // Roll
            instance.group.rotation.x = -enemyData.pitch;  // Pitch
            instance.group.rotation.y = -enemyData.yaw;    // Yaw
            instance.lastZ = ez;

            // X-Wing Bounding Box (Kanat açıklığı ~11.8m, dikey yükseklik ~3.2m, uzunluk ~12.2m)
            if (!instance.box) instance.box = new THREE.Box3();
            instance.box.setFromCenterAndSize(
                instance.group.position,
                new THREE.Vector3(11.8, 3.2, 12.2)
            );

            // 1. Siper Duvarı Hitbox Kontrolü: |X| >= 34.0, Y <= 5.0, Y >= 78.0
            const isWallHit = (Math.abs(ex) >= 34.0 || ey <= 5.0 || ey >= 78.0);

            // 2. Fiziksel Box3 Çarpışma Tespiti (TIE Fighter Box3 ile X-Wing Box3 Kesişimi)
            const isBoxIntersect = this.tieBox.intersectsBox(instance.box);

            // 3. TIE Fighter Giant Fiber Fıçı Tonosu Girdap Şoku:
            // TIE Fighter fıçı tonosu yaparken arkasındaki yüksek enerjili plazma girdabı
            // 28 metre yakınındaki veya Box3 temasındaki 1 HP X-Wing'i anında savurup parçalar!
            const dx = tiePos.x - ex;
            const dy = tiePos.y - ey;
            const dz = tiePos.z - ez;
            const distToTie = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const isBarrelRollWakeHit = isTieBarrelRolling && (distToTie < 28.0 || isBoxIntersect);

            // 4. Doğrudan Gövde Çarpışması (Fıçı tonosu yapılmıyorsa ve Box3 kesiştiyse)
            const isPhysicalCollision = isBoxIntersect && !isTieBarrelRolling;

            if ((isWallHit || isBarrelRollWakeHit || isPhysicalCollision || !enemyData.is_alive) && instance.isAlive) {
                instance.isAlive = false;
                const reason = isPhysicalCollision ? 'tie_physical_collision' : (isBarrelRollWakeHit ? 'tie_barrel_roll_wake' : (isWallHit ? 'trench_wall_crash' : 'server_destroyed'));
                this.triggerXWingExplosion(ex, ey, ez, reason);

                // Sunucuya ve ana uygulamaya imha bildirimini ilet
                if (this.onEnemyDestroyedCallback) {
                    this.onEnemyDestroyedCallback(agentId, reason);
                }

                this.scene.remove(instance.group);
                this.activeEnemies.delete(agentId);
                continue;
            }

            // 200 Hz Sinek Kanat Çırpma & Asimetri
            if (instance.flyRig) {
                instance.flyRig.leftPivot.rotation.z = enemyData.wing_l;
                instance.flyRig.rightPivot.rotation.z = -enemyData.wing_r;
            }

            // PER Lazer Ateşleme Refleksi (-z'den +z'ye, öndeki TIE Fighter'a)
            // YALNIZCA X-Wing TIE Fighter'ın arkasındayken ateş açar (dz > 4.0m)
            if (enemyData.fire_laser && this.onLaserFiredCallback && dz > 4.0) {
                // 4 Kanat ucundan (+Z ileri yönünde) yeşil plazma lazer salvosu
                const cannonOffsets = [
                    [-6.1,  1.8], // Üst-Sol
                    [-6.1, -1.8], // Alt-Sol
                    [ 6.1,  1.8], // Üst-Sağ
                    [ 6.1, -1.8], // Alt-Sağ
                ];

                for (const [cx, cy] of cannonOffsets) {
                    // X-Wing'in rotasyonuna göre namlu uç noktalarını hesapla
                    const localTip = new THREE.Vector3(cx, cy, 5.2);
                    localTip.applyEuler(instance.group.rotation);
                    const spawnPos = instance.group.position.clone().add(localTip);

                    // Lazer hızı: Kesinlikle -z'den +z'ye doğru (+130 m/s)
                    const laserSpeed = 135.0;
                    this.onLaserFiredCallback(spawnPos, laserSpeed, agentId);
                }
            }
        }

        // Telemetriden silinmiş eski düşmanları temizle
        for (const [id, instance] of this.activeEnemies.entries()) {
            if (!currentTelemetryIds.has(id)) {
                this.scene.remove(instance.group);
                this.activeEnemies.delete(id);
            }
        }
    }

    destroyEnemy(agentId, reason = 'tie_laser_hit') {
        const instance = this.activeEnemies.get(agentId);
        if (instance && instance.isAlive) {
            instance.isAlive = false;
            const ex = instance.group.position.x;
            const ey = instance.group.position.y;
            const ez = instance.group.position.z;
            this.triggerXWingExplosion(ex, ey, ez, reason);
            if (this.onEnemyDestroyedCallback) {
                this.onEnemyDestroyedCallback(agentId, reason);
            }
            this.scene.remove(instance.group);
            this.activeEnemies.delete(agentId);
            return true;
        }
        return false;
    }

    reset() {
        for (const [, instance] of this.activeEnemies.entries()) {
            this.scene.remove(instance.group);
        }
        this.activeEnemies.clear();

        for (const p of this.particlePool) {
            p.active = false;
            p.mesh.visible = false;
        }
    }
}
