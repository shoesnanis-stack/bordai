from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from celery_app import app as celery_app

api = FastAPI(title="BordAI Workers", version="0.1.0")

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PipelineRequest(BaseModel):
    project_id: str
    phase: str
    run_id: str
    supabase_url: str
    supabase_service_key: str


# Maps pipeline phases to their Celery task names
PHASE_TASKS = {
    "ingestion": "tasks.vision.analyze_image",
    "extraction": "tasks.segment.extract_element",
    "preparation": "tasks.vectorize.bitmap_to_svg",
    "generation": "tasks.export.generate_embroidery_file",
}


@api.post("/api/pipeline/process")
async def process_pipeline(req: PipelineRequest):
    task_name = PHASE_TASKS.get(req.phase)
    if not task_name:
        raise HTTPException(status_code=400, detail=f"Unknown phase: {req.phase}")

    task = celery_app.send_task(
        task_name,
        kwargs={
            "project_id": req.project_id,
            "run_id": req.run_id,
            "supabase_url": req.supabase_url,
            "supabase_service_key": req.supabase_service_key,
        },
    )

    return {"task_id": task.id, "status": "queued"}


@api.get("/api/pipeline/task/{task_id}")
async def get_task_status(task_id: str):
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }


@api.get("/health")
async def health():
    return {"status": "ok"}
