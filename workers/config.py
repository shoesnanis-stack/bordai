import os

# ─── Supabase ──────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# ─── Redis / Celery ────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# ─── AI Providers ──────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# ─── Model paths (for local models like SAM, Real-ESRGAN) ─────────
SAM_CHECKPOINT_PATH = os.getenv("SAM_CHECKPOINT_PATH", "./models/sam_vit_h.pth")
ESRGAN_MODEL_PATH = os.getenv("ESRGAN_MODEL_PATH", "./models/RealESRGAN_x4plus.pth")

# ─── Processing defaults ──────────────────────────────────────────
MAX_IMAGE_SIZE = 4096  # px
DEFAULT_DENSITY = 5  # stitches per mm
DEFAULT_UNDERLAY = True
MAX_THREAD_COLORS = 15
