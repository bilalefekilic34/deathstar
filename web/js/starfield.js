/**
 * deathstarv2/web/js/starfield.js
 * 
 * Derin Uzay & Hiperspace Yıldız Alanı (Starfield Particle System).
 * 
 * Özellikler:
 * - 3,000 parçacıklı yüksek hızlı yıldız alanı.
 * - İzafi hız eşitlemesi sırasında uzay boşluğundaki akıcılık, hız ve momentum hissini korur.
 * - TIE Fighter'ın hızına göre kameraya doğru kesintisiz yüksek hızda (-Z) akar.
 * - Yıldızlar kameranın arkasına geçtiğinde ileri ufukta sonsuz döngüyle yeniden doğar.
 */

import * as THREE from 'three';

export class StarfieldSystem {
    constructor(scene) {
        this.scene = scene;
        this.particleCount = 3000;
        this.stars = null;
        this.positions = new Float32Array(this.particleCount * 3);
        this.colors = new Float32Array(this.particleCount * 3);
        this.starSpeeds = new Float32Array(this.particleCount);

        this.init();
    }

    init() {
        const geo = new THREE.BufferGeometry();
        const baseColors = [
            new THREE.Color(0xb8d8ff), // Soğuk yıldız mavisi
            new THREE.Color(0xffffff), // Saf beyaz
            new THREE.Color(0xffeaad), // Sıcak kehribar / altın
            new THREE.Color(0x7dd3fc)  // Pastel gök mavisi
        ];

        for (let i = 0; i < this.particleCount; i++) {
            // Geniş uzay koridoru: Siperin üstü ve yanlarını çevreler
            const x = (Math.random() - 0.5) * 900.0;
            const y = 5.0 + Math.random() * 450.0;
            const z = Math.random() * 1200.0 - 100.0;

            this.positions[i * 3] = x;
            this.positions[i * 3 + 1] = y;
            this.positions[i * 3 + 2] = z;

            // Yıldız renkleri
            const col = baseColors[Math.floor(Math.random() * baseColors.length)];
            const lum = 0.6 + Math.random() * 0.4;
            this.colors[i * 3] = col.r * lum;
            this.colors[i * 3 + 1] = col.g * lum;
            this.colors[i * 3 + 2] = col.b * lum;

            // Parçacık bazlı izafi hız çarpanı (Derinlik hissi)
            this.starSpeeds[i] = 0.85 + Math.random() * 0.55;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 2.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.stars = new THREE.Points(geo, mat);
        this.scene.add(this.stars);
        console.log(`[Starfield] ✓ ${this.particleCount} Parçacıklı Hiperspace Yıldız Alanı Aktif!`);
    }

    update(shipZ, dt = 0.016, shipSpeed = 35.0) {
        if (!this.stars) return;

        const effectiveSpeed = Math.max(shipSpeed, 45.0);
        const posAttr = this.stars.geometry.attributes.position;
        const arr = posAttr.array;

        for (let i = 0; i < this.particleCount; i++) {
            const idx = i * 3;
            const speed = effectiveSpeed * this.starSpeeds[i];

            // Yıldızlar kameraya doğru (-Z yönünde) akar
            arr[idx + 2] -= speed * dt;

            // Geminin arkasına geçen yıldızları ileri ufukta yeniden doğur
            if (arr[idx + 2] < shipZ - 60.0) {
                arr[idx] = (Math.random() - 0.5) * 900.0;
                arr[idx + 1] = 5.0 + Math.random() * 450.0;
                arr[idx + 2] = shipZ + 1050.0 + Math.random() * 200.0;
            }
        }

        posAttr.needsUpdate = true;
    }
}
