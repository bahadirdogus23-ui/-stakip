"""Analytic outer mold bodies (box / cylinder) with exact inside-distance queries."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import trimesh

from automold3d.core.errors import GeometryError
from automold3d.core.params import BodyShape, MoldParams


@dataclass(frozen=True)
class BodySpec:
    """Box: lo/hi corners. Cylinder: Z axis through `center`, `radius`, z range lo[2]..hi[2]."""

    shape: BodyShape
    lo: tuple[float, float, float]
    hi: tuple[float, float, float]
    center: tuple[float, float] = (0.0, 0.0)
    radius: float = 0.0
    sections: int = 128

    @property
    def is_cylinder(self) -> bool:
        return self.shape is BodyShape.CYLINDER

    @property
    def dimensions(self) -> tuple[float, float, float]:
        lo, hi = np.asarray(self.lo), np.asarray(self.hi)
        dims = hi - lo
        return (float(dims[0]), float(dims[1]), float(dims[2]))

    def to_mesh(self) -> trimesh.Trimesh:
        lo, hi = np.asarray(self.lo), np.asarray(self.hi)
        if self.is_cylinder:
            height = float(hi[2] - lo[2])
            mesh = trimesh.creation.cylinder(
                radius=self.radius, height=height, sections=self.sections
            )
            mesh.apply_translation((self.center[0], self.center[1], (lo[2] + hi[2]) / 2))
            return mesh
        return trimesh.creation.box(bounds=np.vstack([lo, hi]))

    def inside_distance(self, points: np.ndarray, open_top: bool = False) -> np.ndarray:
        """Distance from each point to the outer wall; negative when the point is outside.

        open_top ignores the top face (one-part open molds).
        """
        pts = np.asarray(points, dtype=float)
        lo, hi = np.asarray(self.lo), np.asarray(self.hi)
        z_dist = pts[:, 2] - lo[2] if open_top else np.minimum(pts[:, 2] - lo[2], hi[2] - pts[:, 2])
        if self.is_cylinder:
            # The polygonal cylinder is inscribed; its apothem is the true minimum radius.
            apothem = self.radius * np.cos(np.pi / self.sections)
            r_xy = np.linalg.norm(pts[:, :2] - np.asarray(self.center), axis=1)
            return np.minimum(apothem - r_xy, z_dist)
        xy_dist = np.minimum(pts[:, :2] - lo[:2], hi[:2] - pts[:, :2]).min(axis=1)
        return np.minimum(xy_dist, z_dist)


def body_for_model(model: trimesh.Trimesh, params: MoldParams) -> BodySpec:
    """Outer body sized from the model bounding box and the margins."""
    lo, hi = np.asarray(model.bounds, dtype=float)
    side, top, bottom = params.margin_side, params.margin_top, params.margin_bottom
    if params.body_shape is BodyShape.AUTO_BOX:
        return BodySpec(
            BodyShape.AUTO_BOX, _t(lo - [side, side, bottom]), _t(hi + [side, side, top])
        )
    if params.body_shape is BodyShape.BOX:
        if params.box_size is None:
            raise GeometryError("Kutu gövde için dış ölçüler girilmeli.", "box_size is None")
        center = (lo + hi) / 2
        half = np.asarray(params.box_size, dtype=float) / 2
        spec = BodySpec(BodyShape.BOX, _t(center - half), _t(center + half))
        if spec.inside_distance(np.asarray(model.vertices)).min() < 0:
            raise GeometryError(
                "Girilen kutu ölçüleri modeli tamamen içine almıyor.",
                f"box_size={params.box_size} model extents={model.extents.tolist()}",
            )
        return spec
    center_xy = (lo[:2] + hi[:2]) / 2
    max_r = float(np.linalg.norm(np.asarray(model.vertices)[:, :2] - center_xy, axis=1).max())
    # Circumradius chosen so that the inscribed polygon still clears the model by margin_side.
    radius = (max_r + side) / np.cos(np.pi / params.cylinder_sections)
    return BodySpec(
        BodyShape.CYLINDER,
        _t(np.array([center_xy[0] - radius, center_xy[1] - radius, lo[2] - bottom])),
        _t(np.array([center_xy[0] + radius, center_xy[1] + radius, hi[2] + top])),
        center=(float(center_xy[0]), float(center_xy[1])),
        radius=float(radius),
        sections=params.cylinder_sections,
    )


def _t(values: np.ndarray | list[float]) -> tuple[float, float, float]:
    arr = np.asarray(values, dtype=float)
    return (float(arr[0]), float(arr[1]), float(arr[2]))
