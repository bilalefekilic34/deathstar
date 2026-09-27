/**
 * deathstarv2/web/js/neural_hologram.js
 * 
 * Janelia Neuprint (male-cns:v1.0) Canlı Konektom Hologramı.
 * - Mini HUD penceresinde 3D nöron ve sinaps grafiğini çizer.
 * - LC10a (Camgöbeği), DNp01 Giant Fiber (Kırmızı), PAM Dopamin (Altın sarısı).
 * - Spikelar ve Dopamin patlamalarında dinamik ışıma efekti.
 */

import * as THREE from 'three';

export class NeuralHologram {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 1, 500);
        this.camera.position.set(0, 30, 90);
        this.camera.lookAt(0, 10, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.nodeMeshes = new Map();
        this.synapseLines = [];
        this.group = new THREE.Group();
        this.scene.add(this.group);
    }

    async init() {
        if (!this.container) return;

        const w = this.container.clientWidth || 220;
        const h = this.container.clientHeight || 180;
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Işıklandırma
        const ambient = new THREE.AmbientLight(0xffffff, 1.2);
        this.scene.add(ambient);

        // Canlı Konektomu API'den Çek
        try {
            const resp = await fetch('/api/connectome');
            const data = await resp.json();
            this.buildGraph(data);
        } catch (e) {
            console.error('[Hologram] Konektom yüklenemedi:', e);
        }
    }

    buildGraph(data) {
        const neurons = data.neurons || [];
        const synapses = data.synapses || [];

        // Renk paleti
        const colors = {
            'LC10a': 0x00f0ff,
            'DNp01_L': 0xff0044,
            'DNp01_R': 0xff0044,
            'PAM': 0xffb700,
            'MBON_alpha': 0xbd00ff,
            'MBON_beta': 0xbd00ff
        };

        const sphereGeo = new THREE.SphereGeometry(2.0, 12, 12);

        // Nöronları Ekle
        neurons.forEach(n => {
            const col = colors[n.type] || 0x00ff88;
            const mat = new THREE.MeshBasicMaterial({ color: col });
            const mesh = new THREE.Mesh(sphereGeo, mat);
            mesh.position.set(n.pos[0], n.pos[1], n.pos[2]);
            this.group.add(mesh);
            this.nodeMeshes.set(n.bodyId, { mesh, baseColor: col, type: n.type });
        });

        // Sinaps Çizgilerini Ekle
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.35
        });

        synapses.forEach(s => {
            const preNode = this.nodeMeshes.get(s.pre);
            const postNode = this.nodeMeshes.get(s.post);
            if (preNode && postNode) {
                const points = [preNode.mesh.position, postNode.mesh.position];
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geo, lineMat.clone());
                this.group.add(line);
                this.synapseLines.push({ line, preType: preNode.type, postType: postNode.type });
            }
        });

        console.log(`[Hologram] ✓ 3D Konektom İnşa Edildi (${neurons.length} Nöron, ${synapses.length} Sinaps)`);
    }

    update(neuralData) {
        if (!this.container) return;

        // Hologramı yavaşça döndür
        this.group.rotation.y += 0.015;

        // Canlı Nöral Aktivasyon Görselleştirmesi
        const isRolling = neuralData?.is_barrel_rolling || false;
        const dopamine = neuralData?.dopamine_mv || 0.0;
        const spikes = neuralData?.spikes || [];

        // Nöron Parlamaları
        this.nodeMeshes.forEach(item => {
            let targetColor = item.baseColor;
            let targetScale = 1.0;

            if (spikes.includes('LC10a') && item.type.includes('LC10a')) {
                targetColor = 0xffffff;
                targetScale = 1.6;
            } else if (isRolling && item.type.includes('DNp01')) {
                targetColor = 0xffffff;
                targetScale = 2.2;
            } else if (dopamine > 5.0 && (item.type.includes('PAM') || item.type.includes('MBON'))) {
                targetColor = 0xffff55;
                targetScale = 1.8;
            }

            item.mesh.material.color.setHex(targetColor);
            item.mesh.scale.setScalar(targetScale);
        });

        // Sinaps Işıması
        this.synapseLines.forEach(item => {
            if (isRolling && (item.postType.includes('DNp01') || item.preType.includes('DNp01'))) {
                item.line.material.color.setHex(0xff0044);
                item.line.material.opacity = 0.9;
            } else if (dopamine > 5.0 && item.preType.includes('PAM')) {
                item.line.material.color.setHex(0xffb700);
                item.line.material.opacity = 0.85;
            } else {
                item.line.material.color.setHex(0x00f0ff);
                item.line.material.opacity = 0.25;
            }
        });

        this.renderer.render(this.scene, this.camera);
    }
}
