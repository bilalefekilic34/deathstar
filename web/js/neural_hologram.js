/**
 * deathstarv2/web/js/neural_hologram.js
 * 
 * 3D Biyolojik Sinek Beyni (Drosophila Melanogaster) İnteraktif Hologramı.
 * - Eski 346 nöronluk basit partikül/çizgi sistemi tamamen kaldırılmıştır.
 * - Janelia male-cns:v1.0 gerçek nöropil verilerinden türetilmiş 3D Sinek Beyni Modeli (/models/drosophila_brain.glb) yüklenir.
 * - Camsı, şeffaf ve holografik MeshPhysicalMaterial (yüksek transmission, düşük opacity, neon parlamalar).
 * - THREE.Raycaster tabanlı fare (hover) algılama & canlı HTML/CSS Pop-up (Tooltip) telemetri penceresi.
 * - Gerçek Zamanlı Bölgesel Emissive Parlama (Dynamic Emissive Mapping):
 *   * Lazerden kaçarken / Fıçı Tonosu esnasında Dev Fiber (Giant Fiber - DNp01) kırmızı parlar (#ff0033).
 *   * Egzoz deliğine kilitlenildiğinde Optik Lob (LC10a) neon mavi parlar (#00f0ff).
 *   * Torpido atılıp ödül/dopamin alındığında Mantar Gövde (Mushroom Body / PAM) altın sarısı parlar (#ffd700).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class NeuralHologram {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);

        // Three.js Sahne, Kamera, Renderer
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(38, 1.25, 0.5, 300);
        this.camera.position.set(0, 16, 42);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });

        // 3D Beyin Modeli ve Anatomik Alt Bölgeler
        this.brainGroup = new THREE.Group();
        this.brainGroup.name = 'drosophila_brain_root';
        this.scene.add(this.brainGroup);

        this.loader = new GLTFLoader();
        this.isLoaded = false;

        // Bölgesel Mesh Referansları
        this.cortexMesh = null;
        this.opticLobeLeftMesh = null;
        this.opticLobeRightMesh = null;
        this.mushroomBodyMesh = null;
        this.giantFiberMesh = null;
        this.centralComplexMesh = null;
        this.interactiveMeshes = [];

        // Dinamik Emissive Yoğunluk Hedefleri ve Mevcut Değerleri (Smooth Decay)
        this.emissiveState = {
            giantFiber: { current: 0.3, target: 0.3, color: new THREE.Color(0xff0044) },
            opticLobe: { current: 0.4, target: 0.4, color: new THREE.Color(0x00f0ff) },
            mushroomBody: { current: 0.4, target: 0.4, color: new THREE.Color(0xffd700) },
            centralComplex: { current: 0.5, target: 0.5, color: new THREE.Color(0x8b5cf6) },
            cortex: { current: 0.25, target: 0.25, color: new THREE.Color(0x00e5ff) }
        };

        // Raycaster ve Hover Etkileşimi
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2(-999, -999);
        this.hoveredRegion = null;
        this.tooltipEl = null;
        this.isMouseOverContainer = false;
        this.isHovered = false;
        this.isBrainHovered = false;
        this.brainModel = null;
        this.explodedMeshes = [];

        // UI Kutu Boyutları & Dinamik Canvas Çözünürlüğü Takibi (Anti-Stretching)
        this.currentWidth = 260;
        this.currentHeight = 210;

        // Mouse ile Serbest Döndürme (Drag to Rotate)
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.rotationVelocity = { x: 0, y: 0.008 }; // Yavaş otomatik dönüş hızı

        // En son gelen telemetri verileri önbelleği
        this.lastNeuralData = null;
        this.lastFullData = null;
        this.lastAgentInfo = null;

        this.initTooltip();
    }

    initTooltip() {
        let el = document.getElementById('brain-hologram-tooltip');
        if (!el) {
            el = document.createElement('div');
            el.id = 'brain-hologram-tooltip';
            el.className = 'brain-tooltip-popup';
            el.innerHTML = `
                <div class="brain-tooltip-header" id="btt-title">SİNEK BEYNİ KORTEKSİ</div>
                <div class="brain-tooltip-row">
                    <span>İzlenen Ajan:</span>
                    <span class="brain-tooltip-val" id="btt-agent" style="color: #38bdf8;">RED 5 (X-WING)</span>
                </div>
                <div class="brain-tooltip-row">
                    <span>Devre / Nöropil:</span>
                    <span class="brain-tooltip-val" id="btt-circuit">Janelia CNS</span>
                </div>
                <div class="brain-tooltip-row">
                    <span>Aktivite:</span>
                    <span class="brain-tooltip-val" id="btt-activity">NORMAL</span>
                </div>
                <div class="brain-tooltip-row">
                    <span>Membran Potansiyeli:</span>
                    <span class="brain-tooltip-val" id="btt-voltage">-70.0 mV</span>
                </div>
                <div class="brain-tooltip-row">
                    <span>Ateşleme Frekansı / Ödül:</span>
                    <span class="brain-tooltip-val" id="btt-freq">200 Hz</span>
                </div>
            `;
            document.body.appendChild(el);
        }
        this.tooltipEl = el;
    }

    async init() {
        if (!this.container) return;

        const w = 260;
        const h = 210;
        this.currentWidth = w;
        this.currentHeight = h;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;
        this.container.appendChild(this.renderer.domElement);

        // Holografik Işıklandırma
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
        this.scene.add(ambientLight);

        const topCyanLight = new THREE.DirectionalLight(0x00f0ff, 2.2);
        topCyanLight.position.set(10, 25, 20);
        this.scene.add(topCyanLight);

        const rimMagentaLight = new THREE.DirectionalLight(0xff00aa, 1.8);
        rimMagentaLight.position.set(-15, -10, -15);
        this.scene.add(rimMagentaLight);

        // 3D Sinek Beyni Modelini Yükle (/models/drosophila_brain.glb)
        await this.loadBrainModel();

        // Olay Dinleyicileri (Hover, Raycast, Drag-Rotate)
        this.setupEventListeners();
    }

    async loadBrainModel() {
        return new Promise((resolve) => {
            this.loader.load(
                '/models/drosophila_brain.glb',
                (gltf) => {
                    const model = gltf.scene;

                    // Holografik, şeffaf, camsı PBR materyaller
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = false;
                            child.receiveShadow = false;
                            const name = (child.name || '').toLowerCase();

                            // 1. Optik Loblar (Sol ve Sağ: LC10a Görsel Hedefleme)
                            if (name.includes('optic')) {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x0ea5e9,
                                    emissive: 0x0284c7,
                                    emissiveIntensity: 0.5,
                                    transparent: true,
                                    opacity: 0.72,
                                    roughness: 0.18,
                                    metalness: 0.25,
                                    clearcoat: 0.8,
                                    side: THREE.DoubleSide
                                });
                                if (name.includes('left')) this.opticLobeLeftMesh = child;
                                else this.opticLobeRightMesh = child;
                                child.userData = {
                                    regionName: 'OPTİK LOB (LC10a)',
                                    circuit: 'Görsel Takip & Hedef Kitleme',
                                    description: '750 Ommatidia bileşik gözden gelen foton akısını işleyerek egzoz çukuruna ve tehditlere kilitlenir.',
                                    neuronType: 'LC10a'
                                };
                                this.interactiveMeshes.push(child);
                            }
                            // 2. Mantar Gövde (Mushroom Body / PAM Dopamin & Kenyon Cells)
                            else if (name.includes('mushroom')) {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0xf59e0b,
                                    emissive: 0xd97706,
                                    emissiveIntensity: 0.5,
                                    transparent: true,
                                    opacity: 0.80,
                                    roughness: 0.15,
                                    metalness: 0.20,
                                    clearcoat: 0.9,
                                    side: THREE.DoubleSide
                                });
                                this.mushroomBodyMesh = child;
                                child.userData = {
                                    regionName: 'MANTAR GÖVDE (MUSHROOM BODY)',
                                    circuit: 'PAM Dopamin & Öğrenme (KC / MBON)',
                                    description: 'Ödül koşullanması, sinaptik plastisite (LTP) ve torpido isabetinde +40 mV dopamin patlaması üretir.',
                                    neuronType: 'PAM / MBON'
                                };
                                this.interactiveMeshes.push(child);
                            }
                            // 3. Dev Fiber (Giant Fiber - DNp01 Kaçış Refleksi)
                            else if (name.includes('giant')) {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0xef4444,
                                    emissive: 0xb91c1c,
                                    emissiveIntensity: 0.45,
                                    transparent: true,
                                    opacity: 0.85,
                                    roughness: 0.12,
                                    metalness: 0.30,
                                    clearcoat: 1.0,
                                    side: THREE.DoubleSide
                                });
                                this.giantFiberMesh = child;
                                child.userData = {
                                    regionName: 'DEV FİBER (GIANT FIBER / DNp01)',
                                    circuit: 'Looming Kaçış & 360° Fıçı Tonosu',
                                    description: 'Hızlı optik büyüme (looming) tehdidinde 2-5 ms reaksiyonla ateşlenerek otonom kaçış manevrası yaptırır.',
                                    neuronType: 'DNp01'
                                };
                                this.interactiveMeshes.push(child);
                            }
                            // 4. Merkezi Kompleks (Central Complex - Yönelim ve Seyir)
                            else if (name.includes('central')) {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0xa855f7,
                                    emissive: 0x7e22ce,
                                    emissiveIntensity: 0.5,
                                    transparent: true,
                                    opacity: 0.78,
                                    roughness: 0.20,
                                    metalness: 0.25,
                                    clearcoat: 0.7,
                                    side: THREE.DoubleSide
                                });
                                this.centralComplexMesh = child;
                                child.userData = {
                                    regionName: 'MERKEZİ KOMPLEKS (CENTRAL COMPLEX)',
                                    circuit: 'EB/FB İç Pusula & Seyrüsefer',
                                    description: 'Uzaysal oryantasyon, açısal kafa yönü (head direction) ve 200 Hz kanat vuruş asimetrisi (ΔΦ) torklarını üretir.',
                                    neuronType: 'EB / FB'
                                };
                                this.interactiveMeshes.push(child);
                            }
                            // 5. Bütünsel Beyin Korteksi Zarfı (Translucent Holographic Glass Cortex Shell)
                            else {
                                child.material = new THREE.MeshPhysicalMaterial({
                                    color: 0x00f0ff,
                                    emissive: 0x005577,
                                    emissiveIntensity: 0.25,
                                    transparent: true,
                                    opacity: 0.26,
                                    transmission: 0.78,
                                    roughness: 0.10,
                                    metalness: 0.08,
                                    ior: 1.35,
                                    clearcoat: 0.95,
                                    clearcoatRoughness: 0.08,
                                    depthWrite: false,
                                    side: THREE.DoubleSide
                                });
                                this.cortexMesh = child;
                                child.userData = {
                                    regionName: 'DROSOPHILA BEYİN KORTEKSİ',
                                    circuit: 'Bütünsel Nöropil (Janelia male-cns)',
                                    description: '100,000+ nöron ve milyonlarca sinaps barındıran tam sinek beyni konektom hacmi.',
                                    neuronType: 'Global Neuropil'
                                };
                                this.interactiveMeshes.push(child);
                            }
                        }
                    });

                    this.brainGroup.add(model);
                    this.brainModel = model;
                    window.brainModel = model;
                    this.explodedMeshes = [];

                    // 1. Orijinal Pozisyonların Ön Belleğe Alınması (userData.originalPosition) ve Patlatılmış Hedefler (userData.explodedPosition)
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.userData.originalPosition = child.position.clone();

                            // Merkeze (0,0,0) olan uzaklığına ve anatomik yönüne göre dışarı doğru patlama hedefi (explodedPosition)
                            if (child.position.lengthSq() > 0.1) {
                                child.userData.explodedPosition = child.userData.originalPosition.clone().multiplyScalar(1.45);
                            } else {
                                // Pivotları (0,0,0) noktasında fırınlanmış GLB modellerinde geometrik merkez ve lob yönüne göre hesapla
                                if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
                                const geomCenter = new THREE.Vector3();
                                child.geometry.boundingBox.getCenter(geomCenter);

                                const name = (child.name || '').toLowerCase();
                                let explodeOffset = new THREE.Vector3();

                                if (name.includes('optic') && name.includes('left')) {
                                    explodeOffset.set(-7.5, 0.0, 0.0);
                                } else if (name.includes('optic')) {
                                    explodeOffset.set(7.5, 0.0, 0.0);
                                } else if (name.includes('mushroom')) {
                                    explodeOffset.set(0.0, 5.0, 2.5);
                                } else if (name.includes('giant')) {
                                    explodeOffset.set(0.0, -5.0, -3.2);
                                } else if (name.includes('central')) {
                                    explodeOffset.set(0.0, 0.0, 4.5);
                                } else if (name.includes('cortex') || name.includes('shell')) {
                                    explodeOffset.set(0.0, 0.0, -4.5);
                                } else if (geomCenter.lengthSq() > 0.1) {
                                    explodeOffset.copy(geomCenter).normalize().multiplyScalar(5.5);
                                } else {
                                    explodeOffset.set(0.0, 0.0, 3.5);
                                }

                                child.userData.explodedPosition = child.userData.originalPosition.clone().add(explodeOffset);
                            }
                            this.explodedMeshes.push(child);
                        }
                    });

                    this.isLoaded = true;
                    console.log(`[NeuralHologram] ✓ 3D Sinek Beyni Modeli (Drosophila Brain GLB) & Exploded View userData (${this.explodedMeshes.length} Parça) Başarıyla Entegre Edildi!`);
                    resolve();
                },
                undefined,
                (err) => {
                    console.error('[NeuralHologram] 3D Beyin Modeli yükleme hatası:', err);
                    resolve();
                }
            );
        });
    }

    setupEventListeners() {
        if (!this.container) return;

        // 1. Raycaster Fare Hareketi
        const onPointerMove = (e) => {
            const rect = this.container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.mouse.x = (x / rect.width) * 2 - 1;
            this.mouse.y = -(y / rect.height) * 2 + 1;
            this.isMouseOverContainer = true;

            // Tooltip Konumlandırma
            if (this.tooltipEl) {
                const tooltipW = 240;
                let left = e.clientX + 16;
                let top = e.clientY - 20;

                if (left + tooltipW > window.innerWidth) {
                    left = e.clientX - tooltipW - 16;
                }
                if (top < 10) top = 10;

                this.tooltipEl.style.left = `${left}px`;
                this.tooltipEl.style.top = `${top}px`;
            }

            // Fareyle Serbest Döndürme (Drag)
            if (this.isDragging) {
                const deltaX = e.clientX - this.previousMousePosition.x;
                const deltaY = e.clientY - this.previousMousePosition.y;

                this.brainGroup.rotation.y += deltaX * 0.012;
                this.brainGroup.rotation.x += deltaY * 0.012;
                this.rotationVelocity.y = deltaX * 0.004;

                this.previousMousePosition = { x: e.clientX, y: e.clientY };
            }
        };

        const onPointerEnter = () => {
            this.isMouseOverContainer = true;
            this.isBrainHovered = true;
            if (typeof isBrainHovered !== 'undefined') isBrainHovered = true;
            if (window.isBrainHovered !== undefined) window.isBrainHovered = true;
        };

        const onPointerLeave = () => {
            this.isMouseOverContainer = false;
            this.isBrainHovered = false;
            if (typeof isBrainHovered !== 'undefined') isBrainHovered = false;
            if (window.isBrainHovered !== undefined) window.isBrainHovered = false;
            this.mouse.set(-999, -999);
            this.isDragging = false;
            this.hideTooltip();
        };

        const onPointerDown = (e) => {
            this.isDragging = true;
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        };

        const onPointerUp = () => {
            this.isDragging = false;
        };

        this.container.addEventListener('pointermove', onPointerMove);
        this.container.addEventListener('pointerenter', onPointerEnter);
        this.container.addEventListener('pointerleave', onPointerLeave);
        this.container.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointerup', onPointerUp);
    }

    showTooltip(data) {
        if (!this.tooltipEl) return;

        const titleEl = document.getElementById('btt-title');
        const agentEl = document.getElementById('btt-agent');
        const circuitEl = document.getElementById('btt-circuit');
        const actEl = document.getElementById('btt-activity');
        const voltEl = document.getElementById('btt-voltage');
        const freqEl = document.getElementById('btt-freq');

        if (titleEl) titleEl.innerText = data.regionName || 'DROSOPHILA BEYNİ';
        if (agentEl) {
            agentEl.innerText = data.agentTitle || 'RED 5 (X-WING)';
            agentEl.style.color = data.agentColor || '#38bdf8';
        }
        if (circuitEl) circuitEl.innerText = data.circuit || 'SNN Devresi';
        if (actEl) {
            actEl.innerText = data.activityStatus || 'AKTİF';
            actEl.style.color = data.statusColor || '#00f0ff';
        }
        if (voltEl) voltEl.innerText = data.voltage || '-70.0 mV';
        if (freqEl) freqEl.innerText = data.freq || '200 Hz';

        this.tooltipEl.classList.add('active');
    }

    hideTooltip() {
        if (this.tooltipEl) {
            this.tooltipEl.classList.remove('active');
        }
        this.hoveredRegion = null;
    }

    update(neuralData, fullData = null, agentInfo = null, dt = 0.016) {
        if (!this.container) return;

        this.lastNeuralData = neuralData || this.lastNeuralData;
        this.lastFullData = fullData || this.lastFullData;
        this.lastAgentInfo = agentInfo || this.lastAgentInfo;

        const isRolling = Boolean(neuralData?.is_barrel_rolling);
        const dopamine = typeof neuralData?.dopamine_mv === 'number' ? neuralData.dopamine_mv : 0.0;
        const spikes = Array.isArray(neuralData?.spikes) ? neuralData.spikes : [];
        const potentials = neuralData?.potentials || {};

        // 1. Dinamik Emissive Mapping Hedeflerini Güncelle
        // A. Dev Fiber (Giant Fiber - DNp01): Fıçı tonosu / Kaçışta Şiddetli Kırmızı Parlama (#ff0033)
        if (isRolling || spikes.some(s => s.includes('DNp01')) || (potentials.v_dnp01 && potentials.v_dnp01 > -55.0)) {
            this.emissiveState.giantFiber.target = 4.2;
            this.emissiveState.giantFiber.color.setHex(0xff0033);
        } else {
            this.emissiveState.giantFiber.target = 0.35;
        }

        // B. Optik Loblar (LC10a): Egzoz deliğine kilitlenirken veya görsel takipte Neon Mavi Parlama (#00f0ff)
        if (spikes.includes('LC10a') || (potentials.v_lc10a && potentials.v_lc10a > -55.0) || (neuralData?.lock_ratio && neuralData.lock_ratio > 0.4)) {
            this.emissiveState.opticLobe.target = 3.6;
            this.emissiveState.opticLobe.color.setHex(0x00f0ff);
        } else {
            this.emissiveState.opticLobe.target = 0.45;
        }

        // C. Mantar Gövde (Mushroom Body / PAM): Torpido isabeti / Ödül anında Altın Sarısı / Yeşil Parlama (#ffd700)
        if (dopamine > 5.0) {
            const intensity = Math.min(5.0, 1.2 + (dopamine / 40.0) * 3.5);
            this.emissiveState.mushroomBody.target = intensity;
            if (dopamine > 25.0) {
                this.emissiveState.mushroomBody.color.setHex(0xffd700); // Altın Sarısı
            } else {
                this.emissiveState.mushroomBody.color.setHex(0x00ff88); // Canlı Zümrüt Yeşili
            }
        } else {
            this.emissiveState.mushroomBody.target = 0.40;
        }

        // D. Merkezi Kompleks (Central Complex): Kanat asimetrisi ve yönelim
        const flyData = this.lastFullData?.fly || {};
        const absDeltaPhi = Math.abs(flyData.delta_phi || 0.0);
        this.emissiveState.centralComplex.target = 0.5 + Math.min(2.5, absDeltaPhi * 0.06);

        // 2. Yumuşak İnterpolasyon ile Materyallere Parlamayı Aktar (Smooth Lerp Decay)
        const lerpSpeed = 0.12;

        if (this.giantFiberMesh && this.giantFiberMesh.material) {
            const st = this.emissiveState.giantFiber;
            st.current += (st.target - st.current) * lerpSpeed;
            this.giantFiberMesh.material.emissiveIntensity = st.current;
            this.giantFiberMesh.material.emissive.copy(st.color);
        }

        const olIntensity = this.emissiveState.opticLobe;
        olIntensity.current += (olIntensity.target - olIntensity.current) * lerpSpeed;
        if (this.opticLobeLeftMesh && this.opticLobeLeftMesh.material) {
            this.opticLobeLeftMesh.material.emissiveIntensity = olIntensity.current;
            this.opticLobeLeftMesh.material.emissive.copy(olIntensity.color);
        }
        if (this.opticLobeRightMesh && this.opticLobeRightMesh.material) {
            this.opticLobeRightMesh.material.emissiveIntensity = olIntensity.current;
            this.opticLobeRightMesh.material.emissive.copy(olIntensity.color);
        }

        if (this.mushroomBodyMesh && this.mushroomBodyMesh.material) {
            const mb = this.emissiveState.mushroomBody;
            mb.current += (mb.target - mb.current) * lerpSpeed;
            this.mushroomBodyMesh.material.emissiveIntensity = mb.current;
            this.mushroomBodyMesh.material.emissive.copy(mb.color);
        }

        if (this.centralComplexMesh && this.centralComplexMesh.material) {
            const cx = this.emissiveState.centralComplex;
            cx.current += (cx.target - cx.current) * lerpSpeed;
            this.centralComplexMesh.material.emissiveIntensity = cx.current;
        }

        if (this.cortexMesh && this.cortexMesh.material) {
            // Cortex hafif canlı nabız atışı (Biomimetic subtle breathing glow)
            const breath = 0.22 + Math.sin(performance.now() * 0.002) * 0.08;
            this.cortexMesh.material.emissiveIntensity = breath;

            // Patlatılmış görünümde iç devreleri engellememek için saydamlığı zarifçe artır
            const targetOpacity = (this.isBrainHovered || window.isBrainHovered) ? 0.12 : 0.26;
            this.cortexMesh.material.opacity += (targetOpacity - this.cortexMesh.material.opacity) * 0.1;
        }

        // 3. Otomatik Dönüş (Sürükleme yapılmıyorsa)
        if (!this.isDragging) {
            this.brainGroup.rotation.y += this.rotationVelocity.y;
            this.brainGroup.rotation.x *= 0.96; // X ekseninde merkeze yumuşak dönüş
        }

        // 4. Raycaster ile Yalnızca Bölgesel Nöropil Tespiti & Tooltip (CSS transform: scale kullanıldığı için canvas resize yapılmaz)
        let isHit = false;
        if (this.isLoaded && this.isMouseOverContainer) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.interactiveMeshes, false);

            if (intersects.length > 0) {
                isHit = true;
                // En öndeki öncelikli spesifik lobu seç (Cortex arkadaki spesifik lobları maskelemesin)
                let selected = intersects[0].object;
                for (const hit of intersects) {
                    if (hit.object !== this.cortexMesh) {
                        selected = hit.object;
                        break;
                    }
                }

                this.hoveredRegion = selected;
                const uData = selected.userData || {};

                // Bölgeye özel anlık telemetriyi formatla
                let actStatus = 'NORMAL (İstirahatte)';
                let stColor = '#00f0ff';
                let volt = '-70.0 mV';
                let freq = '200 Hz';

                if (selected === this.giantFiberMesh) {
                    if (isRolling || (potentials.v_dnp01 && potentials.v_dnp01 > -55.0)) {
                        actStatus = 'ATEŞLENDİ (360° Fıçı Tonosu / Kaçış)!';
                        stColor = '#ff0044';
                    }
                    volt = `${(potentials.v_dnp01 || -70.0).toFixed(1)} mV`;
                } else if (selected === this.opticLobeLeftMesh || selected === this.opticLobeRightMesh) {
                    const lockPct = (neuralData?.lock_ratio ? (neuralData.lock_ratio * 100).toFixed(0) : '95');
                    if (spikes.includes('LC10a') || (potentials.v_lc10a && potentials.v_lc10a > -55.0) || (neuralData?.lock_ratio && neuralData.lock_ratio > 0.4)) {
                        actStatus = `HEDEFE KİLİTLENDİ (LC10a - %${lockPct})!`;
                        stColor = '#00f0ff';
                    }
                    volt = `${(potentials.v_lc10a || -70.0).toFixed(1)} mV`;
                } else if (selected === this.mushroomBodyMesh) {
                    if (dopamine > 5.0) {
                        actStatus = `DOPAMİN PATLAMASI (+${dopamine.toFixed(1)} mV)!`;
                        stColor = '#ffd700';
                    }
                    volt = `PAM Vm: -${(40.0 - Math.min(25.0, dopamine * 0.5)).toFixed(1)} mV`;
                    freq = `+${dopamine.toFixed(1)} mV Ödül`;
                } else if (selected === this.centralComplexMesh) {
                    actStatus = `DÖNÜŞ TORKU (ΔΦ: ${(flyData.delta_phi || 0.0).toFixed(1)}°)`;
                    stColor = '#a855f7';
                    volt = '-65.0 mV';
                }

                this.showTooltip({
                    agentTitle: this.lastAgentInfo?.agentTitle || 'RED 5 (X-WING)',
                    agentColor: this.lastAgentInfo?.agentType === 'hero' ? '#38bdf8' : '#10b981',
                    regionName: uData.regionName,
                    circuit: uData.circuit,
                    activityStatus: actStatus,
                    statusColor: stColor,
                    voltage: volt,
                    freq: freq
                });
            }
        }

        if (!isHit) {
            this.hideTooltip();
        }

        // 3D Beyin Modeli Orijinal Boyutunda Sabit Kalır (Kutunun kendisi CSS ile büyür)
        this.brainGroup.scale.set(1.0, 1.0, 1.0);

        // Sahneyi çiz
        this.renderer.render(this.scene, this.camera);
    }
}
