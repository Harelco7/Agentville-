# Agentville

A persistent 3D town of autonomous AI agents. You watch it from above as its "god": look inside any building, follow any person, and see what they do and why.

The full plan (architecture, phases, LLM cost) lives in the project's plan document. This repository is built one phase at a time.

## Status: Phase 1 (MVP small town)

- **The street.** One street with 12 lots: 8 homes, the Corner Café, Maple Grocery, the Town Works Office and Linden Park. Built from a seed, so the same seed always gives the same town and the same people.
- **People.** 10 residents in 6 homes, with a personality, a job, a home, needs, memories, beliefs and relationships.
- **Daily routines.** Each person picks what to do next by scoring every sensible activity (utility AI): sleep, meals at home or at the café, work, meeting people, a walk in the park, shopping, freshening up. They walk there along the sidewalks and go inside.
- **The mind.** The big moments go through Claude:
  - each morning, a plan for the day, sometimes naming someone they want to see;
  - conversations of at most 20 lines, written as one call, so a chat can never loop;
  - nightly reflections that become lasting beliefs.
- **Reactions and gossip.** People nearby overhear conversations and remember them. If something notable happens (an argument, news), friends and outgoing people react out loud. Overheard news comes up in their later conversations, so gossip travels through the town.
- **Budget.** The weekly LLM budget is split into 7 equal daily caps. Every call is priced and logged. When today's cap is reached, conversations switch to built-in scripts until midnight UTC, so the town never stops.
- **Always running.** The server runs the town at 1x whether or not anyone is watching, saves it every minute, and restores it on restart.
- **God view.** The live 3D street follows the town clock (day and night). It has a town news feed, and a person panel with needs, today's plan, beliefs, relationships, memories and the conversation they are in. Click a building for the cutaway view.

**Time scale:** at 1x, one sim day lasts 22.5 real minutes and one sim year (28 days) lasts 10.5 hours, so an 80-year life takes about 5 real weeks. Aging, families and the economy arrive in later phases.

## Run it locally

Requirements: Node.js 22 or newer and pnpm 10 (`npm install -g pnpm`).

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. This starts the town server on port 8787 and the 3D client with live reload.

- **With no API key,** conversations, plans and reactions come from built-in scripts and cost nothing.
- **To use Claude,** copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. The header shows "Live · Claude" and how much of today's budget has been spent.
- **Without Postgres,** the town is saved to `apps/server/data/`. Delete that folder to start a new town.
- **To watch a day go by quickly,** set `TIME_SCALE=20` in `.env`.

If the 3D client can't reach a server (for example, the hosted preview), it runs the same simulation in the browser with scripted conversations and shows "Demo in your browser". Add `?demo` to the URL to force this mode.

### Production-like run with Postgres

```bash
docker compose up --build
```

Open http://localhost:8787. One container runs the simulation and serves the built 3D client; the town is saved in Postgres.

## Deploy to the cloud

The app is one Docker container plus a Postgres database. Any host that runs a Dockerfile and offers Postgres works. These are the steps on Railway (about $5 to $10 a month for a small server and database):

1. Create a project on [railway.com](https://railway.com) and choose **Deploy from GitHub repo** → `Agentville-`. Railway finds the `Dockerfile`.
2. Add a **PostgreSQL** database to the project.
3. In the app service's **Variables**, set:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `ANTHROPIC_API_KEY` = your key
   - `LLM_WEEKLY_BUDGET_USD` = your weekly budget (default 84)
4. Under **Networking**, generate a public domain. Port 8787 is picked up from the container.

Check `https://<your-domain>/health` for the town's clock, viewers, mind and budget.

## Settings

All settings are environment variables (or a `.env` file). See `.env.example`.

| Variable | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | not set | Turns on the Claude mind. Without it, scripted conversations. |
| `LLM_WEEKLY_BUDGET_USD` | `84` | Weekly LLM budget, split into 7 daily caps. |
| `LLM_ROUTINE_MODEL` | `claude-haiku-5-5` | Everyday conversations, morning plans and reactions. |
| `LLM_DEEP_MODEL` | `claude-sonnet-5-5` | Nightly reflections, and conversations between close friends or people who dislike each other. |
| `DATABASE_URL` | not set | Postgres. Without it, files in `DATA_DIR`. |
| `TIME_SCALE` | `1` | Town speed. 1 = real pace. |
| `WORLD_SEED` | `20261115` | The seed for a new town. |
| `PORT` | `8787` | HTTP and WebSocket port. |

**Expected cost at 1x with 10 people:** about $10 a real day (64 sim days pass in one real day), within the default $12 daily cap. Nightly reflections on the stronger model are the biggest part. Calls use low effort and structured output. The reflection model has a server-side fallback in case a request is declined.

## Tests

```bash
pnpm test        # simulation and LLM gateway tests
pnpm typecheck
```

## Repository layout

```
packages/core    the simulation: world generation, layout, clock, utility AI, conversations, protocol
                 (plain TypeScript; runs in Node and in the browser)
apps/server      runs the town: Claude mind, daily budget, Postgres or file saves, WebSocket feed,
                 serves the built client
apps/client      3D god view (Vite, React, React Three Fiber, drei, postprocessing)
  src/scene      lighting, street, buildings and interiors, people
  src/town       connection to the server, or the in-browser demo
  src/ui         header, town news, person panel
```

## Asset credits

All assets are free. Before the town grows, the textures and the character are replaced with CC0 versions where needed.

| Asset | Source | Licence |
| --- | --- | --- |
| `hdri/quarry_01_1k.hdr` | Poly Haven, via the three.js examples | CC0 |
| `textures/brick_*`, `textures/hardwood2_*`, `textures/grass.jpg`, `textures/roughness_map.jpg`, `textures/disturb.jpg` | three.js examples | as distributed with three.js (MIT repository) |
| `models/Xbot.glb` | Mixamo character, via the three.js examples | Mixamo terms; placeholder until final characters are chosen |

Roof tiles are drawn in code, so each house can have its own colour.
