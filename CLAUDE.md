# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is BordAI

SaaS that converts customer images into machine-ready embroidery files (.PES, .DST, .JEF, etc.). A client uploads a photo or describes what they want, and the system runs a 7-phase AI pipeline: understand intent → extract/clean image → vectorize → digitize stitches → preview → export embroidery file.

## Commands

```bash
# Frontend (Next.js)
npm run dev              # http://localhost:3000
npm run build
npm run lint

# Python workers (Docker required)
npm run workers:up       # Redis + FastAPI + Celery
npm run workers:down
npm run workers:logs
npm run workers:dev      # Also starts Flower at http://localhost:5555
```

**First-time setup:** copy `.env.local.example` → `.env.local`, fill all keys → `npm install` → run SQL from `supabase/migrations/001_initial_schema.sql` in Supabase SQL Editor → `npm run dev`

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Auth + DB + Storage | Supabase (PostgreSQL + RLS + Storage buckets) |
| AI | OpenAI GPT-4o Vision (analysis, stitch assignment) |
| Workers | Python 3.12, FastAPI, Celery + Redis |
| Embroidery | pyembroidery (stitch generation + format export) |

## Architecture

```
src/
├── app/
│   ├── (auth)/               # Login, register (no sidebar)
│   ├── (dashboard)/          # Authenticated pages
│   │   ├── projects/         # Project list
│   │   └── project/[id]/     # Project detail + pipeline tracker
│   │       └── preview/      # Embroidery preview + approval (F4)
│   └── api/
│       └── pipeline/
│           ├── analyze/      # POST — GPT-4o vision analysis (F1)
│           ├── prepare/      # POST — stitch type assignment (F3)
│           ├── generate/     # POST — package embroidery params (F5)
│           └── download/     # GET  — signed URL for file download
├── components/
│   ├── onboarding/           # F0: project type, surface, hoop, machine
│   ├── pipeline/
│   │   └── pipeline-tracker.tsx  # All phase components live here
│   └── preview/
│       └── preview-viewer.tsx    # F4: image + stitch params display
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser client
│   │   ├── server.ts         # Server client with cookies
│   │   ├── admin.ts          # Service role client — bypasses RLS, server only
│   │   └── middleware.ts     # Auth session refresh helper
│   ├── constants.ts          # HOOP_SIZES, SURFACE_OPTIONS, MACHINE_FORMATS, PIPELINE_PHASES
│   └── utils.ts              # cn() helper
├── stores/
│   ├── project-store.ts
│   └── pipeline-store.ts
├── types/index.ts
└── proxy.ts                  # Auth session refresh (Next.js 16: "proxy" not "middleware")

workers/                      # Python backend (Docker)
├── main.py                   # FastAPI app
├── celery_app.py
├── tasks/
│   ├── vision.py             # F1: LLM vision analysis
│   ├── segment.py            # F2: SAM segmentation
│   ├── upscale.py            # F2: Real-ESRGAN upscaling
│   ├── generate.py           # F2B: Image generation (SD/DALL-E)
│   ├── vectorize.py          # F3: Bitmap → SVG (vtracer)
│   ├── digitize.py           # F3/F5: SVG → stitch parameters
│   ├── validate.py           # F5: Pre-export validation
│   └── export.py             # F5: pyembroidery → .PES/.DST/.JEF
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── config.py

supabase/migrations/001_initial_schema.sql   # Full DB schema + RLS policies
```

## Pipeline Phases

| Phase | Code | Where | Description |
|-------|------|-------|-------------|
| F0 | `onboarding` | Frontend | Client selects type, surface, hoop, machine → creates project |
| F1 | `ingestion` | `api/pipeline/analyze` + GPT-4o | Analyzes image, generates brief for approval |
| F2 | `extraction` | Frontend (skip if clean bg) / workers | SAM segmentation + upscaling |
| F3 | `preparation` | `api/pipeline/prepare` + GPT-4o | Assigns stitch types + thread colors per region |
| F4 | `preview` | `/project/[id]/preview` | Client reviews image + stitch params, approves |
| F5 | `generation` | `api/pipeline/generate` | Packages params JSON, saves to storage |
| F6 | `delivery` | Frontend | Download file |

## Supabase

**Storage bucket:** `project-files` (private). Files stored as `{user_id}/{project_id}/{phase}/{filename}`.

**Required RLS policies** (run in SQL Editor if hitting RLS errors):
```sql
create policy "Users can insert own project files" on public.project_files
  for insert with check (exists (select 1 from public.projects where id = project_id and user_id = auth.uid()));
create policy "Users can insert own briefs" on public.briefs
  for insert with check (exists (select 1 from public.projects where id = project_id and user_id = auth.uid()));
create policy "Users can update own briefs" on public.briefs
  for update using (exists (select 1 from public.projects where id = project_id and user_id = auth.uid()));
create policy "Users can update own projects" on public.projects
  for update using (auth.uid() = user_id);
```

To inspect all existing policies: `select tablename, policyname, cmd from pg_policies where schemaname in ('public', 'storage') order by tablename;`

## Critical conventions

- **Next.js 16 + React 19**: Proxy file is `proxy.ts` with exported function `proxy`. Route handler params are `Promise` (must `await params`).
- **Tailwind CSS 4**: `@import "tailwindcss"` in globals.css — not the old `@tailwind` directives.
- **Supabase clients**: Use `client.ts` in Client Components, `server.ts` in Server Components/API routes, `admin.ts` (service role) for write operations in API routes to bypass RLS.
- **Images from Supabase Storage**: Requires `remotePatterns` in `next.config.ts` for `*.supabase.co`.
- **All UI text in Spanish** — target market is Latin America.
- **Pipeline phase transitions**: Always update `projects.current_phase` via `admin.ts` client in API routes.

## What works today (end-to-end)

- Full F0–F6 pipeline
- GPT-4o Vision for image analysis (F1) and stitch assignment (F3)
- Image upload to Supabase Storage
- Brief generation + client approval flow
- Preview with image, stitch regions table, thread color order
- Params JSON download (F6)

## What needs Python workers next

- Real `.DST`/`.PES` binary file generation → `workers/tasks/export.py` (pyembroidery)
- SAM segmentation for images with busy backgrounds → `workers/tasks/segment.py`
- Real-ESRGAN upscaling for low-quality images → `workers/tasks/upscale.py`
- vtracer vectorization (bitmap → SVG) → `workers/tasks/vectorize.py`

## Embroidery domain knowledge

- **Stitch types**: Tatami (large fills >10mm), Satin (text/borders/details), Running (outlines), Triple (reinforced outlines)
- **Underlay**: Required beneath all regions except running stitch — prevents fabric puckering
- **Density**: 4–6 stitches/mm. Max jump 12mm. Max 20 color changes.
- **Machine formats**: Brother → PES, Tajima/Barudan → DST, Janome → JEF, Pfaff → VIP, Husqvarna → HUS
- **Hoop constraint is absolute** — design must fit within selected hoop or it cannot be stitched
