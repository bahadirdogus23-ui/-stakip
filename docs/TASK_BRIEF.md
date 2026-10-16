# AutoMold 3D — Claude Code Task Brief

## Role & goal

You are building **AutoMold 3D**, an offline Windows desktop CAD app (Python) that imports a 3D model (STL/OBJ/3MF), generates a **true negative mold cavity** via Boolean difference, splits it into demoldable parts with registration pins, optionally adds a pour spout and air vents, validates the geometry, and exports each part as a separate STL.

A box drawn around the object is NOT a mold. The cavity must be `MoldBody − PositiveModel` via a real Boolean operation.

## Fixed decisions (do not ask about these)

- **Use cases:** support both (a) making a silicone mold *of* an object (printed mold box / mother mold), and (b) cavity molds into which plaster, resin or concrete is cast. Expose this as a project setting `cast_mode: "silicone_mold" | "cast_into_mold"`; it only changes defaults (wall thickness, spout size, vent count).
- **Inputs:** STL (binary + ASCII), OBJ, 3MF required. PLY optional. STEP optional — only if CadQuery imports cleanly; otherwise disable the menu item and say so in README.
- **Workflow:** automatic suggestions + full manual editing (user can always override the parting plane, pin positions, spout and vents).
- **Platform:** Windows 10/11 desktop, fully offline. Must also run on Linux for CI/tests.
- **Language:** All UI text, error messages, README and user manual in **Turkish**. Code, identifiers, comments and commit messages in English.

## Tech stack

- Python 3.12
- UI: PySide6 + pyvistaqt (PyVista/VTK viewport)
- Mesh: trimesh, numpy
- Booleans: manifold3d (primary). Wrap every Boolean in `core/boolean_engine.py` with: input validation → manifold3d → on failure, try repair + retry → on failure, return a structured error. Never assume a Boolean succeeded; check result is non-empty, watertight, and volume is plausible.
- Optional CAD kernel: cadquery (STEP only). Must be an optional import; app must start without it.
- Project files: JSON (`.amproj`). Recent-projects list: SQLite.
- Tests: pytest. Lint: ruff.
- Pin all versions in `requirements.txt` after verifying they install together.

## Architecture

```
automold3d/
  main.py
  ui/                     # main_window, panels, viewport, dialogs, worker threads
  core/
    importer.py           # load + unit confirmation; never modify source file
    mesh_validation.py    # watertight, normals, degenerate/duplicate faces, components, self-intersection; repair
    boolean_engine.py     # safe wrappers around manifold3d with fallback + error objects
    mold_generator.py     # outer body (box / cylinder / bbox-auto) + cavity subtraction
    demold_analysis.py    # undercut detection for a given pull direction; parting-plane suggestion
    splitter.py           # 1-part open, 2-part, N-part splitting
    alignment.py          # pins & sockets with clearance
    pouring.py            # spout + vents (off by default)
    geometry_checks.py    # post-operation QA, min wall thickness
    exporter.py           # STL/OBJ/3MF per part, PNG, JSON report
    project_manager.py    # save/load, undo/redo command stack
    params.py             # dataclasses for every parameter, units in mm
  tests/
    fixtures.py           # programmatic test meshes (sphere, cube, cylinder, torus, undercut shape, broken STL…)
  requirements.txt
  README.md               # Turkish install + usage
  run.bat / run.sh
```

Rules:
- `core/` must not import Qt. All geometry is testable headless.
- Long operations run in a `QThread` worker with progress and cancel; the UI never freezes.
- Logging to `logs/automold.log` (rotating). Every user-facing error has a Turkish message + a technical log entry.

## Geometry rules (hard constraints)

1. Never scale the model by default. Never silently grow/shrink the cavity.
2. Shrinkage, clearance and draft are separate, explicit parameters with default 0 for shrinkage.
3. Show real object dimensions and cavity dimensions separately.
4. If mesh volume cannot be computed (not watertight), stop and ask the user before proceeding.
5. Margins (distance from model bbox to outer wall) and minimum wall thickness are separate parameters. Compute the actual minimum remaining wall thickness (e.g. via signed distance sampling) and warn where it's below the limit.
6. Pins/sockets must stay outside the cavity with ≥ min wall thickness of material around them; reject placements that violate this.
7. Pin/socket fit uses a user clearance (default 0.2 mm on diameter).
8. Vents must be verified to connect cavity to the outside surface (ray/path check). Spout must actually reach the cavity.
9. If an offset or Boolean cannot be computed reliably, report failure. Never output invalid geometry silently.
10. Do not claim flow simulation. Air-trap suggestions are labelled "öneri" (highest local Z points relative to pour direction).
11. Never claim a mold is "üretime hazır" unless every QA check passed.
12. STL has no unit metadata: write the unit (mm) into the exported JSON report and filenames, e.g. `kalip_parca_1_mm.stl`.

## Mold modes

- **A — One-part open mold:** cavity opens toward the chosen pull direction. Run undercut analysis (faces whose normal · pull_dir < 0 that are occluded) and warn with highlighted faces.
- **B — Two-part mold:** parting plane on X/Y/Z or arbitrary angle + offset. Suggest a plane by scoring candidate planes on undercut area for both halves (not just through the centroid). Both halves must mate exactly; add pins on one half and sockets on the other.
- **C — N-part mold:** multiple user-defined planes, unique part IDs, assembly order, interference check between parts. Auto-generation is best-effort; when it fails, fall back to manual plane editing and say so.

## UI (Turkish)

- Menu: Dosya, Düzenle, Model, Kalıp, Görünüm, Araçlar, Yardım
- Left: Nesne ağacı · Center: 3D görünüm · Right: Parametreler · Bottom: Durum / Uyarılar / Hatalar
- Toolbar: Model İçe Aktar, Modeli Analiz Et, Negatif Kalıp Oluştur, Kalıbı Böl, Pimleri Oluştur, Döküm Ağzı Ekle, Hava Kanalları Ekle, Geometriyi Doğrula, Projeyi Kaydet, Dışa Aktar
- View toggles: pozitif model, negatif boşluk, dış gövde, montajlı, patlatılmış (adjustable gap), kesit, şeffaf, tel kafes, ölçüler, pim/kanal. Positive and cavity in different colors.
- Preview before every Boolean. Undo/redo for every operation.

## QA checks (`geometry_checks.py`)

After each operation, return a list of results with status `BAŞARILI | UYARI | HATA | MANUEL İNCELEME`:
empty geometry · watertight/valid · volume computable · expected part count · cavity enclosed · part boundaries correct · pins match sockets · spout/vents connected · min wall thickness · export→reimport round-trip valid.

## Build phases — complete in order, stop after each phase

For each phase: implement → write tests → run `ruff check .` and `pytest -q` → fix until green → print a short summary (what works, what's untested, known limits) → **wait for my "devam" before the next phase.**

**Phase 0 — Setup.** Create venv instructions, `requirements.txt`, project skeleton, logging, `run.bat`. Verify `python -c "import manifold3d, trimesh, pyvista, PySide6"` succeeds. Acceptance: empty main window opens.

**Phase 1 — Import & validation (headless).** importer + mesh_validation + test fixtures (sphere, cube, cylinder, multi-component, open-edge STL, high-poly ~500k tris). Acceptance: tests report correct dims, watertightness, components; source files untouched (hash check).

**Phase 2 — Negative cavity.** boolean_engine + mold_generator (box, cylinder, auto-bbox). Acceptance: for a cube and sphere, `vol(mold) ≈ vol(body) − vol(model)` within 0.5%; result watertight.

**Phase 3 — Splitting + pins.** Mode A and Mode B, demold_analysis, alignment. Acceptance: 2 halves produced; halves re-union ≈ original mold volume; each pin intersects its socket with exactly the set clearance; undercut test shape triggers a warning.

**Phase 4 — Export.** Per-part STL/OBJ/3MF, JSON report, PNG snapshot. Acceptance: export → reimport → still watertight with same triangle count and volume.

**Phase 5 — UI integration.** Wire Phases 1–4 into the PySide6 window with worker threads, undo/redo, project save/load. Acceptance: manual smoke test steps listed in README; app stays responsive on the 500k-tri fixture.

**Phase 6 — Pour spout & vents.** Off by default. Acceptance: connectivity tests pass; disconnected vent is reported as HATA.

**Phase 7 — N-part molds & advanced parting.** Acceptance: 3-part mold of the undercut fixture with interference check; graceful fallback message when auto fails.

**Phase 8 — Docs & packaging.** Turkish README + `KULLANIM_KILAVUZU.md`; optional PyInstaller build for Windows.

## Working rules for you (Claude Code)

- Ask me only when a decision is genuinely mine; otherwise pick a sensible default and note it.
- Do not mark a feature done unless its tests pass. Explicitly list anything untested.
- No mocks or stubs presented as working features. If something is a placeholder, label it `NotImplemented` and list it.
- Fix import errors and mismatched signatures before reporting a phase complete.
- Keep functions small and typed (type hints everywhere); parameters live in `core/params.py` dataclasses.
