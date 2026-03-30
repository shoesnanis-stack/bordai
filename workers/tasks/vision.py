"""F1 — Ingestion: LLM + Vision analyzes the uploaded image and generates a brief."""

from celery_app import app


@app.task(name="tasks.vision.analyze_image", bind=True)
def analyze_image(self, *, project_id: str, run_id: str, supabase_url: str, supabase_service_key: str):
    """
    1. Fetch the original image from Supabase storage
    2. Send to LLM with vision (Claude/GPT-4o) with a prompt that extracts:
       - Elements to keep (logo, text, figure)
       - Elements to discard (background, noise)
       - Elements to add (new text, colors)
       - Estimated thread color count
    3. Generate a plain-language brief
    4. Store brief in the briefs table
    5. Update pipeline_run status
    """
    # TODO: Implement vision analysis
    return {"project_id": project_id, "status": "completed", "brief_id": None}
