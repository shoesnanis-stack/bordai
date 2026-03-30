"""F3 — Preparation: Convert bitmap to SVG and segment into embroidery regions."""

from celery_app import app


@app.task(name="tasks.vectorize.bitmap_to_svg", bind=True)
def bitmap_to_svg(self, *, project_id: str, run_id: str, supabase_url: str, supabase_service_key: str):
    """
    1. Fetch the cleaned/approved image
    2. Vectorize with vtracer (or Potrace fallback)
    3. Evaluate complexity:
       - Too many nodes → simplify
       - Gradients → convert to flat zones
       - Lines too thin → warn
       - Details < 1mm → remove
    4. Segment regions by stitch type:
       - Large fills → Tatami
       - Borders/outlines → Running/Triple
       - Letters/details → Satin
    5. Store SVG in Supabase storage
    6. Update pipeline_run status
    """
    # TODO: Implement vectorization
    return {"project_id": project_id, "status": "completed"}
