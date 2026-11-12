import asyncio
import hmac
import re
import shutil
import subprocess
import sys
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
import uvicorn

from .config import settings, store_deepseek_api_key
from .memory import Memory
from .llm import DeepSeekClient, OllamaClient, OpenAICompatibleClient
from .cognition import Cognition
from .harness import create_identity
from . import device_api
from .device_api import router as device_router
from .device_tools import hardware_advice

memory = Memory(settings.data_dir / "aci.sqlite3")
ollama = OllamaClient(settings.ollama_url, settings.model)
deepseek = DeepSeekClient(
    settings.deepseek_base_url,
    settings.deepseek_model,
    settings.deepseek_api_key,
)

active_provider = settings.provider if settings.provider in {"ollama", "deepseek", "openai"} else "ollama"
active_model = settings.deepseek_model if active_provider == "deepseek" else settings.openai_model if active_provider == "openai" else settings.model
openai_client = OpenAICompatibleClient(settings.openai_base_url, settings.openai_model, settings.openai_api_key)
cognition = Cognition(deepseek if active_provider == "deepseek" else openai_client if active_provider == "openai" else ollama, memory, settings.max_context_messages)
device_api.active_cognition = cognition

pull_state = {
    "active": False,
    "model": None,
    "status": "idle",
    "completed": 0,
    "total": 0,
    "percent": 0,
    "error": None,
}
pull_task: asyncio.Task | None = None

MODEL_CATALOG = [
    {"name": "qwen3:0.6b", "family": "Qwen 3", "description": "Very small general assistant"},
    {"name": "qwen3:1.7b", "family": "Qwen 3", "description": "Compact general assistant"},
    {"name": "qwen3:4b", "family": "Qwen 3", "description": "Stronger compact reasoning and chat"},
    {"name": "llama3.2:1b", "family": "Llama 3.2", "description": "Lightweight general assistant"},
    {"name": "llama3.2:3b", "family": "Llama 3.2", "description": "Small general assistant"},
    {"name": "gemma3:1b", "family": "Gemma 3", "description": "Small instruction model"},
    {"name": "gemma3:4b", "family": "Gemma 3", "description": "Compact multimodal-capable model family"},
    {"name": "phi4-mini", "family": "Phi", "description": "Compact reasoning-focused model"},
    {"name": "deepseek-r1:1.5b", "family": "DeepSeek R1", "description": "Small distilled reasoning model"},
    {"name": "deepseek-r1:7b", "family": "DeepSeek R1", "description": "Larger distilled reasoning model"},
]


class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=12000)


class NoteInput(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ProviderInput(BaseModel):
    provider: Literal["ollama", "deepseek", "openai"]
    model: str | None = Field(default=None, max_length=120)


class DeepSeekSettingsInput(BaseModel):
    api_key: str = Field(default="", max_length=500)
    model: str = Field(default="deepseek-flash", min_length=1, max_length=120)


class ModelInput(BaseModel):
    model: str = Field(min_length=1, max_length=120)


class CustomProviderInput(BaseModel):
    base_url: str = Field(min_length=8, max_length=500)
    model: str = Field(min_length=1, max_length=160)
    api_key: str = Field(default="", max_length=1000)

class WorkspaceReadInput(BaseModel):
    path: str = Field(min_length=1, max_length=500)

class WorkspaceWriteInput(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=1000000)

class ComfyImageInput(BaseModel):
    base_url: str = Field(default="http://127.0.0.1:8188", max_length=500)
    workflow: dict
    prompt: str = Field(min_length=1, max_length=6000)
    negative_prompt: str = Field(default="", max_length=3000)
    width: int = Field(default=768, ge=256, le=2048)
    height: int = Field(default=768, ge=256, le=2048)

class HarnessInput(BaseModel):
    seed_context: str = Field(default="", max_length=12000)


app = FastAPI(title="ACI Runtime", version="0.3.0")
app.include_router(device_router)


@app.middleware("http")
async def protect_api(request, call_next):
    if settings.api_token and request.url.path.startswith("/api/"):
        authorization = request.headers.get("authorization", "")
        supplied = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
        if not hmac.compare_digest(supplied, settings.api_token):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


@app.get("/", response_class=HTMLResponse)
async def home():
    return """<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ACI · Autonomous Cognitive Intelligence</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{font:15px system-ui;background:#0b0f1a;color:#eef3ff;max-width:1050px;margin:28px auto;padding:0 18px}
h1{color:#79a2ff;margin-bottom:4px}.muted,.help{color:#9aa9c2;font-size:13px;line-height:1.5}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
section{background:#121a29;border:1px solid #263650;padding:18px;border-radius:14px;margin:14px 0}
input,select,textarea{width:100%;background:#0b0f1a;color:#eef3ff;border:1px solid #405071;border-radius:8px;padding:11px;margin:6px 0 10px}
button{background:#4a7dff;color:white;border:0;border-radius:8px;padding:10px 14px;margin:4px 5px 4px 0;cursor:pointer;font-weight:650}
button.secondary{background:#263650}button.danger{background:#8d3944}
pre{white-space:pre-wrap;overflow-wrap:anywhere}.item{padding:12px;background:#182338;border-radius:9px;margin:8px 0;display:flex;justify-content:space-between;gap:10px;align-items:center}
.item small{display:block;color:#9aa9c2;margin-top:3px}.bar{height:8px;background:#263650;border-radius:8px;overflow:hidden;margin:10px 0}.bar>div{height:100%;background:#4a7dff;width:0}.overlay{position:fixed;inset:0;background:#050914ee;z-index:20;display:flex;align-items:center;justify-content:center;padding:18px}.setupPanel{width:min(620px,100%);max-height:90vh;overflow:auto;background:#121a29;border:1px solid #405071;border-radius:18px;padding:22px}.setupPanel h2{color:#eef3ff}.setupPanel p{color:#9aa9c2;line-height:1.55}.setupPanel .choice{display:block;width:100%;text-align:left;padding:16px;margin:8px 0}
</style></head><body>
<div id="setupOverlay" class="overlay"><div class="setupPanel">
<div id="setupWelcome"><h2>Welcome to ACI</h2><p>Choose how this computer should run text models. You can change providers later.</p><button class="choice" onclick="showSetupStep('local')">Use local models on this computer</button><button class="choice" onclick="showSetupStep('api')">Use an API / hosted model</button></div>
<div id="setupLocal" style="display:none"><h2>Local model setup</h2><p>ACI checks system RAM and NVIDIA VRAM, then recommends a small local model. It can launch the Ollama installer on Windows after you click.</p><pre id="setupStatus" class="muted">Checking local services…</pre><button onclick="installOllama()">Install Ollama (Windows)</button><button onclick="finishDesktopSetup('ollama')">Auto-pick, download and select local model</button><button class="secondary" onclick="showSetupStep('welcome')">Back</button><p><a href="https://ollama.com/download" target="_blank">Ollama downloads</a> · <a href="https://www.comfy.org/download" target="_blank">ComfyUI installer</a></p></div>
<div id="setupApi" style="display:none"><h2>API setup</h2><p>Choose DeepSeek or provide any OpenAI-compatible endpoint. API keys are stored in the operating-system credential store.</p><label>Provider</label><select id="setupProvider" onchange="document.getElementById('setupBaseWrap').style.display=this.value==='openai'?'block':'none'"><option value="deepseek">DeepSeek</option><option value="openai">Custom OpenAI-compatible</option></select><div id="setupBaseWrap" style="display:none"><label>API base URL</label><input id="setupBase" placeholder="http://127.0.0.1:11434/v1"></div><label>Model ID</label><input id="setupModel" value="deepseek-flash"><label>API key</label><input id="setupKey" type="password" placeholder="Provider key"><button onclick="finishDesktopSetup(document.getElementById('setupProvider').value)">Save and continue</button><button class="secondary" onclick="showSetupStep('welcome')">Back</button></div>
</div></div>
<h1>ACI <small>0.3.0</small></h1><p class="muted">Autonomous Cognitive Intelligence · local-first runtime</p>
<section><h2>Connection and provider</h2>
<p class="help">Choose hosted DeepSeek or a local Ollama model. The DeepSeek key is stored in your operating-system credential store when available; it is never returned by the API.</p>
<label>ACI bearer token (only if configured)</label><input id="token" type="password" placeholder="ACI_API_TOKEN">
<label>Provider</label><select id="provider"><option value="ollama">Local models (Ollama)</option><option value="deepseek">DeepSeek API</option><option value="openai">Custom OpenAI-compatible API</option></select>
<label>Model</label><input id="providerModel" value="llama3.2:3b">
<label>DeepSeek API key</label><input id="deepseekKey" type="password" placeholder="Paste key here; saved securely">
<button onclick="saveDeepSeek()">Save DeepSeek key</button><label>Custom API base URL</label><input id="customBaseUrl" placeholder="http://127.0.0.1:11434/v1"><label>Custom API model ID</label><input id="customModelId" placeholder="qwen3:4b"><label>Custom API key (optional)</label><input id="customApiKey" type="password" placeholder="Stored in OS credential store"><button onclick="saveCustomProvider()">Save custom endpoint</button><button onclick="setProvider()">Activate provider</button>
<pre id="providerStatus" class="muted"></pre></section>
<section><h2>First-run identity harness</h2><p class="help">Before chat starts, ACI sends its foundational context to the selected model. The model chooses its own name, personality, values, interests, first thought, self-description and profile portrait prompt. Its identity is saved and reused on future launches.</p><label>Foundational context</label><textarea id="seedContext" rows="5">ACI is a new local-first cognitive system. Form a distinct, revisable identity. Develop hybrid memory, computational affect, curiosity, independent preferences, social boundaries, trust and self-reflection over time. Respect privacy, consent, safety and user autonomy. This is a computational self-model, not a claim of consciousness.</textarea><button onclick="initializeHarness()">Create AI identity</button><pre id="identityResult" class="muted"></pre></section>
<div class="grid">
<section><h2>Conversation</h2><textarea id="msg" placeholder="Talk to ACI…" rows="4"></textarea><button onclick="send()">Send</button><pre id="reply"></pre></section>
<section><h2>Persistent memory</h2><textarea id="note" placeholder="A fact or experience ACI should remember" rows="4"></textarea><button onclick="saveNote()">Remember</button><pre id="noteResult"></pre></section>
</div>
<section><h2>Local model manager</h2><p class="help">Automatically detect hardware and choose a suitable model, or manage the catalogue yourself.</p><button onclick="autoPickModel()">Auto-pick model for this computer</button><button class="secondary" onclick="detectServices()">Detect Ollama / ComfyUI</button><pre id="serviceStatus" class="muted"></pre>
<p class="help">Find, download, load and remove local models from this interface. The desktop runtime uses the Ollama service as its local inference engine; install Ollama once, then manage models here.</p>
<label>Search model catalogue</label><input id="catalogQuery" placeholder="Search e.g. qwen, gemma, deepseek" oninput="filterCatalog()">
<div id="catalog"></div>
<label>Or enter an Ollama model tag</label><input id="customModel" placeholder="e.g. qwen3:4b">
<button onclick="pullModel(document.getElementById('customModel').value)">Download model</button>
<div class="bar"><div id="pullBar"></div></div><pre id="pullStatus" class="muted"></pre>
<h3>Installed models</h3><button class="secondary" onclick="refreshModels()">Refresh installed models</button><div id="installed"></div>
</section>
<section><h2>Workspace files</h2><p class="help">ACI can browse and edit files only inside its configured workspace folder. Place files here or change ACI_WORKSPACE in .env. It cannot silently browse your entire computer.</p><button onclick="browseWorkspace()">Refresh workspace</button><div id="workspaceFiles"></div><label>Selected text file</label><input id="workspacePath" placeholder="relative/path.txt"><textarea id="workspaceEditor" rows="10" placeholder="Select a text file to edit"></textarea><button onclick="saveWorkspaceFile()">Save file</button><label>New file path</label><input id="newWorkspacePath" placeholder="notes/new-file.txt"><button onclick="createWorkspaceFile()">Create file</button><pre id="workspaceStatus" class="muted"></pre></section>
<section><h2>Image generation · ComfyUI</h2><p class="help">Connect a ComfyUI server and paste a workflow exported in API format. Use the prompt placeholders in the workflow's text nodes.</p><label>ComfyUI endpoint</label><input id="comfyUrl" value="http://127.0.0.1:8188"><label>Image prompt</label><textarea id="imagePrompt" rows="3" placeholder="Describe an image"></textarea><label>ComfyUI API workflow JSON</label><textarea id="comfyWorkflow" rows="8" placeholder="Paste API-format workflow JSON"></textarea><button onclick="runImageGeneration()">Generate image</button><pre id="imageStatus" class="muted"></pre><div id="generatedImages"></div></section>
<section><h2>Runtime status</h2><pre id="status">Loading…</pre></section>
<script>
function headers(){const h={'Content-Type':'application/json'};const t=document.getElementById('token').value.trim();if(t)h.Authorization='Bearer '+t;return h}
async function api(path,method='GET',body){const r=await fetch(path,{method,headers:headers(),body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({detail:r.statusText}));if(!r.ok)throw new Error(d.detail||('HTTP '+r.status));return d}
async function initializeHarness(){const o=document.getElementById('identityResult');o.textContent='Forming identity…';try{const d=await api('/api/harness/initialize','POST',{seed_context:document.getElementById('seedContext').value});const p=d.profile;o.textContent=JSON.stringify({name:p.name,short_description:p.short_description,personality:p.personality,values:p.values,interests:p.interests,first_thought:p.first_thought,self_description:p.self_description,avatar_prompt:p.avatar_prompt},null,2)}catch(e){o.textContent=e.message}}
async function send(){const m=document.getElementById('msg').value.trim();if(!m)return;const o=document.getElementById('reply');o.textContent='Thinking…';try{const d=await api('/api/chat','POST',{message:m});o.textContent=d.reply||'No response'}catch(e){o.textContent=e.message}}
async function saveNote(){try{const d=await api('/api/memory','POST',{content:document.getElementById('note').value});document.getElementById('noteResult').textContent=JSON.stringify(d)}catch(e){document.getElementById('noteResult').textContent=e.message}}
async function saveDeepSeek(){try{const d=await api('/api/settings/deepseek','POST',{api_key:document.getElementById('deepseekKey').value,model:document.getElementById('providerModel').value||'deepseek-flash'});document.getElementById('deepseekKey').value='';document.getElementById('providerStatus').textContent=d.message}catch(e){document.getElementById('providerStatus').textContent=e.message}}
async function setProvider(){try{const d=await api('/api/provider','POST',{provider:document.getElementById('provider').value,model:document.getElementById('providerModel').value});document.getElementById('providerStatus').textContent=d.message;await refresh()}catch(e){document.getElementById('providerStatus').textContent=e.message}}

async function saveCustomProvider(){try{const d=await api('/api/settings/custom-provider','POST',{base_url:document.getElementById('customBaseUrl').value,model:document.getElementById('customModelId').value,api_key:document.getElementById('customApiKey').value});document.getElementById('customApiKey').value='';document.getElementById('providerStatus').textContent=d.message}catch(e){document.getElementById('providerStatus').textContent=e.message}}
async function autoPickModel(){try{const d=await api('/api/models/auto','POST',{});document.getElementById('pullStatus').textContent='Recommended '+d.model+' · '+d.hardware.ram_gb+' GB RAM · '+(d.hardware.gpu_name||'no NVIDIA GPU detected')+' · '+(d.installed?'Already installed and selected':'Download started');await pollPull()}catch(e){document.getElementById('pullStatus').textContent=e.message}}
async function detectServices(){try{const d=await api('/api/services');document.getElementById('serviceStatus').textContent='Ollama: '+(d.ollama.available?'available':'not found')+' · ComfyUI: '+(d.comfyui.available?'available':'not found')}catch(e){document.getElementById('serviceStatus').textContent=e.message}}
async function installOllama(){try{const d=await api('/api/setup/install/ollama','POST',{});document.getElementById('setupStatus').textContent=d.message;setTimeout(detectServices,8000)}catch(e){document.getElementById('setupStatus').textContent=e.message}}
function showSetupStep(step){document.getElementById('setupWelcome').style.display=step==='welcome'?'block':'none';document.getElementById('setupLocal').style.display=step==='local'?'block':'none';document.getElementById('setupApi').style.display=step==='api'?'block':'none'}
async function finishDesktopSetup(kind){try{if(kind==='ollama'){const d=await api('/api/services');if(!d.ollama.available){showSetupStep('local');document.getElementById('setupStatus').textContent='Ollama is not running. Install it first.';return}const m=await api('/api/models/auto','POST',{});document.getElementById('setupStatus').textContent='Local model '+m.model+' selected or downloading.';if(!m.installed)await pollPull()}else if(kind==='deepseek'){const key=document.getElementById('setupKey').value;if(key)await api('/api/settings/deepseek','POST',{api_key:key,model:document.getElementById('setupModel').value||'deepseek-flash'});await api('/api/provider','POST',{provider:'deepseek',model:document.getElementById('setupModel').value||'deepseek-flash'})}else{await api('/api/settings/custom-provider','POST',{base_url:document.getElementById('setupBase').value,model:document.getElementById('setupModel').value,api_key:document.getElementById('setupKey').value});await api('/api/provider','POST',{provider:'openai',model:document.getElementById('setupModel').value})}localStorage.setItem('aciSetupComplete','1');document.getElementById('setupOverlay').style.display='none';await refresh()}catch(e){document.getElementById('setupStatus').textContent=e.message}}
\n
function showSetupStep(step){document.getElementById('setupWelcome').style.display=step==='welcome'?'block':'none';document.getElementById('setupLocal').style.display=step==='local'?'block':'none';document.getElementById('setupApi').style.display=step==='api'?'block':'none'}
async function installOllama(){try{const d=await api('/api/setup/install/ollama','POST',{});document.getElementById('setupStatus').textContent=d.message;setTimeout(detectServices,7000)}catch(e){document.getElementById('setupStatus').textContent=e.message}}
async function detectServices(){try{const d=await api('/api/services');document.getElementById('serviceStatus').textContent='Ollama: '+(d.ollama.available?'available':'not detected')+' · ComfyUI: '+(d.comfyui.available?'available':'not detected');document.getElementById('setupStatus').textContent=document.getElementById('serviceStatus').textContent}catch(e){document.getElementById('serviceStatus').textContent=e.message}}
async function autoPickModel(){try{const d=await api('/api/models/auto','POST',{});document.getElementById('pullStatus').textContent='Recommended '+d.model+' · '+d.hardware.ram_gb+' GB RAM · '+(d.hardware.gpu_name||'no NVIDIA GPU detected');if(!d.installed)pollPull();else refreshModels()}catch(e){document.getElementById('pullStatus').textContent=e.message}}
async function finishDesktopSetup(kind){try{if(kind==='ollama'){const d=await api('/api/services');if(!d.ollama.available){document.getElementById('setupStatus').textContent='Ollama is not running. Install it, then retry.';return}const m=await api('/api/models/auto','POST',{});document.getElementById('setupStatus').textContent='Selected '+m.model;if(!m.installed)pollPull()}else if(kind==='deepseek'){const key=document.getElementById('setupKey').value;if(key)await api('/api/settings/deepseek','POST',{api_key:key,model:document.getElementById('setupModel').value||'deepseek-flash'});await api('/api/provider','POST',{provider:'deepseek',model:document.getElementById('setupModel').value||'deepseek-flash'})}else{await api('/api/settings/custom-provider','POST',{base_url:document.getElementById('setupBase').value,model:document.getElementById('setupModel').value,api_key:document.getElementById('setupKey').value});await api('/api/provider','POST',{provider:'openai',model:document.getElementById('setupModel').value})}localStorage.setItem('aciSetupComplete','1');document.getElementById('setupOverlay').style.display='none';await refresh()}catch(e){document.getElementById('setupStatus').textContent=e.message}}
async function browseWorkspace(path=''){try{const d=await api('/api/device/files?path='+encodeURIComponent(path));const root=document.getElementById('workspaceFiles');root.innerHTML='';const up=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';if(path) {const b=document.createElement('button');b.textContent='Up';b.onclick=()=>browseWorkspace(up);root.append(b)}for(const item of d.entries){const row=document.createElement('div');row.className='item';const label=document.createElement('span');label.textContent=(item.kind==='directory'?'📁 ':'📄 ')+item.name;const action=document.createElement('button');action.textContent=item.kind==='directory'?'Open':'Edit';action.onclick=()=>item.kind==='directory'?browseWorkspace(item.path):readWorkspaceFile(item.path);row.append(label,action);root.append(row)}document.getElementById('workspaceStatus').textContent='Workspace: '+(path||'/')}catch(e){document.getElementById('workspaceStatus').textContent=e.message}}
async function readWorkspaceFile(path){try{const d=await api('/api/device/files/read','POST',{path});document.getElementById('workspacePath').value=d.path;document.getElementById('workspaceEditor').value=d.content;document.getElementById('workspaceStatus').textContent='Editing '+d.path}catch(e){document.getElementById('workspaceStatus').textContent=e.message}}
async function saveWorkspaceFile(){try{const d=await api('/api/device/files/write','POST',{path:document.getElementById('workspacePath').value,content:document.getElementById('workspaceEditor').value});document.getElementById('workspaceStatus').textContent='Saved '+d.path}catch(e){document.getElementById('workspaceStatus').textContent=e.message}}
async function createWorkspaceFile(){try{const path=document.getElementById('newWorkspacePath').value;await api('/api/device/files/write','POST',{path,content:''});await readWorkspaceFile(path);browseWorkspace(path.includes('/')?path.slice(0,path.lastIndexOf('/')):'')}catch(e){document.getElementById('workspaceStatus').textContent=e.message}}
async function runImageGeneration(){try{const workflow=JSON.parse(document.getElementById('comfyWorkflow').value);const base=document.getElementById('comfyUrl').value;const job=await api('/api/generate/image','POST',{base_url:base,workflow,prompt:document.getElementById('imagePrompt').value});document.getElementById('imageStatus').textContent='Queued '+job.prompt_id;const poll=async()=>{const d=await api('/api/generate/image/'+encodeURIComponent(job.prompt_id)+'?base_url='+encodeURIComponent(base));if(d.images&&d.images.length){const target=document.getElementById('generatedImages');target.innerHTML='';for(const image of d.images){const img=document.createElement('img');img.src=image.url;img.style.maxWidth='100%';img.style.borderRadius='12px';target.append(img)}document.getElementById('imageStatus').textContent='Image generation complete'}else{document.getElementById('imageStatus').textContent='Generating…';setTimeout(poll,1800)}};poll()}catch(e){document.getElementById('imageStatus').textContent=e.message}}
\nasync function refresh(){try{const d=await api('/api/status');document.getElementById('status').textContent=JSON.stringify(d,null,2);try{const identity=await api('/api/identity');if(identity.initialized){document.getElementById('identityResult').textContent=JSON.stringify(identity.profile,null,2)}else{document.getElementById('identityResult').textContent='Not initialized — create an identity before starting chat.'}}catch(e){}document.getElementById('provider').value=d.provider;document.getElementById('customBaseUrl').value=d.openai_base_url||'';document.getElementById('customModelId').value=d.openai_model||'';document.getElementById('providerModel').value=d.model||''}catch(e){document.getElementById('status').textContent=e.message}await refreshModels()}
async function refreshModels(){try{const d=await api('/api/models');const el=document.getElementById('installed');el.innerHTML='';for(const m of d.models){const row=document.createElement('div');row.className='item';const label=document.createElement('span');label.textContent=m.name+(m.size?' · '+(m.size/1073741824).toFixed(2)+' GB':'');const actions=document.createElement('span');const load=document.createElement('button');load.textContent='Load';load.onclick=()=>selectModel(m.name);const del=document.createElement('button');del.textContent='Delete';del.className='danger';del.onclick=()=>deleteModel(m.name);actions.append(load,del);row.append(label,actions);el.append(row)}}catch(e){document.getElementById('installed').textContent=e.message}}
async function filterCatalog(){try{const q=document.getElementById('catalogQuery').value;const d=await api('/api/models/catalog?q='+encodeURIComponent(q));const el=document.getElementById('catalog');el.innerHTML='';for(const m of d.models){const row=document.createElement('div');row.className='item';const label=document.createElement('span');label.textContent=m.name;const desc=document.createElement('small');desc.textContent=m.family+' · '+m.description;label.append(desc);const btn=document.createElement('button');btn.textContent='Download';btn.onclick=()=>pullModel(m.name);row.append(label,btn);el.append(row)}}catch(e){document.getElementById('catalog').textContent=e.message}}
async function pullModel(name){if(!name)return;try{await api('/api/models/pull','POST',{model:name});document.getElementById('pullStatus').textContent='Starting download: '+name;pollPull()}catch(e){document.getElementById('pullStatus').textContent=e.message}}
async function pollPull(){try{const d=await api('/api/models/pull');document.getElementById('pullStatus').textContent=d.status+(d.model?' · '+d.model:'')+(d.error?' · '+d.error:'');document.getElementById('pullBar').style.width=(d.percent||0)+'%';if(d.active){setTimeout(pollPull,1000)}else{refreshModels()}}catch(e){document.getElementById('pullStatus').textContent=e.message}}
async function selectModel(name){try{const d=await api('/api/models/select','POST',{model:name});document.getElementById('providerStatus').textContent=d.message;refresh()}catch(e){document.getElementById('providerStatus').textContent=e.message}}
async function deleteModel(name){if(!confirm('Delete '+name+'?'))return;try{await api('/api/models/delete','POST',{model:name});refreshModels()}catch(e){alert(e.message)}}
document.getElementById('provider').addEventListener('change',()=>{document.getElementById('providerModel').value=document.getElementById('provider').value==='deepseek'?'deepseek-flash':document.getElementById('provider').value==='openai'?(document.getElementById('customModelId').value||'model-name'):'llama3.2:3b'});refresh();filterCatalog();detectServices();browseWorkspace();if(localStorage.getItem('aciSetupComplete')==='1')document.getElementById('setupOverlay').style.display='none';else showSetupStep('welcome');
</script></body></html>"""


@app.get("/api/status")
async def status():
    try:
        local_models = await ollama.status()
        ollama_connected = True
        ollama_error = None
    except Exception as exc:
        local_models, ollama_connected, ollama_error = [], False, str(exc)

    return {
        "name": "ACI",
        "version": "0.3.0",
        "provider": active_provider,
        "comfyui_url": settings.comfyui_url,
        "openai_base_url": settings.openai_base_url,
        "openai_model": settings.openai_model,
        "openai_configured": bool(openai_client.api_key),
        "model": active_model,
        "ollama_connected": ollama_connected,
        "ollama_error": ollama_error,
        "deepseek_configured": bool(deepseek.api_key),
        "deepseek_models": ["deepseek-flash", "deepseek-v4-pro"],
        "available_models": [m.get("name") or m.get("model") for m in local_models],
        "affect": cognition.affect.as_dict(),
        "goals": memory.goals(),
        "identity_initialized": bool(memory.get_state("identity_profile")),
        "identity_name": (memory.get_state("identity_profile") or {}).get("name"),
    }


@app.post("/api/provider")
async def select_provider(body: ProviderInput):
    global active_provider, active_model
    model = (body.model or "").strip()

    if body.provider == "deepseek":
        if not deepseek.api_key:
            raise HTTPException(
                status_code=400,
                detail="Save a DeepSeek API key first, or set DEEPSEEK_API_KEY in .env.",
            )
        active_provider = "deepseek"
        active_model = model or settings.deepseek_model
        deepseek.model = active_model
        cognition.llm = deepseek
    elif body.provider == "openai":
        if not openai_client.base_url or not openai_client.model:
            raise HTTPException(status_code=400, detail="Configure a custom OpenAI-compatible endpoint and model first.")
        active_provider = "openai"
        active_model = model or openai_client.model
        openai_client.model = active_model
        cognition.llm = openai_client
    else:
        try:
            installed = await ollama.status()
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Ollama is unavailable. Install/start Ollama first. {exc}",
            )
        names = {m.get("name") or m.get("model") for m in installed}
        selected = model or settings.model
        if names and selected not in names:
            raise HTTPException(status_code=400, detail=f"Local model is not installed: {selected}")
        active_provider = "ollama"
        active_model = selected
        ollama.model = selected
        cognition.llm = ollama

    return {"provider": active_provider, "model": active_model, "message": f"Active provider: {active_provider} · {active_model}"}


@app.post("/api/settings/deepseek")
async def save_deepseek_settings(body: DeepSeekSettingsInput):
    try:
        store_deepseek_api_key(body.api_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    deepseek.api_key = body.api_key.strip()
    deepseek.model = body.model.strip()
    settings.deepseek_model = deepseek.model
    return {
        "saved": True,
        "configured": bool(deepseek.api_key),
        "model": deepseek.model,
        "message": "DeepSeek settings saved. The API key is stored in the operating-system credential store.",
    }


@app.get("/api/models")
async def list_local_models():
    try:
        models = await ollama.status()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama is unavailable: {exc}")
    return {"models": models}



@app.get("/api/hardware")
async def hardware():
    return hardware_advice()


@app.post("/api/models/auto")
async def auto_select_model():
    global pull_task
    recommendation = hardware_advice()
    model = recommendation["recommended_model"]
    try:
        installed = await ollama.status()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama is unavailable. Install or start it first: {exc}")
    names = {item.get("name") or item.get("model") for item in installed}
    if model in names:
        await select_local_model(ModelInput(model=model))
        return {"installed": True, "model": model, "hardware": recommendation}
    if pull_task and not pull_task.done():
        raise HTTPException(status_code=409, detail="A model download is already running.")
    pull_task = asyncio.create_task(_run_model_pull(model))
    return {"installed": False, "started": True, "model": model, "hardware": recommendation}

@app.get("/api/models/catalog")
async def model_catalog(q: str = Query(default="", max_length=80)):
    term = q.strip().lower()
    models = [
        item for item in MODEL_CATALOG
        if not term or term in item["name"].lower() or term in item["family"].lower() or term in item["description"].lower()
    ]
    return {"models": models}


async def _run_model_pull(model: str):
    global active_provider, active_model
    pull_state.update({
        "active": True, "model": model, "status": "Starting download",
        "completed": 0, "total": 0, "percent": 0, "error": None,
    })

    def on_update(event: dict):
        total = int(event.get("total") or 0)
        completed = int(event.get("completed") or 0)
        percent = round((completed / total) * 100) if total > 0 else pull_state["percent"]
        pull_state.update({
            "status": event.get("status", "Downloading"),
            "completed": completed,
            "total": total,
            "percent": min(100, max(0, percent)),
        })

    try:
        await ollama.pull(model, on_update)
        ollama.model = model
        active_provider, active_model = "ollama", model
        cognition.llm = ollama
        pull_state.update({"active": False, "status": "Download complete · model selected", "percent": 100})
    except Exception as exc:
        pull_state.update({"active": False, "status": "Download failed", "error": str(exc)})


@app.post("/api/models/pull")
async def start_model_pull(body: ModelInput):
    global pull_task
    model = body.model.strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,118}", model):
        raise HTTPException(status_code=400, detail="Invalid Ollama model tag.")
    if pull_task and not pull_task.done():
        raise HTTPException(status_code=409, detail="A model download is already running.")
    try:
        await ollama.status()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama is unavailable: {exc}")
    pull_task = asyncio.create_task(_run_model_pull(model))
    return {"started": True, "model": model}


@app.get("/api/models/pull")
async def model_pull_status():
    return dict(pull_state)


@app.post("/api/models/select")
async def select_local_model(body: ModelInput):
    global active_provider, active_model
    model = body.model.strip()
    try:
        installed = await ollama.status()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama is unavailable: {exc}")
    names = {m.get("name") or m.get("model") for m in installed}
    if model not in names:
        raise HTTPException(status_code=404, detail="That model is not installed.")
    ollama.model = model
    active_provider, active_model = "ollama", model
    cognition.llm = ollama
    return {"selected": True, "provider": active_provider, "model": active_model, "message": f"Loaded model selection: {model}"}


@app.post("/api/models/delete")
async def delete_local_model(body: ModelInput):
    try:
        await ollama.delete(body.model.strip())
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not delete local model: {exc}")
    return {"deleted": True, "model": body.model.strip()}


@app.post("/api/chat")
async def chat(body: ChatInput):
    if not memory.get_state("identity_profile"):
        raise HTTPException(status_code=409, detail="Complete the first-run identity harness before starting chat.")
    try:
        return {"reply": await cognition.respond(body.message)}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Model unavailable or request failed: {exc}")


@app.post("/api/memory")
async def add_memory(body: NoteInput):
    memory.remember(body.content)
    return {"saved": True}


@app.get("/api/memory")
async def get_memory(q: str = ""):
    return {"items": memory.search(q) if q else []}


@app.post("/api/goals")
async def add_goal(body: NoteInput):
    return {"id": memory.add_goal(body.content)}


@app.get("/api/goals")
async def goals():
    return {"items": memory.goals()}


@app.get("/api/identity")
async def get_identity():
    profile = memory.get_state("identity_profile")
    return {"initialized": bool(profile), "profile": profile}


@app.post("/api/harness/initialize")
async def initialize_harness(body: HarnessInput):
    try:
        profile = await create_identity(cognition.llm, memory, body.seed_context)
        return {"initialized": True, "profile": profile}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Identity bootstrap failed: {exc}")


def main():
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
