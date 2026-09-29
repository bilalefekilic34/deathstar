/**
 * deathstarv2/web/js/spacewars_trench.js
 * 
 * Ölüm Yıldızı Siperleri (Trench Run) Mimarisi.
 * - GLTFLoader ile 'trench_module.glb' yüklenir.
 * - Sonsuz uçuş illüzyonu (Infinite Scrolling) için modüller peş peşe dizilir ve geri dönüştürülür.
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
        this.endWall = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.loader.load(
                '/models/trench_module.glb',
                (gltf) => {
                    this.baseTemplate = gltf.scene;
                    
                    // 1. Metalik Açık Gri Kaplama & PBR Materyal Ayarları (Mesh Traversing)
                    this.baseTemplate.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Zemin kılavuz rayları (İmparatorluk Kırmızısı #ff2a2a ışıma)
                            if (child.name.includes('rail')) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x1f1414,
                                    emissive: 0xff2a2a, // İmparatorluk Kırmızısı (#ff2a2a)
                                    emissiveIntensity: 0.85,
                                    roughness: 0.35,
                                    metalness: 0.85
                                });
                            } else if (child.name.includes('floor') || child.name.includes('dock')) {
                                // Zemin için 8F8F8F HTML renk kodu - Yüksek Metalik
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x8f8f8f,       // Zemin: #8F8F8F
                                    metalness: 0.88,       // Yüksek metalik hissiyat
                                    roughness: 0.40,       // Parlak endüstriyel metalik zemin yansıması
                                    envMapIntensity: 1.6
                                });
                            } else {
                                // Duvarlar için #a9b3bd HTML renk kodu - Açık Uzay Grisi PBR Metalik
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xa9b3bd,       // Duvarlar: #a9b3bd
                                    metalness: 0.85,       // Yüksek yansıtıcılık
                                    roughness: 0.35,       // Işığı şıkça saçan metalik yüzey
                                    envMapIntensity: 1.8
                                });
                            }
                        }
                    });

                    // 5 adet peş peşe siper modülü oluştur
                    for (let i = 0; i < this.numModules; i++) {
                        const mod = this.baseTemplate.clone(true);
                        mod.position.set(0, 0, i * this.moduleLength);
                        this.scene.add(mod);
                        this.modules.push(mod);
                    }

                    // Siper zeminine ışık kılavuz şeritleri ekle
                    this.addRunwayLights();

                    // Terminus duvarını oyun başında önceden yükle (Pre-load)
                    this.buildDeathStarTerminus();
                    if (this.endWall) {
                        this.endWall.visible = false;
                        this.endWall.position.set(0, 0, -50000);
                    }

                    this.isLoaded = true;
                    console.log(`[Trench] ✓ ${this.numModules} adet GLTF Siper Modülü ve Terminus Önceden Yüklendi!`);
                    resolve();
                },
                undefined,
                (err) => {
                    console.warn('[Trench] GLTF yükleme uyarısı, siper fallback ile devam ediliyor:', err);
                    this.addRunwayLights();
                    this.buildDeathStarTerminus();
                    if (this.endWall) {
                        this.endWall.visible = false;
                        this.endWall.position.set(0, 0, -50000);
                    }
                    this.isLoaded = true;
                    resolve();
                }
            );
        });
    }

    addRunwayLights() {
        // İki kenara İmparatorluk Kırmızısı (#ff2a2a) rehber ışık şeritleri
        const lightGeo = new THREE.BoxGeometry(0.3, 0.2, 600);
        const redMat = new THREE.MeshStandardMaterial({
            color: 0x221111,
            emissive: 0xff2a2a, // İmparatorluk Kırmızısı (#ff2a2a)
            emissiveIntensity: 0.75
        });

        this.leftStrip = new THREE.Mesh(lightGeo, redMat);
        this.leftStrip.position.set(-44.0, 0.5, 250);
        this.scene.add(this.leftStrip);

        this.rightStrip = new THREE.Mesh(lightGeo, redMat);
        this.rightStrip.position.set(44.0, 0.5, 250);
        this.scene.add(this.rightStrip);
    }

    startFinale(finalTargetZ) {
        this.isFinale = true;
        this.finaleEndZ = finalTargetZ;

        // Tünelin tam ucuna (Egzoz Çukurunun hemen ardına) zengin Ölüm Yıldızı Terminus Üstyapısı inşa et
        if (!this.endWall) {
            this.buildDeathStarTerminus();
        }
        this.endWall.position.set(0, 0, finalTargetZ + 18.0);
        this.endWall.visible = true;
        console.log(`[Trench] 🎯 Ölüm Yıldızı Terminus Duvarı Z=${finalTargetZ.toFixed(1)}`);
    }

    updateFinalePosition(newZ) {
        this.finaleEndZ = newZ;
        if (this.endWall) {
            this.endWall.position.z = newZ + 18.0;
        }
    }

    buildDeathStarTerminus() {
        const texLoader = new THREE.TextureLoader();
        const deathStarTex = texLoader.load('/static/assets/textures/death_star.jpg');
        deathStarTex.wrapS = THREE.RepeatWrapping;
        deathStarTex.wrapT = THREE.RepeatWrapping;
        deathStarTex.repeat.set(4, 3);
        this.endWall = new THREE.Group();

        // 1. Siper Tabanı Ağır İskele ve Rampa (Zemin: #8F8F8F - Metalik)
        const dockGeo = new THREE.BoxGeometry(96, 10, 16);
        const dockMat = new THREE.MeshStandardMaterial({
            map: deathStarTex,
            color: new THREE.Color(0x8f8f8f),
            roughness: 0.42,
            metalness: 0.88
        });
        const floorDock = new THREE.Mesh(dockGeo, dockMat);
        floorDock.position.set(0, 4.0, 0);
        floorDock.castShadow = true;
        floorDock.receiveShadow = true;
        this.endWall.add(floorDock);

        // 2. Yan Siper Çerçeveleri & Ağır Güçlendirilmiş Kolonlar (Duvarlar: #a9b3bd - Metalik)
        const pillarGeo = new THREE.BoxGeometry(14, 130, 24);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0xa9b3bd,
            roughness: 0.35,
            metalness: 0.85,
            envMapIntensity: 1.8
        });
        const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
        leftPillar.position.set(-46, 55.0, 2);
        this.endWall.add(leftPillar);

        const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
        rightPillar.position.set(46, 55.0, 2);
        this.endWall.add(rightPillar);

        // 4. İmparatorluk Güç Hatları (İmparatorluk Kırmızısı & Amber Enerji Tüpleri)
        const conduitGeo = new THREE.CylinderGeometry(1.2, 1.2, 120, 12);
        const redConduitMat = new THREE.MeshStandardMaterial({ color: 0x1f1414, emissive: 0xff2a2a, emissiveIntensity: 0.75 });
        const amberMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0xfbbf24, emissiveIntensity: 0.6 });

        const tubeL = new THREE.Mesh(conduitGeo, redConduitMat);
        tubeL.position.set(-36, 55.0, 11);
        this.endWall.add(tubeL);

        const tubeR = new THREE.Mesh(conduitGeo, amberMat);
        tubeR.position.set(36, 55.0, 11);
        this.endWall.add(tubeR);

        // 5. Üst Savunma Taretleri (Turbolasers)
        for (const x of [-28, 28]) {
            const turretBase = new THREE.Mesh(
                new THREE.CylinderGeometry(5, 6, 8, 16),
                pillarMat
            );
            turretBase.position.set(x, 118, 5);
            this.endWall.add(turretBase);

            const turretGuns = new THREE.Mesh(
                new THREE.BoxGeometry(2, 2, 14),
                new THREE.MeshStandardMaterial({ color: 0x182030, metalness: 0.8, roughness: 0.3 })
            );
            turretGuns.position.set(x, 123, -2);
            this.endWall.add(turretGuns);
        }

        // 6. Terminus Sahne Işıkları (Dengeli sinematik aydınlatma - Parlama ve blowout önlendi)
        const wallLight = new THREE.DirectionalLight(0xffffff, 0.8);
        wallLight.position.set(0, 90, -120);
        this.endWall.add(wallLight);
        this.endWall.add(wallLight.target);
        wallLight.target.position.set(0, 60, 0);

        const wallAmbient = new THREE.AmbientLight(0xffffff, 0.25);
        this.endWall.add(wallAmbient);

        const fillLight = new THREE.PointLight(0xff2a2a, 0.6, 160);
        fillLight.position.set(0, 35, -20);
        this.endWall.add(fillLight);

        this.scene.add(this.endWall);
    }

    resetFinale() {
        this.isFinale = false;
        if (this.endWall) this.endWall.visible = false;
        for (let i = 0; i < this.modules.length; i++) {
            this.modules[i].visible = true;
        }
    }

    update(shipZ) {
        if (!this.isLoaded) return;

        // Işık kılavuz şeritlerini daima gemiyle birlikte ileri taşı
        if (this.leftStrip) this.leftStrip.position.z = shipZ + 250;
        if (this.rightStrip) this.rightStrip.position.z = shipZ + 250;

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

        // Normal uçuş: Geminin arkasında kalan siper modüllerini kesintisiz öne taşı (Tünel akışı asla durmaz)
        for (let i = 0; i < this.modules.length; i++) {
            const mod = this.modules[i];
            mod.visible = true;
            if (mod.position.z + this.moduleLength < shipZ - 40) {
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
