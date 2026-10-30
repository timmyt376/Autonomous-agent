from pathlib import Path
from aci.memory import Memory

def test_memory_roundtrip(tmp_path: Path):
    m = Memory(tmp_path / "test.sqlite3")
    m.remember("Shay likes local AI", "preference")
    assert m.search("local")[0]["content"] == "Shay likes local AI"

def test_goal_creation(tmp_path: Path):
    m = Memory(tmp_path / "test.sqlite3")
    goal_id = m.add_goal("Build ACI")
    assert goal_id > 0
    assert m.goals()[0]["title"] == "Build ACI"
