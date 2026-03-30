"""F2 — Extraction: Real-ESRGAN upscaling for low-quality images."""

from celery_app import app


@app.task(name="tasks.upscale.enhance_image", bind=True)
def enhance_image(self, *, project_id: str, run_id: str, supabase_url: str, supabase_service_key: str):
    """
    1. Fetch the extracted/original image
    2. Run Real-ESRGAN for 4x upscaling
    3. Store enhanced image in Supabase storage
    4. Update pipeline_run status
    """
    # TODO: Implement Real-ESRGAN upscaling
    return {"project_id": project_id, "status": "completed"}
