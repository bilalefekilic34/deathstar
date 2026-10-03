/**
 * deathstarv2/web/js/biological_tie.js
 * 
 * Biyolojik Sinek Pilotlu TIE Fighter Mimarisi.
 * - GLTFLoader ile 'tie_fighter.glb' yüklenir.
 * - Kokpit camı şeffaf hale getirilerek içi görünür kılınır.
 * - Kokpitin içine 3D Drosophila (Meyve Sineği) pilotu ve 200 Hz kanat mekanizması eklenir.
 * - 6-DoF Roll/Pitch/Yaw hareketleri ve 360° Barrel Roll (Fıçı Tonosu) manevrası yönetilir.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class BiologicalTieFighter {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.shipGroup = new THREE.Group();
        this.scene.add(this.shipGroup);

        this.tieMesh = null;
        this.flyGroup = new THREE.Group();
        this.leftWingPivot = new THREE.Group();
        this.rightWingPivot = new THREE.Group();
        this.miniBrainHologram = new THREE.Group();

        this.isLoaded = false;
        this.barrelRollAngle = 0;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.loader.load(
                '/models/tie_fighter.glb',
                (gltf) => {
                    this.tieMesh = gltf.scene;

                    // Malzemeleri yapılandır (Şeffaf kokpit kubbesi ve detaylı gövde)
                    this.tieMesh.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            const name = child.name.toLowerCase();
                            // Kokpit camını ultra berrak ve şeffaf yap (İçteki sinek net görünsün)
                            if (name.includes('glass') || name.includes('canopy')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x93c5fd,
                                    opacity: 0.22,
                                    transparent: true,
                                    roughness: 0.08,
                                    metalness: 0.15,
                                    depthWrite: false
                                });
                            } else if ((name === 'left_wing' || name === 'right_wing') && !name.includes('strut') && !name.includes('rim') && !name.includes('hub')) {
                                // Güneş paneli kanatları: Koyu karbon / fotovoltaik solar panelleri
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x14181f,
                                    roughness: 0.58,
                                    metalness: 0.28,
                                    side: THREE.DoubleSide
                                });
                            } else if (name.includes('engine') && !name.includes('block') && !name.includes('nozzle')) {
                                // İkiz İyon Motorları: Parlak İmparatorluk kırmızı egzoz ışıması (#ff1e1e)
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x110000,
                                    emissive: 0xff1e1e,
                                    emissiveIntensity: 3.5,
                                    roughness: 0.20,
                                    metalness: 0.85
                                });
                            } else {
                                // Gövde küresi, kanat pylon kolları, iskelet kirişleri (struts), çerçeveler ve göbekler:
                                // İkonik İmparatorluk Durasteel Çeliği (#8fa0b2)
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x8fa0b2,
                                    roughness: 0.22,
                                    metalness: 0.88,
                                    clearcoat: 0.35,
                                    clearcoatRoughness: 0.18,
                                    side: THREE.DoubleSide
                                });
                            }
                        }
                    });

                    this.shipGroup.add(this.tieMesh);

                    // Gemiye Özel Optimize Aydınlatma:
                    // 1. Üst Metalik Parlama Işığı (Specular Highlight)
                    const shipTopLight = new THREE.PointLight(0xf1f5f9, 2.0, 16);
                    shipTopLight.position.set(0, 3.5, 0);
                    this.shipGroup.add(shipTopLight);

                    // 2. İkiz İyon Motoru Arka Dolgu Işığı
                    const engineGlowLight = new THREE.PointLight(0xff2222, 2.2, 8);
                    engineGlowLight.position.set(0, 0, -2.6);
                    this.shipGroup.add(engineGlowLight);

                    // 3D Stormtrooper Kaskı Entegrasyonu (GLTFLoader Prefab clone)
                    this.attachStormtrooperHelmet();

                    this.isLoaded = true;
                    console.log('[TIE Fighter] ✓ GLTF Model & 3D Stormtrooper Kaskı Hazır!');
                    resolve();
                },
                undefined,
                (err) => {
                    console.error('[TIE Fighter] GLTF yükleme hatası (/models/tie_fighter.glb):', err);
                    reject(err);
                }
            );
        });
    }

    attachStormtrooperHelmet() {
        const helmetPrefab = (typeof window !== 'undefined' ? window.stormtrooperHelmetPrefab : null);
        if (helmetPrefab && this.tieMesh) {
            const helmet = helmetPrefab.clone(true);
            helmet.name = 'stormtrooper_helmet_pilot';
            helmet.scale.set(1.4, 1.4, 1.4);
            helmet.position.set(0, 0.25, 0.55);
            helmet.rotation.set(0, 0, 0);
            this.tieMesh.add(helmet);
        }
    }

    update(shipData, flyData, neuralData) {
        if (!this.isLoaded) return;

        // 1. TIE Fighter Konumu
        this.shipGroup.position.set(shipData.x, shipData.y, shipData.z);

        // 2. Rotasyon (Roll, Pitch, Yaw)
        this.shipGroup.rotation.z = -shipData.roll;   // Roll
        this.shipGroup.rotation.x = -shipData.pitch;  // Pitch
        this.shipGroup.rotation.y = -shipData.yaw;    // Yaw


        // 4. Mini Hologram Parlaması & Dönüşü
        this.miniBrainHologram.rotation.y += 0.03;
        if (neuralData && neuralData.is_barrel_rolling) {
            // Kaçış refleksi esnasında mini hologram kırmızı yanar
            this.miniBrainHologram.children[0].material.color.setHex(0xff0044);
        } else if (neuralData && neuralData.dopamine_mv > 5.0) {
            // Dopamin patlamasında altın sarısı
            this.miniBrainHologram.children[0].material.color.setHex(0xffb700);
        } else {
            this.miniBrainHologram.children[0].material.color.setHex(0x00f0ff);
        }
    }
}
