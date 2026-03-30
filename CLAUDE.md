# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is BordAI

SaaS that converts customer images into machine-ready embroidery files (.PES, .DST, .JEF, etc.). A client uploads a photo or describes what they want, and the system runs a 7-phase AI pipeline: understand intent → extract/clean image → vectorize → digitize stitches → preview → export embroidery file.

## Commands

```bash
# Frontend (Next.js)
npm run dev              # http://localhost:3000
npm run build            # Production build
npm run lint             # ESLint
npm start                # Serve production build

# Python workers (Docker required)
npm run workers:up       # Start Redis + FastAPI + Celery
npm run workers:down     # Stop all worker containers
npm run workers:logs     # Tail celery_worker + fastapi logs
npm run workers:dev      # Also starts Flower at http://localhost:5555
```

**First-time setup:** copy `.env.local.example` → `.env.local`, fill Supabase + AI keys → `npm install` → `workers:up` → `dev`

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui |
| Auth + DB + Storage | Supabase (PostgreSQL, RLS, Storage buckets) |
| State | Zustand |
| AI Workers | Python 3.12, FastAPI, Celery + Redis |
| ML Models | SAM (segmentation), Real-ESRGAN (upscaling), Claude/GPT-4o (vision), SD/DALL-E (generation) |
| Embroidery | pyembroidery (stitch generation + format export), vtracer (vectorization) |

## Architecture

```
src/
├── app/
│   ├── (auth)/           # Login, register (public, no sidebar)
│   ├── (dashboard)/      # Authenticated pages with sidebar
│   │   ├── projects/     # Project list
│   │   └── project/[id]/ # Project detail + pipeline tracker
│   │       └── preview/  # Interactive embroidery preview (F4)
│   └── api/
│       ├── projects/     # CRUD
│       ├── pipeline/     # start/ and status/[id] — dispatches to Python workers
│       └── webhooks/     # Stripe
├── components/
│   ├── ui/               # shadcn components
│   ├── onboarding/       # F0: project type, surface, hoop, machine selectors
│   ├── pipeline/         # F1-F3: step indicators, brief editor
│   ├── preview/          # F4: embroidery simulation viewer
│   └── shared/           # Sidebar, navbar
├── lib/
│   ├── supabase/         # client.ts (browser), server.ts (SSR), middleware.ts
│   ├── constants.ts      # Hoop sizes, machine formats, thread palettes, stitch limits
│   └── utils.ts          # cn() helper
├── stores/               # Zustand: project-store, pipeline-store
├── types/                # All TypeScript types and enums
└── proxy.ts              # Supabase auth session refresh (Next.js 16 uses "proxy" not "middleware")

workers/                  # Python backend (separate Docker containers)
├── main.py               # FastAPI — receives pipeline dispatch from Next.js API
├── celery_app.py         # Celery config with Redis broker
├── tasks/                # One file per pipeline phase
│   ├── vision.py         # F1: LLM vision analysis → generates brief
│   ├── segment.py        # F2: SAM segmentation → extracts element
│   ├── upscale.py        # F2: Real-ESRGAN upscaling
│   ├── generate.py       # F2B: Image regeneration (SD/DALL-E)
│   ├── vectorize.py      # F3: Bitmap → SVG (vtracer)
│   ├── digitize.py       # F3/F5: SVG → stitch parameters
│   ├── validate.py       # F5: Pre-export validation
│   └── export.py         # F5: pyembroidery → .PES/.DST/.JEF
├── docker-compose.yml    # Redis + FastAPI + Celery + Flower
└── config.py             # Environment variable access

supabase/migrations/      # SQL schema with RLS policies
```

## Pipeline Phases

| Phase | Code | Description | Worker Task |
|-------|------|-------------|-------------|
| F0 | `onboarding` | Client selects project type, surface, hoop, machine | Frontend only |
| F1 | `ingestion` | LLM+Vision analyzes image, generates brief for approval | `tasks.vision` |
| F2 | `extraction` | SAM segments element, removes background, upscales if needed | `tasks.segment`, `tasks.upscale` |
| F2B | `extraction` | Regeneration route — generates clean image when original is unusable | `tasks.generate` |
| F3 | `preparation` | Vectorize (bitmap→SVG), segment regions, assign stitch types + thread colors | `tasks.vectorize` |
| F4 | `preview` | Interactive simulation: stitch direction, real thread colors, surface mockup | Frontend (uses vectorized data) |
| F5 | `generation` | Digitize (SVG→stitch params), validate, export to machine format | `tasks.digitize`, `tasks.validate`, `tasks.export` |
| F6 | `delivery` | Download embroidery file + PDF instructions, collect feedback | Frontend + DB |

## Data flow: Next.js → Workers

1. Frontend calls `POST /api/pipeline/start` with `{ project_id, phase }`
2. API route creates a `pipeline_runs` record and dispatches to `POST worker:8000/api/pipeline/process`
3. FastAPI routes the request to the correct Celery task
4. Celery task processes asynchronously, updates Supabase directly (using service role key)
5. Frontend polls `GET /api/pipeline/status/[run_id]` or listens via Supabase Realtime

## Database (Supabase)

Key tables: `profiles`, `projects`, `project_files`, `briefs`, `pipeline_runs`, `feedback`.

All tables have RLS enabled — user can only access their own data. Schema in `supabase/migrations/001_initial_schema.sql`.

Storage bucket `project-files` stores all uploaded and generated files, organized as `{user_id}/{project_id}/{phase}/{filename}`.

## Critical conventions

- **Next.js 16 + React 19**: Proxy file is `proxy.ts` with exported function `proxy` (not `middleware`). Route handler params are `Promise` (must `await params`). Use `useActionState` from `"react"` for server actions.
- **Tailwind CSS 4**: Uses `@import "tailwindcss"` in globals.css, not the old `@tailwind` directives.
- **Supabase auth**: Three client variants — `client.ts` (browser), `server.ts` (server components/actions), `middleware.ts` (edge). Always use the right one for the context.
- **All UI text in Spanish** — the target market is Latin America.
- **Worker tasks are idempotent** — a task can be retried safely. Each task reads from and writes to Supabase.
- **pyembroidery** is the core library for embroidery file generation. It handles all machine formats.
- **Embroidery validation limits**: max jump 12mm, density 3-7 stitches/mm, max 20 color changes. See `src/lib/constants.ts` for all limits.

## Embroidery domain knowledge

- **Stitch types**: Tatami (large fills), Satin (letters/details/borders), Running (outlines), Triple (reinforced outlines)
- **Underlay**: Required beneath all stitch regions to prevent fabric puckering
- **Pull compensation**: Stitches pull fabric inward — compensate by slightly oversizing the design
- **Thread palettes**: Madeira, Robison-Anton, Isacord, Gutermann — system maps design colors to real thread codes
- **Machine formats**: Brother=PES, Tajima=DST, Janome=JEF, Pfaff=VIP, Husqvarna=HUS, Generic=EXP
- **Hoop constraint is absolute** — the design must fit within the selected hoop dimensions or it cannot be stitched
