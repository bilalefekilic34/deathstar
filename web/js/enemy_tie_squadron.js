/**
 * deathstarv2/web/js/enemy_tie_squadron.js
 * 
 * Çoklu Düşman İmparatorluk TIE Fighter Filosu (Multi-Agent Imperial TIE Squadron).
 * - Star Wars Lore: Siperde kahraman X-Wing'i arkadan kovalayan ve üzerine yeşil lazer sıkan İmparatorluk filosu.
 * - SADECE GLTFLoader ile '/models/tie_fighter.glb' Sketchfab modeli yüklenir.
 * - İlkel sahte geometriler (BoxGeometry, CylinderGeometry vs.) KESİNLİKLE İÇERMEZ.
 * - Bounding Box: Yalnızca matematiksel çarpışma için görünmez THREE.Box3 kullanılır.
 * - Şeffaf kokpiti içinde 3D Drosophila Melanogaster biyo-pilotu yer alır.
 * - 1 HP Glass Cannon Kuralı: X-Wing lazeri, siper duvarı veya X-Wing fıçı tonosu girdabına yakalanırsa anında patlar.
 * - PBR MeshPhysicalMaterial / MeshStandardMaterial ve envMap yansımaları içerir.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class EnemyTieSquadron {
    constructor(scene, audioListener, onLaserFiredCallback, onEnemyDestroyedCallback) {
        this.scene = scene;
        this.audioListener = audioListener;
        this.onLaserFiredCallback = onLaserFiredCallback;
        this.onEnemyDestroyedCallback = onEnemyDestroyedCallback;

        this.loader = new GLTFLoader();
        this.masterTemplate = null;
        this.isModelReady = false;

        // Aktif Düşman TIE Birimleri: Map<agent_id, EnemyInstance>
        this.activeEnemies = new Map();

        // Patlama Parçacık Havuzu (Önceden Tahsis Edilmiş - Zero GC)
        this.particlePool = [];
        this.maxPoolParticles = 60;
        this.debrisGroup = new THREE.Group();
        this.debrisGroup.name = 'tie_explosion_debris';
        this.scene.add(this.debrisGroup);
        this.initParticlePool();

        // Patlama Ses Efekti (Web Audio Buffer)
        this.explosionSound = null;
        this.initExplosionSound();

        // X-Wing Hitbox referansı
        this.xWingBox = new THREE.Box3();
    }

    initParticlePool() {
        const colorPalette = [0x00ff88, 0x10b981, 0xffffff, 0x181c22, 0x475569];
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

            for (let i = 0; i < buffer.length; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * 3.8);
                const noise = (Math.random() * 2 - 1) * 0.7;
                const boom = Math.sin(2 * Math.PI * (75 - t * 45) * t) * 0.6;
                const snap = Math.sin(2 * Math.PI * 340 * t) * Math.exp(-t * 22.0) * 0.5;
                data[i] = (noise + boom + snap) * env;
            }

            this.explosionSound = new THREE.Audio(this.audioListener);
            this.explosionSound.setBuffer(buffer);
            this.explosionSound.setVolume(1.0);
        } catch (err) {
            console.warn('[EnemyTieSquadron] Ses sentezleme uyarısı:', err);
        }
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.loader.load(
                '/models/tie_fighter.glb',
                (gltf) => {
                    this.masterTemplate = gltf.scene;

                    // İmparatorluk TIE Fighter PBR Malzemeleri
                    this.masterTemplate.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            const name = (child.name || '').toLowerCase();

                            // 1. Ultra-Şeffaf Kokpit Camı (İçindeki 3D Stormtrooper Kaskı kristal netliğinde görünsün)
                            if (name.includes('glass') || name.includes('canopy')) {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x93c5fd,
                                    transmission: 0.92,
                                    opacity: 0.10,
                                    transparent: true,
                                    roughness: 0.05,
                                    metalness: 0.10,
                                    depthWrite: false
                                });
                            }
                            // 2. Güneş Panelleri (Fotovoltaik siyah solar ızgaralar)
                            else if ((name === 'left_wing' || name === 'right_wing') && !name.includes('strut') && !name.includes('rim') && !name.includes('hub')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x11161d,
                                    roughness: 0.58,
                                    metalness: 0.28,
                                    side: THREE.DoubleSide
                                });
                            }
                            // 3. İkiz İyon Motorları (Kırmızı İmparatorluk reaktör ışıması)
                            else if (name.includes('engine') && !name.includes('block') && !name.includes('nozzle')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x220000,
                                    emissive: 0xff1e1e,
                                    emissiveIntensity: 3.5,
                                    roughness: 0.20,
                                    metalness: 0.85
                                });
                            }
                            // 4. Gövde & Kanat Pylonları (İmparatorluk Durasteel Gri/Mavi Çeliği)
                            else {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x8a9ba8,
                                    roughness: 0.25,
                                    metalness: 0.88,
                                    clearcoat: 0.35,
                                    clearcoatRoughness: 0.18,
                                    side: THREE.DoubleSide
                                });
                            }
                        }
                    });

                    this.isModelReady = true;
                    console.log('[EnemyTieSquadron] ✓ Düşman TIE Fighter GLTF Modeli Başarıyla Yüklendi ve PBR Malzemelerle Hazırlandı!');
                    resolve();
                },
                undefined,
                (err) => {
                    console.error('[EnemyTieSquadron] GLTF yükleme hatası (/models/tie_fighter.glb):', err);
                    reject(err);
                }
            );
        });
    }

    createEnemyInstance(agentId, spawnData) {
        if (!this.masterTemplate) return null;

        const group = new THREE.Group();
        group.name = `enemy_tie_${agentId}`;

        // GLTF Modelini derin kopyala (clone)
        const shipMesh = this.masterTemplate.clone(true);
        group.add(shipMesh);

        // 2. Gerçek 3D Stormtrooper Kaskı Entegrasyonu (Object3D Grouping / Parenting)
        // Doğrudan TIE Fighter'ın ana model grubuna eklenir (shipMesh.add(helmet))
        const helmetPrefab = (typeof window !== 'undefined' ? window.stormtrooperHelmetPrefab : null);
        if (helmetPrefab) {
            const helmet = helmetPrefab.clone(true);
            helmet.name = `stormtrooper_helmet_${agentId}`;
            // 3. Pozisyon, Ölçek ve Rotasyon Ayarları:
            // Kokpit merkezine tam oturur, oranı bozulmadan uniform küçültülür, vizörü doğrudan kaçan X-Wing'e (+Z) bakar
            helmet.scale.set(1.4, 1.4, 1.4);
            helmet.position.set(0, 0.35, 1.05);
            helmet.rotation.set(0, 0, 0); // X-Wing yönüne (+Z) bakar
            shipMesh.add(helmet);

            // Kokpit içi yumuşak aydınlatma: Kaskın beyaz zırhını ve siyah vizörünü camın arkasından ışıldatır
            const cockpitLight = new THREE.PointLight(0xffffff, 3.5, 6.0);
            cockpitLight.position.set(0, 0.8, 1.5);
            shipMesh.add(cockpitLight);
        }

        group.position.set(spawnData.x, spawnData.y, spawnData.z);
        this.scene.add(group);

        const instance = {
            id: agentId,
            group: group,
            hp: 1,
            isAlive: true,
            lastZ: spawnData.z,
            box: new THREE.Box3()
        };

        this.activeEnemies.set(agentId, instance);
        console.log(`[EnemyTieSquadron] 👾 Sahneye Yeni Stormtrooper Pilotlu Düşman TIE Fighter Eklendi: ${agentId}`);
        return instance;
    }

    triggerTieExplosion(x, y, z, reason = 'hitbox_wall_crash') {
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

        if (this.explosionSound) {
            try {
                if (this.explosionSound.isPlaying) this.explosionSound.stop();
                this.explosionSound.play();
            } catch (err) {
                console.warn('[EnemyTieSquadron] Patlama sesi hatası:', err);
            }
        }

        console.log(`[EnemyTieSquadron] 💥 1 HP KURALI: Düşman TIE Fighter Patlatıldı (${reason})! Konum: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
    }

    update(dt, enemiesTelemetry, heroPos, isHeroBarrelRolling) {
        if (!this.isModelReady) return;

        // A. Havuzlanmış Parçacık Sistemini Güncelle
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

        // B. Telemetri ile Düşman TIE Birimlerini Senkronize Et
        if (!enemiesTelemetry || !Array.isArray(enemiesTelemetry)) return;

        // Kahraman X-Wing Bounding Box (Görünmez matematiksel Box3: W: 11.8m, H: 3.2m, D: 12.2m)
        this.xWingBox.setFromCenterAndSize(
            new THREE.Vector3(heroPos.x, heroPos.y, heroPos.z),
            new THREE.Vector3(11.8, 3.2, 12.2)
        );

        const currentTelemetryIds = new Set();

        for (const enemyData of enemiesTelemetry) {
            const agentId = enemyData.id;
            currentTelemetryIds.add(agentId);

            let instance = this.activeEnemies.get(agentId);
            if (!instance) {
                instance = this.createEnemyInstance(agentId, enemyData);
                if (!instance) continue;
            }

            const ex = enemyData.x;
            const ey = enemyData.y;
            const ez = enemyData.z;

            // Konum ve 6-DoF Rotasyon
            instance.group.position.set(ex, ey, ez);
            instance.group.rotation.z = -enemyData.roll;   // Roll
            instance.group.rotation.x = -enemyData.pitch;  // Pitch
            instance.group.rotation.y = -enemyData.yaw;    // Yaw
            instance.lastZ = ez;

            // TIE Fighter Bounding Box (Görünmez matematiksel Box3: W: 8.5m, H: 8.8m, D: 7.2m)
            instance.box.setFromCenterAndSize(
                instance.group.position,
                new THREE.Vector3(8.5, 8.8, 7.2)
            );

            // 1. Siper Duvarı Hitbox Kontrolü: |X| >= 34.0, Y <= 5.0, Y >= 78.0
            const isWallHit = (Math.abs(ex) >= 34.0 || ey <= 5.0 || ey >= 78.0);

            // 2. Fiziksel Box3 Çarpışma Tespiti (X-Wing Box3 ile TIE Fighter Box3 Kesişimi)
            const isBoxIntersect = this.xWingBox.intersectsBox(instance.box);

            // 3. X-Wing Giant Fiber Fıçı Tonosu Girdap Şoku:
            const dx = heroPos.x - ex;
            const dy = heroPos.y - ey;
            const dz = heroPos.z - ez;
            const distToHero = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const isBarrelRollWakeHit = isHeroBarrelRolling && (distToHero < 28.0 || isBoxIntersect);

            // 4. Doğrudan Gövde Çarpışması
            const isPhysicalCollision = isBoxIntersect && !isHeroBarrelRolling;

            if ((isWallHit || isBarrelRollWakeHit || isPhysicalCollision || !enemyData.is_alive) && instance.isAlive) {
                instance.isAlive = false;
                const reason = isPhysicalCollision ? 'xwing_physical_collision' : (isBarrelRollWakeHit ? 'xwing_barrel_roll_wake' : (isWallHit ? 'trench_wall_crash' : 'server_destroyed'));
                this.triggerTieExplosion(ex, ey, ez, reason);

                if (this.onEnemyDestroyedCallback) {
                    this.onEnemyDestroyedCallback(agentId, reason);
                }

                this.scene.remove(instance.group);
                this.activeEnemies.delete(agentId);
                continue;
            }



            // Sinek Göz Rengi (LC10a Av/Takip Uyarımı)
            const lc10a = enemyData.v_lc10a || -70.0;
            const normalizedExcitation = Math.min(1.0, Math.max(0.0, (lc10a + 70.0) / 45.0));

            // PER (Proboscis Extension Reflex) Lazer Atışı:
            if (enemyData.fire_laser) {
                if (this.onLaserFiredCallback) {
                    const spawnPos = new THREE.Vector3(ex, ey, ez + 2.0);
                    this.onLaserFiredCallback(spawnPos, 160.0, agentId);
                }
            }
        }

        // Sunucuda artık olmayan birimleri temizle
        for (const [id, inst] of this.activeEnemies.entries()) {
            if (!currentTelemetryIds.has(id)) {
                this.scene.remove(inst.group);
                this.activeEnemies.delete(id);
            }
        }
    }
}
