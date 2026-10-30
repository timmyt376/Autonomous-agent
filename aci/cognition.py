from .affect import AffectState

SYSTEM_PROMPT = """You are ACI, a local-first cognitive assistant.
Be honest about uncertainty. Distinguish plans from completed actions.
You have persistent memory and a simulated affect state; do not claim consciousness,
human emotions, or experiences. Do not claim to have used tools unless they ran.
Ask before consequential external actions. Prefer small, verifiable steps."""

class Cognition:
    def __init__(self, llm, memory, max_context=12):
        self.llm, self.memory, self.max_context = llm, memory, max_context
        self.affect = AffectState()

    async def respond(self, text: str) -> str:
        self.affect.update_from_interaction(text)
        self.memory.add_message("user", text)
        memories = self.memory.search(text[:80], 4) if len(text) > 3 else []
        context = "\n".join(f"- {m['content']}" for m in memories)
        system = SYSTEM_PROMPT + f"\nInternal affect model: {self.affect.as_dict()}."
        if context:
            system += "\nPotentially relevant stored notes (verify relevance):\n" + context
        answer = await self.llm.chat(self.memory.recent_messages(self.max_context), system)
        self.memory.add_message("assistant", answer)
        return answer
