"""Negative mold generation: outer body minus the (optionally shrinkage-scaled) model."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import trimesh

from automold3d.core import geometry_checks as qa
from automold3d.core.boolean_engine import difference
from automold3d.core.errors import GeometryError
from automold3d.core.mold_body import BodySpec, body_for_model
from automold3d.core.params import MoldParams

log = logging.getLogger(__name__)


class ModelNotSolidError(GeometryError):
    """The model volume cannot be computed; the user must decide (repair or cancel)."""


@dataclass
class MoldResult:
    model: trimesh.Trimesh
    cavity_model: trimesh.Trimesh
    body_spec: BodySpec
    body: trimesh.Trimesh
    mold: trimesh.Trimesh
    checks: list[qa.CheckResult] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def object_dimensions(self) -> tuple[float, float, float]:
        return _dims(self.model)

    @property
    def cavity_dimensions(self) -> tuple[float, float, float]:
        return _dims(self.cavity_model)

    @property
    def outer_dimensions(self) -> tuple[float, float, float]:
        return self.body_spec.dimensions


def require_solid(model: trimesh.Trimesh) -> float:
    """Return the model volume or raise ModelNotSolidError (never guess a volume)."""
    if not (model.is_watertight and model.is_winding_consistent) or model.volume <= 0:
        raise ModelNotSolidError(
            "Modelin hacmi hesaplanamıyor (kapalı değil veya normaller ters). "
            "Devam etmeden önce modeli onarmak ister misiniz?",
            f"watertight={model.is_watertight} winding={model.is_winding_consistent}",
        )
    return float(model.volume)


def cavity_model(model: trimesh.Trimesh, params: MoldParams) -> trimesh.Trimesh:
    """The shape actually subtracted: the model itself unless shrinkage is set.

    Meshes are treated as immutable throughout the core, so sharing is safe.
    """
    factor = 1.0 + params.shrinkage_percent / 100.0
    if factor == 1.0:
        return model
    cavity = model.copy()
    center = model.bounds.mean(axis=0)
    cavity.apply_transform(trimesh.transformations.scale_matrix(factor, center))
    return cavity


def preview_body(model: trimesh.Trimesh, params: MoldParams) -> trimesh.Trimesh:
    """Outer body for preview before the Boolean is run."""
    _check_params(params)
    return body_for_model(cavity_model(model, params), params).to_mesh()


def generate_mold(model: trimesh.Trimesh, params: MoldParams) -> MoldResult:
    """Build MoldBody − Model with a real Boolean and run QA. Raises GeometryError on failure."""
    _check_params(params)
    require_solid(model)
    cavity = cavity_model(model, params)
    spec = body_for_model(cavity, params)
    body = spec.to_mesh()

    result = difference(body, cavity)
    mold = result.unwrap()
    out = MoldResult(
        model=model,
        cavity_model=cavity,
        body_spec=spec,
        body=body,
        mold=mold,
        warnings=list(result.warnings),
    )
    out.checks = run_mold_checks(out, params)
    log.info(
        "Mold generated: outer=%s cavity=%s checks=%s",
        spec.dimensions,
        out.cavity_dimensions,
        [(c.name, c.status.value) for c in out.checks],
    )
    return out


def run_mold_checks(result: MoldResult, params: MoldParams) -> list[qa.CheckResult]:
    mold = result.mold
    checks = [
        qa.check_not_empty(mold, "Kalıp"),
        qa.check_watertight(mold, "Kalıp"),
        qa.check_volume_computable(mold, "Kalıp"),
    ]
    if qa.has_errors(checks):
        return checks
    model_volume = float(result.cavity_model.volume)
    checks.append(
        qa.check_volume_balance(float(result.body.volume), model_volume, float(mold.volume))
    )
    checks.append(qa.check_cavity_enclosed(mold, model_volume))
    checks.append(
        qa.check_min_wall(result.cavity_model, result.body_spec, params.min_wall_thickness)
    )
    return checks


def _check_params(params: MoldParams) -> None:
    errors = params.validate()
    if errors:
        raise GeometryError(" ".join(errors), f"invalid params {params}")
    if params.draft_angle_deg != 0.0:
        raise GeometryError(
            "Kalıp çıkma açısı (draft) henüz desteklenmiyor; 0 olarak bırakın.",
            "NotImplemented: draft_angle_deg",
        )


def _dims(mesh: trimesh.Trimesh) -> tuple[float, float, float]:
    ext = np.asarray(mesh.extents, dtype=float)
    return (float(ext[0]), float(ext[1]), float(ext[2]))
