from celery import Celery
from config import REDIS_URL

app = Celery(
    "bordai_workers",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "tasks.vision",
        "tasks.segment",
        "tasks.upscale",
        "tasks.generate",
        "tasks.vectorize",
        "tasks.digitize",
        "tasks.validate",
        "tasks.export",
    ],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,  # One task at a time (GPU-bound)
)
