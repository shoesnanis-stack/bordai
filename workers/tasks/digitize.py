"""F5 — Generation: Convert SVG regions into embroidery stitch parameters."""

from celery_app import app


@app.task(name="tasks.digitize.generate_params", bind=True)
def generate_params(self, *, project_id: str, run_id: str, supabase_url: str, supabase_service_key: str):
    """
    1. Fetch the vectorized SVG with region annotations
    2. For each region, compute:
       - Density (stitches/mm) based on region type
       - Fill angle
       - Pull compensation
       - Underlay stitches
    3. Determine color execution order (minimize thread changes)
    4. Generate point-by-point stitch trajectory using pyembroidery
    5. Store embroidery parameters as JSON metadata
    6. Update pipeline_run status
    """
    # TODO: Implement digitization
    return {"project_id": project_id, "status": "completed"}
