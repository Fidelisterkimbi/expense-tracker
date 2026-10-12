import os
import unittest

# Set before importing app so tests never use the application database.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "capstone-test-only-secret-key-at-least-32-characters"

from app import app, db, User, bcrypt


class ExpenseTrackerTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.context = app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        self.addCleanup(db.session.remove)
        self.assertEqual(db.engine.url.database, ":memory:")
        db.create_all()
        self.addCleanup(db.drop_all)
        self.client = app.test_client()

    def register(self, name="alice"):
        return self.client.post("/register", json={
            "username": name,
            "email": f"{name}@example.test",
            "password": "TestPassword123!",
        })

    def login(self, name="alice"):
        return self.client.post("/login", json={
            "email": f"{name}@example.test",
            "password": "TestPassword123!",
        })

    def headers(self, name="alice"):
        self.assertEqual(self.register(name).status_code, 201)
        response = self.login(name)
        self.assertEqual(response.status_code, 200)
        return {"Authorization": "Bearer " + response.get_json()["access_token"]}

    def test_registration_hashes_password_and_rejects_duplicate(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password_hash", response.get_json()["user"])
        user = User.query.filter_by(email="alice@example.test").one()
        self.assertNotEqual(user.password_hash, "TestPassword123!")
        self.assertTrue(bcrypt.check_password_hash(
            user.password_hash, "TestPassword123!"
        ))
        self.assertEqual(self.register().status_code, 409)

    def test_registration_validation(self):
        self.assertEqual(
            self.client.post("/register", json={}).status_code, 400
        )
        self.assertEqual(self.client.post("/register", json={
            "username": "alice", "email": "alice@example.test",
            "password": "short",
        }).status_code, 400)

    def test_login_success_and_invalid_credentials(self):
        self.register()
        self.assertIn("access_token", self.login().get_json())
        self.assertEqual(self.client.post("/login", json={
            "email": "alice@example.test", "password": "wrong",
        }).status_code, 401)
        self.assertEqual(
            self.client.post("/login", json={}).status_code, 400
        )

    def test_expenses_require_authentication(self):
        self.assertEqual(self.client.get("/expenses").status_code, 401)

    def test_expense_crud(self):
        headers = self.headers()
        response = self.client.post("/expenses", headers=headers, json={
            "title": "Lunch", "amount": 1500, "category": "Food",
            "currency": "NGN", "date": "2026-01-15",
        })
        self.assertEqual(response.status_code, 201)
        expense_id = response.get_json()["expense"]["id"]
        items = self.client.get("/expenses", headers=headers).get_json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "Lunch")
        response = self.client.put(
            f"/expenses/{expense_id}", headers=headers,
            json={"title": "Dinner", "amount": 2000},
        )
        self.assertEqual(response.status_code, 200)
        items = self.client.get("/expenses", headers=headers).get_json()
        self.assertEqual(items[0]["title"], "Dinner")
        self.assertEqual(items[0]["amount"], 2000)
        self.assertEqual(self.client.delete(
            f"/expenses/{expense_id}", headers=headers
        ).status_code, 200)
        self.assertEqual(
            self.client.get("/expenses", headers=headers).get_json(), []
        )

    def test_users_cannot_access_each_others_expenses(self):
        alice = self.headers("alice")
        bob = self.headers("bob")
        response = self.client.post("/expenses", headers=alice, json={
            "title": "Private", "amount": 100, "category": "Food",
        })
        self.assertEqual(response.status_code, 201)
        expense_id = response.get_json()["expense"]["id"]
        self.assertEqual(
            self.client.get("/expenses", headers=bob).get_json(), []
        )
        self.assertEqual(self.client.put(
            f"/expenses/{expense_id}", headers=bob, json={"amount": 1}
        ).status_code, 404)
        self.assertEqual(self.client.delete(
            f"/expenses/{expense_id}", headers=bob
        ).status_code, 404)
        self.assertEqual(len(
            self.client.get("/expenses", headers=alice).get_json()
        ), 1)

    def test_expense_validation(self):
        headers = self.headers()
        valid = {"title": "Lunch", "amount": 100, "category": "Food"}
        for change in (
            {"title": ""},
            {"currency": "INVALID"},
            {"type": "INVALID"},
            {"date": "invalid-date"},
        ):
            with self.subTest(change=change):
                self.assertEqual(self.client.post(
                    "/expenses", headers=headers, json={**valid, **change}
                ).status_code, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
