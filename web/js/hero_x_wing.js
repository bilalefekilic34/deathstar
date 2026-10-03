/**
 * deathstarv2/web/js/hero_x_wing.js
 * 
 * Kahraman X-Wing (Red Five) - Biyolojik Sinek Beyni (SNN) Kontrollü Ana Gemi.
 * - Star Wars Lore: Ölüm Yıldızı siperine dalıp reaktör kuyusunu imha eden ana kahraman gemidir.
 * - SADECE GLTFLoader ile '/models/dark_x_wing.glb' Sketchfab modeli yüklenir.
 * - İlkel şekiller (BoxGeometry, CylinderGeometry) içermez.
 * - Şeffaf kokpiti içinde 3D Drosophila Melanogaster (meyve sineği) biyo-pilotu yer alır.
 * - PBR MeshPhysicalMaterial / MeshStandardMaterial ve envMap yansımaları içerir.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class HeroXWing {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.shipGroup = new THREE.Group();
        this.shipGroup.name = 'hero_x_wing';
        this.scene.add(this.shipGroup);

        this.xWingMesh = null;

        this.leftWingMesh = null;
        this.rightWingMesh = null;
        this.isLoaded = false;

        // Canlılık / Hayatta Kalma Durumu
        this.isAlive = true;

        // Hasar ve Biyolojik Stres Göstergeleri
        this.damageFlashTimer = 0.0;
        this.originalMaterials = new Map();

        // Çarpışma Bounding Box3 (Görünmez, sadece matematiksel kesişim için)
        this.collisionBox = new THREE.Box3();
        this.boxHelper = null;

        // Motor İtiş Işıkları
        this.engineLights = [];

        // X-Wing İmha / Patlama Parçacık Sistemi (Zero GC)
        this.debrisGroup = new THREE.Group();
        this.debrisGroup.name = 'hero_x_wing_debris';
        this.scene.add(this.debrisGroup);
        this.explosionParticles = [];
        this.initExplosionParticles();
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.loader.load(
                '/models/dark_x_wing.glb',
                (gltf) => {
                    this.xWingMesh = gltf.scene;

                    const targetEnv = this.scene?.environment || null;

                    // Kahraman X-Wing (Red Five) - TIE Fighter Referanslı Metalik MeshStandardMaterial Konfigürasyonu
                    this.xWingMesh.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            const name = (child.name || '').toLowerCase();

                            // Düzgün normaller ve yansıma hesaplaması, vertex color silinmesi
                            if (child.geometry) {
                                if (child.geometry.index) {
                                    child.geometry = child.geometry.toNonIndexed();
                                }
                                if (child.geometry.attributes.color) {
                                    child.geometry.deleteAttribute('color');
                                }
                                child.geometry.computeVertexNormals();
                            }

                            // 1. Şeffaf Kokpit Camı
                            if (name.includes('glass') || name.includes('canopy')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x93c5fd,
                                    opacity: 0.22,
                                    transparent: true,
                                    roughness: 0.08,
                                    metalness: 0.15,
                                    depthWrite: false
                                });
                            }
                            // 2. İkonik Red Five Kırmızı Filo Şeritleri (Nose & Wing Crimson Stripes)
                            else if (name.includes('stripe')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xc52222,
                                    roughness: 0.30,
                                    metalness: 0.35,
                                    envMap: targetEnv,
                                    envMapIntensity: 1.2
                                });
                            }
                            // 3. İyon Motor Egzoz Parlaması (Yalnızca nozül içi iyon plazması)
                            else if (name.includes('glow')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x110000,
                                    emissive: 0xff3700,
                                    emissiveIntensity: 3.5,
                                    roughness: 0.20,
                                    metalness: 0.85
                                });
                            }
                            // 4. Lazer Namluları, Nozzle ve Mekanik Durasteel Parçalar
                            else if (name.includes('cannon') || name.includes('barrel') || name.includes('probe') || name.includes('nozzle') || name.includes('fan') || name.includes('dorsal')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x242a35,
                                    roughness: 0.25,
                                    metalness: 0.90,
                                    envMap: targetEnv,
                                    envMapIntensity: 1.8
                                });
                            }
                            // 5. Ana Gövde, Kanatlar ve Motor Gövdeleri: TIE Fighter metalik yapılandırmasının birebir aynısı,
                            // saf kırık beyaz/platin (#e8eaed)
                            else {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xe8eaed,
                                    roughness: 0.22,
                                    metalness: 0.88,
                                    envMap: targetEnv,
                                    envMapIntensity: 2.2,
                                    side: THREE.DoubleSide
                                });
                            }

                            if (child.material) {
                                child.material.needsUpdate = true;
                            }
                        }
                    });

                    this.shipGroup.add(this.xWingMesh);

                    // X-Wing Gemi Aydınlatması (Specular & Engine Highlights)
                    const shipTopLight = new THREE.PointLight(0xffffff, 2.5, 20);
                    shipTopLight.position.set(0, 4.0, 0);
                    this.shipGroup.add(shipTopLight);

                    const engineGlow = new THREE.PointLight(0xff4500, 2.8, 12);
                    engineGlow.position.set(0, 0, -3.2);
                    this.shipGroup.add(engineGlow);
                    this.engineLights.push(engineGlow);

                    this.isLoaded = true;
                    console.log('[HeroXWing] ✓ Kahraman X-Wing (Red Five) GLTF Modeli Başarıyla Hazırlandı!');
                    resolve();
                },
                undefined,
                (err) => {
                    console.error('[HeroXWing] GLTF yükleme hatası (/models/dark_x_wing.glb):', err);
                    reject(err);
                }
            );
        });
    }


    initExplosionParticles() {
        const palette = [0xff4400, 0xff8800, 0xff0033, 0xef4444, 0x242e3d, 0xffffff];
        const boxGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5);
        const mats = palette.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1.0 }));

        for (let i = 0; i < 45; i++) {
            const mesh = new THREE.Mesh(boxGeo, mats[i % mats.length]);
            mesh.visible = false;
            this.debrisGroup.add(mesh);
            this.explosionParticles.push({
                mesh: mesh,
                vel: new THREE.Vector3(),
                rotSpeed: new THREE.Vector3(),
                life: 0.0,
                decay: 1.0,
                active: false
            });
        }
    }

    destroy(reason = 'combat') {
        if (!this.isAlive) return;
        this.isAlive = false;
        console.warn(`[HeroXWing] 💀 KAHRAMAN X-WING İMHA EDİLDİ! (Sebep: ${reason}) - isAlive = false`);

        // Gemiyi gizle
        this.shipGroup.visible = false;

        // Patlama saçılması
        const origin = this.shipGroup.position;
        this.explosionParticles.forEach((p, idx) => {
            p.mesh.position.copy(origin).add(new THREE.Vector3(
                (Math.random() - 0.5) * 3.5,
                (Math.random() - 0.5) * 3.5,
                (Math.random() - 0.5) * 3.5
            ));
            const angle = Math.random() * Math.PI * 2;
            const elevation = (Math.random() - 0.5) * Math.PI;
            const speed = 15.0 + Math.random() * 35.0;

            p.vel.set(
                Math.cos(elevation) * Math.cos(angle) * speed,
                Math.sin(elevation) * speed * 0.8,
                Math.cos(elevation) * Math.sin(angle) * speed
            );
            p.rotSpeed.set(
                (Math.random() - 0.5) * 12.0,
                (Math.random() - 0.5) * 12.0,
                (Math.random() - 0.5) * 12.0
            );
            p.life = 1.0;
            p.decay = 0.5 + Math.random() * 0.8;
            p.mesh.scale.setScalar(0.7 + Math.random() * 0.8);
            p.mesh.visible = true;
            p.active = true;
        });
    }

    reset() {
        this.isAlive = true;
        this.shipGroup.visible = true;
        this.shipGroup.scale.set(1, 1, 1);
        this.explosionParticles.forEach(p => {
            p.active = false;
            p.mesh.visible = false;
        });
        console.log('[HeroXWing] 🔄 X-Wing (Red Five) Canlandırıldı ve Yeniden Başlatıldı! (isAlive = true)');
    }

    applyEnvMap(envMap) {
        if (!this.xWingMesh) return;
        this.xWingMesh.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.envMap = envMap;
                child.material.envMapIntensity = 1.8;
                child.material.needsUpdate = true;
            }
        });
    }

    triggerDamageFlash() {
        this.damageFlashTimer = 0.35;
    }

    update(shipData, flyDataOrDt = 0.016, neuralDataOrRolling = false) {
        const dt = (typeof flyDataOrDt === 'number') ? flyDataOrDt : 0.016;

        // Patlama parçacıklarını güncelle
        if (this.explosionParticles) {
            this.explosionParticles.forEach(p => {
                if (!p.active) return;
                p.mesh.position.addScaledVector(p.vel, dt);
                p.mesh.rotation.x += p.rotSpeed.x * dt;
                p.mesh.rotation.y += p.rotSpeed.y * dt;
                p.vel.y -= 18.0 * dt; // Siper tabanına yerçekimi düşüşü
                p.life -= p.decay * dt;
                if (p.life <= 0) {
                    p.active = false;
                    p.mesh.visible = false;
                } else {
                    p.mesh.scale.setScalar(p.life);
                }
            });
        }

        if (!this.isLoaded || !shipData) return;

        // Eğer gemi ölü ise pozisyonu ve rotasyonu dondur
        if (!this.isAlive) {
            this.collisionBox.makeEmpty();
            return;
        }

        // Gemi pozisyonu ve rotasyonu
        this.shipGroup.position.set(shipData.x, shipData.y, shipData.z);
        this.shipGroup.rotation.z = -shipData.roll;   // Roll
        this.shipGroup.rotation.x = -shipData.pitch;  // Pitch
        this.shipGroup.rotation.y = -shipData.yaw;    // Yaw



        // Bounding Box güncelle
        this.collisionBox.setFromObject(this.shipGroup);

        // Hasar flaşı
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= dt;
        }
    }
}
