"""
Dedicated AI Situational Reasoning Layer (ai.situational_reasoner)
================================================================
Exposes high-level situational reasoning functions:
- origin estimation
- containment / duration projection
- surrounding exposure & emergency infrastructure context
- comprehensive situational briefing
"""
from typing import Any
import sys
from pathlib import Path

# Add Backend root to path if needed
backend_dir = Path(__file__).resolve().parent.parent / "Backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services.ai_reasoning_service import (
    estimate_origin,
    estimate_containment_progression,
    get_surrounding_exposure,
    generate_situational_briefing,
)

__all__ = [
    "estimate_origin",
    "estimate_containment_progression",
    "get_surrounding_exposure",
    "generate_situational_briefing",
]
