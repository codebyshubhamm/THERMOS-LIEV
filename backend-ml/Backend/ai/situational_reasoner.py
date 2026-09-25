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
