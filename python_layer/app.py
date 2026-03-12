from fastapi import FastAPI

app = FastAPI()

@app.get("/task-summary")
def get_task_summary():
    return summary.to_dict(orient="records")
