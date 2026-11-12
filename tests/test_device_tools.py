from pathlib import Path

import pytest

from aci.config import settings
from aci.device_tools import (
    list_workspace,
    read_workspace_text,
    resolve_workspace_path,
    substitute_prompt,
    write_workspace_text,
)


def test_workspace_text_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "workspace", tmp_path)
    result = write_workspace_text("notes/hello.txt", "hello ACI")
    assert result["saved"] is True
    assert read_workspace_text("notes/hello.txt")["content"] == "hello ACI"
    listing = list_workspace("notes")
    assert listing["entries"][0]["name"] == "hello.txt"


def test_workspace_rejects_path_escape(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "workspace", tmp_path)
    with pytest.raises(ValueError, match="outside"):
        resolve_workspace_path("../outside.txt")


def test_workspace_rejects_large_and_binary_files(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "workspace", tmp_path)
    (tmp_path / "large.txt").write_text("x" * 1_000_001)
    with pytest.raises(ValueError, match="1 MB"):
        read_workspace_text("large.txt")
    (tmp_path / "binary.txt").write_bytes(b"\xff\xfe")
    with pytest.raises(ValueError, match="UTF-8"):
        read_workspace_text("binary.txt")


def test_comfy_workflow_prompt_placeholders():
    workflow = {
        "1": {"inputs": {"text": "{{PROMPT}}", "negative": "{{NEGATIVE_PROMPT}}"}},
        "2": {"inputs": {"width": "{{WIDTH}}", "height": "{{HEIGHT}}"}},
    }
    result = substitute_prompt(workflow, "blue fox", "blurry", 640, 512)
    assert result["1"]["inputs"] == {"text": "blue fox", "negative": "blurry"}
    assert result["2"]["inputs"] == {"width": "640", "height": "512"}
