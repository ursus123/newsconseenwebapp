from fastapi import APIRouter, Query
import httpx

router = APIRouter(prefix="/open-data/weather", tags=["Weather"])


@router.get("")
def get_weather(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
):
    """
    Proxy for Open-Meteo current weather.
    Frontend must never call Open-Meteo directly — all external API calls go through python_layer.
    """
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&current_weather=true"
        "&hourly=temperature_2m,precipitation_probability"
        "&forecast_days=1"
        "&wind_speed_unit=mph"
    )
    try:
        r = httpx.get(url, timeout=8)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e)}
