import requests
import pandas as pd
from datetime import datetime

# -----------------------------
# 1. CONNECT TO BASE44 BACKEND
# -----------------------------

BASE44_API_URL = "https://news-con-seen.com/api/tasks"   # Example endpoint
API_KEY = "YOUR_BASE44_API_KEY"  # Store in environment variable in production

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

response = requests.get(BASE44_API_URL, headers=headers)
tasks_raw = response.json()

# Convert to DataFrame
df = pd.DataFrame(tasks_raw)

# -----------------------------
# 2. TRANSFORM LAYER
# -----------------------------

# Convert dates
df["created_at"] = pd.to_datetime(df["created_at"])
df["completed_at"] = pd.to_datetime(df["completed_at"], errors="coerce")

# Derived fields
df["duration_days"] = (df["completed_at"] - df["created_at"]).dt.days
df["is_completed"] = df["status"] == "completed"
df["is_delayed"] = df["duration_days"] > 2
df["month"] = df["created_at"].dt.strftime("%B")

# -----------------------------
# 3. AGGREGATION FOR ANALYTICS
# -----------------------------

summary = df.groupby("enterprise_id").agg({
    "task_id": "count",
    "is_completed": "sum",
    "is_delayed": "sum",
    "duration_days": "mean"
}).rename(columns={
    "task_id": "total_tasks",
    "is_completed": "completed_tasks",
    "is_delayed": "delayed_tasks",
    "duration_days": "avg_duration_days"
}).reset_index()

print("\n=== RAW TASKS ===")
print(df.head())

print("\n=== TRANSFORMED SUMMARY ===")
print(summary)
