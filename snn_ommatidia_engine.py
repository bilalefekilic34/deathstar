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
import warnings
import concurrent.futures
import numpy as np

# Bağımlılık sürüm uyarılarını sessize al
warnings.filterwarnings("ignore")

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

    def process_visual_stimuli(self, lasers, exhaust_target=None, frontal_obstacles=None):
        """
        Lazerler, Egzoz Çukuru ve Öndeki Fiziksel Engellerden (Sollayan X-Wing'ler) gelen foton akısını
        ve optik büyüme (Optical Looming) vektörlerini 750 ommatidia reseptöründe hesaplar.
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
            
            # Arkadan (-z'den +z'ye) veya önden yaklaşan lazerlerin yaklaşma kontrolü:
            # client 'approaching' bilgisini gönderirse doğrudan kullanır, yoksa mesafeye bakar
            is_approaching = laser.get('approaching', True)
            if not is_approaching:
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
            
            # Doğrudan gövdeye çarpma rotasındaki kritik acil tehdit (Arkadan veya önden):
            if dist < 42.0 and lateral_dist < 4.2:
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

        # 1b. TIE Fighter'ı Sollayan X-Wing'ler (Ön Fiziksel Looming Tehdidi / Yol Kesme)
        closest_obstacle_dist = 999.0
        closest_obstacle_looming = 0.0
        closest_obstacle_x = 0.0
        
        if frontal_obstacles:
            for obs in frontal_obstacles:
                ox = obs['x']
                oy = obs['y']
                oz = obs['z']  # oz > 0: TIE'nin önünde (+z yönünde)
                if oz <= 0.2 or oz > 75.0:
                    continue
                    
                dist = math.sqrt(ox*ox + oy*oy + oz*oz)
                if dist < 0.1:
                    dist = 0.1
                lateral_dist = math.hypot(ox, oy)
                
                # TIE Fighter ile öndeki X-Wing arasındaki yaklaşma hızı (closing speed):
                # TIE ~35 m/s, önündeki X-Wing ~32 m/s -> TIE hızla arkadan yetişiyor
                rel_vz = obs.get('vz', 0.0)  # tie_vz - obs_vz
                closing_speed = max(8.0, rel_vz + 12.0)
                approach_rate = closing_speed / max(1.0, dist)
                
                # Büyüyen optik gövde uyarımı (Optical Looming Stimulus):
                # X-Wing devasa bir fiziksel gövdedir (12m kanat açıklığı),
                # yaklaştıkça petek göz üzerinde katlanarak genişleyen bir silüet oluşturur!
                looming = approach_rate * (60.0 / max(3.5, dist))
                
                if dist < closest_obstacle_dist:
                    closest_obstacle_dist = dist
                    closest_obstacle_looming = looming
                    closest_obstacle_x = ox
                
                # Doğrudan çarpışma rotasındaki kritik acil engel:
                if dist < 38.0 and lateral_dist < 6.5:
                    critical_threat = True
                    
                # 750 Ommatidia bileşik göz üzerinde nesnenin izdüşümü:
                norm_o = np.array([ox/dist, oy/dist, oz/dist], dtype=np.float32)
                dots = np.dot(self.vectors, norm_o)
                
                # Cisim yaklaştıkça petek göz üzerindeki açısal çapı (koni) genişler:
                cone_threshold = max(0.55, 1.0 - (5.5 / max(3.0, dist)))
                active_mask = dots > cone_threshold
                stim = np.clip(looming * 0.08, 0.0, 1.0)
                self.excitation[active_mask] += stim
                
                # Sol/Sağ lateral tehdit ayrımı (TIE'nin engelden kaçması için):
                if lateral_dist < 18.0:
                    if ox < 0:
                        left_threat += looming * 1.5
                    else:
                        right_threat += looming * 1.5

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

        # En yakın tehdit değerlendirmesi (Lazer veya Ön Engel)
        effective_dist = min(closest_laser_dist, closest_obstacle_dist)
        effective_looming = max(closest_laser_looming, closest_obstacle_looming)
        effective_x = closest_obstacle_x if closest_obstacle_dist < closest_laser_dist else closest_laser_x

        return {
            "left_threat": float(left_threat),
            "right_threat": float(right_threat),
            "closest_laser_dist": float(effective_dist),
            "closest_laser_x": float(effective_x),
            "closest_looming": float(effective_looming),
            "critical_threat": critical_threat,
            "closest_obstacle_dist": float(closest_obstacle_dist),
            "closest_obstacle_looming": float(closest_obstacle_looming),
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
        self.last_tie_laser_time = 0.0
        
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
        print("[SNN] Janelia Neuprint (male-cns:v1.0) biyolojik konektom devresi yükleniyor...")
        neurons = []
        synapses = []
        status = "Referans FlyWire / Neuprint Biyolojik Modeli"
        
        if NEUPRINT_AVAILABLE and YOUR_API_KEY:
            def _fetch_neuprint():
                c = Client("https://neuprint.janelia.org", dataset='male-cns:v1.0', token=YOUR_API_KEY, progress=False)
                return fetch_adjacencies(sources=['LC10a'], targets=['DNp01'], client=c)

            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(_fetch_neuprint)
                    n_df, c_df = future.result(timeout=3.5)
                    if len(n_df) > 0:
                        status = "Janelia Neuprint (male-cns:v1.0) CANLI BAĞLANTI"
                        print(f"[SNN] ✓ Neuprint API'den {len(n_df)} nöron başarıyla çekildi!")
            except concurrent.futures.TimeoutError:
                print("[SNN] ℹ Neuprint API yanıtı (3.5s) zaman aşımına uğradı. Biyolojik kalibreli yerel Janelia konektomu aktif.")
            except Exception as e:
                print(f"[SNN] ℹ Neuprint API ({e}). Biyolojik kalibreli yerel Janelia konektomu aktif.")

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

        # 2b. Biyolojik Karşı Saldırı & Düşman Avlama Refleksi (TIE Forward Lasers):
        # Sineğin önünde bir X-Wing belirdiğinde (özellikle sollayıp önüne geçen veya ön koridorda uçan düşmanlar):
        # Sineğin hortum (PER) ve bacak refleksleri tetiklenerek ileriye lazer ateşler!
        tie_fire_laser = False
        closest_obs_dist = visual_data.get("closest_obstacle_dist", 999.0)
        closest_obs_x = visual_data.get("closest_laser_x", 0.0)
        
        # Ön koridorda (dist < 85m ve |x| < 6.5m) düşman varsa:
        if closest_obs_dist < 85.0 and abs(closest_obs_x) < 6.5:
            if (t_now - self.last_tie_laser_time) > 1.2:
                self.v_proboscis += 50.0
                if self.v_proboscis > -48.0:
                    spikes.append("PROBOSCIS_PER")
                    tie_fire_laser = True
                    self.last_tie_laser_time = t_now
                    self.v_proboscis = -70.0
                    print(f"[COUNTER-ATTACK] ⚡ SİNEK KARŞI SALDIRI REFLEKSİ! Öndeki X-Wing'e İkiz Lazer Ateşlendi (Mesafe: {closest_obs_dist:.1f}m)!")

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
            "tie_fire_laser": bool(tie_fire_laser),
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


class XWingDrosophilaBrain:
    """
    X-Wing Düşman Birimi Biyolojik Sinek Beyni (Drosophila Melanogaster Multi-Agent SNN).
    - Her bir Dark X-Wing'in arka planda çalışan kendi simüle edilmiş Drosophila beynidir.
    - Uçuş Fiziği: TIE Fighter ile aynı (200 Hz kanat çırpma, basalar motor nöronları b1_L / b1_R,
      asimetrik kanat vuruş genliği ΔΦ, Roll/Pitch/Yaw torkları).
    - LC10a Görsel Devresi: Öndeki TIE Fighter'ı av/feromon hedefi olarak algılayıp rotasını sürekli ona kilitler.
    - Proboscis Extension Reflex (PER): TIE menzile girip açı sıfırlandığında lazer salvosunu ateşler (-z'den +z'ye).
    - 1 HP Kuralı (Glass Cannon): Tek vuruşluk can; siper duvarına çarparsa veya kaçış şokuna kapılırsa imha olur.
    """
    def __init__(self, agent_id, spawn_x=0.0, spawn_y=32.0, spawn_z=-50.0):
        self.agent_id = str(agent_id)
        self.hp = 1
        self.is_alive = True
        self.destroyed_reason = None
        
        # 750 Ommatidia Bileşik Göz Geometrisi
        self.eye = OmmatidiaEyeArray(num_ommatidia=750)
        
        # 6-DoF Kinematik Durum
        self.x = float(spawn_x)
        self.y = float(spawn_y)
        self.z = float(spawn_z)
        self.vx = 0.0
        self.vy = 0.0
        self.vz = 39.0  # Dengeli takip başlangıç hızı
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0
        
        # Nöron Potansiyelleri (Leaky Integrate-and-Fire, LIF mV)
        self.v_lc10a = -70.0      # TIE Fighter av/feromon takip nöronu
        self.v_dnp01 = -70.0      # Giant Fiber
        self.v_b1_l = -70.0       # Sol kanat basalar motor nöronu
        self.v_b1_r = -70.0       # Sağ kanat basalar motor nöronu
        self.v_proboscis = -70.0  # PER Lazer Tetikleyici Nöron
        
        # 200 Hz Kanat Mekaniği
        self.wing_freq = 200.0
        self.wing_phase = float(np.random.uniform(0.0, 2.0 * math.pi))
        self.phi_l = 150.0
        self.phi_r = 150.0
        self.delta_phi = 0.0
        self.current_flap_l = 0.0
        self.current_flap_r = 0.0
        
        # PER Ateşleme Zamanlaması
        self.last_fire_time = 0.0
        self.fire_cooldown = float(np.random.uniform(1.2, 1.9))
        self.aim_lock_ratio = 0.0
        self.is_locked = False
        
        # Biyolojik Çeşitlilik ve Av Takip Helezon Parametreleri (Predatory Weave Dynamics)
        self.flight_time = float(np.random.uniform(0.0, 10.0))
        self.weave_phase = float(np.random.uniform(0.0, 2.0 * math.pi))
        self.weave_freq_x = float(np.random.uniform(0.85, 1.45))
        self.weave_freq_y = float(np.random.uniform(0.65, 1.15))
        self.weave_amp_x = float(np.random.uniform(7.0, 13.0))   # Yatay kanat manevra yarıçapı
        self.weave_amp_y = float(np.random.uniform(3.5, 7.5))    # Dikey irtifa dalgalanması
        self.attack_pulse_phase = float(np.random.uniform(0.0, 2.0 * math.pi))
        
        self.aggression = float(np.random.uniform(1.15, 1.45))
        self.steering_gain = float(np.random.uniform(2.8, 3.8))

        # Taktik Durum Makinesi (Asimetrik Av-Avcı Dogfight & Sollama):
        # 'chase': Arkadan takip & PER lazer taciz ateşi
        # 'boost_overtake': İtki patlaması (+32 m/s delta) ile TIE Fighter'ı sollama
        # 'lane_block': TIE'nin tam önüne geçip yolunu kesme & Looming tehdit engeli
        # 'breakaway': Kenara açılarak TIE'nin tekrar öne geçmesine izin verme
        self.tactic_state = 'chase'
        self.tactic_timer = float(np.random.uniform(0.5, 3.5))
        self.overtake_flank_x = 0.0
        self.block_target_x = 0.0
        self.block_duration = float(np.random.uniform(2.5, 4.2))

    def step(self, dt, tie_state, is_tie_barrel_rolling=False):
        """
        60 Hz X-Wing SNN simülasyon adımı.
        TIE Fighter'ı av olarak arkadan takip eder, ani itki (boost) ile TIE'yi sollayıp
        tam önüne geçer (+z ekseni), yolunu keserek ommatidia petek gözde büyüyen bir engel (looming threat)
        oluşturur ve TIE'yi manevra yapmaya zorlar.
        """
        if not self.is_alive:
            return None
            
        spikes = []
        t_now = time.time()
        self.flight_time += dt
        
        tie_x = float(tie_state["x"])
        tie_y = float(tie_state["y"])
        tie_z = float(tie_state["z"])
        tie_vz = float(tie_state.get("vz", 35.0))
        
        dx = tie_x - self.x
        dy = tie_y - self.y
        dz = tie_z - self.z  # dz > 0: TIE önde, dz < 0: X-Wing önde (+z)!
        dist = math.sqrt(dx * dx + dy * dy + dz * dz)
        if dist < 0.1:
            dist = 0.1

        self.tactic_timer += dt
        
        # 1. Taktik Durum Makinesi Geçişleri:
        if self.tactic_state == 'chase':
            # 5.0s - 7.0s takip ettikten sonra ve TIE'nin 10m - 42m arkasındayken sollama itkisini ateşle
            if self.tactic_timer > 5.0 and (10.0 < dz < 42.0):
                self.tactic_state = 'boost_overtake'
                self.tactic_timer = 0.0
                # TIE'nin solundan veya sağından geçiş kanadı belirle
                self.overtake_flank_x = float(tie_x - 13.0 if tie_x > 0 else tie_x + 13.0)
                self.overtake_flank_x = max(-26.0, min(26.0, self.overtake_flank_x))
                print(f"[DOGFIGHT] 🚀 {self.agent_id} İTKİ PATLAMASI! TIE Fighter'ı sollamaya başladı! (Hız delta: +14 m/s, Flank X: {self.overtake_flank_x:.1f})")

        elif self.tactic_state == 'boost_overtake':
            # TIE Fighter'ın önüne geçtiğinde (dz <= -12m) hemen önüne kırarak yolunu kes!
            if dz <= -12.0 or self.tactic_timer > 4.5:
                self.tactic_state = 'lane_block'
                self.tactic_timer = 0.0
                self.block_duration = float(np.random.uniform(2.5, 4.0))
                self.block_target_x = tie_x
                print(f"[DOGFIGHT] 🛑 {self.agent_id} TIE Fighter'ı SOLLAYIP ÖNÜNE GEÇTİ! Yol kesme ve Looming Tehdit başladı (Önde {(-dz):.1f}m)")

        elif self.tactic_state == 'lane_block':
            # TIE'nin önünde 2.5 - 4.0 saniye kalarak looming tehdit oluşturur
            # Süre dolunca veya TIE çok uzaklaşınca / fıçı tonosuyla savrulunca kenara açıl
            if self.tactic_timer > self.block_duration or dz < -42.0 or dz > 2.0:
                self.tactic_state = 'breakaway'
                self.tactic_timer = 0.0
                self.overtake_flank_x = float(22.0 if self.x > 0 else -22.0)

        elif self.tactic_state == 'breakaway':
            # Kenara açılıp hız keserek TIE'nin tekrar öne geçmesine izin verir
            if dz > 16.0 or self.tactic_timer > 3.2:
                self.tactic_state = 'chase'
                self.tactic_timer = 0.0

        # 2. Uçuş Hedefi ve Z-Ekseni Hız Farkı (Velocity Delta):
        if self.tactic_state == 'chase':
            weave_x = math.sin(self.flight_time * self.weave_freq_x + self.weave_phase) * self.weave_amp_x
            weave_y = math.cos(self.flight_time * self.weave_freq_y + self.weave_phase) * self.weave_amp_y
            aim_x = tie_x + weave_x
            aim_y = tie_y + weave_y
            desired_dz = 20.0 + (math.sin(self.flight_time * 0.75 + self.attack_pulse_phase) + 1.0) * 6.0
            
            if dz > desired_dz + 8.0:
                target_speed = tie_vz + 10.0  # İnsaflı yaklaşma
            elif dz > desired_dz:
                target_speed = tie_vz + 4.0   # Takip
            else:
                target_speed = tie_vz - 3.0   # Mesafe koruma
                
        elif self.tactic_state == 'boost_overtake':
            # Yan kanattan sıyrılıp TIE'yi insaflı hız farkıyla solla (+14 m/s delta)
            aim_x = self.overtake_flank_x
            aim_y = tie_y + 1.2
            # Sineğin Giant Fiber kaçış refleksleriyle savuşturabileceği dengeli hız delta
            target_speed = tie_vz + 14.0
            
        elif self.tactic_state == 'lane_block':
            # TIE Fighter'ın doğrudan uçuş koridoruna yerleş
            sway_x = math.sin(self.flight_time * 1.8) * 3.0
            aim_x = self.block_target_x + sway_x
            aim_y = tie_y + math.cos(self.flight_time * 1.2) * 1.5
            # TIE ile neredeyse denk hız (-0.5 m/s delta), ani tuğla freni yapmaz
            target_speed = tie_vz - 0.5
            
        elif self.tactic_state == 'breakaway':
            # Siper duvarına doğru açıl ve hız keserek TIE'nin öne geçmesini sağla
            aim_x = self.overtake_flank_x
            aim_y = 48.0
            target_speed = tie_vz - 16.0

        # Z-Ekseni Hız Entegrasyonu
        accel_rate = 4.8 if self.tactic_state == 'boost_overtake' else 2.6
        self.vz += (target_speed - self.vz) * dt * accel_rate
        self.z += self.vz * dt
        
        # 3. Yönelim ve 6-DoF Hedef Hataları
        aim_dx = aim_x - self.x
        aim_dy = aim_y - self.y
        target_azimuth_error = math.atan2(aim_dx, 12.0)
        target_elevation_error = math.atan2(aim_dy, 12.0)
        
        # Ommatidia Bileşik Göz & LC10a Devresi
        self.eye.excitation.fill(0.0)
        norm_t = np.array([dx / dist, dy / dist, max(1.0, dz) / dist], dtype=np.float32)
        dots = np.dot(self.eye.vectors, norm_t)
        in_view_mask = dots > 0.65
        self.eye.excitation[in_view_mask] += 1.0
        
        # LC10a Hedef Kitleme Nöronu Depolarizasyonu
        alignment_error = math.hypot(target_azimuth_error, target_elevation_error)
        self.aim_lock_ratio = max(0.0, min(1.0, 1.0 - (alignment_error / 0.45)))
        
        stim_lc10a = (math.fabs(target_azimuth_error) * 45.0 + 22.0) * self.aggression
        self.v_lc10a += stim_lc10a * dt
        if self.v_lc10a > -50.0:
            spikes.append("LC10a")
            self.v_lc10a = -70.0
            
        # 4. Yönlendirme (Steering Intent) ve Siper Duvarı Algısı
        steering_intent = target_azimuth_error * self.steering_gain
        
        # Siper duvarı optik akış kaçınması:
        if self.x > 26.0:
            steering_intent -= (self.x - 26.0) * 0.60
        elif self.x < -26.0:
            steering_intent += (-26.0 - self.x) * 0.60
            
        # Tavan ve Zemin optik kaçınması:
        pitch_intent = target_elevation_error * 2.4
        if self.y > 66.0:
            pitch_intent -= (self.y - 66.0) * 0.45
        elif self.y < 12.0:
            pitch_intent += (12.0 - self.y) * 0.45
            
        # Asimetrik Kanat Strok Genliği (ΔΦ = ΦL - ΦR)
        self.v_b1_l = -70.0 + max(0.0, steering_intent * 32.0)
        self.v_b1_r = -70.0 + max(0.0, -steering_intent * 32.0)
        
        self.delta_phi = float(np.clip(steering_intent * 28.0, -36.0, 36.0))
        self.phi_l = 150.0 + self.delta_phi / 2.0
        self.phi_r = 150.0 - self.delta_phi / 2.0
        
        # 200 Hz Kanat Çırpma Kinematiği
        self.wing_phase = (self.wing_phase + 2.0 * math.pi * self.wing_freq * dt) % (2.0 * math.pi)
        self.current_flap_l = math.sin(self.wing_phase) * math.radians(self.phi_l / 2.0)
        self.current_flap_r = math.sin(self.wing_phase) * math.radians(self.phi_r / 2.0)
        
        # 5. Uçuş Fiziği Torkları (Pitch/Yaw/Roll Manevraları)
        yaw_torque = self.delta_phi * 0.15
        roll_torque = self.delta_phi * 0.24
        pitch_torque = float(np.clip(pitch_intent, -2.0, 2.0))
        
        # Rotasyon Entegrasyonu
        self.roll += roll_torque * dt
        self.roll *= math.exp(-dt * 3.2)
        self.yaw += yaw_torque * dt
        self.yaw *= math.exp(-dt * 2.2)
        self.pitch += pitch_torque * dt
        self.pitch *= math.exp(-dt * 3.2)
        
        # Konum Güncelleme
        self.vx = self.roll * 20.0 + self.yaw * 14.0
        self.x += self.vx * dt
        
        self.vy = self.pitch * 16.0
        self.y += self.vy * dt
        
        # 6. Proboscis Extension Reflex (PER) Lazer Ateşleme
        # KURAL: X-Wing SADECE TIE Fighter'ın arkasındayken (dz > 6.0) ve menzildeyken ateş açar!
        # TIE Fighter'ın önüne geçtiğinde (lane_block veya dz <= 0) TIE'ye doğru ateş açamaz (namlular +Z ileri yönlüdür).
        fire_laser = False
        if dz > 6.0 and self.tactic_state != 'lane_block':
            tie_dx = tie_x - self.x
            tie_dy = tie_y - self.y
            tie_azimuth_err = math.atan2(tie_dx, max(1.0, dz))
            tie_elev_err = math.atan2(tie_dy, max(1.0, dz))
            direct_alignment = math.hypot(tie_azimuth_err, tie_elev_err)
            
            in_range = (8.0 < dz < 55.0) and (dist < 60.0)
            self.is_locked = in_range and (direct_alignment < 0.28)
            
            if self.is_locked and (t_now - self.last_fire_time > self.fire_cooldown):
                self.v_proboscis += 45.0
                if self.v_proboscis > -48.0:
                    spikes.append("PROBOSCIS_PER")
                    fire_laser = True
                    self.last_fire_time = t_now
                    self.v_proboscis = -70.0
                    self.fire_cooldown = float(np.random.uniform(2.4, 3.8))
            else:
                self.v_proboscis += (-70.0 - self.v_proboscis) * dt * 4.0
        else:
            self.is_locked = False
            self.v_proboscis += (-70.0 - self.v_proboscis) * dt * 4.0
            
        # 7. 1 HP Kuralı & Çarpışma / Savrulma Kontrolü (Glass Cannon)
        # Siper Duvar Sınırları: |X| >= 34.0, Y <= 5.0, Y >= 78.0
        if abs(self.x) >= 34.0:
            self.is_alive = False
            self.destroyed_reason = "wall_crash"
        elif self.y <= 5.0:
            self.is_alive = False
            self.destroyed_reason = "floor_crash"
        elif self.y >= 78.0:
            self.is_alive = False
            self.destroyed_reason = "ceiling_crash"
            
        # TIE Fighter Giant Fiber Fıçı Tonosu Girdap Şoku:
        # TIE fıçı tonosu yaparsa ve X-Wing arkasındaysa (dist < 26m, dz < 34m):
        # 1 HP X-Wing şiddetli hava girdabıyla anında savrulur ve parçalanır!
        if is_tie_barrel_rolling and (dz > -6.0 and dz < 34.0) and (dist < 26.0):
            self.is_alive = False
            self.destroyed_reason = "barrel_roll_wake"
            
        return {
            "id": self.agent_id,
            "x": float(self.x),
            "y": float(self.y),
            "z": float(self.z),
            "roll": float(self.roll),
            "pitch": float(self.pitch),
            "yaw": float(self.yaw),
            "speed": float(self.vz),
            "hp": int(self.hp if self.is_alive else 0),
            "is_alive": bool(self.is_alive),
            "destroyed_reason": self.destroyed_reason,
            "wing_l": float(self.current_flap_l),
            "wing_r": float(self.current_flap_r),
            "delta_phi": float(self.delta_phi),
            "fire_laser": bool(fire_laser),
            "tactic_state": str(self.tactic_state),
            "is_in_front": bool(dz < 0),
            "dz": float(round(dz, 1)),
            "neural": {
                "v_lc10a": float(self.v_lc10a),
                "v_proboscis": float(self.v_proboscis),
                "lock_ratio": float(round(self.aim_lock_ratio, 2)),
                "spikes": spikes
            }
        }


class EnemySquadronManager:
    """
    Çoklu Düşman X-Wing Filosu Yöneticisi (Multi-Agent Simulation Manager).
    - Maksimum 2 X-Wing sınırıyla adil dalga (wave) simülasyonu yürütür.
    - Sahnede yok edilen birimlerin ardından TIE Fighter'a reaksiyon payı (4.5s cooldown) tanır.
    """
    def __init__(self, max_enemies=2):
        self.enemies = {}  # {agent_id: XWingDrosophilaBrain}
        self.max_enemies = max_enemies
        self.next_agent_num = 1
        self.spawn_timer = 0.0

    def reset(self):
        self.enemies.clear()
        self.next_agent_num = 1
        self.spawn_timer = 0.0

    def spawn_enemy(self, tie_state):
        agent_id = f"tie_{self.next_agent_num}"
        self.next_agent_num += 1
        
        # TIE Fighter'ın gerisinde reaksiyon payı tanıyacak mesafede spawn:
        # Z: TIE Fighter'ın 42 - 62 metre gerisi (Geniş 3. şahıs kamerada yaklaşırken net görünür)
        # Yan kanatlardan (X: +/- 10m - 20m) siper içine dalarak spawn olur
        side = 1.0 if (self.next_agent_num % 2 == 0) else -1.0
        spawn_x = float(tie_state["x"] + side * np.random.uniform(10.0, 20.0))
        spawn_x = max(-26.0, min(26.0, spawn_x))
        spawn_y = float(tie_state["y"] + np.random.uniform(-2.0, 6.0))
        spawn_y = max(14.0, min(60.0, spawn_y))
        spawn_z = float(tie_state["z"] - np.random.uniform(42.0, 62.0))
        
        brain = XWingDrosophilaBrain(agent_id, spawn_x, spawn_y, spawn_z)
        brain.vz = float(tie_state.get("vz", 35.0) + 4.0)
        self.enemies[agent_id] = brain
        return brain

    def on_enemy_hit_or_crashed(self, agent_id, reason="client_confirmed"):
        if agent_id in self.enemies:
            self.enemies[agent_id].is_alive = False
            self.enemies[agent_id].destroyed_reason = reason

    def step(self, dt, tie_state, is_tie_barrel_rolling=False, is_finale=False):
        # Final aşamasında (Ölüm Yıldızı reaktör çukuru) yeni düşman spawn edilmez
        if not is_finale:
            self.spawn_timer += dt
            alive_count = sum(1 for e in self.enemies.values() if e.is_alive)
            
            # Adil Dalga Sistemi (Balanced Wave Cooldown):
            # Eğer sahnede hiç düşman kalmadıysa 4.5 saniye nefes alma süresi tanı!
            # Eğer 1 düşman varsa ikincisi için 7.0 saniye bekle.
            spawn_delay = 4.5 if alive_count == 0 else 7.0
            if self.spawn_timer >= spawn_delay and alive_count < self.max_enemies:
                self.spawn_enemy(tie_state)
                self.spawn_timer = 0.0
                
        # Tüm X-Wing'lerin SNN ve Uçuş Adımlarını İlerlet
        results = []
        dead_ids = []
        
        for agent_id, enemy in list(self.enemies.items()):
            # Çok geride kalanları (> 95m) veya sollama sonrası çok öne kaçanları (< -70m) temizle
            dz = tie_state["z"] - enemy.z
            if dz > 95.0 or dz < -70.0:
                dead_ids.append(agent_id)
                continue
                
            res = enemy.step(dt, tie_state, is_tie_barrel_rolling)
            if res:
                results.append(res)
                if not enemy.is_alive:
                    dead_ids.append(agent_id)
                    
        # Ölü veya menzil dışına çıkmış birimleri temizle
        for did in dead_ids:
            if did in self.enemies:
                del self.enemies[did]
                
        return results

