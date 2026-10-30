from aci.affect import AffectState

def test_affect_bounded():
    a = AffectState()
    for _ in range(100):
        a.update_from_interaction("great! urgent?")
    assert -1 <= a.valence <= 1
    assert 0 <= a.arousal <= 1
    assert 0 <= a.curiosity <= 1
