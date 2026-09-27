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

        // Patlama Sistemi
        this.explosionGroup = new THREE.Group();
        this.scene.add(this.explosionGroup);
        this.explosionParticles = null;
        this.explosionParticleData = [];
        this.shockwaveRing = null;
        this.explosionLight = null;
        this.isExploding = false;
        this.explosionTime = 0;

        this.isLoaded = false;
        this.targetZ = 600.0;
        this.isActive = false;
        this.isFinale = false;
        this.group.visible = false;

        // Box3 Çarpışma Kutusu (Egzoz ağzı)
        this.collisionBox = new THREE.Box3();
    }

    async init() {
        return new Promise((resolve) => {
            const onModelReady = (model) => {
                this.portMesh = model;
                
                // Imperial Egzoz Portu mimarisi:
                // Siyah düz bir silindir yerine, TIE Fighter'a bakan yüksek teknolojili
                // plazma kalkan halkalı, parlayan reaktör çekirdekli ve zırhlı blast bileziği oluşturulur.
                const collarGeo = new THREE.CylinderGeometry(8.5, 9.2, 14.0, 32, 1, true);
                collarGeo.rotateX(Math.PI / 2);
                const collarMat = new THREE.MeshStandardMaterial({
                    color: 0x242e3d,
                    metalness: 0.85,
                    roughness: 0.35,
                    side: THREE.DoubleSide
                });
                const collar = new THREE.Mesh(collarGeo, collarMat);
                collar.castShadow = true;
                collar.receiveShadow = true;
                this.group.add(collar);

                // Port Ağzı Titanyum Çerçeve Bileziği
                const rimGeo = new THREE.TorusGeometry(8.6, 0.7, 16, 32);
                const rimMat = new THREE.MeshStandardMaterial({
                    color: 0x141a24,
                    metalness: 0.9,
                    roughness: 0.2
                });
                const rim = new THREE.Mesh(rimGeo, rimMat);
                rim.position.set(0, 0, -6.0);
                this.group.add(rim);

                // Neon Ray-Shield Tehlike Işık Halkası
                const hazardGeo = new THREE.TorusGeometry(8.2, 0.22, 8, 32);
                const hazardMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
                const hazardRing = new THREE.Mesh(hazardGeo, hazardMat);
                hazardRing.position.set(0, 0, -6.1);
                this.group.add(hazardRing);

                // Işıyan Termonükleer Reaktör Çekirdeği
                const coreGeo = new THREE.SphereGeometry(3.8, 24, 24);
                const coreMat = new THREE.MeshStandardMaterial({
                    color: 0xffaa00,
                    emissive: 0xff6600,
                    emissiveIntensity: 3.5,
                    roughness: 0.1
                });
                this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
                this.coreMesh.position.set(0, 0, -2.0);
                this.group.add(this.coreMesh);

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
                console.log('[Exhaust Port] ✓ Yüksek Detaylı Termal Egzoz Portu ve Plazma Halkaları Hazırlandı!');
                resolve();
            };

            this.loader.load(
                '/models/exhaust_port.glb',
                (gltf) => {
                    onModelReady(gltf.scene);
                },
                undefined,
                (err) => {
                    console.warn('[Exhaust Port] Model yükleme uyarısı, prosedürel port ile devam:', err);
                    onModelReady(new THREE.Group());
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

    triggerHitExplosion(pos) {
        // Ara Darbe Patlaması (Reaktör Çekirdeği sarsıntısı - 1 ila 4. vuruşlar)
        this.isExploding = true;
        const blastCenter = (pos && typeof pos.clone === 'function')
            ? pos.clone()
            : (pos ? new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0) : this.group.position.clone());
        this.explosionGroup.position.copy(blastCenter);
        this.explosionGroup.clear();

        // Parlak sarı/turuncu ışık patlaması
        this.explosionLight = new THREE.PointLight(0xffaa22, 10.0, 180);
        this.explosionGroup.add(this.explosionLight);

        // 350 parçacıklı çekirdek darbe patlaması
        const count = 350;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        this.explosionParticleData = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const speed = 15.0 + Math.random() * 60.0;

            const vx = Math.sin(phi) * Math.cos(theta) * speed;
            const vy = Math.cos(phi) * speed;
            const vz = Math.sin(phi) * Math.sin(theta) * speed;

            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.4 + Math.random() * 0.4;
            colors[i * 3 + 2] = 0.1;

            this.explosionParticleData.push({
                vx: vx,
                vy: vy,
                vz: vz,
                drag: 0.96
            });
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 1.4,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        this.explosionParticles = new THREE.Points(geo, mat);
        this.explosionGroup.add(this.explosionParticles);
        console.log('💥 [HIT] Reaktör Çekirdeği Darbe Aldı! (Ara Patlama)');
    }

    triggerEpicExplosion(pos, onFlashCallback) {
        this.isActive = false;
        this.isExploding = true;
        this.explosionTime = 0.0;

        const blastCenter = (pos && typeof pos.clone === 'function')
            ? pos.clone()
            : (pos ? new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0) : this.group.position.clone());
        this.explosionGroup.position.copy(blastCenter);
        this.explosionGroup.clear();

        // 1. Beyaz Ekran Patlama Flaşı
        if (onFlashCallback) onFlashCallback();

        // 2. Süper-Parlak Işık Kaynağı
        this.explosionLight = new THREE.PointLight(0xffeedd, 15.0, 350);
        this.explosionGroup.add(this.explosionLight);

        // 3. 1000+ Parçacıklı Devasa Patlama (ParticleSystem)
        const count = 1100;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        this.explosionParticleData = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

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
                colors[i * 3] = 1.0;
                colors[i * 3 + 1] = 0.95;
                colors[i * 3 + 2] = 0.7;
            } else if (colorChoice > 0.25) {
                // Ateş turuncusu
                colors[i * 3] = 1.0;
                colors[i * 3 + 1] = 0.45;
                colors[i * 3 + 2] = 0.05;
            } else {
                // Koyu kızıl şok
                colors[i * 3] = 0.95;
                colors[i * 3 + 1] = 0.1;
                colors[i * 3 + 2] = 0.05;
            }

            this.explosionParticleData.push({
                vx: vx,
                vy: vy,
                vz: vz,
                drag: 0.97 + Math.random() * 0.02
            });
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 1.8,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        this.explosionParticles = new THREE.Points(geo, mat);
        this.explosionGroup.add(this.explosionParticles);

        // 4. Genişleyen Termonükleer Şok Dalgası Halkası (Shockwave Ring)
        const shockGeo = new THREE.RingGeometry(2.0, 5.0, 36);
        const shockMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });
        this.shockwaveRing = new THREE.Mesh(shockGeo, shockMat);
        this.shockwaveRing.rotation.x = Math.PI / 2;
        this.explosionGroup.add(this.shockwaveRing);

        // 5. Çekirdek Patlama Küresi
        const fireballGeo = new THREE.SphereGeometry(6.0, 24, 24);
        const fireballMat = new THREE.MeshBasicMaterial({
            color: 0xffdd44,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending
        });
        this.fireball = new THREE.Mesh(fireballGeo, fireballMat);
        this.explosionGroup.add(this.fireball);

        console.log('💥 [SUPERNOVA] Devasa Parçacık Patlaması Tetiklendi!');
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
            const maxDuration = 3.5; // saniye
            const progress = this.explosionTime / maxDuration;

            // Parçacık fiziği
            if (this.explosionParticles) {
                const posAttr = this.explosionParticles.geometry.attributes.position;
                for (let i = 0; i < this.explosionParticleData.length; i++) {
                    const p = this.explosionParticleData[i];
                    p.vx *= p.drag;
                    p.vy *= p.drag;
                    p.vz *= p.drag;

                    const curX = posAttr.getX(i);
                    const curY = posAttr.getY(i);
                    const curZ = posAttr.getZ(i);

                    posAttr.setXYZ(i, curX + p.vx * dt, curY + p.vy * dt, curZ + p.vz * dt);
                }
                posAttr.needsUpdate = true;
                this.explosionParticles.material.opacity = Math.max(0, 1.0 - progress);
            }

            // Şok dalgası genişlemesi
            if (this.shockwaveRing) {
                const shockScale = 1.0 + this.explosionTime * 45.0; // Hızlıca 120 metreye yayılır
                this.shockwaveRing.scale.set(shockScale, shockScale, 1.0);
                this.shockwaveRing.material.opacity = Math.max(0, 1.0 - progress * 1.4);
            }

            // Çekirdek alev topu büyümesi ve sönmesi
            if (this.fireball) {
                this.fireball.scale.addScalar(dt * 20.0);
                this.fireball.material.opacity = Math.max(0, 1.0 - progress * 1.8);
            }

            // Işık parlaklığı sönümü
            if (this.explosionLight) {
                this.explosionLight.intensity = Math.max(0, 15.0 * (1.0 - progress));
            }

            if (this.explosionTime >= maxDuration) {
                this.isExploding = false;
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
        this.explosionGroup.clear();
    }
}
