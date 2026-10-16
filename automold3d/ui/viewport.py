"""3D viewport: draws the current session according to the view options."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pyvista as pv
import trimesh
from PySide6.QtWidgets import QVBoxLayout, QWidget
from pyvistaqt import QtInteractor

from automold3d.core.exporter import PART_COLORS, exploded_offsets
from automold3d.core.params import PartingPlane
from automold3d.core.splitter import MoldPart

MODEL_COLOR = "#d8c9a8"
CAVITY_COLOR = "#e0564f"
BODY_COLOR = "#7fa7d9"
UNDERCUT_COLOR = "#ff2020"
PLANE_COLOR = "#ffd84d"
CHANNEL_COLOR = "#30d0d0"


@dataclass
class ViewOptions:
    """Turkish menu: pozitif model, negatif boşluk, dış gövde, montajlı/patlatılmış, kesit,
    şeffaf, tel kafes, ölçüler, pim/kanal."""

    show_model: bool = True
    show_cavity: bool = True
    show_body: bool = True
    exploded: bool = False
    explode_gap: float = 20.0
    section: bool = False
    transparent: bool = True
    wireframe: bool = False
    dimensions: bool = False
    show_pins: bool = True


@dataclass
class Scene:
    model: trimesh.Trimesh | None = None
    cavity: trimesh.Trimesh | None = None
    body_preview: trimesh.Trimesh | None = None
    mold: trimesh.Trimesh | None = None
    parts: list[MoldPart] = field(default_factory=list)
    pins: list[trimesh.Trimesh] = field(default_factory=list)
    channels: list[trimesh.Trimesh] = field(default_factory=list)
    undercut_mask: np.ndarray | None = None
    planes: list[PartingPlane] = field(default_factory=list)
    markers: list[tuple[float, float, float]] = field(default_factory=list)


class Viewport(QWidget):
    """Central 3D view. Holds a single PyVista interactor."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        # No periodic auto-update: we render explicitly after every scene change, and timed
        # re-renders of a large mesh would stall the UI.
        self.plotter = QtInteractor(self, auto_update=False)
        self.plotter.set_background("#2b2b2b", top="#4a4a4a")
        self.plotter.add_axes()
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.plotter.interactor)
        self.scene = Scene()
        self.options = ViewOptions()
        self._cache: dict[int, tuple[trimesh.Trimesh, pv.PolyData]] = {}
        self._has_camera = False

    def _poly(self, mesh: trimesh.Trimesh) -> pv.PolyData:
        hit = self._cache.get(id(mesh))
        if hit is not None and hit[0] is mesh:
            return hit[1]
        if len(self._cache) > 64:
            self._cache.clear()
        poly = pv.wrap(mesh)
        self._cache[id(mesh)] = (mesh, poly)
        return poly

    def show_scene(self, scene: Scene, reset_camera: bool = False) -> None:
        self.scene = scene
        self.render_scene(reset_camera)

    def set_options(self, options: ViewOptions) -> None:
        self.options = options
        self.render_scene()

    def render_scene(self, reset_camera: bool = False) -> None:
        p, o, s = self.plotter, self.options, self.scene
        # Everything is added with render=False and drawn once at the end.
        p.clear_actors()
        p.remove_bounds_axes()
        style = "wireframe" if o.wireframe else "surface"
        opacity = 0.45 if o.transparent else 1.0
        clip = self._clip_origin() if o.section else None

        pin_offset = np.zeros(3)
        if s.parts:
            offsets = (
                exploded_offsets(s.parts, o.explode_gap)
                if o.exploded
                else [np.zeros(3)] * len(s.parts)
            )
            for i, (part, offset) in enumerate(zip(s.parts, offsets, strict=True)):
                self._add(
                    part.mesh,
                    PART_COLORS[i % len(PART_COLORS)],
                    opacity,
                    style,
                    clip,
                    offset,
                    name=f"part_{part.part_id}",
                )
            pin_offset = offsets[0]  # pins belong to part 1
        elif s.mold is not None and o.show_body:
            self._add(s.mold, BODY_COLOR, opacity, style, clip, name="mold")
        elif s.body_preview is not None and o.show_body:
            self._add(s.body_preview, BODY_COLOR, 0.15, "wireframe", None, name="body_preview")

        if o.show_cavity and s.cavity is not None and (s.mold is not None or s.parts):
            self._add(s.cavity, CAVITY_COLOR, 0.9, style, clip, name="cavity")
        elif o.show_model and s.model is not None:
            self._add(s.model, MODEL_COLOR, 1.0, style, clip, name="model")
        if s.undercut_mask is not None and s.cavity is not None and s.undercut_mask.any():
            marked = s.cavity.submesh([np.flatnonzero(s.undercut_mask)], append=True)
            self._add(marked, UNDERCUT_COLOR, 1.0, "surface", clip, name="undercut")
        if o.show_pins:
            for i, mesh in enumerate(s.pins):
                self._add(mesh, CHANNEL_COLOR, 1.0, style, clip, pin_offset, name=f"pin_{i}")
            for i, mesh in enumerate(s.channels):
                self._add(mesh, CHANNEL_COLOR, 1.0, style, clip, name=f"channel_{i}")
            for i, point in enumerate(s.markers):
                p.add_mesh(
                    pv.Sphere(radius=self._marker_radius(), center=point),
                    color=CHANNEL_COLOR,
                    name=f"marker_{i}",
                    render=False,
                )
        if not s.parts:
            for i, plane in enumerate(s.planes):
                self._add_plane(plane, f"plane_{i}")
        if o.dimensions and (s.model is not None or s.parts):
            p.show_bounds(
                grid=False,
                location="outer",
                xtitle="X (mm)",
                ytitle="Y (mm)",
                ztitle="Z (mm)",
                color="white",
                render=False,
            )
        if reset_camera or not self._has_camera:
            p.reset_camera(render=False)
            self._has_camera = s.model is not None
        p.render()

    def _add(
        self,
        mesh: trimesh.Trimesh,
        color: str,
        opacity: float,
        style: str,
        clip: np.ndarray | None,
        offset: np.ndarray | None = None,
        name: str = "",
    ) -> None:
        poly = self._poly(mesh)
        if offset is not None and np.any(offset):
            poly = poly.translate(offset, inplace=False)
        if clip is not None:
            poly = poly.clip(normal="y", origin=clip)
            if poly.n_points == 0:
                return
        self.plotter.add_mesh(
            poly,
            color=color,
            opacity=opacity,
            style=style,
            name=name,
            smooth_shading=False,
            render=False,
        )

    def _add_plane(self, plane: PartingPlane, name: str) -> None:
        ref = _first(self.scene.body_preview, self.scene.mold, self.scene.model)
        if ref is None:
            return
        n = np.asarray(plane.unit_normal())
        size = float(np.linalg.norm(ref.extents)) * 1.2
        centre = ref.bounds.mean(axis=0)
        centre = centre - (centre @ n - plane.offset) * n
        self.plotter.add_mesh(
            pv.Plane(center=centre, direction=n, i_size=size, j_size=size),
            color=PLANE_COLOR,
            opacity=0.35,
            name=name,
            render=False,
        )

    def _clip_origin(self) -> np.ndarray | None:
        ref = _first(self.scene.mold, self.scene.model)
        if self.scene.parts:
            ref = self.scene.parts[0].mesh
        return None if ref is None else ref.bounds.mean(axis=0)

    def _marker_radius(self) -> float:
        ref = self.scene.model
        return 1.0 if ref is None else max(float(np.linalg.norm(ref.extents)) * 0.01, 0.3)

    def screenshot(self) -> np.ndarray:
        return self.plotter.screenshot(return_img=True)

    def shutdown(self) -> None:
        """Release VTK resources; must be called before the window is destroyed."""
        self.plotter.close()


def _first(*meshes: trimesh.Trimesh | None) -> trimesh.Trimesh | None:
    return next((m for m in meshes if m is not None), None)
