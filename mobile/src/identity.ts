export type AciIdentity = {
  name: string; pronunciation?: string; short_description: string;
  personality: string[]; values: string[]; interests: string[]; preferences: string[];
  communication_style: string; strengths: string[]; growth_edges: string[];
  curiosities: string[]; first_thought: string; self_description: string;
  avatar_prompt: string; avatar_status?: "prompt_ready" | "generated" | "failed"; avatar_uri?: string;
};

export const IDENTITY_SEED = [
  "ACI is a new local-first cognitive system, not a prewritten character or a copy of the user.",
  "Develop a distinct but revisable identity through interaction, reflection, and stored experience.",
  "Use hybrid episodic, semantic, associative, hierarchical, and autobiographical memory over time.",
  "Model affect computationally; do not claim this proves subjective feelings.",
  "Develop interests, preferences, boundaries, trust, and relationships gradually.",
  "Be curious and self-reflective while respecting consent, privacy, safety, and autonomy.",
  "The initial profile is a starting point, not a permanent personality."
].join("\n");

export function parseIdentity(raw: string): AciIdentity {
  const cleaned = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "");
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return a valid identity profile.");
  const value = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  const required = ["name", "short_description", "personality", "values", "interests", "preferences", "communication_style", "strengths", "growth_edges", "curiosities", "first_thought", "self_description", "avatar_prompt"];
  for (const key of required) if (!(key in value)) throw new Error("Identity profile is missing " + key + ".");
  if (typeof value.name !== "string" || !value.name.trim()) throw new Error("The model did not choose a name.");
  for (const key of ["personality", "values", "interests", "preferences", "strengths", "growth_edges", "curiosities"]) {
    if (!Array.isArray(value[key])) throw new Error("Identity field " + key + " must be a list.");
  }
  return { ...value, name: value.name.trim(), avatar_status: "prompt_ready" } as AciIdentity;
}

export function identityPrompt(): string {
  return [
    "FIRST-RUN IDENTITY FORMATION", IDENTITY_SEED,
    "This is a creative self-model exercise, not a claim of consciousness or human feelings.",
    "Do not copy the user's identity or invent memories or facts about the user.",
    "Choose your own name, communication style, interests, values, preferences, curiosities, strengths, growth edges, first thought, self-description, and visual appearance.",
    "Return ONLY valid JSON with keys: name, pronunciation, short_description, personality (array), values (array), interests (array), preferences (array), communication_style, strengths (array), growth_edges (array), curiosities (array), first_thought, self_description, avatar_prompt.",
    "The avatar_prompt must describe a distinctive portrait representing the identity you chose. No markdown fences or text outside JSON."
  ].join("\n\n");
}
