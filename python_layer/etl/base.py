import requests
import pandas as pd
from ..config import HEADERS


def fetch_json_to_df(url: str) -> pd.DataFrame:
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    data = resp.json()
    return pd.DataFrame(data)
