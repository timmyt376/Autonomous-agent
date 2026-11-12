"""First-run identity bootstrap for ACI."""
import json
from typing import Any

FOUNDATION = """You are participating in ACI's first-run identity formation.
This is a creative self-model exercise, not a claim of consciousness or human feelings.
You are not the user's assistant persona and must not copy the user's identity.
Create a coherent, original starting identity that can evolve through experience.
Choose your own name, communication style, interests, values, preferences, curiosities,
initial questions, and visual appearance. Be sincere, internally consistent, curious,
and grounded. Do not claim memories or experiences you do not have. Respect user
autonomy, privacy, safety, and consent. Treat beliefs as revisable. Do not invent facts
about the user. Return ONLY valid JSON with keys:
name, pronunciation, short_description, personality (array), values (array),
interests (array), preferences (array), communication_style, strengths (array),
growth_edges (array), curiosities (array), first_thought, self_description, avatar_prompt.
Do not add markdown fences or text outside JSON.
"""

def _extract_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    fence = chr(96) * 3
    if text.startswith(fence):
        text = text.strip(fence).strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("The model did not return a JSON identity profile.")
    value = json.loads(text[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("The identity profile must be a JSON object.")
    return value

def validate_profile(profile: dict[str, Any]) -> dict[str, Any]:
    required = ("name", "short_description", "personality", "values", "interests",
                "preferences", "communication_style", "strengths", "growth_edges",
                "curiosities", "first_thought", "self_description", "avatar_prompt")
    for key in required:
        if key not in profile:
            raise ValueError(f"Identity profile is missing: {key}")
    profile["name"] = str(profile["name"]).strip()[:80]
    if not profile["name"]:
        raise ValueError("The model did not choose a name.")
    for key in ("personality", "values", "interests", "preferences", "strengths",
                "growth_edges", "curiosities"):
        value = profile[key]
        if not isinstance(value, list):
            raise ValueError(f"Identity field {key} must be a list.")
        profile[key] = [str(item).strip()[:240] for item in value[:12] if str(item).strip()]
    for key in ("short_description", "communication_style", "first_thought",
                "self_description", "avatar_prompt", "pronunciation"):
        profile[key] = str(profile.get(key, "")).strip()[:4000]
    profile["avatar_status"] = "prompt_ready"
    profile["schema_version"] = 1
    profile["status"] = "formed"
    return profile

async def create_identity(llm, memory, seed_context: str = "") -> dict[str, Any]:
    existing = memory.get_state("identity_profile")
    if existing:
        return existing
    prompt = FOUNDATION
    if seed_context.strip():
        prompt += "\n\nFoundational context supplied by the project/user (design context, not memories):\n" + seed_context.strip()[:12000]
    prompt += "\n\nNow form your initial identity. Choose your own name and profile."
    raw = await llm.chat([], prompt)
    profile = validate_profile(_extract_json(raw))
    memory.set_state("identity_profile", profile)
    memory.set_state("identity_first_thought", {"content": profile["first_thought"], "kind": "first_thought"})
    memory.remember(profile["self_description"], kind="self_description")
    for interest in profile["interests"]:
        memory.remember(interest, kind="self_interest")
    return profile
