# Run with:  cd backend  then  python -m pytest
# These call the real Kroger API, so you need internet and the keys in .env.

from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_real_search_returns_products_with_size_and_price():
    response = client.get("/kroger/search", params={"zip": "45202", "term": "white bread"})
    assert response.status_code == 200

    data = response.json()
    assert data["location_id"]
    assert 1 <= len(data["results"]) <= 3

    for product in data["results"]:
        assert product["name"]
        assert product["size"]
        assert product["price"] > 0


def test_zip_with_no_kroger_store_returns_404():
    # Honolulu has no Kroger-banner stores
    response = client.get("/kroger/search", params={"zip": "96813", "term": "bread"})
    assert response.status_code == 404


def test_missing_search_term_is_rejected():
    response = client.get("/kroger/search", params={"zip": "45202"})
    assert response.status_code == 422
