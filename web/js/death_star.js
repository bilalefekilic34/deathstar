/**
 * deathstarv2/web/js/death_star.js
 * 
 * Todesstern // Death Star 01 (Sketchfab: 4f587d65ac3b471193bed95c43dbcc5c)
 * 3D Model & Göksel İstasyon Mimarisi.
 * 
 * Özellikler:
 * - GLTF 'death_star.glb' modeli yüklenir (Süper Lazer Çukuru, Ekvatoryal Siper, Greeble Zırh Plakaları).
 * - 'death_star.jpg' gerçek doku kaplaması uygulanır.
 * - Süper Lazer Çanağında yeşil/zümrüt iyon odaklama çekirdeği (Glowing Emitter).
 * - Derin uzayda kesintisiz görünürlük (Fog bypass).
 * - Siper boyunca sinematik ufuk takibi ve yavaş eksen dönüşü.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class DeathStarStation {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.model = null;
        this.isLoaded = false;
        this.rotationSpeed = 0.0008;

        // Süper Lazer İyon Parıldaması
        this.emitterLight = null;
        this.emitterGlow = null;
        this.pulseTime = 0.0;

        // Hasar / Darbe Efekti
        this.hitFlashTimer = 0.0;
        this.materials = [];

        // Ölüm Yıldızı Görünürlük Durumu (Kameradan bağımsız daima aktif)
        this.isSpawned = true;
        this.group.visible = true;
    }

    setSpawned(spawned) {
        this.isSpawned = (spawned !== undefined) ? !!spawned : true;
        this.group.visible = this.isSpawned;
        if (this.dsFrontLight) this.dsFrontLight.visible = this.isSpawned;
        if (this.dsRimLight) this.dsRimLight.visible = this.isSpawned;
        console.log(`[DeathStar] 🛸 Görünürlük Durumu: ${this.isSpawned ? 'BELİRDİ (SPAWNED)' : 'GİZLİ'}`);
    }

    async init() {
        return new Promise((resolve) => {
            const setupDeathStarModel = (model) => {
                this.model = model;
                this.group.add(this.model);

                // Süper Lazer Işığı (Varsa bağla, yoksa ekle)
                if (!this.emitterLight) {
                    this.emitterLight = new THREE.PointLight(0x00ff88, 5.0, 250);
                    this.emitterLight.position.set(20.0, 20.0, -25.0);
                    this.model.add(this.emitterLight);
                }

                // Dünya Uzayında Ön Güneş Işığı (Dengeli sinematik aydınlatma)
                this.dsFrontLight = new THREE.DirectionalLight(0xffffff, 2.2);
                this.dsFrontLight.position.set(80, 160, 200);
                this.scene.add(this.dsFrontLight);
                this.dsFrontTarget = new THREE.Object3D();
                this.scene.add(this.dsFrontTarget);
                this.dsFrontLight.target = this.dsFrontTarget;

                // Yan Kontur Işığı (Krater ve Siper Gölgelerini Ortaya Çıkarır)
                this.dsRimLight = new THREE.DirectionalLight(0xb0d8ff, 1.5);
                this.dsRimLight.position.set(-160, 140, 300);
                this.scene.add(this.dsRimLight);
                this.dsRimTarget = new THREE.Object3D();
                this.scene.add(this.dsRimTarget);
                this.dsRimLight.target = this.dsRimTarget;

                // Ortam Işığı (Hafif uzay ambiyansı, aşırı parlamayı engeller)
                const dsAmbient = new THREE.AmbientLight(0x99aabf, 0.45);
                this.group.add(dsAmbient);

                // Tüm mesh'lerde frustum culling'i devre dışı bırak (Kamera açısından bağımsız görünürlük)
                this.group.traverse((child) => {
                    if (child.isMesh) {
                        child.frustumCulled = false;
                    }
                });

                // Başlangıç göksel konumu: Siperin ilerisinde, derin uzayda heybetli görünüm
                this.group.position.set(0, 175.0, 650.0);
                this.group.visible = true;
                if (this.dsFrontLight) this.dsFrontLight.visible = true;
                if (this.dsRimLight) this.dsRimLight.visible = true;

                this.isLoaded = true;
                console.log('[DeathStar] ✓ Ölüm Yıldızı İstasyonu Başarıyla Yüklendi ve Sahnede Aktif Kılındı!');
                resolve();
            };

            const buildProceduralFallback = () => {
                console.warn('[DeathStar] GLTF yüklenemedi veya gecikti, prosedürel İmparatorluk İstasyonu oluşturuluyor...');
                const fallbackGroup = new THREE.Group();
                const sphereGeo = new THREE.SphereGeometry(36.0, 32, 32);
                const sphereMat = new THREE.MeshStandardMaterial({
                    color: 0x90a0b5,
                    roughness: 0.5,
                    metalness: 0.4,
                    fog: false
                });
                const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
                fallbackGroup.add(sphereMesh);

                // Süper Lazer Çanağı
                const dishGeo = new THREE.SphereGeometry(10.0, 24, 24, 0, Math.PI * 2, 0, Math.PI / 4);
                const dishMat = new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
                const dishMesh = new THREE.Mesh(dishGeo, dishMat);
                dishMesh.position.set(16.0, 16.0, 24.0);
                dishMesh.rotation.x = Math.PI;
                fallbackGroup.add(dishMesh);

                // Emitter
                const emitterGeo = new THREE.SphereGeometry(2.0, 16, 16);
                const emitterMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, fog: false });
                this.emitterGlow = new THREE.Mesh(emitterGeo, emitterMat);
                this.emitterGlow.position.set(16.0, 16.0, 26.0);
                fallbackGroup.add(this.emitterGlow);

                fallbackGroup.scale.set(6.0, 6.0, 6.0);
                setupDeathStarModel(fallbackGroup);
            };

            // Yüksek Çözünürlüklü İmparatorluk Ölüm Yıldızı Zırh Dokusu
            const texture = this.textureLoader.load(
                '/static/assets/textures/death_star_imperial_hd.png',
                (tex) => {
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.ClampToEdgeWrapping;
                    tex.colorSpace = THREE.SRGBColorSpace;
                },
                undefined,
                () => {
                    console.warn('[DeathStar] Doku yükleme uyarısı, standart materyalle devam ediliyor.');
                }
            );

            this.loader.load(
                '/models/death_star.glb',
                (gltf) => {
                    const loadedModel = gltf.scene;

                    // Materyalleri ve dokuyu uygula
                    loadedModel.traverse((child) => {
                        if (child.isMesh) {
                            if (child.name === 'todesstern_stand' || (child.geometry && child.geometry.name === 'geometry_1')) {
                                child.visible = false;
                                return;
                            }
                            if (child.geometry) {
                                const pos = child.geometry.attributes.position;
                                if (pos) {
                                    const uvs = new Float32Array(pos.count * 2);
                                    for (let i = 0; i < pos.count; i++) {
                                        const x = pos.getX(i);
                                        const y = pos.getY(i);
                                        const z = pos.getZ(i);
                                        const r = Math.sqrt(x * x + y * y + z * z) || 1.0;
                                        const u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
                                        const v = 0.5 - Math.asin(Math.max(-1.0, Math.min(1.0, y / r))) / Math.PI;
                                        uvs[i * 2] = u;
                                        uvs[i * 2 + 1] = v;
                                    }
                                    child.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                                }
                                child.geometry.computeVertexNormals();
                            }
                            child.castShadow = true;
                            child.receiveShadow = true;

                            const mat = new THREE.MeshStandardMaterial({
                                map: texture || null,
                                color: new THREE.Color(0xb0b5b9),
                                roughness: 0.46,
                                metalness: 0.85,
                                side: THREE.DoubleSide,
                                fog: false
                            });

                            child.material = mat;
                            this.materials.push(mat);
                        }
                    });

                    // Süper Lazer Odak Çanağına Zümrüt Yeşili Enerji Çekirdeği Ekle
                    const emitterGeo = new THREE.SphereGeometry(2.2, 16, 16);
                    const emitterMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, fog: false });
                    this.emitterGlow = new THREE.Mesh(emitterGeo, emitterMat);
                    const dishDir = new THREE.Vector3(
                        Math.cos(32 * Math.PI / 180) * Math.cos(38 * Math.PI / 180),
                        Math.sin(32 * Math.PI / 180),
                        Math.cos(32 * Math.PI / 180) * Math.sin(38 * Math.PI / 180)
                    ).normalize();

                    this.emitterGlow.position.copy(dishDir.clone().multiplyScalar(36.0));
                    loadedModel.add(this.emitterGlow);

                    // Süper Lazer Işık Kaynağı
                    this.emitterLight = new THREE.PointLight(0x00ff88, 5.0, 250);
                    this.emitterLight.position.copy(this.emitterGlow.position);
                    loadedModel.add(this.emitterLight);

                    loadedModel.scale.set(6.0, 6.0, 6.0);
                    setupDeathStarModel(loadedModel);
                },
                undefined,
                (err) => {
                    console.warn('[DeathStar] GLTF yükleme hatası yakalandı, fallback devreye giriyor:', err);
                    buildProceduralFallback();
                }
            );
        });
    }

    triggerHitFlash() {
        this.hitFlashTimer = 0.5;
        if (this.emitterLight) {
            this.emitterLight.color.setHex(0xff3300);
            this.emitterLight.intensity = 8.0;
        }
    }

    update(shipZ, dt = 0.016, isFinale = false, finalTargetZ = 0) {
        try {
            if (!this.isLoaded) return;
            // Ölüm Yıldızı İstasyonu kameradan bağımsız olarak sahnede daima görünür
            this.group.visible = true;
            if (this.dsFrontLight) this.dsFrontLight.visible = true;
            if (this.dsRimLight) this.dsRimLight.visible = true;

            this.pulseTime += dt;

        // Göksel pozisyon:
        if (!isFinale) {
            // Normal uçuş: Derin uzayda siper duvarlarının (Y=110) hemen üzerinde heybetli göksel görünüm
            this.group.position.z = shipZ + 650.0;
            this.group.position.y = 175.0 + Math.sin(this.pulseTime * 0.25) * 4.0;
            this.group.position.x = Math.sin(this.pulseTime * 0.12) * 12.0;
            // Süper lazer çanağını (-Z) doğrudan TIE Fighter'ın burun hattına yönelt
            this.group.rotation.x = 0.12;
            this.group.rotation.y = 2.23 + Math.sin(this.pulseTime * 0.08) * 0.04;
            if (this.model) this.model.scale.set(6.0, 6.0, 6.0);
        } else {
            // Final aşaması: Terminus kapısının ardında heybetli Ölüm Yıldızı İstasyonu göğe yükselir!
            // Küre tam orantılı ve süper lazer çanağı TIE Fighter'a ve kameraya dönük şekilde konumlanır
            this.group.position.z = finalTargetZ + 220.0;
            this.group.position.y = 75.0;
            this.group.position.x = 0.0;
            this.group.rotation.x = 0.12;
            this.group.rotation.y = 2.23 + Math.sin(this.pulseTime * 0.04) * 0.02;
            if (this.model) this.model.scale.set(4.6, 4.6, 4.6);
        }

        // Ön ve Yan Projektör Güneş Işıklarını Ölüm Yıldızı'nın Ön Yüzüne Yönlendir
        if (this.dsFrontLight && this.dsFrontTarget) {
            this.dsFrontLight.position.set(
                this.group.position.x + 60.0,
                this.group.position.y + 130.0,
                this.group.position.z - 180.0 // Modelin önünde, yüzeye doğru vurur
            );
            this.dsFrontTarget.position.copy(this.group.position);
            this.dsFrontTarget.updateMatrixWorld();
        }
        if (this.dsRimLight && this.dsRimTarget) {
            this.dsRimLight.position.set(
                this.group.position.x - 160.0,
                this.group.position.y + 110.0,
                this.group.position.z - 100.0
            );
            this.dsRimTarget.position.copy(this.group.position);
            this.dsRimTarget.updateMatrixWorld();
        }

        // Süper Lazer Çanağı Enerji Titreşimi
        if (this.emitterGlow && this.emitterLight) {
            const glow = 1.8 + Math.sin(this.pulseTime * 4.5) * 0.8;
            this.emitterLight.intensity = glow;
            const s = 1.0 + Math.sin(this.pulseTime * 4.5) * 0.25;
            this.emitterGlow.scale.set(s, s, s);
        }

        // Darbe flaş sönümleme
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            const flashFactor = Math.max(0, this.hitFlashTimer / 0.5);
            this.materials.forEach(mat => {
                if (mat.emissive) {
                    mat.emissive.setRGB(flashFactor * 0.5, flashFactor * 0.1, 0.0);
                }
            });
        }
        } catch (err) {
            console.warn('[DeathStar update error]', err);
        }
    }
}
