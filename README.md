# Death Star v2: Drosophila SNN Flight Control & Neural Trench Run

*Drosophila melanogaster* (meyve sineği) biyolojik görme sistemi ve beyin konektomunu (Janelia `male-cns:v1.0`) referans alan; 750 ommatidia bileşik göz mimarisi ve Spiking Neural Network (SNN) ile çalışan interaktif 3D Star Wars Death Star siper uçuş simülasyonu.

---

## 🌟 Özellikler

- **750 Ommatidia Bileşik Göz Modeli**: Sol ve sağ yarıkürelerde 375'er ommatidium ile 3D küresel bakış vektörleri ve retinotopik optik akış (optical flow) algılama.
- **Janelia male-cns:v1.0 Biyolojik SNN Devresi**: 
  - `LC10a` (Lobula Columnar - Küçük hedef takibi)
  - `DNp01` (İniş nöronları - Kanat çırpma ve uçuş yönlendirme kontrolü)
  - `PAM` (Ödül/Dopaminerjik nöronlar)
  - `Fdg_PER` (Hedef kilitlenme & torpido ateşleme geri bildirimi)
  - Leaky Integrate-and-Fire (LIF) membran dinamikleri ve sinaptik gecikmeler.
- **Three.js Web Tabanlı 3D Arayüz**: Death Star, TIE Fighter / Biyolojik avcı, siper mimarisi, egzoz portu, nöral hologram görselleştirmesi ve proton torpidoları.
- **Gerçek Zamanlı WebSocket İletişimi**: FastAPI ve WebSocket ile Python nöral motoru ile tarayıcı arasında çift yönlü telemetri akışı.

---

## 🚀 Kurulum

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/KULLANICI_ADI/deathstarv2.git
cd deathstarv2
```

### 2. Sanal Ortam Oluşturun ve Bağımlılıkları Yükleyin
```bash
python3 -m venv venv
source venv/bin/activate  # Windows için: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 🔑 Janelia Neuprint API Yapılandırması (Opsiyonel)

Sistem hem yerel Janelia konektom referans modeliyle hem de doğrudan Janelia Neuprint canlı API'siyle çalışabilir.

1. [Janelia Neuprint](https://neuprint.janelia.org/) üzerinden bir kimlik doğrulama belirteci (token) edinin.
2. `api.py` dosyasını açıp API anahtarınızı girin:
   ```python
   YOUR_API_KEY = "BURAYA_TOKENINIZI_YAZIN"
   ```
   *(Alternatif olarak `NEUPRINT_APPLICATION_CREDENTIALS` ortam değişkenini de tanımlayabilirsiniz).*

---

## 🎮 Çalıştırma

Sunucuyu başlatın:
```bash
python3 server.py
```

Ardından tarayıcınızda açın:
```
http://localhost:8000
```

---

## 📁 Proje Yapısı

```
deathstarv2/
├── server.py                 # FastAPI & WebSocket sunucusu
├── snn_ommatidia_engine.py   # 750 Ommatidia & Biyolojik SNN motoru
├── requirements.txt          # Python bağımlılıkları
├── zort.example.py           # API yapılandırma şablonu
├── models/                   # 3D GLB modelleri ve dokuları
│   ├── death_star.glb
│   ├── tie_fighter.glb
│   ├── exhaust_port.glb
│   └── trench_module.glb
└── web/                      # Three.js 3D istemci arayüzü
    ├── index.html
    ├── css/
    └── js/
```
