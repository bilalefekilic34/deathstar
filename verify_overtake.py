#!/home/efe/fruit-fly/venv/bin/python
"""
deathstarv2/verify_overtake.py
Verifies TIE weapon restrictions, X-Wing dynamic overtaking (+z), lane blocking,
frontal ommatidia looming threats, and captures screenshots.
"""

import os
import sys
import time
import json
import asyncio
import subprocess
import urllib.request
import websockets
import base64

SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "test_screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

async def run_verification():
    brave_proc = subprocess.Popen([
        "/usr/bin/brave-browser",
        "--headless=new",
        "--remote-debugging-port=9222",
        "--no-sandbox",
        "--disable-gpu-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--window-size=1280,720",
        "about:blank"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        await asyncio.sleep(2.0)
        with urllib.request.urlopen("http://localhost:9222/json") as resp:
            tabs = json.loads(resp.read().decode())
        ws_url = tabs[0]["webSocketDebuggerUrl"]
        print(f"[CDP] Connected to Brave: {ws_url}")

        async with websockets.connect(ws_url) as ws:
            msg_id = 1
            pending_responses = {}
            console_errors = []
            console_logs = []

            async def router():
                try:
                    async for raw in ws:
                        ev = json.loads(raw)
                        if "id" in ev and ev["id"] in pending_responses:
                            pending_responses[ev["id"]].set_result(ev.get("result", {}))
                        method = ev.get("method")
                        if method == "Runtime.consoleAPICalled":
                            args = ev.get("params", {}).get("args", [])
                            text = " ".join([str(a.get("value", a.get("description", ""))) for a in args])
                            t_type = ev.get("params", {}).get("type", "log")
                            if t_type == "error":
                                console_errors.append(text)
                                print(f"[Browser ERROR] {text}")
                            else:
                                console_logs.append(text)
                                if any(k in text for k in ["X-Wing", "DOGFIGHT", "DEFENSE", "Looming", "TACTIC", "OVERTAKE", "LOCK"]):
                                    print(f"[Browser LOG] {text}")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"[Router Error] {e}")

            router_task = asyncio.create_task(router())

            async def send_cmd(method, params=None):
                nonlocal msg_id
                cid = msg_id
                msg_id += 1
                fut = asyncio.get_event_loop().create_future()
                pending_responses[cid] = fut
                cmd = {"id": cid, "method": method, "params": params or {}}
                await ws.send(json.dumps(cmd))
                res = await fut
                del pending_responses[cid]
                return res

            await send_cmd("Page.enable")
            await send_cmd("Runtime.enable")

            print("[CDP] Navigating to http://localhost:8001/?cam=1 ...")
            await send_cmd("Page.navigate", {"url": "http://localhost:8001/?cam=1"})

            # Wait for simulation to load
            await asyncio.sleep(5.0)

            # 1. Test Weapon Lock
            print("\n--- TEST 1: TIE Fighter Weapon Lock (Passive Prey Flight) ---")
            lock_test = await send_cmd("Runtime.evaluate", {
                "expression": """
                (() => {
                    const btn = document.getElementById('btn-laser');
                    btn.click();
                    const banner = document.getElementById('banner-weapons-locked');
                    return {
                        btnText: btn ? btn.innerText : '',
                        bannerVisible: banner ? banner.style.display : 'none',
                        bannerText: banner ? banner.innerText : ''
                    };
                })()
                """,
                "returnByValue": True
            })
            print(f"[TEST 1] Weapon lock result: {lock_test.get('result', {}).get('value')}")

            # 2. Monitor Dogfight and Overtaking for 12 seconds
            print("\n--- TEST 2: Dynamic Z-Axis Speeds & Overtaking (+z) ---")
            overtake_detected = False
            for step in range(12):
                await asyncio.sleep(1.0)
                state_res = await send_cmd("Runtime.evaluate", {
                    "expression": """
                    (() => {
                        if (!window.sim || !window.sim.latestData) return null;
                        const data = window.sim.latestData;
                        const shipZ = data.ship ? data.ship.z : 0;
                        const enemies = (data.enemies || []).map(e => ({
                            id: e.id,
                            z: e.z,
                            relZ: e.z - shipZ,
                            speed: e.speed,
                            tactic: e.tactic_state,
                            inFront: (e.z > shipZ)
                        }));
                        const ommatidia = data.ommatidia || {};
                        return {
                            shipSpeed: data.ship ? data.ship.speed : 0,
                            enemies: enemies,
                            ommatidia: ommatidia
                        };
                    })()
                    """,
                    "returnByValue": True
                })
                val = state_res.get("result", {}).get("value")
                if val:
                    enemies = val.get("enemies", [])
                    front_enemies = [e for e in enemies if e["inFront"]]
                    print(f"  Step {step+1}s: {len(enemies)} active X-Wings | Frontal (+z): {len(front_enemies)} | Speeds: {[round(e['speed'],1) for e in enemies]} | Tactics: {[e['tactic'] for e in enemies]}")
                    if len(front_enemies) > 0:
                        overtake_detected = True
                        print(f"  >>> OVERTAKE CONFIRMED! Enemy {front_enemies[0]['id']} is ahead by {front_enemies[0]['relZ']:.1f}m (speed {front_enemies[0]['speed']:.1f} m/s) | Ommatidia Looming: {val.get('ommatidia',{}).get('closest_looming')}")

            # Capture Chase Camera Screenshot
            shot1 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            p1 = os.path.join(SCREENSHOTS_DIR, "overtake_chase_cam.png")
            with open(p1, "wb") as f:
                f.write(base64.b64decode(shot1["data"]))
            print(f"[CDP] ✓ Screenshot 1 (Chase Cam) saved to {p1}")

            # 3. Switch to Pilot POV (Mode 3) looking forward through windscreen
            print("\n--- TEST 3: Pilot POV Windshield Looming View ---")
            await send_cmd("Runtime.evaluate", {
                "expression": "if (window.sim) window.sim.setCameraMode(3);"
            })
            await asyncio.sleep(2.0)

            shot2 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            p2 = os.path.join(SCREENSHOTS_DIR, "overtake_pilot_pov.png")
            with open(p2, "wb") as f:
                f.write(base64.b64decode(shot2["data"]))
            print(f"[CDP] ✓ Screenshot 2 (Pilot Windshield View) saved to {p2}")

            router_task.cancel()
            print(f"\n[CDP] Verification Finished! Overtake detected: {overtake_detected}. JS Errors: {len(console_errors)}")

    finally:
        brave_proc.terminate()
        brave_proc.wait()

if __name__ == "__main__":
    asyncio.run(run_verification())
