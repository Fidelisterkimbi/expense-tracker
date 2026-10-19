"""API contracts used by the mobile client; isolated SQLite only."""
import os
import unittest
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
os.environ['JWT_SECRET_KEY'] = 'mobile-test-only-secret-key-at-least-32-characters'
from app import app, db

class MobileApiTests(unittest.TestCase):
    def setUp(self):
        context = app.app_context()
        context.push()
        self.addCleanup(context.pop)
        self.addCleanup(db.session.remove)
        self.assertEqual(db.engine.url.database, ':memory:')
        db.create_all()
        self.addCleanup(db.drop_all)
        self.client = app.test_client()
        self.client.post('/register', json={'username':'mobile','email':'mobile@example.test','password':'MobileTest123!'})
        token = self.client.post('/login', json={'email':'mobile@example.test','password':'MobileTest123!'}).get_json()['access_token']
        self.headers = {'Authorization':'Bearer '+token}

    def test_account_summary_separates_types_and_currencies(self):
        for currency, kind, amount in [('NGN','income',500),('NGN','expense',100),('USD','income',10)]:
            response = self.client.post('/expenses', headers=self.headers, json={'title':'Mobile','category':'Other','amount':amount,'currency':currency,'type':kind})
            self.assertEqual(response.status_code, 201)
        result = self.client.get('/accounts/summary', headers=self.headers).get_json()
        self.assertEqual(result['NGN'], {'income':500,'expenses':100,'balance':400})
        self.assertEqual(result['USD']['balance'], 10)

    def test_savings_goal_and_deposit_history(self):
        result = self.client.get('/savings', headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(result.get_json()['goal'])
        self.assertEqual(result.get_json()['deposits'], [])
        self.assertEqual(self.client.post('/savings/goal', headers=self.headers, json={'name':'Emergency','target_amount':1000}).status_code, 200)
        for currency, amount in [('NGN',200),('USD',5)]:
            result = self.client.post('/savings/deposit', headers=self.headers, json={'amount':amount,'currency':currency,'saving_date':'2026-10-19'})
            self.assertEqual(result.status_code, 201)
            self.assertEqual(result.get_json()['deposit']['status'], 'successful')
        result = self.client.get('/savings', headers=self.headers).get_json()
        self.assertEqual(result['goal']['name'], 'Emergency')
        self.assertEqual(len(result['deposits']), 2)
        accounts = self.client.get('/savings/accounts', headers=self.headers).get_json()
        self.assertEqual(accounts['NGN']['balance'], 200)
        self.assertEqual(accounts['USD']['balance'], 5)

    def test_profile_shape_and_upload_validation(self):
        result = self.client.get('/profile', headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.get_json()['username'], 'mobile')
        self.assertIsNone(result.get_json()['profile_picture'])
        result = self.client.post('/profile/picture', headers=self.headers)
        self.assertEqual(result.status_code, 400)
        self.assertIn('error', result.get_json())
