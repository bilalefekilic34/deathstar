"""
=============================================================================
Death Star v2: 3D GLTF / GLB Asset Generator
=============================================================================
"""

import os
import sys
import numpy as np
import trimesh

MODELS_DIR = os.path.dirname(os.path.abspath(__file__))
os.makedirs(MODELS_DIR, exist_ok=True)


def rotate_mesh(mesh, angle, axis):
    R = trimesh.transformations.rotation_matrix(angle, axis)
    mesh.apply_transform(R)
    return mesh


def create_trench_module():
    """Modüler Death Star Siper Segmenti (Uzunluk: 120m, Genişlik: 100m, Yükseklik: 110m)"""
    scene = trimesh.Scene()
    
    # 1. Taban Plakası (Floor - #8F8F8F)
    floor = trimesh.creation.box([116, 12, 120])
    floor.apply_translation([0, -6, 0])
    floor.visual.face_colors = [143, 143, 143, 255] # Zemin (#8F8F8F)
    scene.add_geometry(floor, node_name="floor_base")

    # Taban kılavuz rayları / ızgaraları
    for x in [-35, -15, 15, 35]:
        rail = trimesh.creation.box([2, 1, 120])
        rail.apply_translation([x, 0.5, 0])
        rail.visual.face_colors = [56, 189, 248, 220] # Pastel sky blue hat
        scene.add_geometry(rail, node_name=f"floor_rail_{x}")

    # 2. Sol ve Sağ Masif Duvarlar (Açık Uzay Grisi #a9b3bd)
    left_wall = trimesh.creation.box([16, 110, 120])
    left_wall.apply_translation([-58, 55, 0])
    left_wall.visual.face_colors = [169, 179, 189, 255] # Duvar (#a9b3bd)
    scene.add_geometry(left_wall, node_name="left_wall")

    right_wall = trimesh.creation.box([16, 110, 120])
    right_wall.apply_translation([58, 55, 0])
    right_wall.visual.face_colors = [169, 179, 189, 255] # Duvar (#a9b3bd)
    scene.add_geometry(right_wall, node_name="right_wall")

    # 3. Duvar Greeble Panelleri & Destek Kolonları
    for z in [-40, 0, 40]:
        # Sol ve sağ kolonlar
        p_l = trimesh.creation.box([5, 110, 8])
        p_l.apply_translation([-48, 55, z])
        p_l.visual.face_colors = [160, 170, 180, 255]
        scene.add_geometry(p_l, node_name=f"pillar_l_{z}")

        p_r = trimesh.creation.box([5, 110, 8])
        p_r.apply_translation([48, 55, z])
        p_r.visual.face_colors = [160, 170, 180, 255]
        scene.add_geometry(p_r, node_name=f"pillar_r_{z}")

        # Boru hatları (Conduits)
        pipe_l = trimesh.creation.cylinder(radius=1.2, height=120)
        rotate_mesh(pipe_l, np.pi / 2, [1, 0, 0])
        pipe_l.apply_translation([-49, 25, 0])
        pipe_l.visual.face_colors = [175, 185, 195, 255]
        scene.add_geometry(pipe_l, node_name=f"pipe_l_{z}")

    # 4. Üst Endüstriyel Kiriş (Overhead Gantry)
    gantry = trimesh.creation.box([100, 5, 8])
    gantry.apply_translation([0, 105, 0])
    gantry.visual.face_colors = [165, 175, 185, 255]
    scene.add_geometry(gantry, node_name="overhead_gantry")

    # 5. Savunma Tareti (Turret)
    t_base = trimesh.creation.cylinder(radius=6, height=14)
    t_base.apply_translation([-43, 7, 20])
    t_base.visual.face_colors = [155, 165, 175, 255]
    scene.add_geometry(t_base, node_name="turret_base")

    t_head = trimesh.creation.icosphere(subdivisions=2, radius=4.5)
    t_head.apply_translation([-43, 16, 20])
    t_head.visual.face_colors = [170, 180, 190, 255]
    scene.add_geometry(t_head, node_name="turret_head")

    out_path = os.path.join(MODELS_DIR, "trench_module.glb")
    glb_data = scene.export(file_type="glb")
    with open(out_path, "wb") as f:
        f.write(glb_data)
    print(f"✓ trench_module.glb oluşturuldu ({len(glb_data)} bayt)")


def create_tie_fighter():
    """Şeffaf Kokpitli ve Sinek Pilot Bölmeli TIE Fighter Modeli"""
    scene = trimesh.Scene()

    # 1. Kokpit Küresi (Dış Gövde - Ön ve Üst Cam Pencereleri Açık)
    cockpit = trimesh.creation.icosphere(subdivisions=4, radius=2.3)
    centers = cockpit.triangles_center
    # Ön cam ve üst cam alanlarını açık bırakarak iç mekanın ve sinek pilotun görünmesini sağla
    mask = ~((centers[:, 2] > 1.3) & (centers[:, 0]**2 + centers[:, 1]**2 < 2.0**2))
    mask &= ~((centers[:, 1] > 1.4) & (centers[:, 0]**2 + centers[:, 2]**2 < 1.7**2))
    cockpit.update_faces(mask)
    cockpit.visual.face_colors = [70, 85, 105, 255] # İmparatorluk açık gri metal
    scene.add_geometry(cockpit, node_name="cockpit_hull")

    # 2. Ön Şeffaf Cam Kubbe (Kokpit Camı - Three.js'te cam materyali uygulanacak)
    canopy = trimesh.creation.cylinder(radius=1.35, height=0.25)
    rotate_mesh(canopy, np.pi / 2, [1, 0, 0])
    canopy.apply_translation([0, 0, 2.15])
    canopy.visual.face_colors = [147, 197, 253, 110] # Şeffaf camgöbeği
    scene.add_geometry(canopy, node_name="cockpit_canopy_glass")

    # Üst Tavan Cam Kapağı (Sinek ve Nöral Hologramın Üstten Net Görülmesi İçin)
    top_glass = trimesh.creation.cylinder(radius=1.2, height=0.25)
    top_glass.apply_translation([0, 2.15, 0])
    top_glass.visual.face_colors = [147, 197, 253, 110]
    scene.add_geometry(top_glass, node_name="cockpit_top_glass")

    # 3. İkiz İyon Motoru Egzozları (Kırmızı Parlama)
    for x in [-0.65, 0.65]:
        eng = trimesh.creation.cylinder(radius=0.35, height=0.6)
        rotate_mesh(eng, np.pi / 2, [1, 0, 0])
        eng.apply_translation([x, 0, -2.15])
        eng.visual.face_colors = [255, 0, 60, 255] # Parlak neon kırmızı
        scene.add_geometry(eng, node_name=f"engine_{x}")

    # 4. Kanat Bağlantı Kolları (Wing Pylons)
    pylon = trimesh.creation.cylinder(radius=0.5, height=7.2)
    rotate_mesh(pylon, np.pi / 2, [0, 0, 1])
    pylon.visual.face_colors = [70, 85, 100, 255]
    scene.add_geometry(pylon, node_name="wing_pylon")

    # 5. Altıgen Güneş Paneli Kanatları (Solar Array Wings)
    w_pts = np.array([
        [0.0, 6.8],
        [4.2, 3.4],
        [4.2, -3.4],
        [0.0, -6.8],
        [-4.2, -3.4],
        [-4.2, 3.4]
    ])
    
    polygon = trimesh.path.polygons.Polygon(w_pts)
    wing_mesh = trimesh.creation.extrude_polygon(polygon, height=0.25)
    rotate_mesh(wing_mesh, np.pi / 2, [0, 1, 0])

    # Sol Kanat
    left_wing = wing_mesh.copy()
    left_wing.apply_translation([-3.7, 0, 0])
    left_wing.visual.face_colors = [15, 18, 24, 255] # Siyah fotovoltaik panel
    scene.add_geometry(left_wing, node_name="left_wing")

    # Sağ Kanat
    right_wing = wing_mesh.copy()
    right_wing.apply_translation([3.7, 0, 0])
    right_wing.visual.face_colors = [15, 18, 24, 255]
    scene.add_geometry(right_wing, node_name="right_wing")

    # 6. Kokpit İçi Pilot Kaidesi (3D Sineğin Oturacağı Biyo-Koltuk)
    seat = trimesh.creation.box([1.0, 0.4, 1.0])
    seat.apply_translation([0, -0.6, 0])
    seat.visual.face_colors = [40, 50, 65, 255]
    scene.add_geometry(seat, node_name="pilot_seat")

    out_path = os.path.join(MODELS_DIR, "tie_fighter.glb")
    glb_data = scene.export(file_type="glb")
    with open(out_path, "wb") as f:
        f.write(glb_data)
    print(f"✓ tie_fighter.glb oluşturuldu ({len(glb_data)} bayt)")


def create_exhaust_port():
    """Thermal Exhaust Port Modeli (Besin / Feromon Işıltılı Termal Egzoz Deliği)"""
    scene = trimesh.Scene()

    # 1. Dış Düşük Siper Kaidesi (Görüşü asla kapatmaz)
    base = trimesh.creation.box([40, 6, 16])
    base.apply_translation([0, -8.0, 0])
    base.visual.face_colors = [35, 45, 60, 255]
    scene.add_geometry(base, node_name="exhaust_base")

    # 2. Silindirik Egzoz Boğazı (2m Rayshieldli Termal Egzoz Bacası)
    duct = trimesh.creation.cylinder(radius=8.0, height=22)
    rotate_mesh(duct, np.pi / 2, [1, 0, 0])
    duct.visual.face_colors = [18, 22, 30, 255]
    scene.add_geometry(duct, node_name="exhaust_duct")

    # 3. Reaktör Çekirdeği (Sineği Çeken Parlayan Mor-Altın Feromon Çekirdeği)
    core = trimesh.creation.icosphere(subdivisions=2, radius=4.5)
    core.apply_translation([0, 0, -4.0])
    core.visual.face_colors = [255, 180, 0, 230] # Altın sarısı feromon ışıltısı
    scene.add_geometry(core, node_name="pheromone_reactor_core")

    # 4. Ray-Shield Halka Kalkanı
    ring = trimesh.creation.cylinder(radius=9.2, height=1.5)
    rotate_mesh(ring, np.pi / 2, [1, 0, 0])
    ring.apply_translation([0, 0, 8.5])
    ring.visual.face_colors = [180, 0, 255, 160] # Mor ray-shield ışıması
    scene.add_geometry(ring, node_name="ray_shield_ring")

    out_path = os.path.join(MODELS_DIR, "exhaust_port.glb")
    glb_data = scene.export(file_type="glb")
    with open(out_path, "wb") as f:
        f.write(glb_data)
    print(f"✓ exhaust_port.glb oluşturuldu ({len(glb_data)} bayt)")


def create_death_star():
    """
    Sketchfab Todesstern // death star 01 (4f587d65ac3b471193bed95c43dbcc5c) modelini
    birebir temsil eden 3D Ölüm Yıldızı İstasyonu.
    Özellikler:
    - Süper Lazer Çukuru (Concave dish with 8 focus channels & central emitter)
    - Ekvatoryal Siper Kuşağı (Equatorial trench)
    - Greeble Yüzey Zırh Panelleri (Protruding armor panels)
    - Stand Kaidesi (Pedestal mount)
    - Todesstern_01 Doku Haritası (UV mapping)
    """
    from PIL import Image

    R = 40.0
    n_lat = 96
    n_lon = 128

    lats = np.linspace(-np.pi/2, np.pi/2, n_lat)
    lons = np.linspace(-np.pi, np.pi, n_lon)

    dish_lat = np.radians(32.0)
    dish_lon = np.radians(38.0)
    dish_dir = np.array([
        np.cos(dish_lat) * np.cos(dish_lon),
        np.sin(dish_lat),
        np.cos(dish_lat) * np.sin(dish_lon)
    ])
    dish_dir = dish_dir / np.linalg.norm(dish_dir)
    dish_angular_radius = np.radians(24.0)
    dish_depth = 4.2

    vertices = []
    uvs = []

    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            nx = np.cos(lat) * np.cos(lon)
            ny = np.sin(lat)
            nz = np.cos(lat) * np.sin(lon)
            p_dir = np.array([nx, ny, nz])

            r = R

            # 1. Ekvatoryal Siper Girintisi
            if abs(lat) < np.radians(3.2):
                trench_factor = 1.0 - (1.0 - abs(lat) / np.radians(3.2)) * 0.05
                r *= trench_factor

            # 2. Süper Lazer Odak Çukuru & Kanalları
            cos_angle = np.dot(p_dir, dish_dir)
            angle = np.arccos(np.clip(cos_angle, -1.0, 1.0))
            if angle < dish_angular_radius:
                t = angle / dish_angular_radius
                depression = (1.0 - t**2) * dish_depth

                spoke_angle = np.arctan2(
                    np.dot(np.cross(dish_dir, [0, 1, 0]), p_dir),
                    np.dot(np.cross(dish_dir, np.cross(dish_dir, [0, 1, 0])), p_dir)
                )
                radial_rib = np.cos(8 * spoke_angle)

                if t < 0.12:
                    emitter_bump = (1.0 - t / 0.12) * 1.5
                    r = r - depression + emitter_bump
                else:
                    rib_bump = max(0.0, radial_rib) * 0.35 * (1.0 - t)
                    r = r - depression + rib_bump
            else:
                # 3. Yüzey Zırh Panelleri (Greebles)
                lat_deg = np.degrees(lat)
                lon_deg = np.degrees(lon)
                is_panel = False
                if (10 < abs(lat_deg) < 25) or (35 < abs(lat_deg) < 55) or (62 < abs(lat_deg) < 78):
                    lat_mod = abs(lat_deg) % 6.0
                    lon_mod = (lon_deg + 180.0) % 15.0
                    if 0.8 < lat_mod < 5.2 and 1.2 < lon_mod < 13.8:
                        is_panel = True
                if is_panel:
                    r += 0.45

            pos = p_dir * r
            vertices.append(pos)

            u = (lon + np.pi) / (2 * np.pi)
            v = (lat + np.pi/2) / np.pi
            uvs.append([u, v])

    vertices = np.array(vertices, dtype=np.float32)
    uvs = np.array(uvs, dtype=np.float32)

    faces = []
    for i in range(n_lat - 1):
        for j in range(n_lon - 1):
            idx0 = i * n_lon + j
            idx1 = i * n_lon + (j + 1)
            idx2 = (i + 1) * n_lon + j
            idx3 = (i + 1) * n_lon + (j + 1)

            # Dışa bakan yüz normalleri için saat yönünün tersi (CCW outward winding)
            faces.append([idx0, idx2, idx1])
            faces.append([idx1, idx2, idx3])

    faces = np.array(faces, dtype=np.int32)
    hull_mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    hull_mesh.fix_normals()

    # 4. Alt Kaide / Stand Halkası
    stand = trimesh.creation.torus(major_radius=14.0, minor_radius=2.8, major_sections=48, minor_sections=24)
    stand.apply_translation([0, -R * 0.92, 0])
    stand.visual.face_colors = [40, 36, 42, 255]

    tex_path = os.path.join(MODELS_DIR, "death_star_texture.jpg")
    scene = trimesh.Scene()

    if os.path.exists(tex_path):
        img = Image.open(tex_path).convert("RGB")
        material = trimesh.visual.material.PBRMaterial(
            name="DeathStarSkin",
            baseColorTexture=img,
            roughnessFactor=0.6,
            metallicFactor=0.3
        )
        hull_mesh.visual = trimesh.visual.TextureVisuals(uv=uvs, material=material)
    else:
        hull_mesh.visual.face_colors = [50, 115, 60, 255]

    scene.add_geometry(hull_mesh, node_name="todesstern_hull")
    scene.add_geometry(stand, node_name="todesstern_stand")

    out_path = os.path.join(MODELS_DIR, "death_star.glb")
    glb_data = scene.export(file_type="glb")
    with open(out_path, "wb") as f:
        f.write(glb_data)
    print(f"✓ death_star.glb oluşturuldu ({len(glb_data)} bayt)")


if __name__ == "__main__":
    print("=" * 70)
    print("DEATH STAR v2: 3D GLB VARLIK ÜRETİCİ BAŞLATILIYOR...")
    print("=" * 70)
    create_trench_module()
    create_tie_fighter()
    create_exhaust_port()
    create_death_star()
    print("=" * 70)
    print("TÜM GLB MODELLERİ BAŞARIYLA DERLENDİ!")
    print("=" * 70)
