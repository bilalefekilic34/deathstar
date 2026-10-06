/**
 * deathstarv2/web/js/exhaust_port.js
 * 
 * Termal Egzoz Çukuru (Thermal Exhaust Port) ve Ölüm Yıldızı Patlama Motoru.
 * - GLTF 'exhaust_port.glb' modeli.
 * - Sinek için devasa feromon / besin kaynağı illüzyonu (Altın/kehribar parçacık bulutu & halkalar).
 * - Box3 torpido çarpışma algılayıcısı.
 * - 1000+ parçacıklı devasa süpernova reaktör patlaması & şok dalgası halkası (ParticleSystem).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class ExhaustPort {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.portMesh = null;
        this.pheromoneParticles = null;
        this.pheromoneRings = [];

        // Patlama Sistemi (Pre-allocated Object Pooling - Sıfır Çalışma Zamanı Ayrımı ve Sıfır Takılma)
        this.explosionGroup = new THREE.Group();
        this.explosionGroup.visible = false;
        this.scene.add(this.explosionGroup);

        this.isExploding = false;
        this.explosionMode = 'hit';
        this.explosionTime = 0;

        this.isLoaded = false;
        this.targetZ = 600.0;
        this.isActive = false;
        this.isFinale = false;
        this.group.visible = false;

        // Box3 Çarpışma Kutusu (Egzoz ağzı)
        this.collisionBox = new THREE.Box3();

        // Patlama havuzunu (Hit & Epic particles, lights, shockwave, fireball) oyunun başında hazırla
        this.initExplosionPool();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const onModelReady = (model) => {
                this.portMesh = model;

                // GLTF modelindeki PBR materyalleri yapılandır
                this.portMesh.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        const name = (child.name || '').toLowerCase();

                        if (name.includes('core') || name.includes('reactor')) {
                            child.material = new THREE.MeshStandardMaterial({
                                color: 0xffaa00,
                                emissive: 0xff6600,
                                emissiveIntensity: 3.5,
                                roughness: 0.15,
                                metalness: 0.5
                            });
                            this.coreMesh = child;
                        } else if (name.includes('ring') || name.includes('shield')) {
                            child.material = new THREE.MeshStandardMaterial({
                                color: 0x00f0ff,
                                emissive: 0x00c8ff,
                                emissiveIntensity: 2.2,
                                roughness: 0.2,
                                metalness: 0.8
                            });
                        } else {
                            // Gövde ve tünel boğazı (İmparatorluk Durasteel Çeliği)
                            child.material = new THREE.MeshStandardMaterial({
                                color: 0x242e3d,
                                metalness: 0.88,
                                roughness: 0.35,
                                envMapIntensity: 1.6
                            });
                        }
                    }
                });

                this.group.add(this.portMesh);

                // Reaktör Çekirdek Işığı
                this.coreLight = new THREE.PointLight(0xff9900, 4.0, 55);
                this.coreLight.position.set(0, 0, -3.5);
                this.group.add(this.coreLight);

                // Başlangıçta kameranın çok uzağına sakla (Pre-load)
                this.group.position.set(0, 12.0, -50000);
                this.group.visible = false;

                // 1. Feromon ve Besin Işıltı Parçacıkları
                this.createPheromoneParticles();

                // 2. Reaktör Ağzı İyon Halkaları
                this.createPheromoneRings();

                // Çarpışma kutusunu hesapla
                this.updateCollisionBox();

                this.isLoaded = true;
                console.log('[Exhaust Port] ✓ GLTF Termal Egzoz Portu Modeli ve PBR Malzemeler Hazırlandı!');
                resolve();
            };

            this.loader.load(
                '/models/exhaust_port.glb',
                (gltf) => {
                    onModelReady(gltf.scene);
                },
                undefined,
                (err) => {
                    console.error('[Exhaust Port] GLTF yükleme hatası (/models/exhaust_port.glb):', err);
                    reject(err);
                }
            );
        });
    }

    createPheromoneParticles() {
        const particleCount = 280;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const r = Math.random() * 8.0;
            const theta = Math.random() * Math.PI * 2;
            positions[i * 3] = Math.cos(theta) * r;
            positions[i * 3 + 1] = Math.sin(theta) * r;
            positions[i * 3 + 2] = -10.0 + Math.random() * 20.0;

            // Altın sarısı - zümrüt yeşili feromon ışıltısı (Pozitif fototaksis & şeker algısı)
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.75 + Math.random() * 0.25;
            colors[i * 3 + 2] = 0.15;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.9,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        this.pheromoneParticles = new THREE.Points(geo, mat);
        this.group.add(this.pheromoneParticles);
    }

    createPheromoneRings() {
        // Reaktör bacasının ağzında dönen parlak neon plazma ve ray-shield halkaları (önden görüş)
        for (let i = 0; i < 3; i++) {
            const ringGeo = new THREE.TorusGeometry(6.6 - i * 1.4, 0.22, 8, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: i === 0 ? 0xff00aa : (i === 1 ? 0x00ff88 : 0xffaa00),
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(0, 0, -6.5 + i * 1.8);
            ring.rotation.set(0, 0, 0); // Doğrudan yaklaşan gemiye bakar
            this.group.add(ring);
            this.pheromoneRings.push(ring);
        }
    }

    spawnFinale(targetZ) {
        this.isFinale = true;
        this.isActive = true;
        this.group.visible = true;
        this.targetZ = targetZ;
        this.group.position.set(0, 12.0, this.targetZ);
        this.updateCollisionBox();
        console.log(`[Exhaust Port] 🎯 FİNAL MODU: Termal Egzoz Deliği Y=12.0, Z=${targetZ.toFixed(1)} konumunda konuşlandırıldı!`);
    }

    updatePosition(newZ) {
        this.targetZ = newZ;
        this.group.position.z = newZ;
        this.updateCollisionBox();
    }

    updateCollisionBox() {
        // Egzoz deliğinin ağzını saran Box3
        const pos = this.group.position;
        this.collisionBox.min.set(pos.x - 12.0, pos.y - 12.0, pos.z - 12.0);
        this.collisionBox.max.set(pos.x + 12.0, pos.y + 12.0, pos.z + 12.0);
    }

    getCollisionBox() {
        return this.collisionBox;
    }

    checkTorpedoCollision(torpedoBox, torpedoPos) {
        if (!this.isActive || !this.isLoaded) return false;

        // 1. Box3 Kesişim Kontrolü
        if (this.collisionBox.intersectsBox(torpedoBox)) {
            return true;
        }

        // 2. Radyal Mesafe Kontrolü (Giriş bacası çapı ~12m)
        const pos = this.group.position;
        const dx = torpedoPos.x - pos.x;
        const dy = torpedoPos.y - pos.y;
        const dz = Math.abs(torpedoPos.z - pos.z);

        if (dz < 12.0 && Math.hypot(dx, dy) < 14.0) {
            return true;
        }

        return false;
    }

    /**
     * Patlama Havuzu Ön Yüklemesi (Pre-allocated Object Pooling):
     * Ara vuruş ve süpernova reaktör patlamalarına ait tüm parçacık sistemleri,
     * ışıklar, şok dalgası halkası ve alev topu modelleri oyun başında sahneye eklenir.
     * Oyun esnasında sıfır bellek ayrımı (0 GC allocations) ve sıfır WebGL shader derlemesi.
     */
    initExplosionPool() {
        // 1. Ara Darbe Patlaması Havuzu (Hit Explosion Pool - 350 Parçacık + Turuncu Işık)
        this.hitExplosionGroup = new THREE.Group();
        this.hitExplosionGroup.visible = false;

        this.hitLight = new THREE.PointLight(0xffaa22, 10.0, 180);
        this.hitExplosionGroup.add(this.hitLight);

        this.hitParticleCount = 350;
        const hitPositions = new Float32Array(this.hitParticleCount * 3);
        const hitColors = new Float32Array(this.hitParticleCount * 3);
        for (let i = 0; i < this.hitParticleCount; i++) {
            hitPositions[i * 3] = 0;
            hitPositions[i * 3 + 1] = 0;
            hitPositions[i * 3 + 2] = 0;
            hitColors[i * 3] = 1.0;
            hitColors[i * 3 + 1] = 0.5;
            hitColors[i * 3 + 2] = 0.1;
        }

        this.hitGeo = new THREE.BufferGeometry();
        this.hitGeo.setAttribute('position', new THREE.BufferAttribute(hitPositions, 3));
        this.hitGeo.setAttribute('color', new THREE.BufferAttribute(hitColors, 3));

        this.hitMat = new THREE.PointsMaterial({
            size: 1.4,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        this.hitParticles = new THREE.Points(this.hitGeo, this.hitMat);
        this.hitExplosionGroup.add(this.hitParticles);
        this.hitParticleData = [];

        this.explosionGroup.add(this.hitExplosionGroup);

        // 2. Süpernova Reaktif Patlaması Havuzu (Epic Supernova Pool - 1100 Parçacık + Beyaz Işık + Şok Dalgası + Alev Topu)
        this.epicExplosionGroup = new THREE.Group();
        this.epicExplosionGroup.visible = false;

        this.epicLight = new THREE.PointLight(0xffeedd, 15.0, 350);
        this.epicExplosionGroup.add(this.epicLight);

        this.epicParticleCount = 1100;
        const epicPositions = new Float32Array(this.epicParticleCount * 3);
        const epicColors = new Float32Array(this.epicParticleCount * 3);
        for (let i = 0; i < this.epicParticleCount; i++) {
            epicPositions[i * 3] = 0;
            epicPositions[i * 3 + 1] = 0;
            epicPositions[i * 3 + 2] = 0;
            epicColors[i * 3] = 1.0;
            epicColors[i * 3 + 1] = 0.8;
            epicColors[i * 3 + 2] = 0.4;
        }

        this.epicGeo = new THREE.BufferGeometry();
        this.epicGeo.setAttribute('position', new THREE.BufferAttribute(epicPositions, 3));
        this.epicGeo.setAttribute('color', new THREE.BufferAttribute(epicColors, 3));

        this.epicMat = new THREE.PointsMaterial({
            size: 1.8,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        this.epicParticles = new THREE.Points(this.epicGeo, this.epicMat);
        this.epicExplosionGroup.add(this.epicParticles);

        const shockGeo = new THREE.RingGeometry(2.0, 5.0, 36);
        this.shockMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });
        this.shockwaveRing = new THREE.Mesh(shockGeo, this.shockMat);
        this.shockwaveRing.rotation.x = Math.PI / 2;
        this.epicExplosionGroup.add(this.shockwaveRing);

        const fireballGeo = new THREE.SphereGeometry(6.0, 24, 24);
        this.fireballMat = new THREE.MeshBasicMaterial({
            color: 0xffdd44,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending
        });
        this.fireball = new THREE.Mesh(fireballGeo, this.fireballMat);
        this.epicExplosionGroup.add(this.fireball);

        this.epicParticleData = [];

        this.explosionGroup.add(this.epicExplosionGroup);

        // Geriye dönük uyumluluk referansları
        this.explosionParticles = this.epicParticles;
        this.explosionLight = this.epicLight;
    }

    triggerHitExplosion(pos) {
        // Ara Darbe Patlaması (Reaktör Çekirdeği sarsıntısı - 1 ila 4. vuruşlar)
        this.isExploding = true;
        this.explosionMode = 'hit';
        this.explosionTime = 0;

        const blastCenter = (pos && typeof pos.clone === 'function')
            ? pos.clone()
            : (pos ? new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0) : this.group.position.clone());
        this.explosionGroup.position.copy(blastCenter);

        // Havuzdaki nesneleri sıfırla ve yeniden canlandır (Zero Allocation)
        this.hitLight.intensity = 10.0;
        this.hitMat.opacity = 1.0;

        const posAttr = this.hitGeo.attributes.position;
        const colAttr = this.hitGeo.attributes.color;
        this.hitParticleData = [];

        for (let i = 0; i < this.hitParticleCount; i++) {
            posAttr.setXYZ(i, 0, 0, 0);

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const speed = 15.0 + Math.random() * 60.0;

            const vx = Math.sin(phi) * Math.cos(theta) * speed;
            const vy = Math.cos(phi) * speed;
            const vz = Math.sin(phi) * Math.sin(theta) * speed;

            colAttr.setXYZ(i, 1.0, 0.4 + Math.random() * 0.4, 0.1);

            this.hitParticleData.push({
                vx: vx,
                vy: vy,
                vz: vz,
                drag: 0.96
            });
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        this.hitExplosionGroup.visible = true;
        this.epicExplosionGroup.visible = false;
        this.explosionGroup.visible = true;

        console.log('💥 [HIT] Reaktör Çekirdeği Darbe Aldı! (Önceden Derlenen Havuzdan Çağrıldı - Zero Stutter)');
    }

    triggerEpicExplosion(pos, onFlashCallback) {
        this.isActive = false;
        this.isExploding = true;
        this.explosionMode = 'epic';
        this.explosionTime = 0.0;

        const blastCenter = (pos && typeof pos.clone === 'function')
            ? pos.clone()
            : (pos ? new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0) : this.group.position.clone());
        this.explosionGroup.position.copy(blastCenter);

        // 1. Beyaz Ekran Patlama Flaşı
        if (onFlashCallback) onFlashCallback();

        // 2. Havuzdaki nesneleri sıfırla (Zero Allocation)
        this.epicLight.intensity = 15.0;
        this.epicMat.opacity = 1.0;

        this.shockwaveRing.scale.set(1.0, 1.0, 1.0);
        this.shockMat.opacity = 0.9;

        this.fireball.scale.set(1.0, 1.0, 1.0);
        this.fireballMat.opacity = 0.95;

        const posAttr = this.epicGeo.attributes.position;
        const colAttr = this.epicGeo.attributes.color;
        this.epicParticleData = [];

        for (let i = 0; i < this.epicParticleCount; i++) {
            posAttr.setXYZ(i, 0, 0, 0);

            // Rastgele küresel patlama hız vektörü
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const speed = 25.0 + Math.random() * 95.0; // 25 to 120 m/s

            const vx = Math.sin(phi) * Math.cos(theta) * speed;
            const vy = Math.cos(phi) * speed;
            const vz = Math.sin(phi) * Math.sin(theta) * speed;

            // Beyaz-sarı-turuncu-kırmızı renk geçişi
            const colorChoice = Math.random();
            if (colorChoice > 0.6) {
                // Beyaz-altın plazma
                colAttr.setXYZ(i, 1.0, 0.95, 0.7);
            } else if (colorChoice > 0.25) {
                // Ateş turuncusu
                colAttr.setXYZ(i, 1.0, 0.45, 0.05);
            } else {
                // Koyu kızıl şok
                colAttr.setXYZ(i, 0.95, 0.1, 0.05);
            }

            this.epicParticleData.push({
                vx: vx,
                vy: vy,
                vz: vz,
                drag: 0.97 + Math.random() * 0.02
            });
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        this.hitExplosionGroup.visible = false;
        this.epicExplosionGroup.visible = true;
        this.explosionGroup.visible = true;

        console.log('💥 [SUPERNOVA] Devasa Parçacık Patlaması Tetiklendi! (Önceden Derlenen Havuzdan Çağrıldı - Zero Stutter)');
    }

    update(dt, shipPos) {
        if (!this.isLoaded) return { entered: false };

        // 1. Feromon halkalarını döndür ve nabız gibi büyüt
        if (this.pheromoneRings.length > 0) {
            this.pheromoneRings.forEach((ring, idx) => {
                ring.rotation.z += (idx + 1) * 0.015;
                const scale = 1.0 + Math.sin(Date.now() * 0.004 + idx) * 0.12;
                ring.scale.set(scale, scale, 1.0);
            });
        }

        // 2. Feromon parçacık dönüşü ve Çekirdek Enerji Titreşimi
        if (this.pheromoneParticles) {
            this.pheromoneParticles.rotation.z += 0.025;
        }
        if (this.coreLight && this.coreMesh) {
            const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.12;
            this.coreLight.intensity = 4.0 * pulse;
            this.coreMesh.scale.set(pulse, pulse, pulse);
        }

        // 3. Patlama Animasyonu Güncellemesi
        if (this.isExploding) {
            this.explosionTime += dt;

            if (this.explosionMode === 'hit') {
                const maxDuration = 1.6;
                const progress = this.explosionTime / maxDuration;

                if (this.hitParticles) {
                    const posAttr = this.hitGeo.attributes.position;
                    for (let i = 0; i < this.hitParticleData.length; i++) {
                        const p = this.hitParticleData[i];
                        p.vx *= p.drag;
                        p.vy *= p.drag;
                        p.vz *= p.drag;

                        const curX = posAttr.getX(i);
                        const curY = posAttr.getY(i);
                        const curZ = posAttr.getZ(i);

                        posAttr.setXYZ(i, curX + p.vx * dt, curY + p.vy * dt, curZ + p.vz * dt);
                    }
                    posAttr.needsUpdate = true;
                    this.hitMat.opacity = Math.max(0, 1.0 - progress);
                }

                if (this.hitLight) {
                    this.hitLight.intensity = Math.max(0, 10.0 * (1.0 - progress));
                }

                if (this.explosionTime >= maxDuration) {
                    this.isExploding = false;
                    this.hitExplosionGroup.visible = false;
                    this.explosionGroup.visible = false;
                }
            } else if (this.explosionMode === 'epic') {
                const maxDuration = 3.5; // saniye
                const progress = this.explosionTime / maxDuration;

                // Parçacık fiziği
                if (this.epicParticles) {
                    const posAttr = this.epicGeo.attributes.position;
                    for (let i = 0; i < this.epicParticleData.length; i++) {
                        const p = this.epicParticleData[i];
                        p.vx *= p.drag;
                        p.vy *= p.drag;
                        p.vz *= p.drag;

                        const curX = posAttr.getX(i);
                        const curY = posAttr.getY(i);
                        const curZ = posAttr.getZ(i);

                        posAttr.setXYZ(i, curX + p.vx * dt, curY + p.vy * dt, curZ + p.vz * dt);
                    }
                    posAttr.needsUpdate = true;
                    this.epicMat.opacity = Math.max(0, 1.0 - progress);
                }

                // Şok dalgası genişlemesi
                if (this.shockwaveRing) {
                    const shockScale = 1.0 + this.explosionTime * 45.0; // Hızlıca 120 metreye yayılır
                    this.shockwaveRing.scale.set(shockScale, shockScale, 1.0);
                    this.shockMat.opacity = Math.max(0, 1.0 - progress * 1.4);
                }

                // Çekirdek alev topu büyümesi ve sönmesi
                if (this.fireball) {
                    this.fireball.scale.addScalar(dt * 20.0);
                    this.fireballMat.opacity = Math.max(0, 1.0 - progress * 1.8);
                }

                // Işık parlaklığı sönümü
                if (this.epicLight) {
                    this.epicLight.intensity = Math.max(0, 15.0 * (1.0 - progress));
                }

                if (this.explosionTime >= maxDuration) {
                    this.isExploding = false;
                    this.epicExplosionGroup.visible = false;
                    this.explosionGroup.visible = false;
                }
            }
        }

        // 4. Normal sonsuz modda egzoz deliği görünmez ve devre dışıdır
        if (!this.isFinale) {
            this.isActive = false;
            this.group.visible = false;
        }

        return {
            targetPos: {
                x: this.group.position.x - shipPos.x,
                y: this.group.position.y - shipPos.y,
                z: this.group.position.z - shipPos.z,
                active: this.isFinale && this.isActive,
                is_finale: this.isFinale,
                abs_z: this.targetZ
            }
        };
    }

    reset() {
        this.isFinale = false;
        this.isActive = false;
        this.group.visible = false;
        this.isExploding = false;
        this.explosionTime = 0;
        if (this.hitExplosionGroup) this.hitExplosionGroup.visible = false;
        if (this.epicExplosionGroup) this.epicExplosionGroup.visible = false;
        if (this.explosionGroup) this.explosionGroup.visible = false;
    }
}
