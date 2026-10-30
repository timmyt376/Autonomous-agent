from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
import uvicorn

from .config import settings
from .memory import Memory
from .llm import OllamaClient
from .cognition import Cognition

memory = Memory(settings.data_dir / "aci.sqlite3")
llm = OllamaClient(settings.ollama_url, settings.model)
cognition = Cognition(llm, memory, settings.max_context_messages)

class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=12000)

class NoteInput(BaseModel):
    content: str = Field(min_length=1, max_length=4000)

app = FastAPI(title="ACI Runtime", version="0.2.0")

@app.get("/", response_class=HTMLResponse)
async def home():
    return """<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>ACI</title>
<style>body{font:16px system-ui;background:#0b1020;color:#e8edff;max-width:850px;margin:40px auto;padding:0 18px}h1{color:#79a2ff}section{background:#141d33;padding:18px;border-radius:14px;margin:14px 0}textarea{width:100%;min-height:90px;background:#0b1020;color:white;border:1px solid #405071;border-radius:8px;padding:10px}button{background:#4a7dff;color:white;border:0;border-radius:8px;padding:10px 18px;margin-top:10px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#aab7d4}</style></head><body><h1>ACI <small>0.2.0</small></h1><p class='muted'>Autonomous Cognitive Intelligence · local runtime</p>
<section><h2>Conversation</h2><textarea id='msg' placeholder='Talk to ACI...'></textarea><button onclick='send()'>Send</button><pre id='reply'></pre></section>
<section><h2>Persistent note</h2><textarea id='note' placeholder='A fact or experience ACI should remember'></textarea><button onclick='saveNote()'>Remember</button><pre id='noteResult'></pre></section>
<section><h2>Status</h2><pre id='status'>Loading…</pre></section>
<script>
async function send(){let m=document.getElementById('msg').value;let o=document.getElementById('reply');o.textContent='Thinking…';try{let r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m})});let d=await r.json();o.textContent=d.reply||d.detail||'No response';}catch(e){o.textContent=String(e)}}
async function saveNote(){let c=document.getElementById('note').value;let r=await fetch('/api/memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:c})});document.getElementById('noteResult').textContent=JSON.stringify(await r.json())}
async function status(){let r=await fetch('/api/status');document.getElementById('status').textContent=JSON.stringify(await r.json(),null,2)}status();
</script></body></html>"""

@app.get("/api/status")
async def status():
    try:
        models = await llm.status()
        ollama = True
    except Exception as exc:
        models, ollama = [], False
        error = str(exc)
    return {"name":"ACI","version":"0.2.0","ollama_connected":ollama,"model":settings.model,"available_models":[m.get("name") for m in models],"affect":cognition.affect.as_dict(),"goals":memory.goals(),"error":None if ollama else error}

@app.post("/api/chat")
async def chat(body: ChatInput):
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

def main():
    uvicorn.run(app, host=settings.host, port=settings.port)

if __name__ == "__main__":
    main()
