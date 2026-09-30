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
        this.flyGroup = new THREE.Group();
        this.flyGroup.name = 'drosophila_pilot';
        this.shipGroup.add(this.flyGroup);

        this.leftWingMesh = null;
        this.rightWingMesh = null;
        this.isLoaded = false;

        // Hasar ve Biyolojik Stres Göstergeleri
        this.damageFlashTimer = 0.0;
        this.originalMaterials = new Map();

        // Çarpışma Bounding Box3 (Görünmez, sadece matematiksel kesişim için)
        this.collisionBox = new THREE.Box3();
        this.boxHelper = null;

        // Motor İtiş Işıkları
        this.engineLights = [];
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.loader.load(
                '/models/dark_x_wing.glb',
                (gltf) => {
                    this.xWingMesh = gltf.scene;

                    // Red Five / Kahraman X-Wing PBR Materyalleri
                    this.xWingMesh.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            const name = (child.name || '').toLowerCase();

                            // 1. Şeffaf Kokpit Camı (Biyo-pilot sinek net görünsün)
                            if (name.includes('glass') || name.includes('canopy')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x93c5fd,
                                    opacity: 0.22,
                                    transparent: true,
                                    roughness: 0.06,
                                    metalness: 0.15,
                                    depthWrite: false
                                });
                            }
                            // 2. İkonik Red Five Kırmızı / Turuncu Filo Şeritleri
                            else if (name.includes('stripe') || name.includes('intake') || name.includes('panel') || name.includes('ring')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xef4444,
                                    emissive: 0xb91c1c,
                                    emissiveIntensity: 0.75,
                                    roughness: 0.28,
                                    metalness: 0.40
                                });
                            }
                            // 3. 4x İyon İtiş Motor Egzoz Alevleri
                            else if (name.includes('glow')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xff3300,
                                    emissive: 0xff4500,
                                    emissiveIntensity: 4.5,
                                    roughness: 0.10,
                                    metalness: 0.85
                                });
                            }
                            // 4. Taim & Bak KX9 Titanyum Dörtlü Lazer Namluları
                            else if (name.includes('cannon') || name.includes('barrel') || name.includes('probe')) {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x242e3d,
                                    roughness: 0.20,
                                    metalness: 0.92,
                                    clearcoat: 0.40
                                });
                            }
                            // 5. Astromech Droid Gümüş Kubbesi (R2-D2)
                            else if (name.includes('droid_head')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xe2e8f0,
                                    roughness: 0.15,
                                    metalness: 0.90
                                });
                            }
                            else if (name.includes('sensor_eye')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x00f0ff,
                                    emissive: 0x00c8ff,
                                    emissiveIntensity: 3.0
                                });
                            }
                            // 6. Açık Durasteel Zırh Gövdesi (#cbd5e1 - Star Wars Klasik X-Wing Rengi)
                            else {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0xd0d8e2,
                                    roughness: 0.28,
                                    metalness: 0.82,
                                    clearcoat: 0.32,
                                    clearcoatRoughness: 0.18
                                });
                            }
                        }
                    });

                    this.shipGroup.add(this.xWingMesh);

                    // X-Wing Gemi Aydınlatması (Specular & Engine Highlights)
                    const shipTopLight = new THREE.PointLight(0xf1f5f9, 2.2, 18);
                    shipTopLight.position.set(0, 3.8, 0);
                    this.shipGroup.add(shipTopLight);

                    const engineGlow = new THREE.PointLight(0xff4500, 2.8, 12);
                    engineGlow.position.set(0, 0, -3.2);
                    this.shipGroup.add(engineGlow);
                    this.engineLights.push(engineGlow);

                    // 3D Biyolojik Sinek Pilotunu kokpit içine yerleştir
                    this.buildFlyPilot();

                    this.isLoaded = true;
                    console.log('[HeroXWing] ✓ Kahraman X-Wing (Red Five) GLTF Modeli ve Biyo-Sinek Kokpiti Hazır!');
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

    buildFlyPilot() {
        // Kokpitin tam içi: X-Wing kokpit merkezi (Z: 0.85, Y: 0.48)
        this.flyGroup.position.set(0, 0.48, 0.85);
        this.flyGroup.scale.set(0.42, 0.42, 0.42);

        // 1. Toraks & Abdomen
        const thoraxGeo = new THREE.SphereGeometry(0.7, 12, 12);
        thoraxGeo.scale(1.0, 1.1, 1.4);
        const thoraxMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.4 });
        this.flyGroup.add(new THREE.Mesh(thoraxGeo, thoraxMat));

        const abdomenGeo = new THREE.SphereGeometry(0.8, 12, 12);
        abdomenGeo.scale(0.85, 0.85, 1.7);
        const abdomenMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.35 });
        const abdomen = new THREE.Mesh(abdomenGeo, abdomenMat);
        abdomen.position.set(0, -0.25, -1.4);
        abdomen.rotation.x = -0.15;
        this.flyGroup.add(abdomen);

        // 2. Baş & Kırmızı Petek Gözler (750 Ommatidia)
        const headGeo = new THREE.SphereGeometry(0.5, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x1f140e });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 0.2, 1.1);
        this.flyGroup.add(head);

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
        this.flyGroup.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.32, 0.3, 1.2);
        this.flyGroup.add(rightEye);

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
        this.leftWingMesh = new THREE.Mesh(wingGeo, wingMat);
        this.leftWingMesh.rotation.set(-Math.PI / 2, 0, Math.PI * 0.9);
        leftPivot.add(this.leftWingMesh);
        this.flyGroup.add(leftPivot);
        this.leftWingPivot = leftPivot;

        const rightPivot = new THREE.Group();
        rightPivot.position.set(0.4, 0.5, 0.2);
        this.rightWingMesh = new THREE.Mesh(wingGeo, wingMat);
        this.rightWingMesh.rotation.set(-Math.PI / 2, 0, -Math.PI * 0.9);
        this.rightWingMesh.scale.set(-1, 1, 1);
        rightPivot.add(this.rightWingMesh);
        this.flyGroup.add(rightPivot);
        this.rightWingPivot = rightPivot;
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
        if (!this.isLoaded || !shipData) return;

        // Gemi pozisyonu ve rotasyonu
        this.shipGroup.position.set(shipData.x, shipData.y, shipData.z);
        this.shipGroup.rotation.z = -shipData.roll;   // Roll
        this.shipGroup.rotation.x = -shipData.pitch;  // Pitch
        this.shipGroup.rotation.y = -shipData.yaw;    // Yaw

        // Biyo-pilot sinek kanat çırpma animasyonu (200 Hz yüksek hızlı kanat kinematiği)
        if (typeof flyDataOrDt === 'object' && flyDataOrDt !== null) {
            if (this.leftWingPivot) this.leftWingPivot.rotation.z = flyDataOrDt.wing_l;
            if (this.rightWingPivot) this.rightWingPivot.rotation.z = -flyDataOrDt.wing_r;
        } else {
            const wingFreq = 200.0;
            const time = performance.now() * 0.001;
            const strokeAngle = Math.sin(time * wingFreq * 0.06) * 0.45;
            if (this.leftWingPivot) this.leftWingPivot.rotation.z = strokeAngle;
            if (this.rightWingPivot) this.rightWingPivot.rotation.z = -strokeAngle;
        }

        // Bounding Box güncelle
        this.collisionBox.setFromObject(this.shipGroup);

        // Hasar flaşı
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= (typeof flyDataOrDt === 'number' ? flyDataOrDt : 0.016);
        }
    }
}
