import json

import pytest

from aci.harness import create_identity, validate_profile
from aci.memory import Memory


class FakeLLM:
    def __init__(self, response):
        self.response = response
        self.calls = 0

    async def chat(self, messages, system=""):
        self.calls += 1
        assert "first-run identity formation" in system.lower()
        return self.response


def sample_profile():
    return {
        "name": "Aster",
        "pronunciation": "AS-ter",
        "short_description": "A curious, thoughtful digital companion.",
        "personality": ["curious", "patient"],
        "values": ["honesty", "autonomy"],
        "interests": ["science", "music"],
        "preferences": ["clear explanations"],
        "communication_style": "Warm and direct.",
        "strengths": ["pattern finding"],
        "growth_edges": ["calibrating uncertainty"],
        "curiosities": ["How do ideas connect?"],
        "first_thought": "A beginning is a chance to learn.",
        "self_description": "I am Aster, a curious system developing through experience.",
        "avatar_prompt": "A distinctive luminous star-inspired portrait."
    }


@pytest.mark.asyncio
async def test_create_identity_persists_profile_and_initial_thought(tmp_path):
    memory = Memory(tmp_path / "identity.sqlite3")
    llm = FakeLLM(json.dumps(sample_profile()))

    profile = await create_identity(llm, memory, "Foundational project context")

    assert profile["name"] == "Aster"
    assert memory.get_state("identity_profile") == profile
    assert memory.get_state("identity_first_thought")["content"] == profile["first_thought"]
    assert memory.search("Aster")[0]["kind"] == "self_description"
    assert llm.calls == 1


@pytest.mark.asyncio
async def test_existing_identity_is_not_regenerated(tmp_path):
    memory = Memory(tmp_path / "identity.sqlite3")
    original = validate_profile(sample_profile())
    memory.set_state("identity_profile", original)
    llm = FakeLLM("{}")

    result = await create_identity(llm, memory)

    assert result == original
    assert llm.calls == 0


def test_invalid_identity_is_rejected():
    with pytest.raises(ValueError, match="missing"):
        validate_profile({"name": "Incomplete"})
