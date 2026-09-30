import requests
from datetime import date, datetime, timedelta
import os
import secrets

from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from flask_bcrypt import Bcrypt
from werkzeug.utils import secure_filename
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)

load_dotenv()

app = Flask(__name__)
CORS(app)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

PROFILE_UPLOAD_FOLDER = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "uploads",
    "profiles"
)

ALLOWED_PROFILE_EXTENSIONS = {
    "jpg",
    "jpeg",
    "png",
    "webp"
}

app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

os.makedirs(
    PROFILE_UPLOAD_FOLDER,
    exist_ok=True
)



class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    profile_picture = db.Column(db.String(255), nullable=True)

    expenses = db.relationship(
        "Expense",
        backref="user",
        lazy=True,
        cascade="all, delete-orphan"
    )


class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    type = db.Column(db.String(20), nullable=False, default="expense")
    currency = db.Column(db.String(3), nullable=False, default="NGN")
    description = db.Column(db.String(255))
    date = db.Column(db.Date, nullable=False, default=date.today)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )


class SavingsGoal(db.Model):
    __tablename__ = "savings_goal"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, default="My Savings Goal")
    target_amount = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.Date, nullable=False, default=date.today)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )

    deposits = db.relationship(
        "SavingsDeposit",
        backref="goal",
        lazy=True,
        cascade="all, delete-orphan"
    )


class SavingsDeposit(db.Model):
    __tablename__ = "savings_deposit"

    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(3), nullable=False, default="NGN")
    saving_date = db.Column(db.Date, nullable=False, default=date.today)
    payment_reference = db.Column(db.String(150), unique=True)
    status = db.Column(db.String(30), nullable=False, default="pending")

    goal_id = db.Column(
        db.Integer,
        db.ForeignKey("savings_goal.id"),
        nullable=False
    )

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )


class SavingsPayment(db.Model):
    __tablename__ = "savings_payment"

    id = db.Column(db.Integer, primary_key=True)

    amount = db.Column(db.Float, nullable=False)

    reference = db.Column(
        db.String(100),
        unique=True,
        nullable=False
    )

    provider_reference = db.Column(
        db.String(150),
        unique=True,
        nullable=True
    )

    status = db.Column(
        db.String(30),
        nullable=False,
        default="pending"
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow
    )

    expires_at = db.Column(
        db.DateTime,
        nullable=False
    )

    paid_at = db.Column(
        db.DateTime,
        nullable=True
    )

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id"),
        nullable=False
    )

    goal_id = db.Column(
        db.Integer,
        db.ForeignKey("savings_goal.id"),
        nullable=False
    )


with app.app_context():
    db.create_all()


@app.route("/")
def home():
    return "Expense Tracker API is running!"


# -------------------------
# AUTHENTICATION
# -------------------------

@app.route("/register", methods=["POST"])
def register():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is required"}), 400

    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    if not username or not email or not password:
        return jsonify({
            "error": "Username, email and password are required"
        }), 400

    if len(password) < 6:
        return jsonify({
            "error": "Password must be at least 6 characters"
        }), 400

    existing_user = User.query.filter(
        (User.username == username) | (User.email == email)
    ).first()

    if existing_user:
        return jsonify({
            "error": "Username or email already exists"
        }), 409

    password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    user = User(
        username=username,
        email=email,
        password_hash=password_hash
    )

    db.session.add(user)
    db.session.commit()

    return jsonify({
        "message": "User registered successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    }), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is required"}), 400

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({
            "error": "Email and password are required"
        }), 400

    user = User.query.filter_by(email=email).first()

    if not user or not bcrypt.check_password_hash(
        user.password_hash,
        password
    ):
        return jsonify({
            "error": "Invalid email or password"
        }), 401

    access_token = create_access_token(identity=str(user.id))

    return jsonify({
        "message": "Login successful",
        "access_token": access_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    })


# -------------------------
# USER PROFILE
# -------------------------

def allowed_profile_picture(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower()
        in ALLOWED_PROFILE_EXTENSIONS
    )


@app.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    user_id = int(get_jwt_identity())

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 404

    picture_url = None

    if user.profile_picture:
        picture_url = (
            "/profile/picture/"
            + user.profile_picture
        )

    return jsonify({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "profile_picture": picture_url
    }), 200


@app.route("/profile/picture", methods=["POST"])
@jwt_required()
def upload_profile_picture():
    user_id = int(get_jwt_identity())

    user = db.session.get(User, user_id)

    if not user:
        return jsonify({
            "error": "User not found"
        }), 404

    if "picture" not in request.files:
        return jsonify({
            "error": "Please select a profile picture"
        }), 400

    picture = request.files["picture"]

    if not picture or not picture.filename:
        return jsonify({
            "error": "Please select a profile picture"
        }), 400

    if not allowed_profile_picture(picture.filename):
        return jsonify({
            "error": "Only JPG, JPEG, PNG and WEBP images are allowed"
        }), 400

    original_name = secure_filename(
        picture.filename
    )

    extension = original_name.rsplit(
        ".",
        1
    )[1].lower()

    filename = (
        f"user_{user.id}_"
        f"{secrets.token_hex(8)}."
        f"{extension}"
    )

    filepath = os.path.join(
        PROFILE_UPLOAD_FOLDER,
        filename
    )

    picture.save(filepath)

    old_picture = user.profile_picture

    user.profile_picture = filename
    db.session.commit()

    # Delete the previous picture after the
    # database has successfully been updated.
    if old_picture and old_picture != filename:
        old_path = os.path.join(
            PROFILE_UPLOAD_FOLDER,
            old_picture
        )

        try:
            if os.path.isfile(old_path):
                os.remove(old_path)
        except OSError:
            pass

    return jsonify({
        "message": "Profile picture updated successfully",
        "profile_picture": (
            "/profile/picture/" + filename
        )
    }), 200


@app.route(
    "/profile/picture/<path:filename>",
    methods=["GET"]
)
def serve_profile_picture(filename):
    return send_from_directory(
        PROFILE_UPLOAD_FOLDER,
        filename
    )


# -------------------------
# EXPENSES
# -------------------------

@app.route("/expenses", methods=["POST"])
@jwt_required()
def add_expense():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is required"}), 400

    if not data.get("title"):
        return jsonify({"error": "Title is required"}), 400

    if data.get("amount") is None:
        return jsonify({"error": "Amount is required"}), 400

    if not data.get("category"):
        return jsonify({"error": "Category is required"}), 400

    user_id = int(get_jwt_identity())

    transaction_date = date.today()

    if data.get("date"):
        try:
            transaction_date = datetime.strptime(
                data["date"],
                "%Y-%m-%d"
            ).date()
        except ValueError:
            return jsonify({
                "error": "Date must use YYYY-MM-DD format"
            }), 400

    transaction_type = data.get("type", "expense")

    if transaction_type not in ("income", "expense"):
        return jsonify({
            "error": "Type must be income or expense"
        }), 400

    currency = str(data.get("currency", "NGN")).upper()

    if currency not in ("NGN", "USD"):
        return jsonify({
            "error": "Currency must be NGN or USD"
        }), 400

    expense = Expense(
        title=data["title"],
        amount=data["amount"],
        category=data["category"],
        type=transaction_type,
        currency=currency,
        description=data.get("description"),
        date=transaction_date,
        user_id=user_id
    )

    db.session.add(expense)
    db.session.commit()

    return jsonify({
        "message": "Expense added successfully",
        "expense": {
            "id": expense.id,
            "title": expense.title,
            "amount": expense.amount,
            "category": expense.category,
            "type": expense.type,
            "currency": expense.currency,
            "description": expense.description,
            "date": expense.date.isoformat()
        }
    }), 201


@app.route("/expenses", methods=["GET"])
@jwt_required()
def get_expenses():
    user_id = int(get_jwt_identity())

    expenses = Expense.query.filter_by(user_id=user_id).all()

    return jsonify([
        {
            "id": expense.id,
            "title": expense.title,
            "amount": expense.amount,
            "category": expense.category,
            "type": expense.type,
            "currency": expense.currency,
            "description": expense.description,
            "date": expense.date.isoformat()
        }
        for expense in expenses
    ])


@app.route("/expenses/<int:id>", methods=["PUT"])
@jwt_required()
def update_expense(id):
    user_id = int(get_jwt_identity())

    expense = Expense.query.filter_by(
        id=id,
        user_id=user_id
    ).first_or_404()

    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is required"}), 400

    if data.get("title"):
        expense.title = data["title"]

    if data.get("amount") is not None:
        expense.amount = data["amount"]

    if data.get("category"):
        expense.category = data["category"]

    if data.get("type") in ("income", "expense"):
        expense.type = data["type"]

    if "currency" in data:
        currency = str(data["currency"]).upper()

        if currency not in ("NGN", "USD"):
            return jsonify({
                "error": "Currency must be NGN or USD"
            }), 400

        expense.currency = currency

    if data.get("date"):
        try:
            expense.date = datetime.strptime(
                data["date"],
                "%Y-%m-%d"
            ).date()
        except ValueError:
            return jsonify({
                "error": "Date must use YYYY-MM-DD format"
            }), 400

    if "description" in data:
        expense.description = data["description"]

    db.session.commit()

    return jsonify({
        "message": "Expense updated successfully",
        "expense": {
            "id": expense.id,
            "title": expense.title,
            "amount": expense.amount,
            "category": expense.category,
            "type": expense.type,
            "currency": expense.currency,
            "description": expense.description,
            "date": expense.date.isoformat()
        }
    })


@app.route("/expenses/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_expense(id):
    user_id = int(get_jwt_identity())

    expense = Expense.query.filter_by(
        id=id,
        user_id=user_id
    ).first_or_404()

    db.session.delete(expense)
    db.session.commit()

    return jsonify({
        "message": "Expense deleted successfully"
    })


@app.route("/expenses/summary", methods=["GET"])
@jwt_required()
def expense_summary():
    user_id = int(get_jwt_identity())

    expenses = Expense.query.filter_by(user_id=user_id).all()

    total = sum(expense.amount for expense in expenses)

    categories = {}

    for expense in expenses:
        categories[expense.category] = (
            categories.get(expense.category, 0) + expense.amount
        )

    return jsonify({
        "total_expenses": total,
        "number_of_expenses": len(expenses),
        "categories": categories
    })


# -------------------------
# SAVINGS
# -------------------------

@app.route("/savings/goal", methods=["POST"])
@jwt_required()
def create_savings_goal():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is required"}), 400

    name = data.get("name", "My Savings Goal")
    target_amount = data.get("target_amount")

    if target_amount is None:
        return jsonify({"error": "Target amount is required"}), 400

    try:
        target_amount = float(target_amount)
    except (TypeError, ValueError):
        return jsonify({"error": "Target amount must be a number"}), 400

    if target_amount <= 0:
        return jsonify({"error": "Target amount must be greater than zero"}), 400

    goal = SavingsGoal.query.filter_by(user_id=user_id).first()

    if goal:
        goal.name = name
        goal.target_amount = target_amount
    else:
        goal = SavingsGoal(
            name=name,
            target_amount=target_amount,
            user_id=user_id
        )
        db.session.add(goal)

    db.session.commit()

    return jsonify({
        "message": "Savings goal saved successfully",
        "goal": {
            "id": goal.id,
            "name": goal.name,
            "target_amount": goal.target_amount,
            "created_at": goal.created_at.isoformat()
        }
    })


@app.route("/savings", methods=["GET"])
@jwt_required()
def get_savings():
    user_id = int(get_jwt_identity())

    goal = SavingsGoal.query.filter_by(user_id=user_id).first()

    if not goal:
        return jsonify({
            "goal": None,
            "total_saved": 0,
            "remaining": 0,
            "progress": 0,
            "deposits": [],
            "payment_account": {
                "bank": "OPay",
                "account_number": "9127594805",
                "account_name": "FIDELIS TERKIMBI SANJO"
            }
        })

    deposits = SavingsDeposit.query.filter_by(
        user_id=user_id,
        goal_id=goal.id,
        status="successful"
    ).order_by(SavingsDeposit.saving_date.desc()).all()

    total_saved = sum(deposit.amount for deposit in deposits)
    remaining = max(goal.target_amount - total_saved, 0)

    progress = (
        min((total_saved / goal.target_amount) * 100, 100)
        if goal.target_amount > 0
        else 0
    )

    return jsonify({
        "goal": {
            "id": goal.id,
            "name": goal.name,
            "target_amount": goal.target_amount,
            "created_at": goal.created_at.isoformat()
        },
        "total_saved": total_saved,
        "remaining": remaining,
        "progress": round(progress, 2),
        "payment_account": {
            "bank": "OPay",
            "account_number": "9127594805",
            "account_name": "FIDELIS TERKIMBI SANJO"
        },
        "deposits": [
            {
                "id": deposit.id,
                "amount": deposit.amount,
                "currency": deposit.currency or "NGN",
                "saving_date": deposit.saving_date.isoformat(),
                "payment_reference": deposit.payment_reference,
                "status": deposit.status
            }
            for deposit in deposits
        ]
    })


# -------------------------
# RECORD SAVINGS DEPOSIT
# -------------------------

@app.route("/savings/deposit", methods=["POST"])
@jwt_required()
def record_savings_deposit():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is required"}), 400

    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Amount must be a number"}), 400

    if amount <= 0:
        return jsonify({
            "error": "Amount must be greater than zero"
        }), 400

    currency = str(
        data.get("currency", "NGN")
    ).upper()

    if currency not in ("NGN", "USD"):
        return jsonify({
            "error": "Currency must be NGN or USD"
        }), 400

    goal = SavingsGoal.query.filter_by(
        user_id=user_id
    ).first()

    if not goal:
        return jsonify({
            "error": "Create a savings goal first"
        }), 400

    saving_date_value = data.get("saving_date")

    if saving_date_value:
        try:
            deposit_date = datetime.strptime(
                saving_date_value,
                "%Y-%m-%d"
            ).date()
        except ValueError:
            return jsonify({
                "error": "Saving date must be YYYY-MM-DD"
            }), 400
    else:
        deposit_date = date.today()

    reference = "MANUAL-" + secrets.token_hex(8).upper()

    deposit = SavingsDeposit(
        amount=amount,
        currency=currency,
        saving_date=deposit_date,
        payment_reference=reference,
        status="successful",
        user_id=user_id,
        goal_id=goal.id
    )

    db.session.add(deposit)
    db.session.commit()

    return jsonify({
        "message": "Saving recorded successfully",
        "deposit": {
            "id": deposit.id,
            "amount": deposit.amount,
            "currency": deposit.currency,
            "saving_date": deposit.saving_date.isoformat(),
            "payment_reference": deposit.payment_reference,
            "status": deposit.status
        }
    }), 201


# -------------------------
# GET SAVINGS GOAL
# -------------------------

@app.route("/savings/goal", methods=["GET"])
@jwt_required()
def get_savings_goal():
    user_id = int(get_jwt_identity())

    goal = SavingsGoal.query.filter_by(
        user_id=user_id
    ).first()

    if not goal:
        return jsonify({
            "goal": None,
            "message": "No savings goal found"
        }), 404

    deposits = SavingsDeposit.query.filter_by(
        user_id=user_id,
        goal_id=goal.id,
        status="successful"
    ).all()

    amount_saved = sum(
        deposit.amount for deposit in deposits
    )

    remaining = max(
        goal.target_amount - amount_saved,
        0
    )

    progress = (
        (amount_saved / goal.target_amount) * 100
        if goal.target_amount > 0
        else 0
    )

    return jsonify({
        "goal": {
            "id": goal.id,
            "name": goal.name,
            "target_amount": goal.target_amount,
            "amount_saved": amount_saved,
            "remaining": remaining,
            "progress": round(min(progress, 100), 2),
            "created_at": goal.created_at.isoformat()
        }
    }), 200



# -------------------------
# SAVINGS ACCOUNTS
# -------------------------

@app.route("/savings/accounts", methods=["GET"])
@jwt_required()
def savings_accounts():
    user_id = int(get_jwt_identity())

    deposits = SavingsDeposit.query.filter_by(
        user_id=user_id,
        status="successful"
    ).all()

    accounts = {
        "NGN": {
            "balance": 0.0,
            "deposit_count": 0
        },
        "USD": {
            "balance": 0.0,
            "deposit_count": 0
        }
    }

    for deposit in deposits:
        currency = (
            deposit.currency or "NGN"
        ).upper()

        if currency not in accounts:
            continue

        accounts[currency]["balance"] += float(
            deposit.amount
        )

        accounts[currency]["deposit_count"] += 1

    for account in accounts.values():
        account["balance"] = round(
            account["balance"],
            2
        )

    return jsonify(accounts), 200


# -------------------------
# MONTHLY SAVINGS STATISTICS
# -------------------------

@app.route(
    "/savings/statistics/monthly",
    methods=["GET"]
)
@jwt_required()
def monthly_savings_statistics():
    user_id = int(get_jwt_identity())

    currency = request.args.get(
        "currency",
        "NGN"
    ).upper()

    if currency not in ("NGN", "USD"):
        return jsonify({
            "error": "Currency must be NGN or USD"
        }), 400

    today = date.today()

    try:
        start_year = int(
            request.args.get(
                "start_year",
                today.year
            )
        )

        start_month = int(
            request.args.get(
                "start_month",
                1
            )
        )

        end_year = int(
            request.args.get(
                "end_year",
                today.year
            )
        )

        end_month = int(
            request.args.get(
                "end_month",
                today.month
            )
        )

        start_date = date(
            start_year,
            start_month,
            1
        )

        if end_month == 12:
            end_date = date(
                end_year + 1,
                1,
                1
            )
        else:
            end_date = date(
                end_year,
                end_month + 1,
                1
            )

    except (TypeError, ValueError):
        return jsonify({
            "error": "Invalid statistics date range"
        }), 400

    if start_date >= end_date:
        return jsonify({
            "error":
                "Start month must not be after end month"
        }), 400

    deposits = SavingsDeposit.query.filter(
        SavingsDeposit.user_id == user_id,
        SavingsDeposit.status == "successful",
        SavingsDeposit.currency == currency,
        SavingsDeposit.saving_date >= start_date,
        SavingsDeposit.saving_date < end_date
    ).order_by(
        SavingsDeposit.saving_date.asc()
    ).all()

    months = []

    cursor_year = start_year
    cursor_month = start_month

    while (
        cursor_year < end_year
        or (
            cursor_year == end_year
            and cursor_month <= end_month
        )
    ):
        months.append({
            "year": cursor_year,
            "month": cursor_month,
            "label": date(
                cursor_year,
                cursor_month,
                1
            ).strftime("%b %Y"),
            "saved": 0.0,
            "deposit_count": 0
        })

        if cursor_month == 12:
            cursor_month = 1
            cursor_year += 1
        else:
            cursor_month += 1

    lookup = {
        (item["year"], item["month"]): item
        for item in months
    }

    for deposit in deposits:
        key = (
            deposit.saving_date.year,
            deposit.saving_date.month
        )

        month = lookup.get(key)

        if not month:
            continue

        month["saved"] += float(
            deposit.amount
        )

        month["deposit_count"] += 1

    total_saved = 0.0
    total_deposits = 0

    for month in months:
        month["saved"] = round(
            month["saved"],
            2
        )

        total_saved += month["saved"]
        total_deposits += month["deposit_count"]

    return jsonify({
        "currency": currency,

        "range": {
            "start": start_date.isoformat(),
            "end": date(
                end_year,
                end_month,
                1
            ).isoformat()
        },

        "summary": {
            "saved": round(
                total_saved,
                2
            ),
            "deposit_count": total_deposits
        },

        "months": months
    }), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
