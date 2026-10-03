"""
Death Star v2: 3D Stormtrooper Helmet GLB Generator
Creates a high-fidelity Star Wars Stormtrooper helmet 3D model for TIE Fighter pilot integration.
"""

import os
import numpy as np
import trimesh

MODELS_DIR = os.path.dirname(os.path.abspath(__file__))

def create_stormtrooper_helmet():
    scene = trimesh.Scene()
    
    WHITE = [255, 255, 255, 255]
    BLACK = [18, 18, 20, 255]
    DARK_LENS = [10, 15, 18, 255]
    GUNMETAL = [55, 60, 68, 255]
    SILVER = [210, 215, 225, 255]
    BLUE_TUBE = [38, 92, 168, 255]

    # 1. Ana Kask Kubbesi (Cranial Dome) - Şekillendirilmiş pürüzsüz beyaz kask üstü
    dome = trimesh.creation.icosphere(subdivisions=4, radius=0.68)
    dome.apply_scale([1.0, 1.08, 1.05])
    dome.apply_translation([0, 0.32, -0.04])
    dome.visual.face_colors = WHITE
    scene.add_geometry(dome, node_name="helmet_dome")

    # 2. İkonik Siyah Alın Kauçuk Şeridi (Black Brow Band)
    rot_x_brow = trimesh.transformations.rotation_matrix(-0.08, [1, 0, 0])
    brow = trimesh.creation.box([1.02, 0.08, 0.35])
    brow.apply_transform(rot_x_brow)
    brow.apply_translation([0, 0.42, 0.46])
    brow.visual.face_colors = BLACK
    scene.add_geometry(brow, node_name="brow_band")

    # 3. İkonik Açılı Koyu Vizör Gözleri (Angled Stormtrooper Lenses)
    for sign, x_pos in [(-1, -0.25), (1, 0.25)]:
        lens = trimesh.creation.box([0.32, 0.16, 0.15])
        # Gözlerin karakteristik Star Wars açısı: dışarı ve aşağı meyilli
        R_z = trimesh.transformations.rotation_matrix(-sign * 0.22, [0, 0, 1])
        R_y = trimesh.transformations.rotation_matrix(-sign * 0.24, [0, 1, 0])
        R_x = trimesh.transformations.rotation_matrix(-0.14, [1, 0, 0])
        lens.apply_transform(R_z)
        lens.apply_transform(R_y)
        lens.apply_transform(R_x)
        lens.apply_translation([x_pos, 0.28, 0.54])
        lens.visual.face_colors = DARK_LENS
        scene.add_geometry(lens, node_name=f"visor_lens_{'left' if sign < 0 else 'right'}")

    # Gözler arası beyaz burun köprüsü
    bridge = trimesh.creation.box([0.16, 0.18, 0.18])
    bridge.apply_translation([0, 0.30, 0.56])
    bridge.visual.face_colors = WHITE
    scene.add_geometry(bridge, node_name="nose_bridge")

    # 4. Yanak Tüpleri & Çene Hatları (Cheek Tubes & Slanted Flanges)
    for sign, x_pos in [(-1, -0.36), (1, 0.36)]:
        cheek = trimesh.creation.cylinder(radius=0.18, height=0.55)
        # Yanak tüpünü çeneye doğru eğ
        R_z = trimesh.transformations.rotation_matrix(sign * 0.38, [0, 0, 1])
        R_x = trimesh.transformations.rotation_matrix(-0.32, [1, 0, 0])
        cheek.apply_transform(R_z)
        cheek.apply_transform(R_x)
        cheek.apply_translation([x_pos, 0.02, 0.38])
        cheek.visual.face_colors = WHITE
        scene.add_geometry(cheek, node_name=f"cheek_tube_{'left' if sign < 0 else 'right'}")

        # Yanak üstü mavi/siyah havalandırma çizgisi detayı
        vent_stripe = trimesh.creation.box([0.04, 0.28, 0.08])
        vent_stripe.apply_transform(R_z)
        vent_stripe.apply_transform(R_x)
        vent_stripe.apply_translation([x_pos * 1.08, 0.02, 0.44])
        vent_stripe.visual.face_colors = BLUE_TUBE
        scene.add_geometry(vent_stripe, node_name=f"cheek_stripe_{'left' if sign < 0 else 'right'}")

    # 5. Ağız Izgarası / Vokoder (Vocoder / Frown Grille)
    vocoder_base = trimesh.creation.box([0.36, 0.22, 0.18])
    rot_x_voc = trimesh.transformations.rotation_matrix(-0.24, [1, 0, 0])
    vocoder_base.apply_transform(rot_x_voc)
    vocoder_base.apply_translation([0, 0.05, 0.55])
    vocoder_base.visual.face_colors = BLACK
    scene.add_geometry(vocoder_base, node_name="vocoder_grille")

    # Vokoder dikey siyah dişleri / ızgara çıtaları
    for x_rib in [-0.12, -0.06, 0.0, 0.06, 0.12]:
        rib = trimesh.creation.box([0.024, 0.18, 0.22])
        rib.apply_transform(rot_x_voc)
        rib.apply_translation([x_rib, 0.05, 0.56])
        rib.visual.face_colors = GUNMETAL
        scene.add_geometry(rib, node_name=f"vocoder_rib_{x_rib}")

    # 6. Alt Çene Tabanı (Chin Box)
    chin = trimesh.creation.box([0.48, 0.18, 0.32])
    chin.apply_translation([0, -0.14, 0.42])
    chin.visual.face_colors = WHITE
    scene.add_geometry(chin, node_name="chin_box")

    # 7. Çene Yanı Mikrofon / Aeratör Filtreleri (Chin Aerators / Mic Cylinders)
    for sign, x_pos in [(-1, -0.22), (1, 0.22)]:
        rot_x_aero = trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0])
        aero = trimesh.creation.cylinder(radius=0.082, height=0.18)
        aero.apply_transform(rot_x_aero)
        aero.apply_translation([x_pos, -0.16, 0.58])
        aero.visual.face_colors = GUNMETAL
        scene.add_geometry(aero, node_name=f"chin_aerator_{'left' if sign < 0 else 'right'}")

        # Aerator ön gümüş metalik filtre başlığı
        aero_rim = trimesh.creation.cylinder(radius=0.075, height=0.04)
        aero_rim.apply_transform(rot_x_aero)
        aero_rim.apply_translation([x_pos, -0.16, 0.67])
        aero_rim.visual.face_colors = SILVER
        scene.add_geometry(aero_rim, node_name=f"chin_aerator_cap_{'left' if sign < 0 else 'right'}")

    # 8. Yan Kulak Silindirleri (Ear Caps)
    for sign, x_pos in [(-1, -0.66), (1, 0.66)]:
        rot_y_ear = trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0])
        ear = trimesh.creation.cylinder(radius=0.19, height=0.16)
        ear.apply_transform(rot_y_ear)
        ear.apply_translation([x_pos, 0.18, -0.02])
        ear.visual.face_colors = WHITE
        scene.add_geometry(ear, node_name=f"ear_cap_{'left' if sign < 0 else 'right'}")

        # Kulak üstü rütbe siyah şeritleri
        for y_bar in [-0.06, 0.0, 0.06]:
            bar = trimesh.creation.box([0.18, 0.025, 0.16])
            bar.apply_translation([x_pos * 1.05, 0.18 + y_bar, -0.02])
            bar.visual.face_colors = BLACK
            scene.add_geometry(bar, node_name=f"ear_bar_{sign}_{y_bar}")

    # 9. Arka Baş & Boyun Çemberi (Neck Collar / Base Rim)
    rot_x_collar = trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0])
    collar = trimesh.creation.annulus(r_min=0.48, r_max=0.64, height=0.18)
    collar.apply_transform(rot_x_collar)
    collar.apply_translation([0, -0.28, -0.06])
    collar.visual.face_colors = WHITE
    scene.add_geometry(collar, node_name="neck_collar")

    # Kaskın arkasındaki yatay siyah trap detayı
    back_trap = trimesh.creation.box([0.55, 0.12, 0.15])
    back_trap.apply_translation([0, 0.15, -0.66])
    back_trap.visual.face_colors = BLACK
    scene.add_geometry(back_trap, node_name="back_detail")

    # Modeli /models/stormtrooper_helmet.glb olarak dışa aktar
    out_path = os.path.join(MODELS_DIR, "stormtrooper_helmet.glb")
    scene.export(out_path, file_type="glb")
    print(f"[Generator] ✓ Stormtrooper Kaskı GLB başarıyla üretildi: {out_path} ({os.path.getsize(out_path):,} bayt)")

if __name__ == "__main__":
    create_stormtrooper_helmet()
