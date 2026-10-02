from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import kroger

app = FastAPI()

# Lets the website (a different address than this server) ask this server for data
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.get("/kroger/search")
def kroger_search(zip: str, term: str):
    location_id = kroger.find_nearest_location(zip)

    if location_id is None:
        raise HTTPException(status_code=404, detail="No Kroger-banner store near that zip code.")

    results = kroger.search_products(term, location_id)

    return {"location_id": location_id, "results": results}
