import numpy as np
import pytest

from automold3d.core.errors import ModelImportError
from automold3d.core.importer import file_sha256, load_model, step_supported, to_mm
from automold3d.tests import fixtures as fx


@pytest.mark.parametrize(
    ("name", "file_type"),
    [
        ("cube.stl", None),
        ("cube_ascii.stl", "stl_ascii"),
        ("cube.obj", None),
        ("cube.3mf", None),
        ("cube.ply", None),
    ],
)
def test_formats_load_with_correct_dimensions(tmp_path, name, file_type):
    path = fx.write_mesh(fx.cube(30.0), tmp_path / name, file_type)
    result = load_model(path)
    np.testing.assert_allclose(result.dimensions, [30, 30, 30], atol=1e-5)
    assert len(result.mesh.faces) == 12
    assert result.mesh.is_watertight


def test_ascii_stl_really_is_ascii(tmp_path):
    path = fx.write_mesh(fx.cube(), tmp_path / "a.stl", "stl_ascii")
    assert path.read_bytes().startswith(b"solid")


@pytest.mark.parametrize("name", ["s.stl", "s.obj", "s.3mf"])
def test_source_file_untouched(tmp_path, name):
    path = fx.write_mesh(fx.sphere(), tmp_path / name)
    before = file_sha256(path)
    mtime = path.stat().st_mtime_ns
    result = load_model(path)
    result.mesh.apply_scale(2.0)  # mutating the loaded mesh must not touch the file
    assert file_sha256(path) == before == result.source_sha256
    assert path.stat().st_mtime_ns == mtime


def test_3mf_reports_unit(tmp_path):
    result = load_model(fx.write_mesh(fx.cube(), tmp_path / "c.3mf"))
    assert result.detected_unit == "mm"


def test_stl_has_no_unit_and_warns(tmp_path):
    result = load_model(fx.write_mesh(fx.cube(), tmp_path / "c.stl"))
    assert result.detected_unit is None
    assert any("birim" in w.lower() for w in result.warnings)


def test_tiny_model_warns_about_metres(tmp_path):
    result = load_model(fx.write_mesh(fx.cube(0.05), tmp_path / "tiny.stl"))
    assert any("metre" in w for w in result.warnings)


def test_no_scaling_by_default(tmp_path):
    result = load_model(fx.write_mesh(fx.cube(12.5), tmp_path / "c.stl"))
    np.testing.assert_allclose(result.dimensions, [12.5] * 3, atol=1e-5)


def test_to_mm_returns_scaled_copy(tmp_path):
    result = load_model(fx.write_mesh(fx.cube(3.0), tmp_path / "c.stl"))
    scaled = to_mm(result.mesh, "cm")
    np.testing.assert_allclose(scaled.extents, [30, 30, 30], atol=1e-5)
    np.testing.assert_allclose(result.mesh.extents, [3, 3, 3], atol=1e-5)
    with pytest.raises(ModelImportError):
        to_mm(result.mesh, "furlong")


def test_broken_stl_raises_turkish_error(tmp_path):
    with pytest.raises(ModelImportError) as info:
        load_model(fx.write_broken_stl(tmp_path / "broken.stl"))
    assert "okunamadı" in info.value.user_message or "bulunamadı" in info.value.user_message


def test_empty_file(tmp_path):
    path = tmp_path / "empty.stl"
    path.write_bytes(b"")
    with pytest.raises(ModelImportError, match="boş"):
        load_model(path)


def test_unsupported_extension(tmp_path):
    path = tmp_path / "model.fbx"
    path.write_bytes(b"data")
    with pytest.raises(ModelImportError, match="Desteklenmeyen"):
        load_model(path)


def test_missing_file(tmp_path):
    with pytest.raises(ModelImportError, match="bulunamadı"):
        load_model(tmp_path / "nope.stl")


def test_step_without_cadquery(tmp_path):
    path = tmp_path / "part.step"
    path.write_text("ISO-10303-21;")
    if step_supported():
        pytest.skip("CadQuery installed")
    with pytest.raises(ModelImportError, match="STEP"):
        load_model(path)
