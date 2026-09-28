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
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x93c5fd,
                                    transmission: 0.95,
                                    opacity: 0.35,
                                    transparent: true,
                                    roughness: 0.08,
                                    metalness: 0.1,
                                    ior: 1.45,
                                    reflectivity: 0.7,
                                    depthWrite: false
                                });
                            } else if (name.includes('wing') && !name.includes('pylon')) {
                                // Güneş paneli kanatları: Sleek slate paneller & metalik yansıma
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x283548,
                                    roughness: 0.45,
                                    metalness: 0.55
                                });
                            } else if (name.includes('engine')) {
                                // İkiz İyon Motorları: Yumuşak pastel kırmızı egzoz ışıması
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x1e293b,
                                    emissive: 0xf87171,
                                    emissiveIntensity: 1.0,
                                    roughness: 0.35
                                });
                            } else {
                                // Gövde küresi, pylon kolları ve koltuk: Aydınlık İmparatorluk çeliği
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0x5a6a7e,
                                    roughness: 0.38,
                                    metalness: 0.6,
                                    side: THREE.DoubleSide
                                });
                            }
                        }
                    });

                    this.shipGroup.add(this.tieMesh);

                    // Gemiye özel yerel aydınlatmalar: Siluetleşmeyi kesin olarak önler ve detayları öne çıkarır
                    // 1. Üst Gövde Tepe Işığı: Kanat panelleri ve gövde çeliği üzerindeki detayları aydınlatır
                    const shipTopLight = new THREE.PointLight(0xf1f5f9, 2.2, 28);
                    shipTopLight.position.set(0, 4.2, 0);
                    this.shipGroup.add(shipTopLight);

                    // 2. İkiz İyon Motoru Arka Dolgu Işığı: Arkadan takipte motorları ve gövde hatlarını yumuşakça parlatır
                    const engineGlowLight = new THREE.PointLight(0xf87171, 1.8, 14);
                    engineGlowLight.position.set(0, 0, -2.6);
                    this.shipGroup.add(engineGlowLight);

                    // 3D Biyolojik Sinek Pilotunu kokpite inşa et
                    this.buildFlyPilot();

                    this.isLoaded = true;
                    console.log('[TIE Fighter] ✓ GLTF Model & Biyolojik Sinek Kokpiti Hazır!');
                    resolve();
                },
                undefined,
                (err) => {
                    console.warn('[TIE Fighter] GLTF yükleme uyarısı, prosedürel TIE Fighter kuruluyor:', err);
                    const fallbackGroup = new THREE.Group();
                    const cockpitGeo = new THREE.SphereGeometry(2.0, 16, 16);
                    const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x283240, roughness: 0.5, metalness: 0.7 });
                    fallbackGroup.add(new THREE.Mesh(cockpitGeo, cockpitMat));

                    const pylonGeo = new THREE.CylinderGeometry(0.3, 0.3, 8.0, 12);
                    pylonGeo.rotateZ(Math.PI / 2);
                    fallbackGroup.add(new THREE.Mesh(pylonGeo, cockpitMat));

                    const wingGeo = new THREE.CylinderGeometry(4.2, 4.2, 0.2, 6);
                    wingGeo.rotateZ(Math.PI / 2);
                    const wingMat = new THREE.MeshStandardMaterial({ color: 0x121720, roughness: 0.4, metalness: 0.85 });
                    const leftWing = new THREE.Mesh(wingGeo, wingMat);
                    leftWing.position.set(-4.0, 0, 0);
                    const rightWing = new THREE.Mesh(wingGeo, wingMat);
                    rightWing.position.set(4.0, 0, 0);
                    fallbackGroup.add(leftWing);
                    fallbackGroup.add(rightWing);

                    this.tieMesh = fallbackGroup;
                    this.shipGroup.add(this.tieMesh);
                    this.buildFlyPilot();
                    this.isLoaded = true;
                    resolve();
                }
            );
        });
    }

    buildFlyPilot() {
        // Kokpitin tam ortası
        this.flyGroup.position.set(0, -0.15, 0.1);
        this.flyGroup.scale.set(0.78, 0.78, 0.78);

        // Kokpit içi yumuşak aydınlatma: Sinek pilotunun vücudunu ve kanatlarını aydınlatır
        const cockpitLight = new THREE.PointLight(0xe0f2fe, 2.0, 10);
        cockpitLight.position.set(0, 0.6, 0.5);
        this.flyGroup.add(cockpitLight);

        // 1. Toraks (Göğüs)
        const thoraxGeo = new THREE.SphereGeometry(0.7, 16, 16);
        thoraxGeo.scale(1.0, 1.2, 1.5);
        const thoraxMat = new THREE.MeshStandardMaterial({
            color: 0x473322,
            roughness: 0.4,
            metalness: 0.25
        });
        const thorax = new THREE.Mesh(thoraxGeo, thoraxMat);
        this.flyGroup.add(thorax);

        // 2. Abdomen (Karın - Çizgili Chitin)
        const abdomenGeo = new THREE.SphereGeometry(0.85, 16, 16);
        abdomenGeo.scale(0.9, 0.9, 1.8);
        const abdomenMat = new THREE.MeshStandardMaterial({
            color: 0x6b4e33,
            roughness: 0.35
        });
        const abdomen = new THREE.Mesh(abdomenGeo, abdomenMat);
        abdomen.position.set(0, -0.3, -1.6);
        abdomen.rotation.x = -0.2;
        this.flyGroup.add(abdomen);

        // 3. Baş & 750 Ommatidia Kırmızı Bileşik Gözler
        const headGeo = new THREE.SphereGeometry(0.55, 16, 16);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x1f1712 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 0.25, 1.3);
        this.flyGroup.add(head);

        // Parlak Kırmızı Bileşik Gözler (Bileşik Göz / Ommatidia)
        const eyeGeo = new THREE.SphereGeometry(0.38, 16, 16);
        eyeGeo.scale(1.0, 1.3, 1.1);
        const eyeMat = new THREE.MeshStandardMaterial({
            color: 0xee1111,
            emissive: 0x880000,
            roughness: 0.2,
            metalness: 0.5
        });

        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.38, 0.35, 1.4);
        leftEye.rotation.set(0, -0.3, 0.2);
        this.flyGroup.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.38, 0.35, 1.4);
        rightEye.rotation.set(0, 0.3, -0.2);
        this.flyGroup.add(rightEye);

        // 4. Kanatlar (200 Hz ile Titreşen Yarı Saydam Chitin Kanatlar)
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0);
        wingShape.quadraticCurveTo(1.2, 0.4, 2.5, 0.1);
        wingShape.quadraticCurveTo(2.7, -0.4, 1.8, -0.7);
        wingShape.quadraticCurveTo(0.6, -0.6, 0, 0);

        const wingGeo = new THREE.ShapeGeometry(wingShape);
        const wingMat = new THREE.MeshPhysicalMaterial({
            color: 0xccf0ff,
            transmission: 0.85,
            opacity: 0.65,
            transparent: true,
            roughness: 0.1,
            side: THREE.DoubleSide
        });

        // Sol Kanat Pivotu
        this.leftWingPivot.position.set(-0.5, 0.6, 0.2);
        const leftWingMesh = new THREE.Mesh(wingGeo, wingMat);
        leftWingMesh.rotation.set(-Math.PI / 2, 0, Math.PI * 0.9);
        this.leftWingPivot.add(leftWingMesh);
        this.flyGroup.add(this.leftWingPivot);

        // Sağ Kanat Pivotu
        this.rightWingPivot.position.set(0.5, 0.6, 0.2);
        const rightWingMesh = new THREE.Mesh(wingGeo, wingMat);
        rightWingMesh.rotation.set(-Math.PI / 2, 0, Math.PI * 0.1);
        rightWingMesh.scale.set(-1, 1, 1);
        this.rightWingPivot.add(rightWingMesh);
        this.flyGroup.add(this.rightWingPivot);

        // 5. Mini Nöral Hologram (Sineğin kafasının üstünde süzülen 3D hologram)
        const holoGeo = new THREE.IcosahedronGeometry(0.35, 1);
        const holoMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.85
        });
        const miniBrain = new THREE.Mesh(holoGeo, holoMat);
        this.miniBrainHologram.position.set(0, 1.2, 1.2);
        this.miniBrainHologram.add(miniBrain);
        this.flyGroup.add(this.miniBrainHologram);

        this.shipGroup.add(this.flyGroup);
    }

    update(shipData, flyData, neuralData) {
        if (!this.isLoaded) return;

        // 1. TIE Fighter Konumu
        this.shipGroup.position.set(shipData.x, shipData.y, shipData.z);

        // 2. Rotasyon (Roll, Pitch, Yaw)
        this.shipGroup.rotation.z = -shipData.roll;   // Roll
        this.shipGroup.rotation.x = -shipData.pitch;  // Pitch
        this.shipGroup.rotation.y = -shipData.yaw;    // Yaw

        // 3. Kanat Hareketi (200 Hz Kanat Çırpma & Asimetri)
        if (flyData) {
            this.leftWingPivot.rotation.z = flyData.wing_l;
            this.rightWingPivot.rotation.z = -flyData.wing_r;
        }

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
