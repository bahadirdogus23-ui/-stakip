import json

import pytest

from automold3d.core import geometry_checks as qa
from automold3d.core.exporter import (
    REPORT_NAME,
    SNAPSHOT_NAME,
    ExportError,
    check_roundtrip,
    export_all,
    export_parts,
)
from automold3d.core.importer import load_model
from automold3d.core.mold_generator import generate_mold
from automold3d.core.params import MoldParams, PartingPlane, PinParams
from automold3d.core.splitter import one_part_open, two_part
from automold3d.tests import fixtures as fx


@pytest.fixture(scope="module")
def split():
    params = MoldParams()
    mold = generate_mold(fx.sphere(20.0), params)
    return two_part(mold, PartingPlane((0, 0, 1), 0.0), params, PinParams(count=4)), params


@pytest.mark.parametrize("file_format", ["stl", "obj", "3mf"])
def test_roundtrip_watertight_same_triangles_and_volume(tmp_path, split, file_format):
    result, _ = split
    exported = export_parts(result.parts, tmp_path, [file_format])
    assert len(exported) == 2
    for item, part in zip(exported, result.parts, strict=True):
        assert item.path.name == f"kalip_parca_{part.part_id}_mm.{file_format}"
        mesh = load_model(item.path).mesh
        assert mesh.is_watertight
        assert len(mesh.faces) == len(part.mesh.faces)
        assert mesh.volume == pytest.approx(part.mesh.volume, rel=1e-5)
        assert check_roundtrip(item).status is qa.CheckStatus.PASSED


def test_refuses_to_overwrite(tmp_path, split):
    result, _ = split
    export_parts(result.parts, tmp_path, ["stl"])
    with pytest.raises(ExportError, match="zaten var"):
        export_parts(result.parts, tmp_path, ["stl"])
    export_parts(result.parts, tmp_path, ["stl"], overwrite=True)


def test_unknown_format(tmp_path, split):
    with pytest.raises(ExportError, match="Desteklenmeyen"):
        export_parts(split[0].parts, tmp_path, ["fbx"])


def test_roundtrip_detects_tampered_file(tmp_path, split):
    exported = export_parts(split[0].parts, tmp_path, ["stl"])[0]
    data = exported.path.read_bytes()
    exported.path.write_bytes(data[: len(data) - 50 * 20])  # drop 20 triangles
    assert check_roundtrip(exported).status is qa.CheckStatus.ERROR


def test_export_all_writes_report_and_png(tmp_path, split):
    result, params = split
    report, exported = export_all(result, params, tmp_path, ["stl", "3mf"])
    assert len(exported) == 4
    saved = json.loads((tmp_path / REPORT_NAME).read_text(encoding="utf-8"))
    assert saved["birim"] == "mm"
    assert saved["kalip_modu"] == "B"
    assert saved["olculer_mm"]["nesne"] == pytest.approx([40, 40, 40], abs=0.1)
    assert saved["pimler"]["cap_boslugu_mm"] == pytest.approx(0.2)
    assert all(f["dosya"].endswith(("_mm.stl", "_mm.3mf")) for f in saved["dosyalar"])
    assert saved["uretime_hazir"] is True, [
        c for c in saved["kontroller"] if c["durum"] != "BAŞARILI"
    ]
    assert "üretime hazır" in saved["sonuc"]
    png = tmp_path / SNAPSHOT_NAME
    assert png.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


def test_report_not_ready_when_warnings(tmp_path):
    params = MoldParams()
    result = one_part_open(fx.inverted_mushroom(), params)
    report, _ = export_all(result, params, tmp_path, snapshot=False)
    assert report["uretime_hazir"] is False
    assert "sayılmaz" in report["sonuc"]
