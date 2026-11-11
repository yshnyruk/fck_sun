from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def read_health() -> dict[str, str]:
    return {"status": "ok"}
