"""F2 — Extraction: SAM segments the relevant element from the image."""

from celery_app import app


@app.task(name="tasks.segment.extract_element", bind=True)
def extract_element(self, *, project_id: str, run_id: str, supabase_url: str, supabase_service_key: str):
    """
    1. Fetch the original image
    2. Run SAM (Segment Anything Model) to extract the target element
    3. Remove background
    4. Evaluate quality — if unusable, trigger regeneration route (F2B)
    5. Store extracted image in Supabase storage
    6. Update pipeline_run status
    """
    # TODO: Implement SAM segmentation
    return {"project_id": project_id, "status": "completed"}
