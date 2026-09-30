/**
 * deathstarv2/web/js/spacewars_trench.js
 * 
 * Ölüm Yıldızı Siperleri (Trench Run) Mimarisi.
 * - SADECE GLTFLoader ile '/models/trench_module.glb' yüklenir.
 * - İlkel şekiller (BoxGeometry, CylinderGeometry vb.) içermez.
 * - PBR MeshStandardMaterial / MeshPhysicalMaterial ve envMap yansımaları içerir.
 * - Sonsuz uçuş illüzyonu (Infinite Scrolling) için GLTF modülleri peş peşe dizilir.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class SpacewarsTrench {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.modules = [];
        this.moduleLength = 120.0; // generate_assets.py uzunluğu ile uyumlu
        this.numModules = 5;
        this.isLoaded = false;
        this.baseTemplate = null;
        this.isFinale = false;
        this.finaleEndZ = 0;
        this.endCapModule = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.loader.load(
                '/models/trench_module.glb',
                (gltf) => {
                    this.baseTemplate = gltf.scene;
                    
                    // Metalik Açık Gri Kaplama & PBR Materyal Ayarları (Mesh Traversing)
                    this.baseTemplate.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Zemin kılavuz rayları (İmparatorluk Kırmızısı #ff2a2a ışıma)
                            if (child.name.includes('rail')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x1f1414,
                                    emissive: 0xff2a2a, // İmparatorluk Kırmızısı (#ff2a2a)
                                    emissiveIntensity: 0.95,
                                    roughness: 0.35,
                                    metalness: 0.85
                                });
                            } else if (child.name.includes('floor') || child.name.includes('dock')) {
                                // Zemin için #8F8F8F - Yüksek Metalik
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x8f8f8f,
                                    metalness: 0.88,
                                    roughness: 0.38,
                                    envMapIntensity: 1.6
                                });
                            } else {
                                // Duvarlar için #a9b3bd - Açık Uzay Grisi PBR Metalik
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xa9b3bd,
                                    metalness: 0.85,
                                    roughness: 0.35,
                                    envMapIntensity: 1.8
                                });
                            }
                        }
                    });

                    // 5 adet peş peşe GLTF siper modülü oluştur
                    for (let i = 0; i < this.numModules; i++) {
                        const mod = this.baseTemplate.clone(true);
                        mod.position.set(0, 0, i * this.moduleLength);
                        this.scene.add(mod);
                        this.modules.push(mod);
                    }

                    this.isLoaded = true;
                    console.log(`[Trench] ✓ ${this.numModules} adet GLTF Siper Modülü Başarıyla Yüklendi!`);
                    resolve();
                },
                undefined,
                (err) => {
                    console.error('[Trench] GLTF siper yükleme hatası:', err);
                    reject(err);
                }
            );
        });
    }

    startFinale(finalTargetZ) {
        this.isFinale = true;
        this.finaleEndZ = finalTargetZ;

        // Final anında siper tüneli doğrudan Ölüm Yıldızı ana gövdesine ve egzoz deliğine açılır
        console.log(`[Trench] 🎯 Final Açılışı: Z=${finalTargetZ.toFixed(1)}`);
    }

    updateFinalePosition(newZ) {
        this.finaleEndZ = newZ;
    }

    resetFinale() {
        this.isFinale = false;
        for (let i = 0; i < this.modules.length; i++) {
            this.modules[i].visible = true;
        }
    }

    update(shipZ) {
        if (!this.isLoaded) return;

        // Final aşamasında: Siperin bittiği noktadan (finaleEndZ) sonrasına siper modülü dizilmez,
        // açık derin uzay ve arkasındaki heybetli Ölüm Yıldızı İstasyonu tüm ihtişamıyla ortaya çıkar!
        if (this.isFinale) {
            for (let i = 0; i < this.modules.length; i++) {
                const mod = this.modules[i];
                if (mod.position.z >= this.finaleEndZ - 15.0) {
                    mod.visible = false;
                } else {
                    mod.visible = true;
                }
            }
            return;
        }

        // Siper modüllerinin gemi etrafında kesintisiz akışı
        const baseZ = Math.floor((shipZ - this.moduleLength) / this.moduleLength) * this.moduleLength;
        const isDesynced = this.modules.some(m => Math.abs(m.position.z - shipZ) > (this.numModules + 2) * this.moduleLength);

        if (isDesynced) {
            for (let i = 0; i < this.modules.length; i++) {
                this.modules[i].position.z = baseZ + i * this.moduleLength;
                this.modules[i].visible = true;
            }
            return;
        }

        // Normal uçuş: Geminin arkasında kalan siper modüllerini kesintisiz öne taşı (Tünel akışı asla durmaz)
        for (let i = 0; i < this.modules.length; i++) {
            const mod = this.modules[i];
            mod.visible = true;
            while (mod.position.z + this.moduleLength < shipZ - 60) {
                let maxZ = -Infinity;
                for (let j = 0; j < this.modules.length; j++) {
                    if (this.modules[j].position.z > maxZ) {
                        maxZ = this.modules[j].position.z;
                    }
                }
                mod.position.z = maxZ + this.moduleLength;
            }
        }
    }
}
