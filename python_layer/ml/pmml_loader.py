"""
KNIME PMML Bridge
-----------------
Loads PMML files exported from KNIME Desktop and runs predictions
using pypmml.  Falls back gracefully if pypmml is not installed or
the PMML file has not yet been placed in ml/pmml/.

KNIME Desktop workflow → File → Export → PMML 4.x
Place the exported file in:  python_layer/ml/pmml/<model_name>.pmml

File naming convention:
  ml/pmml/retention_risk.pmml    ← retention-risk model
  ml/pmml/ltv_segmentation.pmml  ← ltv-segmentation model
  ml/pmml/staffing_forecast.pmml ← staffing-forecast model
  ml/pmml/shift_demand.pmml      ← shift-demand model

KNIME nodes that export compatible PMML:
  - Cox Regression Learner       → retention_risk.pmml
  - k-Means (PMML export)        → ltv_segmentation.pmml
  - Linear Regression Learner    → staffing_forecast.pmml
  - Gradient Boosted Trees       → shift_demand.pmml

When a PMML file is present, python_layer uses it for prediction
instead of re-training sklearn/Prophet/XGBoost on each request.
This makes predictions stable, auditable, and reproducible —
the model is trained once in KNIME, versioned as a PMML file,
and deployed as a static artefact.

If no PMML file exists, the sklearn/Prophet/XGBoost fallback
runs automatically with no code change required.
"""

import logging
from pathlib import Path
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

PMML_DIR = Path(__file__).parent / "pmml"

# Maps api model_name → pmml filename
MODEL_FILES: dict[str, str] = {
    "retention-risk":    "retention_risk.pmml",
    "ltv-segmentation":  "ltv_segmentation.pmml",
    "staffing-forecast": "staffing_forecast.pmml",
    "shift-demand":      "shift_demand.pmml",
}

# Cached model objects keyed by model_name
_cache: dict[str, object] = {}


def pmml_available(model_name: str) -> bool:
    """Return True if a PMML file exists for model_name."""
    fname = MODEL_FILES.get(model_name)
    if not fname:
        return False
    return (PMML_DIR / fname).exists()


def _load_model(model_name: str) -> Optional[object]:
    """Load and cache a pypmml Model for model_name."""
    if model_name in _cache:
        return _cache[model_name]

    fname = MODEL_FILES.get(model_name)
    if not fname:
        logger.warning("pmml_loader: unknown model_name=%s", model_name)
        return None

    pmml_path = PMML_DIR / fname
    if not pmml_path.exists():
        logger.debug("pmml_loader: %s not found — fallback to sklearn", pmml_path)
        return None

    try:
        from pypmml import Model
        model = Model.load(str(pmml_path))
        _cache[model_name] = model
        logger.info("pmml_loader: loaded %s from %s", model_name, pmml_path)
        return model
    except ImportError:
        logger.warning("pmml_loader: pypmml not installed — pip install pypmml")
        return None
    except Exception as e:
        logger.error("pmml_loader: failed to load %s — %s", pmml_path, e)
        return None


def predict_from_pmml(model_name: str, df: pd.DataFrame) -> Optional[pd.DataFrame]:
    """
    Run PMML prediction on df.

    Returns a DataFrame with the original columns plus KNIME prediction
    columns (e.g. 'predicted_class', 'probability_0', 'probability_1').
    Returns None if PMML is unavailable — caller falls back to sklearn.

    Usage in routes.py:
        pmml_result = predict_from_pmml("retention-risk", feature_df)
        if pmml_result is not None:
            return format_pmml_result(pmml_result)
        # else fall through to sklearn model
    """
    model = _load_model(model_name)
    if model is None:
        return None

    try:
        raw = model.predict(df)

        if isinstance(raw, pd.DataFrame):
            out = pd.concat(
                [df.reset_index(drop=True), raw.reset_index(drop=True)],
                axis=1,
            )
        else:
            out = df.copy()
            out["pmml_prediction"] = raw

        logger.info(
            "pmml_loader: %s PMML prediction complete — %d rows",
            model_name, len(out),
        )
        return out

    except Exception as e:
        logger.error("pmml_loader: %s prediction failed — %s", model_name, e)
        # Invalidate cache so next call retries the load
        _cache.pop(model_name, None)
        return None


def pmml_status() -> dict:
    """
    Return installation status for all PMML models.

    Used by GET /ml/pmml-status endpoint.
    Shows operators which KNIME models are deployed vs which
    are using the sklearn/Prophet/XGBoost fallback.
    """
    pypmml_installed = False
    try:
        import pypmml  # noqa
        pypmml_installed = True
    except ImportError:
        pass

    models = {}
    for name, fname in MODEL_FILES.items():
        path = PMML_DIR / fname
        models[name] = {
            "pmml_file":  fname,
            "installed":  path.exists(),
            "path":       str(path) if path.exists() else None,
            "source":     "knime_pmml" if path.exists() else "sklearn_fallback",
            "cached":     name in _cache,
        }

    return {
        "pmml_dir":        str(PMML_DIR),
        "pypmml_installed": pypmml_installed,
        "models":          models,
        "knime_guide":     (
            "1. Open KNIME Desktop  "
            "2. Build/train your model workflow  "
            "3. Add PMML Writer node at the end  "
            "4. Execute → right-click PMML Writer → Browse Output  "
            "5. Save the .pmml file to python_layer/ml/pmml/<model_name>.pmml  "
            "6. Restart python_layer (or it auto-reloads on next request)"
        ),
    }
