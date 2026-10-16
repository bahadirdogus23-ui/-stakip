"""`AutoMold3D --self-test`: verify an installation without opening the UI.

Runs import -> mold -> two-part split with pins -> export through the same geometry worker
process the UI uses, and prints a Turkish summary. Exit code 0 means every step passed.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import trimesh

from automold3d.core import geometry_checks as qa
from automold3d.core import pipeline
from automold3d.process_executor import ProcessExecutor


def run_self_test() -> int:
    executor = ProcessExecutor()
    try:
        with tempfile.TemporaryDirectory(prefix="automold_selftest_") as tmp:
            folder = Path(tmp)
            model_path = folder / "test_kure.stl"
            model_path.write_bytes(trimesh.creation.icosphere(3, radius=20.0).export("stl"))
            session = executor.call(pipeline.import_model, (model_path, "mm"))
            print(f"[1/4] İçe aktarma: {len(session.model.faces)} üçgen")
            session = executor.call(pipeline.build_mold, (session,))
            print(f"[2/4] Negatif kalıp: {qa.readiness_message(session.mold.checks)}")
            session = executor.call(pipeline.split, (session, True))
            print(
                f"[3/4] Bölme + pimler: {len(session.split.parts)} parça, "
                f"{len(session.split.pins.pins)} pim"
            )
            report, files = executor.call(
                pipeline.export, (session, folder / "cikti", ["stl", "3mf"], False, True)
            )
            print(f"[4/4] Dışa aktarma: {len(files)} dosya; {report['sonuc']}")
            ok = bool(report["uretime_hazir"])
    except Exception as exc:  # report any failure as a failed self-test
        print(f"KENDİ KENDİNİ TEST BAŞARISIZ: {exc}")
        return 1
    finally:
        executor.shutdown()
    print("KENDİ KENDİNİ TEST BAŞARILI" if ok else "KENDİ KENDİNİ TEST: kontrollerde sorun var")
    return 0 if ok else 1
