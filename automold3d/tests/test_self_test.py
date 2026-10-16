from automold3d.self_test import run_self_test


def test_self_test_passes(capsys):
    assert run_self_test() == 0
    out = capsys.readouterr().out
    assert "[4/4]" in out and "BAŞARILI" in out
