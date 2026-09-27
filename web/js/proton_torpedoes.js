/**
 * deathstarv2/web/js/proton_torpedoes.js
 * 
 * Biyolojik Proton Torpido Ateşleme Sistemi (Proboscis Extension Reflex / PER).
 * - Sinek hedefin tam üstüne gelip besini ısırmaya çalıştığında (PER),
 *   TIE Fighter'ın alt pilonlarından iki adet proton torpidosu ateşlenir.
 * - Star Wars filmindeki ikonik 90° egzoz bacası dalış fiziği.
 * - Parçacık izleri, ışık efektleri ve Box3 çarpışma mekaniği.
 */

import * as THREE from 'three';

export class ProtonTorpedoSystem {
    constructor(scene) {
        this.scene = scene;
        this.torpedoes = [];
        this.isFired = false;
        this.hasHit = false;

        // Torpido ortak geometrisi ve materyali (Yüksek enerjili plazma)
        this.torpedoGeo = new THREE.SphereGeometry(0.55, 16, 16);
        this.torpedoMat = new THREE.MeshBasicMaterial({
            color: 0xff00aa // Neon magenta-pink proton plazması
        });

        // Çekirdek parlama küresi
        this.glowGeo = new THREE.SphereGeometry(1.1, 12, 12);
        this.glowMat = new THREE.MeshBasicMaterial({
            color: 0xff88ff,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending
        });
    }

    fire(shipPos, targetPos, flyAimStats = {}) {
        if (this.isFired) return;
        this.isFired = true;
        this.hasHit = false;

        const accuracy = typeof flyAimStats.accuracy === 'number' ? flyAimStats.accuracy : 0.65;
        const alignError = typeof flyAimStats.alignmentError === 'number' ? flyAimStats.alignmentError : 0.2;

        // İki adet torpido: Sol ve Sağ alt pilonlardan
        const offsets = [-2.1, 2.1];

        // Sinek öğrenme düzeyine göre terminal hedef sapması (Acemiyken sapma yüksek, öğrendikçe sıfıra yaklaşır)
        const aimJitterX = (1.0 - accuracy) * (Math.random() - 0.5) * 18.0;
        const aimJitterY = (1.0 - accuracy) * (Math.random() - 0.5) * 14.0;

        offsets.forEach((offsetX) => {
            const group = new THREE.Group();

            const coreMesh = new THREE.Mesh(this.torpedoGeo, this.torpedoMat);
            const glowMesh = new THREE.Mesh(this.glowGeo, this.glowMat);
            group.add(coreMesh);
            group.add(glowMesh);

            // Torpido Işığı
            const light = new THREE.PointLight(0xff00ff, 4.0, 30);
            group.add(light);

            // Başlangıç konumu
            const startX = shipPos.x + offsetX;
            const startY = shipPos.y - 0.7;
            const startZ = shipPos.z + 2.2;
            group.position.set(startX, startY, startZ);

            this.scene.add(group);

            // Parçacık duman/iyon izi sistemi
            const trailCount = 45;
            const trailGeo = new THREE.BufferGeometry();
            const trailPositions = new Float32Array(trailCount * 3);
            for (let i = 0; i < trailCount * 3; i++) {
                trailPositions[i] = group.position.x;
            }
            trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
            const trailMat = new THREE.PointsMaterial({
                color: 0xff44ff,
                size: 0.75,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });
            const trailPoints = new THREE.Points(trailGeo, trailMat);
            this.scene.add(trailPoints);

            const targetCenter = targetPos ? { ...targetPos } : { x: 0, y: 22.0, z: shipPos.z + 260.0 };
            // Gerçek isabet noktası: Sineğin hizalama hatası ve öğrenme isabetliliğine göre belirlenir
            const terminalX = targetCenter.x + aimJitterX + (shipPos.x * 0.25);
            const terminalY = targetCenter.y + aimJitterY + ((shipPos.y - 22.0) * 0.2);

            this.torpedoes.push({
                group: group,
                light: light,
                trail: trailPoints,
                trailPositions: trailPositions,
                trailHistory: [],
                speedZ: 145.0, // m/s ileri hız (+z ekseninde)
                target: { x: terminalX, y: terminalY, z: targetCenter.z },
                targetCenter: targetCenter,
                accuracy: accuracy,
                box: new THREE.Box3(),
                alive: true
            });
        });

        console.log(`🚀 [TORPEDO] İkiz Proton Torpidoları Ateşlendi! Sinek İsabet Skoru: %${(accuracy * 100).toFixed(0)}`);
    }

    update(dt, exhaustPort, onHitCallback, onMissCallback) {
        if (this.torpedoes.length === 0) return;

        // İzafi Hız Eşitlemesi (Relative Velocity Sync): Hedef hareket ediyorsa Z koordinatını dinamik eşitle
        let currentTargetZ = null;
        if (exhaustPort && exhaustPort.group) {
            currentTargetZ = exhaustPort.group.position.z;
        }

        for (let i = 0; i < this.torpedoes.length; i++) {
            const t = this.torpedoes[i];
            if (!t.alive) continue;

            if (currentTargetZ !== null) {
                t.target.z = currentTargetZ;
                t.targetCenter.z = currentTargetZ;
            }

            // İleri hareket (+z yönünde egzoz deliğine doğru)
            t.group.position.z += t.speedZ * dt;

            // Güdümlü rota (Sineğin öğrendiği hedefe doğru süzülüş)
            const targetZ = t.target.z;
            const distZ = targetZ - t.group.position.z;

            if (distZ < 110.0 && distZ > 0.0) {
                // Sineğin isabet becerisi oranında hedefin ortasına yönelir
                const homingStrength = 3.5 + t.accuracy * 4.5;
                t.group.position.x = THREE.MathUtils.lerp(t.group.position.x, t.target.x, dt * homingStrength);
                t.group.position.y = THREE.MathUtils.lerp(t.group.position.y, t.target.y, dt * homingStrength);
            }

            // Torpido Box3 güncelle
            t.box.setFromObject(t.group);

            // İyon izi güncelleme
            t.trailHistory.unshift(t.group.position.clone());
            if (t.trailHistory.length > 40) t.trailHistory.pop();

            const posAttr = t.trail.geometry.attributes.position;
            for (let j = 0; j < t.trailHistory.length; j++) {
                const hist = t.trailHistory[j];
                posAttr.setXYZ(j, hist.x + (Math.random() - 0.5) * 0.3, hist.y + (Math.random() - 0.5) * 0.3, hist.z);
            }
            posAttr.needsUpdate = true;

            // Hedef Düzlemine Ulaşıldı mı? (Z >= targetZ - 4.0)
            if (t.group.position.z >= (targetZ - 4.0)) {
                // Egzoz deliği merkezine olan radyal uzaklık
                const lateralDist = Math.hypot(
                    t.group.position.x - t.targetCenter.x,
                    t.group.position.y - t.targetCenter.y
                );

                // Egzoz Deliği Giriş Çapı: 9.0 metre
                const isDirectHit = lateralDist <= 9.0;

                if (!this.hasHit) {
                    this.hasHit = true;
                    const hitPos = t.group.position.clone();
                    
                    // Salvodaki her iki torpidoyu da hedef düzleminde çöz
                    this.torpedoes.forEach(tp => {
                        tp.alive = false;
                        this.destroyTorpedo(tp);
                    });

                    if (isDirectHit) {
                        console.log(`🎯 [DIRECT HIT] Proton Torpidosu Egzoz Deliğine Tam İsabet! (Sapma: ${lateralDist.toFixed(2)}m)`);
                        if (onHitCallback) onHitCallback(hitPos);
                    } else {
                        console.log(`⚠️ [MISS] Torpido Dış Zırha Çarptı / Iska Geçti! (Sapma: ${lateralDist.toFixed(2)}m > 9.0m)`);
                        if (onMissCallback) onMissCallback(hitPos, lateralDist);
                    }
                    break;
                }
            }

            // Hedefi çok aşarsa imha et
            if (t.group.position.z > targetZ + 30.0) {
                t.alive = false;
                this.destroyTorpedo(t);
            }
        }

        // Yaşamayan torpidoları temizle
        this.torpedoes = this.torpedoes.filter(t => t.alive);
    }

    destroyTorpedo(t) {
        if (t.group) this.scene.remove(t.group);
        if (t.trail) this.scene.remove(t.trail);
    }

    readyForNextSalvo() {
        this.torpedoes.forEach(t => this.destroyTorpedo(t));
        this.torpedoes = [];
        this.isFired = false;
        this.hasHit = false;
        console.log('🚀 [TORPEDO RELOAD] Yeni Torpido Salvosu Yüklendi ve Ateşlemeye Hazır!');
    }

    reset() {
        this.torpedoes.forEach(t => this.destroyTorpedo(t));
        this.torpedoes = [];
        this.isFired = false;
        this.hasHit = false;
    }
}
