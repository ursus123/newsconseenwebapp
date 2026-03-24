from open_data.medication_routes   import router as medication_router
from open_data.healthcare_routes   import router as healthcare_router
from open_data.labor_routes        import router as labor_router
from open_data.demographics_routes import router as demographics_router
from open_data.geospatial_routes   import router as geospatial_router
from open_data.education_routes    import router as education_router
from open_data.agriculture_routes  import router as agriculture_router
from open_data.nonprofit_routes    import router as nonprofit_router
from open_data.market_routes       import router as market_router

ALL_ROUTERS = [
    medication_router,
    healthcare_router,
    labor_router,
    demographics_router,
    geospatial_router,
    education_router,
    agriculture_router,
    nonprofit_router,
    market_router,
]

__all__ = ["ALL_ROUTERS"]
