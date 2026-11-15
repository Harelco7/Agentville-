# Agentville

A persistent 3D town of autonomous AI agents. You watch it from above as its "god": zoom into any house, follow any person, and see what they do and why.

The full plan (architecture, phases, LLM cost) lives in the project's plan document. This repository is built one phase at a time.

## Status: Phase 1, step 1 (3D look test)

This first step answers one question: **does the town look right?** It is a single street in the browser with:

- two houses built from real materials (brick, plaster, wood, glass, roof tiles) with furnished rooms
- grass, asphalt road, concrete sidewalks, hedges, trees and street lights
- sky lighting from an HDR image, a moving sun with soft shadows, ambient occlusion and bloom
- a day/night cycle: lights in the windows and street lamps come on after sunset
- the cutaway view: click a house to hide its roof and front walls and look inside
- two people: Maya walks along the sidewalk, Dana waits in front of her house

There is no simulation server yet. The next steps of Phase 1 add the server, the agents' needs and routines, conversations and the agent panel.

## Run it locally

Requirements: Node.js 20 or newer and pnpm 9 or newer (`npm install -g pnpm`).

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173.

Controls: drag to orbit, right-drag to pan, scroll to zoom, click a house to see inside. Use the slider or the Morning / Noon / Sunset / Night buttons to change the time, or Play to let the day run (one hour every 6 seconds).

## Repository layout

```
apps/client      3D god view (Vite, React, React Three Fiber, drei, postprocessing)
  src/scene      world: lighting, street, houses, people, materials
  src/ui         panels over the 3D view
  public/assets  textures, HDR sky and character model
```

`apps/sim` (the headless simulation server) and `packages/shared` (types shared by server and client) arrive in the next steps.

## Asset credits

All assets are free. Before the town grows, the textures and the character are replaced with CC0 versions where needed.

| Asset | Source | Licence |
| --- | --- | --- |
| `hdri/quarry_01_1k.hdr` | Poly Haven, via the three.js examples | CC0 |
| `textures/brick_*`, `textures/hardwood2_*`, `textures/grass.jpg`, `textures/roughness_map.jpg`, `textures/disturb.jpg` | three.js examples | as distributed with three.js (MIT repository) |
| `models/Xbot.glb` | Mixamo character, via the three.js examples | Mixamo terms; placeholder until final characters are chosen |

Roof tiles are drawn in code, so each house can have its own colour.
