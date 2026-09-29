#!/home/efe/fruit-fly/venv/bin/python
"""
deathstarv2/verify_xwing.py
Verifies the multi-agent Dark X-Wing simulation via headless Brave browser and Chrome DevTools Protocol (CDP).
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

async def run_cdp():
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
        print(f"[CDP] Connected to Brave tab: {ws_url}")

        async with websockets.connect(ws_url) as ws:
            msg_id = 1
            pending_responses = {}
            console_errors = []
            console_logs = []

            async def router():
                try:
                    async for raw in ws:
                        ev = json.loads(raw)
                        # Request-response
                        if "id" in ev and ev["id"] in pending_responses:
                            pending_responses[ev["id"]].set_result(ev.get("result", {}))
                        # Event
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
                                if "X-Wing" in text or "GLTF" in text or "Preload" in text:
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

            # Enable Page, Runtime
            await send_cmd("Page.enable")
            await send_cmd("Runtime.enable")

            # Navigate to Death Star v2
            print("[CDP] Navigating to http://localhost:8001 ...")
            await send_cmd("Page.navigate", {"url": "http://localhost:8001/?cam=1"})

            # Wait for assets to preload and simulation to start running
            print("[CDP] Waiting 6s for simulation initialization and first enemy spawn...")
            await asyncio.sleep(6.0)

            # Check JS state
            res = await send_cmd("Runtime.evaluate", {
                "expression": "JSON.stringify({ enemies: (window.sim && window.sim.latestData) ? window.sim.latestData.enemies : [], shipZ: (window.sim && window.sim.latestData && window.sim.latestData.ship) ? window.sim.latestData.ship.z : 0, activeXWings: (window.sim && window.sim.darkXWingManager) ? window.sim.darkXWingManager.activeEnemies.size : 0 })"
            })
            state_str = res.get("result", {}).get("value", "{}")
            print(f"[CDP] Current Simulation State: {state_str}")

            # Screenshot 1
            shot1 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            p1 = os.path.join(SCREENSHOTS_DIR, "xwing_pursuit_1.png")
            with open(p1, "wb") as f:
                f.write(base64.b64decode(shot1["data"]))
            print(f"[CDP] ✓ Screenshot 1 saved to {p1}")

            # Wait another 5 seconds for X-Wings to pursue closely and dogfight
            print("[CDP] Waiting 5s for pursuit and PER laser fire...")
            await asyncio.sleep(5.0)

            res2 = await send_cmd("Runtime.evaluate", {
                "expression": "JSON.stringify({ enemies: window.sim.latestData.enemies, lasers: window.sim.lasers.length, activeXWings: window.sim.darkXWingManager.activeEnemies.size })"
            })
            print(f"[CDP] Dogfight State: {res2.get('result', {}).get('value')}")

            # Screenshot 2
            shot2 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            p2 = os.path.join(SCREENSHOTS_DIR, "xwing_pursuit_2.png")
            with open(p2, "wb") as f:
                f.write(base64.b64decode(shot2["data"]))
            print(f"[CDP] ✓ Screenshot 2 saved to {p2}")

            # Now set Camera to Cockpit / Rear View to capture the Dark X-Wings chasing right behind
            await send_cmd("Runtime.evaluate", {
                "expression": """
                if (window.sim && window.sim.camera) {
                    const ship = window.sim.latestData.ship;
                    // Move camera ahead of TIE Fighter looking backwards down the trench
                    window.sim.camera.position.set(ship.x, ship.y + 2.5, ship.z + 16.0);
                    window.sim.camera.lookAt(ship.x, ship.y + 1.0, ship.z - 45.0);
                }
                """
            })
            await asyncio.sleep(1.0)

            shot3 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            p3 = os.path.join(SCREENSHOTS_DIR, "xwing_rear_view.png")
            with open(p3, "wb") as f:
                f.write(base64.b64decode(shot3["data"]))
            print(f"[CDP] ✓ Screenshot 3 (Rear-Facing Camera) saved to {p3}")

            router_task.cancel()
            print(f"[CDP] Verification completed with {len(console_errors)} JS errors.")

    finally:
        brave_proc.terminate()
        brave_proc.wait()

if __name__ == "__main__":
    asyncio.run(run_cdp())
