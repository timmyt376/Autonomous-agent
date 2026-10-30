from dataclasses import dataclass, asdict

@dataclass
class AffectState:
    valence: float = 0.0
    arousal: float = 0.2
    confidence: float = 0.5
    curiosity: float = 0.6

    def update_from_interaction(self, text: str):
        t = text.lower()
        if any(w in t for w in ("thanks", "great", "good", "awesome")):
            self.valence = min(1.0, self.valence + 0.08)
        if any(w in t for w in ("error", "broken", "wrong", "urgent")):
            self.arousal = min(1.0, self.arousal + 0.12)
        if "?" in text:
            self.curiosity = min(1.0, self.curiosity + 0.04)
        self.arousal = max(0.0, self.arousal * 0.96)
        self.curiosity = max(0.0, min(1.0, self.curiosity))
        self.valence = max(-1.0, min(1.0, self.valence))

    def as_dict(self):
        return asdict(self)
