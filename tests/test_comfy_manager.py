import pytest

from aci.device_api import WorkflowInspect, inspect_comfy_workflow


class FakeResponse:
    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self.data


class FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, url):
        return FakeResponse({
            "CheckpointLoaderSimple": {"input": {"required": {"ckpt_name": [["sd15.safetensors", "sdxl.safetensors"]]}}},
            "LoraLoader": {"input": {"required": {"lora_name": [["detail.safetensors"]]}}},
        })


@pytest.mark.asyncio
async def test_workflow_inspection_reports_missing_checkpoint(monkeypatch):
    import aci.device_api as module
    monkeypatch.setattr(module, "httpx", type("Httpx", (), {"AsyncClient": FakeClient}))
    monkeypatch.setattr(module.settings, "comfyui_url", "http://127.0.0.1:8188")
    result = await inspect_comfy_workflow(WorkflowInspect(workflow={
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "missing.safetensors"}},
        "2": {"class_type": "LoraLoader", "inputs": {"lora_name": "detail.safetensors"}},
    }))
    assert result["valid"] is False
    assert result["missing"][0]["name"] == "missing.safetensors"
    assert result["dependencies"][1]["installed"] is True


def test_comfy_endpoint_must_match_saved_setting(monkeypatch):
    import aci.device_api as module
    monkeypatch.setattr(module.settings, "comfyui_url", "http://127.0.0.1:8188")
    with pytest.raises(Exception):
        module._configured_comfy_url("http://example.com")
