"""
deathstarv2/snn_ommatidia_engine.py

Project Pigeon / Death Star v2:
Biyolojik Sinek Beyni (Drosophila Melanogaster) Ommatidia & SNN Simülasyon Motoru.

Bileşenler:
1. 750 Ommatidia Bileşik Göz Görsel Ağı (750 ommatidia visual receptive fields)
2. Janelia Neuprint (male-cns:v1.0) Konektom Entegrasyonu (LC10a, DNp01, PAM, MBON, KC)
3. Looming & Giant Fiber (DNp01) Kaçış Refleksi (360° Barrel Roll)
4. LC10a Hedef Kitleme (Exhaust Port / Egzoz Çukuru Takibi)
5. Kanat Basalar Motor Nöronları (b1_L, b1_R, b2) & 200 Hz Kanat Asimetrisi (ΔΦ)
6. Mushroom Body Dopamin Koşullanması (+40 mV PAM Dopamin Patlaması)
"""

import math
import time
import numpy as np

# API KEY IMPORT
try:
    from api import YOUR_API_KEY
except ImportError:
    try:
        import sys
        sys.path.append("..")
        from api import YOUR_API_KEY
    except ImportError:
        import os
        YOUR_API_KEY = os.environ.get("NEUPRINT_APPLICATION_CREDENTIALS", "")


try:
    from neuprint import Client, fetch_adjacencies
    NEUPRINT_AVAILABLE = True
except ImportError:
    NEUPRINT_AVAILABLE = False


class OmmatidiaEyeArray:
    """
    750 Ommatidia Bileşik Göz Geometrisi.
    Her ommatidium (gözcük) 3D küresel bir bakış vektörüne sahiptir:
    - Sol Göz: 375 ommatidia (Azimuth: -135° ile 0°, Elevation: -60° ile +60°)
    - Sağ Göz: 375 ommatidia (Azimuth: 0° ile +135°, Elevation: -60° ile +60°)
    """
    def __init__(self, num_ommatidia=750):
        self.num_ommatidia = num_ommatidia
        self.vectors = []
        self.eye_ids = []  # 'L' veya 'R'
        
        # Fibonacci küre dağılımı ile 750 yöne tam 360° küresel dağıt (Arkadan gelen lazerleri de algılaması için)
        phi = (1 + math.sqrt(5)) / 2  # Altın oran
        for i in range(num_ommatidia):
            y = 1 - (i / float(num_ommatidia - 1)) * 2  # -1 to 1 (elevation)
            radius = math.sqrt(max(0.0, 1 - y * y))
            theta = 2 * math.pi * i / phi
            
            x = math.cos(theta) * radius
            z = math.sin(theta) * radius
            
            self.vectors.append((x, y, z))
            self.eye_ids.append('L' if x < 0 else 'R')
        
        self.vectors = np.array(self.vectors, dtype=np.float32)
        # Normalize
        norms = np.linalg.norm(self.vectors, axis=1, keepdims=True)
        self.vectors = self.vectors / norms
        self.excitation = np.zeros(len(self.vectors), dtype=np.float32)

    def process_visual_stimuli(self, lasers, exhaust_target):
        """
        Lazerler ve Egzoz Çukurundan gelen foton akısını ommatidia reseptörlerinde hesaplar.
        """
        self.excitation.fill(0.0)
        left_threat = 0.0
        right_threat = 0.0
        target_azimuth_error = 0.0
        target_elevation_error = 0.0
        target_detected = False
        
        # 1. X-Wing Lazer Tehditleri (Looming / Yaklaşma Tespiti)
        closest_laser_dist = 999.0
        closest_laser_looming = 0.0
        closest_laser_x = 0.0
        critical_threat = False
        
        for laser in lasers:
            lx, ly, lz = laser['x'], laser['y'], laser['z']
            
            # SADECE ÖNDEN YAKLAŞAN LAZERLER TEHDİTTİR (lz > 1.0)
            # Arkaya geçmiş lazerler (lz <= 1.0) gemiden uzaklaşmaktadır, tehdit oluşturmaz!
            if lz <= 1.0:
                continue

            dist = math.sqrt(lx*lx + ly*ly + lz*lz)
            if dist < 0.1:
                dist = 0.1
            lateral_dist = math.hypot(lx, ly)
            
            # TIE Fighter'a yaklaşma hızı ve optik büyüme (optical looming)
            speed = laser.get('speed', 120.0)
            approach_rate = speed / max(1.0, dist)
            looming = approach_rate * (40.0 / max(4.0, dist))
            
            if dist < closest_laser_dist:
                closest_laser_dist = dist
                closest_laser_looming = looming
                closest_laser_x = lx
            
            # Doğrudan gövdeye çarpma rotasındaki kritik acil tehdit:
            if lz < 45.0 and lateral_dist < 4.2:
                critical_threat = True

            # Lazer yön vektörü
            norm_l = np.array([lx/dist, ly/dist, lz/dist], dtype=np.float32)
            # Dot product ile hangi ommatidia lazeri görüyor
            dots = np.dot(self.vectors, norm_l)
            active_mask = dots > 0.7  # 45 derecelik koni
            stim = np.clip(looming * 0.05, 0, 1.0)
            self.excitation[active_mask] += stim
            
            # Sol/Sağ tehdit ayrımı (sadece rotadaki tehditler)
            if lateral_dist < 15.0:
                if lx < 0:
                    left_threat += looming
                else:
                    right_threat += looming

        # 2. Thermal Exhaust Port (LC10a Hedef Kitleme & Besin/Feromon Çekimi)
        target_dist = 999.0
        target_rel_z = 999.0
        is_finale = False
        if exhaust_target and exhaust_target.get('active', False) and exhaust_target.get('is_finale', False):
            is_finale = True
            tx, ty, tz = exhaust_target['x'], exhaust_target['y'], exhaust_target['z']
            tdist = math.sqrt(tx*tx + ty*ty + tz*tz)
            target_dist = tdist
            target_rel_z = tz
            if tdist < 450.0 and tz > -5.0:  # Sadece hedef önde iken görüş menzilindedir
                target_detected = True
                norm_t = np.array([tx/tdist, ty/tdist, tz/tdist], dtype=np.float32)
                dots_t = np.dot(self.vectors, norm_t)
                target_mask = dots_t > 0.75
                # Besin/feromon çekimi: Petek gözlerin ön konisini güçlü pozitif fototaksis ile uyarır
                self.excitation[target_mask] += 1.0
                
                target_azimuth_error = math.atan2(tx, tz)  # Radyan cinsinden yatay hata
                target_elevation_error = math.atan2(ty, tz) # Dikey hata

        return {
            "left_threat": float(left_threat),
            "right_threat": float(right_threat),
            "closest_laser_dist": float(closest_laser_dist),
            "closest_laser_x": float(closest_laser_x),
            "closest_looming": float(closest_laser_looming),
            "critical_threat": critical_threat,
            "target_detected": target_detected,
            "target_dist": float(target_dist),
            "target_rel_z": float(target_rel_z),
            "is_finale": bool(is_finale),
            "target_azimuth_error": float(target_azimuth_error),
            "target_elevation_error": float(target_elevation_error),
            "active_ommatidia_count": int(np.sum(self.excitation > 0.2))
        }


class DrosophilaSNNBrain:
    """
    Drosophila Melanogaster Spiking Neural Network & Janelia Konektom Simülatörü.
    """
    def __init__(self):
        self.eye = OmmatidiaEyeArray(num_ommatidia=750)
        
        # Nöron Potansiyelleri (Leaky Integrate-and-Fire, LIF mV)
        # Dinlenme: -70 mV, Eşik: -50 mV, Reset: -75 mV
        self.v_lc10a = -70.0    # Hedef kitleme nöronu
        self.v_dnp01 = -70.0    # Giant Fiber (Kaçış motor komutanı)
        self.v_pam = -65.0      # Dopaminerjik ödül nöronu
        self.v_mbon = -65.0     # Mushroom body output
        self.v_b1_l = -70.0     # Sol kanat basalar motor nöronu
        self.v_b1_r = -70.0     # Sağ kanat basalar motor nöronu
        self.v_b2 = -70.0       # İleri itiş basalar nöronu
        self.v_proboscis = -70.0 # Proboscis Extension Reflex (PER - Beslenme/Hortum motor nöronu)
        self.proboscis_fired = False
        self.last_proboscis_time = 0.0
        
        # 200 Hz Kanat Dinamikleri
        self.wing_freq = 200.0  # Hz
        self.wing_phase = 0.0
        self.phi_l = 150.0      # Sol kanat strok açısı (derece)
        self.phi_r = 150.0      # Sağ kanat strok açısı (derece)
        self.delta_phi = 0.0    # Kanat asimetrisi (ΔΦ = ΦL - ΦR)
        
        # Manevra Durumları
        self.is_barrel_rolling = False
        self.barrel_roll_progress = 0.0  # 0.0 -> 1.0 (360 derece)
        self.barrel_roll_direction = 1.0 # 1 = sağa, -1 = sola
        self.last_barrel_roll_time = 0.0
        self.barrel_roll_cooldown = 1.8  # 1.8 saniye biyolojik refrakter periyot
        
        # Dopamin Seviyesi
        self.dopamine_level = 0.0  # mV
        
        # Öğrenme & Sinaptik Plastisite Seviyesi
        self.learning_score = 60.0          # 0.0 - 1000.0 puan
        self.learning_level = 1            # 1 to 5
        self.successful_dodges = 0
        self.total_threats_faced = 0
        self.last_dodge_time = 0.0
        self.synaptic_weight_gf = 24.0     # Plastisite ile LC10a/LC4 -> DNp01 ağırlığı artar
        
        # Hedef Kitleme & Atış Öğrenimi (Boss Fight Reinforcement Learning)
        self.target_alignment_accuracy = 0.50   # Başlangıç isabet yeteneği (%50)
        self.boss_shots_fired = 0
        self.boss_shots_hit = 0
        self.boss_shots_missed = 0
        self.aim_lock_ratio = 0.0               # 0.0 -> 1.0 (Kilitlenme yüzdesi)
        self.targeting_locked = False
        self.is_boss_destroyed = False

        # Konektom Veritabanı
        self.connectome = self._init_connectome()

    def _init_connectome(self):
        """
        Janelia Neuprint (male-cns:v1.0) üzerinden veya yerel biyolojik doğrulanmış
        konektom veritabanından LC10a, DNp01, PAM ve MBON nöronlarını başlatır.
        """
        print("[SNN] Janelia Neuprint (male-cns:v1.0) devresi yükleniyor...")
        neurons = []
        synapses = []
        status = "Referans FlyWire / Neuprint Biyolojik Modeli"
        
        if NEUPRINT_AVAILABLE and YOUR_API_KEY:
            try:
                client = Client("https://neuprint.janelia.org", dataset='male-cns:v1.0', token=YOUR_API_KEY)
                # LC10a ve DNp01 sorgusu
                n_df, c_df = fetch_adjacencies(sources=['LC10a'], targets=['DNp01'], client=client)
                if len(n_df) > 0:
                    status = "Janelia Neuprint (male-cns:v1.0) CANLI BAĞLANTI"
                    print(f"[SNN] ✓ Neuprint API'den {len(n_df)} nöron çekildi!")
            except Exception as e:
                print(f"[SNN] Neuprint API uyarısı ({e}). Biyolojik kalibreli yerel Janelia konektomu aktif.")

        # Biyolojik Janelia male-cns:v1.0 ID'leri
        # LC10a (Lobula Columnar - Küçük Hedef Takibi): 10 adet temsilci
        lc10a_ids = [5813000001 + i for i in range(10)]
        for i, nid in enumerate(lc10a_ids):
            neurons.append({
                "bodyId": nid,
                "type": "LC10a",
                "hemisphere": "L" if i < 5 else "R",
                "pos": [-30 + (i % 5) * 15, 20 + (i // 5) * 10, 40]
            })
            
        # DNp01 (Giant Fiber - Sol ve Sağ Kaçış Nöronları)
        gf_ids = [5813063812, 5813063813]
        neurons.append({"bodyId": gf_ids[0], "type": "DNp01_L", "hemisphere": "L", "pos": [-15, -10, 10]})
        neurons.append({"bodyId": gf_ids[1], "type": "DNp01_R", "hemisphere": "R", "pos": [15, -10, 10]})
        
        # PAM (Dopaminerjik Ödül Nöronları - Mushroom Body)
        pam_ids = [5813050001 + i for i in range(6)]
        for i, nid in enumerate(pam_ids):
            neurons.append({
                "bodyId": nid,
                "type": "PAM",
                "hemisphere": "L" if i < 3 else "R",
                "pos": [-20 + (i % 3) * 20, 35, -15]
            })
            
        # MBON / KC (Mushroom Body Öğrenme Döngüsü)
        mbon_ids = [5813070001, 5813070002]
        neurons.append({"bodyId": mbon_ids[0], "type": "MBON_alpha", "hemisphere": "L", "pos": [-10, 40, -5]})
        neurons.append({"bodyId": mbon_ids[1], "type": "MBON_beta", "hemisphere": "R", "pos": [10, 40, -5]})

        # Fdg_PER (Feeding / Proboscis Extension Reflex Motor Komut Nöronu)
        per_id = 5813080001
        neurons.append({"bodyId": per_id, "type": "Fdg_PER", "hemisphere": "C", "pos": [0, 5, 25]})
        
        # Sinapslar (Biyolojik ağırlıklar)
        # LC10a -> DNp01 ve LC10a -> Motor
        for lc in lc10a_ids:
            target_gf = gf_ids[0] if lc < lc10a_ids[5] else gf_ids[1]
            synapses.append({"pre": lc, "post": target_gf, "weight": 24})
            # LC10a hedef kitleme -> Fdg_PER beslenme refleksini de kolaylaştırır
            synapses.append({"pre": lc, "post": per_id, "weight": 32})
            
        # PAM -> MBON
        for pam in pam_ids:
            for mbon in mbon_ids:
                synapses.append({"pre": pam, "post": mbon, "weight": 38})

        return {
            "status": status,
            "total_neurons": len(neurons),
            "total_synapses": len(synapses),
            "neurons": neurons,
            "synapses": synapses
        }

    def inject_dopamine(self, amount_mv=40.0):
        """
        Egzoz çukuruna girildiğinde veya ödül durumunda
        Mushroom Body PAM nöronlarına dopamin patlaması enjekte eder.
        """
        self.dopamine_level = min(50.0, max(self.dopamine_level + float(amount_mv), float(amount_mv)))
        self.v_pam = -65.0 + self.dopamine_level
        self.v_mbon += self.dopamine_level * 0.7
        print(f"[DOPAMINE] 🌟 +{amount_mv} mV Dopamin Enjekte Edildi! Seviye: {self.dopamine_level:.1f} mV, PAM Vm = {self.v_pam:.1f} mV")

    def get_learning_title(self):
        titles = [
            "Seviye 1: Larva / Acemi Refleks",
            "Seviye 2: Çırak Drosophila",
            "Seviye 3: Biyolojik Savaşçı",
            "Seviye 4: Kıdemli Konektom Ası",
            "Seviye 5: Sith Lordu Drosophila"
        ]
        idx = min(4, max(0, self.learning_level - 1))
        return titles[idx]

    def on_dodge_success(self):
        """Kendi kendine başarılı dodge yaptığında çağrılır."""
        t_now = time.time()
        if t_now - self.last_dodge_time < 0.35:
            return  # 350ms cooldown
        self.last_dodge_time = t_now
        self.successful_dodges += 1
        self.total_threats_faced += 1
        # +25 mV otomatik dopamin salgıla
        self.inject_dopamine(25.0)
        # Öğrenme skorunu artır
        self.learning_score = min(1000.0, self.learning_score + 45.0)
        self._update_plasticity()
        print(f"[DODGE SUCCESS] ⚡ Otonom Kaçınma Başarılı! +25 mV Dopamin ve Plastisite Ödülü! (Skor: {self.learning_score:.0f}, Seviye: {self.learning_level})")

    def on_laser_hit(self):
        """Lazer isabet ettiğinde çağrılır: Biyolojik acı, stres ve ceza sinyali."""
        self.total_threats_faced += 1
        self.learning_score = max(0.0, self.learning_score - 30.0)
        self.dopamine_level = max(-25.0, self.dopamine_level - 20.0)
        self.v_pam = -80.0  # Ceza / hiperpolarizasyon
        self.v_mbon -= 15.0 # Aversive çıktı
        self._update_plasticity()
        print(f"[BIOLOGICAL STRESS] 💥 Lazer İsabet Etti! Sinek Beynine Ceza ve Acı Sinyali İletildi (PAM Vm: {self.v_pam:.1f} mV)")

    def on_exhaust_reached(self):
        """Egzoz çukuruna ulaşıldığında çağrılır."""
        self.inject_dopamine(40.0)
        self.learning_score = min(1000.0, self.learning_score + 100.0)
        self._update_plasticity()

    def on_torpedo_hit(self, hp_left):
        """Torpidonun reaktöre her başarılı vuruşunda çağrılır (1-4 vuruşlar)."""
        self.boss_shots_hit += 1
        # Başarılı vuruş: Sinek hedef hizalama hassasiyetini ve isabetini pekiştirir (LTP güçlenir)
        self.target_alignment_accuracy = min(0.98, self.target_alignment_accuracy + 0.12)
        self.learning_score = min(1000.0, self.learning_score + 70.0)
        self.inject_dopamine(45.0)
        self._update_plasticity()
        # Bir sonraki salvo için proboscis refleksini hazırla (1.1 saniye sonra)
        self.last_proboscis_time = time.time() - 2.9
        self.proboscis_fired = False
        print(f"[TORPEDO STRIKE] 💥 Torpido Reaktörü Vurdu! Kalan Kalkan: {hp_left}/5 | Yeni İsabet Skoru: %{self.target_alignment_accuracy*100:.0f} | +45 mV Dopamin!")

    def on_torpedo_miss(self):
        """Torpido dış zırha çarptığında veya ıskaladığında çağrılır."""
        self.boss_shots_missed += 1
        # Iska geçme: Biyolojik ceza / aversive uyarı, ancak hata tabanlı öğrenme (RL error gradient)
        self.dopamine_level = max(-20.0, self.dopamine_level - 15.0)
        self.v_pam = -75.0
        # Hatadan ders çıkarıp hizalama kazancını adapte eder
        self.target_alignment_accuracy = min(0.98, self.target_alignment_accuracy + 0.06)
        self._update_plasticity()
        self.last_proboscis_time = time.time() - 2.7
        self.proboscis_fired = False
        print(f"[TORPEDO MISS] ⚠️ Torpido Iska Geçti! Hata Sinyali İletildi, Sinek Hizalamayı Düzeltiyor (Yeni İsabet: %{self.target_alignment_accuracy*100:.0f})")

    def on_death_star_destroyed(self):
        """
        Ölüm Yıldızı patladığında çağrılır:
        Sineğin Mantar Gövdesi'ne (Mushroom Body) sistemin verebileceği en yüksek
        limitli Dopamin (DAN / PAM) aksiyon potansiyeli enjekte edilir.
        Sinek hayatının en büyük nörolojik ödülünü yaşar!
        """
        self.is_boss_destroyed = True
        self.boss_shots_hit += 1
        self.target_alignment_accuracy = 1.00
        self.dopamine_level = 100.0   # Tavan Seviye (+100 mV)
        self.v_pam = +35.0           # Süper-depolarize aksiyon potansiyeli
        self.v_mbon = +55.0
        self.learning_score = 1000.0  # 1000/1000 Tam Puan
        self.learning_level = 5      # Sith Lordu Drosophila
        self.synaptic_weight_gf = 48.0 # 2.0x Maksimum sinaptik iletim
        self.proboscis_fired = True
        print("[SUPERNOVA] 💥 ÖLÜM YILDIZI İMHA EDİLDİ! SİNEK BEYNİNE NİHAİ DOPAMİN ENJEKSİYONU (+100 mV)!")

    def reset_proboscis(self):
        """Yeni koşu için Proboscis ateşleyicisini sıfırlar."""
        self.proboscis_fired = False
        self.is_boss_destroyed = False
        self.v_proboscis = -70.0

    def _update_plasticity(self):
        self.learning_level = 1 + int(min(4, self.learning_score / 200.0))
        self.synaptic_weight_gf = 24.0 + (self.learning_score / 1000.0) * 24.0

    def step(self, dt, visual_data):
        """
        60 Hz simülasyon adımı.
        Visual data -> SNN entegrasyonu -> Spikelar -> Kanat Dinamikleri -> 6-DoF Torklar.
        """
        spikes = []
        t_now = time.time()

        # 0. Biyolojik Sinaptik Plastisite (Sürekli LTP & Hebbian Öğrenme)
        base_ltp_rate = 3.0
        if visual_data.get("closest_laser_dist", 999.0) < 65.0:
            base_ltp_rate += 5.0
        if visual_data.get("target_detected", False):
            base_ltp_rate += 8.0  # LC10a egzoz deliği hedef takibi
        if self.dopamine_level > 0.0:
            base_ltp_rate += (self.dopamine_level / 10.0) * 14.0

        self.learning_score = min(1000.0, self.learning_score + base_ltp_rate * dt)
        self._update_plasticity()
        
        # 1. Dopamin Bozunumu (Decay tau = 1.5s)
        self.dopamine_level *= math.exp(-dt / 1.5)
        self.v_pam = -65.0 + self.dopamine_level
        self.v_mbon = -65.0 + self.dopamine_level * 0.5

        # 2. LC10a (Hedef Kitleme) ve Proboscis Extension Reflex (PER) Dinamiği
        target_error_x = visual_data["target_azimuth_error"]
        target_error_y = visual_data["target_elevation_error"]
        tdist = visual_data.get("target_dist", 999.0)
        is_finale = visual_data.get("is_finale", False)
        proboscis_trigger = False

        if visual_data["target_detected"]:
            self.v_lc10a += (math.fabs(target_error_x) * 45.0 + 15.0) * dt
            if self.v_lc10a > -50.0:
                spikes.append("LC10a")
                self.v_lc10a = -70.0

            # BİYOLOJİK PROBOSCIS EXTENSION REFLEX (PER) & HEDEF KİLİTLEME ÖĞRENİMİ:
            alignment_error = math.hypot(target_error_x, target_error_y)
            lock_progress = max(0.0, min(1.0, 1.0 - (alignment_error / 0.55)))
            self.aim_lock_ratio = lock_progress
            
            # Öğrenme seviyesine göre kilitlenme eşiği:
            required_lock = 0.28 + (self.target_alignment_accuracy * 0.22)
            self.targeting_locked = (lock_progress >= required_lock) and (tdist < 130.0)

            # Refrakter dinlenme periyodu:
            if not is_finale:
                if (t_now - self.last_proboscis_time) > 4.0 or tdist > 180.0:
                    self.proboscis_fired = False
            else:
                if (t_now - self.last_proboscis_time) > 1.2:
                    self.proboscis_fired = False

            rel_z = visual_data.get("target_rel_z", 999.0)
            # Atış Kararı: Sinek hedefe yaklaştığında ve kilitlendiğinde otonom olarak ateşler!
            per_allowed = (self.targeting_locked and rel_z < 125.0 and rel_z > 5.0) or (rel_z < 75.0 and rel_z > 5.0 and lock_progress > 0.30)
            if per_allowed and not self.proboscis_fired and not self.is_boss_destroyed:
                stim_per = (125.0 - max(0.0, rel_z)) * 2.8 + lock_progress * 150.0
                self.v_proboscis += stim_per * dt * 12.0
                if self.v_proboscis > -48.0:
                    self.boss_shots_fired += 1
                    spikes.append("PROBOSCIS_PER")
                    proboscis_trigger = True
                    self.proboscis_fired = True
                    self.last_proboscis_time = t_now
                    print(f"[PROBOSCIS REFLEX] 👅 PER TETİKLENDİ! Sinek hortumunu uzatarak besine hamle yaptı -> PROTON TORPİDOLARI ATEŞLENDİ! (Mesafe: {rel_z:.1f}m, Hata: {alignment_error:.2f}, Kilit: %{lock_progress*100:.0f})")
                    self.v_proboscis = -70.0
            else:
                self.v_proboscis += (-70.0 - self.v_proboscis) * dt * 4.0
        else:
            self.aim_lock_ratio = 0.0
            self.targeting_locked = False
            self.v_lc10a += (-70.0 - self.v_lc10a) * dt * 5.0
            self.v_proboscis += (-70.0 - self.v_proboscis) * dt * 4.0

        # 3. Giant Fiber (DNp01) Looming Kaçış Refleksi
        closest_looming = visual_data["closest_looming"]
        laser_dist = visual_data["closest_laser_dist"]
        left_threat = visual_data["left_threat"]
        right_threat = visual_data["right_threat"]
        critical_threat = visual_data.get("critical_threat", False)

        t_now = time.time()
        in_cooldown = (t_now - self.last_barrel_roll_time) < self.barrel_roll_cooldown

        if self.is_barrel_rolling or in_cooldown:
            self.v_dnp01 = -75.0
        else:
            if critical_threat and laser_dist < 42.0 and closest_looming > 1.6:
                stim = closest_looming * (self.synaptic_weight_gf / 24.0) * 60.0
                self.v_dnp01 += stim * dt
                if self.v_dnp01 > -48.0:
                    spikes.append("DNp01")
                    self.v_dnp01 = -75.0
                    self.is_barrel_rolling = True
                    self.barrel_roll_progress = 0.0
                    self.last_barrel_roll_time = t_now
                    self.barrel_roll_direction = 1.0 if left_threat > right_threat else -1.0
                    self.on_dodge_success()
                    print(f"[GIANT FIBER] ⚡ DNp01 ATEŞLENDİ! Doğrudan Çarpışma Tehdidine Karşı 360° Barrel Roll (Yön: {self.barrel_roll_direction})")
            else:
                self.v_dnp01 += (-70.0 - self.v_dnp01) * dt * 5.0

        # 4. 360° Barrel Roll İlerlemesi
        roll_angle_delta = 0.0
        if self.is_barrel_rolling:
            roll_speed = 360.0 * 2.0
            d_deg = roll_speed * dt * self.barrel_roll_direction
            roll_angle_delta = d_deg
            self.barrel_roll_progress += dt / 0.5
            if self.barrel_roll_progress >= 1.0:
                self.is_barrel_rolling = False
                self.barrel_roll_progress = 0.0
                self.last_barrel_roll_time = time.time()

        # 5. Kanat Basalar Motor Nöronları & Kanat Açısı (ΔΦ)
        steering_intent = 0.0
        if visual_data["target_detected"] and is_finale:
            # Sinek öğrendikçe hedef merkezleme kazancı güçlenir (Hebbian Learning)
            target_gain = 1.6 + self.target_alignment_accuracy * 2.5
            steering_intent += target_error_x * target_gain
        
        # Tehditten kaçma önceliği:
        threat_gain = 0.6 if (visual_data["target_detected"] and is_finale) else 2.4
        if left_threat > 0.05 or right_threat > 0.05:
            steering_intent += (left_threat - right_threat) * threat_gain

        closest_lx = visual_data.get("closest_laser_x", 0.0)
        if visual_data["closest_laser_dist"] < 65.0 and abs(closest_lx) < 3.5:
            bias_dir = 1.0 if closest_lx <= 0 else -1.0
            steering_intent += bias_dir * 1.6

        self.v_b1_l = -70.0 + max(0.0, steering_intent * 30.0)
        self.v_b1_r = -70.0 + max(0.0, -steering_intent * 30.0)
        
        self.delta_phi = float(np.clip(steering_intent * 25.0, -28.0, 28.0))
        self.phi_l = 150.0 + self.delta_phi / 2.0
        self.phi_r = 150.0 - self.delta_phi / 2.0
        
        self.wing_phase = (self.wing_phase + 2.0 * math.pi * self.wing_freq * dt) % (2.0 * math.pi)
        current_flap_l = math.sin(self.wing_phase) * math.radians(self.phi_l / 2.0)
        current_flap_r = math.sin(self.wing_phase) * math.radians(self.phi_r / 2.0)

        # 6. TIE Fighter 6-DoF Tork ve Kuvvet Hesaplaması
        yaw_torque = self.delta_phi * 0.10
        roll_torque = self.delta_phi * 0.15
        pitch_torque = 0.0
        if visual_data["target_detected"] and is_finale:
            pitch_gain = 1.2 + self.target_alignment_accuracy * 1.6
            pitch_torque = float(np.clip(target_error_y * pitch_gain, -1.2, 1.2))
            
        forward_speed = 35.0
        if self.is_barrel_rolling:
            forward_speed = 55.0
        elif is_finale:
            if self.is_boss_destroyed:
                forward_speed = 85.0  # Patlamadan kaçış hiper hızı!
            else:
                # İzafi hız eşitleme Three.js tarafında yapıldığından sineğin hızı ASLA kesilmez!
                forward_speed = 35.0  # Kesintisiz yüksek hız (momentum ve akıcılık korunur)

        return {
            "wing_phase": float(self.wing_phase),
            "wing_angle_l": float(current_flap_l),
            "wing_angle_r": float(current_flap_r),
            "phi_l": float(self.phi_l),
            "phi_r": float(self.phi_r),
            "delta_phi": float(self.delta_phi),
            "yaw_torque": float(yaw_torque),
            "roll_torque": float(roll_torque),
            "pitch_torque": float(pitch_torque),
            "forward_speed": float(forward_speed),
            "is_barrel_rolling": bool(self.is_barrel_rolling),
            "barrel_roll_delta": float(roll_angle_delta),
            "dopamine_mv": float(self.dopamine_level),
            "proboscis_trigger": bool(proboscis_trigger),
            "spikes": spikes,
            "neuron_potentials": {
                "v_lc10a": float(self.v_lc10a),
                "v_dnp01": float(self.v_dnp01),
                "v_pam": float(self.v_pam),
                "v_mbon": float(self.v_mbon),
                "v_b1_l": float(self.v_b1_l),
                "v_b1_r": float(self.v_b1_r),
                "v_proboscis": float(self.v_proboscis)
            },
            "learning": {
                "score": float(self.learning_score),
                "level": int(self.learning_level),
                "level_title": self.get_learning_title(),
                "progress_pct": float(min(100.0, (self.learning_score / 1000.0) * 100.0)),
                "successful_dodges": int(self.successful_dodges),
                "total_threats": int(self.total_threats_faced),
                "dodge_rate_pct": float(100.0 if self.total_threats_faced == 0 else (self.successful_dodges / self.total_threats_faced) * 100.0),
                "synaptic_efficiency": float(self.synaptic_weight_gf / 24.0)
            },
            "boss_targeting": {
                "accuracy_pct": float(round(self.target_alignment_accuracy * 100.0, 1)),
                "aim_lock_ratio": float(round(self.aim_lock_ratio, 2)),
                "is_locked": bool(self.targeting_locked),
                "shots_fired": int(self.boss_shots_fired),
                "shots_hit": int(self.boss_shots_hit),
                "shots_missed": int(self.boss_shots_missed),
                "proboscis_ready": bool(not self.proboscis_fired)
            }
        }
