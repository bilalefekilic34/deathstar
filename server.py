#!/home/efe/fruit-fly/venv/bin/python
"""
deathstarv2/server.py

FastAPI + WebSocket 60 Hz Neuro-Motor Simulation Server.
Project Pigeon / Death Star v2: TIE Fighter Sinek Beyni Uçuş Simülasyonu.
"""

import os
import sys
import json
import math
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

# Workspace dizinini ekle
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

try:
    from deathstarv2.snn_ommatidia_engine import DrosophilaSNNBrain
except ImportError:
    from snn_ommatidia_engine import DrosophilaSNNBrain


app = FastAPI(title="Death Star v2: Drosophila SNN Flight Control")

# Statik Dosyalar
WEB_DIR = os.path.join(CURRENT_DIR, "web")
MODELS_DIR = os.path.join(CURRENT_DIR, "models")

app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
app.mount("/models", StaticFiles(directory=MODELS_DIR), name="models")

# Sinek Beyni & Simülasyon Durumu
brain = DrosophilaSNNBrain()

# TIE Fighter Kinematik Durumu
ship_state = {
    "x": 0.0,
    "y": 32.0,
    "z": 0.0,
    "vx": 0.0,
    "vy": 0.0,
    "vz": 35.0,
    "roll": 0.0,
    "pitch": 0.0,
    "yaw": 0.0,
}

# Ön yüzden gelen algısal veriler
client_visual_input = {
    "lasers": [],
    "exhaust_target": None
}


@app.get("/")
async def get_index():
    index_file = os.path.join(WEB_DIR, "index.html")
    return FileResponse(index_file)


@app.get("/api/connectome")
async def get_connectome():
    """Janelia Neuprint canlı/kalibre konektom ağını döner."""
    return JSONResponse(brain.connectome)


@app.post("/api/dopamine")
async def inject_dopamine_endpoint(amount: float = 40.0):
    """Mushroom Body PAM nöronlarına dopamin patlaması verir."""
    brain.inject_dopamine(amount)
    return {"status": "ok", "dopamine_mv": brain.dopamine_level}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WebSocket] ✓ Three.js İstemcisi Bağlandı!")
    
    # Her istemci bağlantısı için bağımsız TIE Fighter ve görsel girdi durumu
    ship_state = {
        "x": 0.0,
        "y": 32.0,
        "z": 0.0,
        "vx": 0.0,
        "vy": 0.0,
        "vz": 35.0,
        "roll": 0.0,
        "pitch": 0.0,
        "yaw": 0.0,
    }
    client_visual_input = {
        "lasers": [],
        "exhaust_target": None
    }
    brain.reset_proboscis()
    
    dt = 1.0 / 60.0  # 60 Hz
    last_time = asyncio.get_event_loop().time()
    
    # Arka plan mesaj dinleme görevi
    async def receive_client_data():
        try:
            while True:
                msg_text = await websocket.receive_text()
                data = json.loads(msg_text)
                msg_type = data.get("type", "")
                
                if msg_type == "visual_feedback":
                    client_visual_input["lasers"] = data.get("lasers", [])
                    client_visual_input["exhaust_target"] = data.get("exhaust_target", None)
                    
                elif msg_type == "dodge_success":
                    brain.on_dodge_success()
                    
                elif msg_type == "laser_hit":
                    brain.on_laser_hit()

                elif msg_type == "exhaust_entered":
                    # Egzoz çukuruna ulaşıldı! +40 mV Dopamin & +100 Plastisite
                    brain.on_exhaust_reached()
                    print("[WebSocket] 🎯 HEDEF VURULDU: Egzoz Çukuruna Girildi! +40 mV Dopamin Patlaması!")

                elif msg_type == "torpedo_hit":
                    hp = int(data.get("hp", 0))
                    brain.on_torpedo_hit(hp)

                elif msg_type == "torpedo_miss":
                    brain.on_torpedo_miss()

                elif msg_type == "death_star_destroyed":
                    # Proton Torpidoları Egzoz Deliğini Vurdu: Devasa Ölüm Yıldızı Patlaması!
                    brain.on_death_star_destroyed()
                    print("[WebSocket] 💥 SÜPERNOVA: Proton Torpidoları Egzoz Deliğini Vurdu! Ölüm Yıldızı Patlatıldı! +100 mV Dopamin!")

                elif msg_type == "reset_proboscis":
                    brain.reset_proboscis()
                    
                elif msg_type == "inject_dopamine":
                    amount = float(data.get("amount", 40.0))
                    brain.inject_dopamine(amount)
                    
        except WebSocketDisconnect:
            print("[WebSocket] İstemci bağlantısı koptu.")
            client_visual_input["lasers"] = []
            client_visual_input["exhaust_target"] = None
        except Exception as e:
            print(f"[WebSocket Dinleme Hatası] {e}")
            client_visual_input["lasers"] = []

    rx_task = asyncio.create_task(receive_client_data())
    
    try:
        while True:
            t_now = asyncio.get_event_loop().time()
            elapsed = t_now - last_time
            last_time = t_now
            step_dt = min(elapsed, 0.05) if elapsed > 0 else dt

            # 1. 750 Ommatidia Görsel Girdi İşleme
            visual_res = brain.eye.process_visual_stimuli(
                lasers=client_visual_input["lasers"],
                exhaust_target=client_visual_input["exhaust_target"]
            )
            
            # 2. SNN & Motor Tork Hesabı
            motor_out = brain.step(step_dt, visual_res)
            
            # 3. TIE Fighter Kinematik Entegrasyonu (Siper İçinde Sınırlar)
            # Roll, Pitch, Yaw
            ship_state["roll"] += motor_out["roll_torque"] * step_dt
            if motor_out["is_barrel_rolling"]:
                ship_state["roll"] += math.radians(motor_out["barrel_roll_delta"])
            else:
                # Roll kendi kendini doğrultma (righting reflex)
                ship_state["roll"] *= math.exp(-step_dt * 3.0)
                
            ship_state["yaw"] += motor_out["yaw_torque"] * step_dt
            ship_state["yaw"] *= math.exp(-step_dt * 2.0)
            
            ship_state["pitch"] += motor_out["pitch_torque"] * step_dt
            ship_state["pitch"] *= math.exp(-step_dt * 3.0)

            # Konum güncelleme (Siper koordinatları: X=[-22, 22], Y=[-12, 18])
            # Yaw ve Roll ile yatay kayma
            ship_state["vx"] = ship_state["roll"] * 18.0 + ship_state["yaw"] * 12.0
            ship_state["x"] += ship_state["vx"] * step_dt
            # Siper duvar sınırlamaları (Duvarlar X=[-48, 48], Taban Y=0, Tavan Y=105)
            ship_state["x"] = max(-34.0, min(34.0, ship_state["x"]))

            # Pitch ile dikey hareket
            ship_state["vy"] = ship_state["pitch"] * 14.0
            ship_state["y"] += ship_state["vy"] * step_dt
            ship_state["y"] = max(8.0, min(75.0, ship_state["y"]))
            
            ship_state["vz"] = motor_out["forward_speed"]
            ship_state["z"] += ship_state["vz"] * step_dt
            # Sinek ileri hızını ve momentumunu kesintisiz korur (İzafi hız Three.js'de senkronize edilir)
            if rx_task.done():
                break

            # 4. 60Hz Telemetri Paketi
            payload = {
                "ship": {
                    "x": float(ship_state["x"]),
                    "y": float(ship_state["y"]),
                    "z": float(ship_state["z"]),
                    "roll": float(ship_state["roll"]),
                    "pitch": float(ship_state["pitch"]),
                    "yaw": float(ship_state["yaw"]),
                    "speed": float(ship_state["vz"])
                },
                "fly": {
                    "wing_l": float(motor_out["wing_angle_l"]),
                    "wing_r": float(motor_out["wing_angle_r"]),
                    "phi_l": float(motor_out["phi_l"]),
                    "phi_r": float(motor_out["phi_r"]),
                    "delta_phi": float(motor_out["delta_phi"]),
                    "freq": 200.0
                },
                "neural": {
                    "spikes": motor_out["spikes"],
                    "potentials": motor_out["neuron_potentials"],
                    "dopamine_mv": float(motor_out["dopamine_mv"]),
                    "is_barrel_rolling": bool(motor_out["is_barrel_rolling"]),
                    "proboscis_trigger": bool(motor_out.get("proboscis_trigger", False)),
                    "v_proboscis": float(motor_out["neuron_potentials"].get("v_proboscis", -70.0))
                },
                "ommatidia": {
                    "active_count": visual_res["active_ommatidia_count"],
                    "closest_dist": visual_res["closest_laser_dist"],
                    "closest_looming": visual_res["closest_looming"],
                    "target_detected": visual_res["target_detected"]
                },
                "learning": motor_out.get("learning", {}),
                "boss_targeting": motor_out.get("boss_targeting", {})
            }
            
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(dt)
            
    except WebSocketDisconnect:
        print("[WebSocket] İstemci ayrıldı.")
    except Exception as e:
        print(f"[WebSocket Döngü Hatası] {e}")
    finally:
        rx_task.cancel()


if __name__ == "__main__":
    print("======================================================================")
    print("DEATH STAR v2: DROSOPHILA SNN FLIGHT CONTROL SERVER (PORT 8001)")
    print("======================================================================")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
