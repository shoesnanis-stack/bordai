"""F5 — Export: Generate final embroidery file in the target machine format."""

from celery_app import app


@app.task(name="tasks.export.generate_embroidery_file", bind=True)
def generate_embroidery_file(self, *, project_id: str, run_id: str, supabase_url: str, supabase_service_key: str):
    """
    1. Fetch validated stitch data
    2. Use pyembroidery to write the file in the correct format:
       - Brother → .PES
       - Tajima  → .DST
       - Janome  → .JEF
       - Pfaff   → .VIP
       - Generic → .EXP
    3. Generate PDF with sewing instructions:
       - Thread colors in execution order
       - Final dimensions
       - Recommended stabilizer
       - Suggested tension settings
    4. Store both files in Supabase storage
    5. Update project status to 'completed'
    6. Update pipeline_run status
    """
    # TODO: Implement export with pyembroidery
    return {"project_id": project_id, "status": "completed"}
