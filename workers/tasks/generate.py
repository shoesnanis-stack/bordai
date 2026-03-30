"""F2B — Regeneration route: Generate clean image when original is unusable."""

from celery_app import app


@app.task(name="tasks.generate.regenerate_image", bind=True)
def regenerate_image(self, *, project_id: str, run_id: str, supabase_url: str, supabase_service_key: str):
    """
    1. Fetch the brief's intent description
    2. Build an embroidery-oriented prompt:
       "clean vector logo, [description], minimal, embroidery-ready, flat design, N colors"
    3. Generate 3 variants via Stable Diffusion / DALL-E
    4. Store variants in Supabase storage
    5. Update project status to 'needs_approval' for client to pick one
    """
    # TODO: Implement image generation
    return {"project_id": project_id, "status": "completed", "variants": 3}
