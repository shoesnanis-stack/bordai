"""F5 — Validation: Pre-export checks to ensure machine compatibility."""

from celery_app import app


@app.task(name="tasks.validate.check_embroidery", bind=True)
def check_embroidery(self, *, project_id: str, run_id: str, supabase_url: str, supabase_service_key: str):
    """
    Validation checklist:
    - Total stitches within machine limit
    - Jump stitches < 12mm
    - Density within safe range (3-7 stitches/mm)
    - Color changes within limit
    - Dimensions fit within selected hoop
    - No regions without underlay

    Auto-fix when possible, warn when not.
    """
    # TODO: Implement validation
    return {"project_id": project_id, "status": "completed", "warnings": []}
