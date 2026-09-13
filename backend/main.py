import os
import re
import unicodedata
import logging
import html
import json
import hashlib
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Optional, List, Literal

from fastapi import FastAPI, HTTPException, Depends, Header, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from sqlalchemy import (
    create_engine, Column, Integer, String, DateTime,
    func, text, Text, ForeignKey, Float
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from passlib.context import CryptContext
from jose import jwt, JWTError
from dotenv import load_dotenv
from google.cloud import translate_v2 as translate
from textblob import TextBlob

# ============================== CONFIG ====================================

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///wheretocofi.db")
SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5").strip()
OPENAI_TIMEOUT_SECONDS = int(os.getenv("OPENAI_TIMEOUT_SECONDS", "30"))

BASE_DIR = os.path.dirname(__file__)
UPLOAD_ROOT = os.path.join(BASE_DIR, "uploads")
CAFE_UPLOAD_DIR = os.path.join(UPLOAD_ROOT, "cafes")
os.makedirs(CAFE_UPLOAD_DIR, exist_ok=True)

# admin
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
ADMIN_PRENUME = os.getenv("ADMIN_PRENUME", "Admin")
ADMIN_NUME = os.getenv("ADMIN_NUME", "User")

# logging (optional but cleaner than print)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wheretocofi")

# =========================== DATABASE SETUP ===============================

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

# =========================== TABLES =======================================

class Cafegii(Base):
    __tablename__ = "cafegii"

    id = Column(Integer, primary_key=True, autoincrement=True)
    prenume = Column(String(50), nullable=False)
    nume = Column(String(50), nullable=False)
    mail = Column(String(120), nullable=False, unique=True, index=True)
    parola = Column(String(255), nullable=False)
    role = Column(String(255), nullable=False, server_default="user")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class Cafenele(Base):
    __tablename__ = "cafenele"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(80), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    city = Column(String(80), nullable=False, default="Bucuresti")
    address = Column(String(255), nullable=False)
    area = Column(String(255), nullable=True)       # ex: „ParkLake”, „Titan”
    tags = Column(String(255), nullable=True)       # ex: „specialty, nordic”
    hours_text = Column(String(255))
    about_text = Column(Text)
    menu_text = Column(Text)
    products_text = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("cafegii.id"), nullable=True)  # guest allowed
    cafe_id = Column(Integer, ForeignKey("cafenele.id"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1–5
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    guest_first_name = Column(String(50), nullable=True)
    guest_last_name = Column(String(50), nullable=True)
    receipt_number = Column(String(80), nullable=False)
    purchased_items = Column(Text, nullable=False)

    lang = Column(String(10), nullable=True)
    comment_ro = Column(Text, nullable=True)
    comment_en = Column(Text, nullable=True)

    sentiment_label = Column(String(20), nullable=True)
    sentiment_score = Column(Float, nullable=True)

    translated_at = Column(String(40), nullable=True)
    translation_provider = Column(String(40), nullable=True)


class Cafecito(Base):
    __tablename__ = "cafecitos"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("cafegii.id"), nullable=False)
    cafe_id = Column(Integer, ForeignKey("cafenele.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class CafePhoto(Base):
    __tablename__ = "cafe_photos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cafe_id = Column(Integer, ForeignKey("cafenele.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("cafegii.id"), nullable=False, index=True)
    image_url = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=True)
    mime_type = Column(String(80), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    caption = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

Base.metadata.create_all(bind=engine)

# ========================= MINI MIGRATIONS SQLITE =========================

with engine.begin() as conn:
    if "sqlite" in DATABASE_URL:
        # role în cafegii
        cols = conn.execute(text("PRAGMA table_info(cafegii);")).all()
        names = {c[1] for c in cols}
        if "role" not in names:
            conn.execute(text("ALTER TABLE cafegii ADD COLUMN role TEXT NOT NULL DEFAULT 'user';"))

        # area, tags în cafenele
        cols_caf = conn.execute(text("PRAGMA table_info(cafenele);")).all()
        names_caf = {c[1] for c in cols_caf}
        if "area" not in names_caf:
            conn.execute(text("ALTER TABLE cafenele ADD COLUMN area TEXT;"))
        if "tags" not in names_caf:
            conn.execute(text("ALTER TABLE cafenele ADD COLUMN tags TEXT;"))

        
        # guest + bon + translate + sentiment în reviews
        cols_rev = conn.execute(text("PRAGMA table_info(reviews);")).all()
        names_rev = {c[1] for c in cols_rev}

        if "guest_first_name" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN guest_first_name TEXT;"))
        if "guest_last_name" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN guest_last_name TEXT;"))
        if "receipt_number" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN receipt_number TEXT;"))
        if "purchased_items" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN purchased_items TEXT;"))

        if "lang" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN lang TEXT;"))
        if "comment_ro" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN comment_ro TEXT;"))
        if "comment_en" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN comment_en TEXT;"))
        if "sentiment_label" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN sentiment_label TEXT;"))
        if "sentiment_score" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN sentiment_score REAL;"))
        if "translated_at" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN translated_at TEXT;"))
        if "translation_provider" not in names_rev:
            conn.execute(text("ALTER TABLE reviews ADD COLUMN translation_provider TEXT;"))

        # enforce 1 bon / cafenea (DB-level)
        try:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_cafe_receipt ON reviews(cafe_id, receipt_number);"
            ))
        except Exception as e:
            logger.warning("Cannot create unique index uq_reviews_cafe_receipt (maybe duplicates exist): %s", e)

# =========================== HELPER FUNCTIONS =============================

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(p: str) -> str:
    return pwd_ctx.hash(p)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload.get("sub", "0"))
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalid")


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> "Cafegii":
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Lipseste token-ul")
    token = authorization.split(" ", 1)[1]
    user_id = decode_token(token)
    user = db.get(Cafegii, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User inexistent")
    return user


def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional["Cafegii"]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        user_id = decode_token(token)
    except HTTPException:
        return None
    return db.get(Cafegii, user_id)


def admin_required(current_user: "Cafegii" = Depends(get_current_user)) -> "Cafegii":
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Necesita rol de administrator")
    return current_user


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "cafe"


def normalize_receipt(s: str) -> str:
    # consistent: whitespace trim + uppercase
    return s.strip().upper()

def analyze_sentiment(text_value: Optional[str]):
    if not text_value or not text_value.strip():
        return None, None

    try:
        polarity = TextBlob(text_value).sentiment.polarity

        if polarity > 0.1:
            label = "positive"
        elif polarity < -0.1:
            label = "negative"
        else:
            label = "neutral"

        return label, round(float(polarity), 3)
    except Exception as e:
        logger.warning("Sentiment failed: %s", e)
        return None, None
    
def split_items(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    parts = re.split(r"[,;/|]+", raw)
    return [p.strip() for p in parts if p and p.strip()]


def normalize_drink_name(name: str) -> str:
    value = (name or "").strip().lower()
    value = re.sub(r"\s+", " ", value)

    replacements = {
        "flatwhite": "flat white",
        "espresso martini": "espresso martini",
        "v 60": "v60",
    }
    value = replacements.get(value, value)

    # poți extinde aici după nevoie
    if "cappuccino" in value:
        return "cappuccino"
    if "flat white" in value:
        return "flat white"
    if "latte" in value:
        return "latte"
    if "espresso martini" in value:
        return "espresso martini"
    if "espresso" in value:
        return "espresso"
    if "v60" in value:
        return "v60"
    if "matcha" in value:
        return "matcha"
    if "cold brew" in value:
        return "cold brew"
    if "batch brew" in value:
        return "batch brew"
    if "croissant" in value:
        return "croissant"

    return value

def normalize_text_basic(text: str) -> str:
    text = (text or "").lower().strip()

    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))

    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text


def is_romanian_question(question: str) -> bool:
    q = (question or "").lower()

    ro_markers = [
        "unde", "ce", "care", "cum", "vreau", "pot", "bea",
        "cafea", "cafenea", "cafenele", "lapte", "tare",
        "recomand", "ingrediente", "conține", "contine",
        "sănătate", "sanatate", "zonă", "zona", "băutură", "bautura",
        "seara", "noaptea", "rece", "fără", "fara"
    ]

    return any(word in q for word in ro_markers)

def load_json_file(filename: str, fallback: dict) -> dict:
    path = os.path.join(os.path.dirname(__file__), "data", filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Could not load %s: %s", filename, e)
        return fallback


def load_ai_data() -> dict:
    return {
        "drinks": load_json_file("coffee_knowledge.json", {"drinks": []}).get("drinks", []),
        "methods": load_json_file("brewing_methods.json", {"methods": []}).get("methods", []),
        "beans": load_json_file("coffee_beans.json", {"beans": []}).get("beans", []),
        "rules": load_json_file("coffee_recommendation_rules.json", {"rules": []}).get("rules", []),
    }


def find_exact_or_related(items: list, query: str, key: str = "name") -> list:
    q = normalize_text_basic(query)
    results = []

    for item in items:
        blob = normalize_text_basic(" ".join([
            str(item.get(key, "")),
            str(item.get("category", "")),
            str(item.get("description", "")),
            " ".join(item.get("ingredients", [])) if isinstance(item.get("ingredients"), list) else "",
            " ".join(item.get("taste_profile", [])) if isinstance(item.get("taste_profile"), list) else "",
            " ".join(item.get("recommended_for", [])) if isinstance(item.get("recommended_for"), list) else "",
            " ".join(item.get("best_for", [])) if isinstance(item.get("best_for"), list) else "",
            " ".join(item.get("common_use", [])) if isinstance(item.get("common_use"), list) else "",
        ]))

        name = normalize_text_basic(str(item.get(key, "")))

        if name and name in q:
            results.insert(0, item)
        elif q and q in blob:
            results.append(item)
        else:
            q_words = [w for w in q.split() if len(w) >= 4]
            score = sum(1 for w in q_words if w in blob)
            if score >= 1:
                results.append(item)

    return results[:5]


def detect_ai_rule(question: str, rules: list) -> Optional[dict]:
    q = normalize_text_basic(question)

    best_rule = None
    best_score = 0

    for rule in rules:
        score = 0
        for kw in rule.get("keywords", []):
            nkw = normalize_text_basic(kw)
            if nkw and nkw in q:
                score += 1

        if score > best_score:
            best_score = score
            best_rule = rule

    return best_rule if best_score > 0 else None


def format_list(values: list, limit: int = 5) -> str:
    clean = [str(v).strip() for v in values if str(v).strip()]
    return ", ".join(clean[:limit]) if clean else "nu am date clare"

def translate_ai_term(value: str, ro: bool) -> str:
    if not ro:
        return str(value)

    dictionary = {
        "low": "scăzut",
        "low-medium": "scăzut-mediu",
        "medium": "mediu",
        "medium-high": "mediu-ridicat",
        "high": "ridicat",
        "very high": "foarte ridicat",
        "unknown": "necunoscut",

        "short espresso shot": "shot scurt de espresso",
        "long espresso shot": "shot lung de espresso",
        "steamed milk": "lapte încălzit cu abur",
        "milk foam": "spumă de lapte",
        "microfoam milk": "lapte microspumat",
        "hot water": "apă fierbinte",
        "cold water": "apă rece",
        "ice": "gheață",
        "filter coffee": "cafea la filtru",
        "water": "apă",
        "coffee": "cafea",
        "milk": "lapte",
        "chocolate": "ciocolată",

        "very intense": "foarte intens",
        "intense": "intens",
        "bitter": "amar",
        "strong": "tare",
        "creamy": "cremos",
        "balanced": "echilibrat",
        "mild": "blând",
        "sweet": "dulce",
        "clear": "clar",
        "fruity": "fructat",
        "floral": "floral",
        "acidic": "acidulat",
        "smooth": "fin",
        "less acidic": "mai puțin acid",
        "refreshing": "răcoritor",
        "concentrated": "concentrat",
        "less bitter": "mai puțin amar",
    }

    return dictionary.get(str(value).lower().strip(), str(value))


def format_ai_list(values: list, ro: bool, limit: int = 5) -> str:
    clean = [translate_ai_term(v, ro) for v in values if str(v).strip()]
    return ", ".join(clean[:limit]) if clean else ("nu am date clare" if ro else "no clear data")


def translate_ai_sentence(text: str, ro: bool) -> str:
    if not ro:
        return text or ""

    known = {
        "Short extraction means less bitterness but strong flavor.":
            "Extracția scurtă înseamnă mai puțină amăreală, dar gust intens.",
        "Espresso contains a higher level of caffeine in a small volume. It is better to avoid it late in the evening if you are sensitive to caffeine.":
            "Espresso are mai multă cofeină într-un volum mic. E mai bine să-l eviți seara târziu dacă ești sensibil(ă) la cofeină.",
        "Cappuccino contains milk and a moderate amount of caffeine. It can be a softer option compared to plain espresso.":
            "Cappuccino conține lapte și o cantitate moderată de cofeină. Este o variantă mai blândă decât espresso simplu.",
        "Latte contains more milk, so it has a smoother and milder taste.":
            "Latte conține mai mult lapte, deci are un gust mai fin și mai blând.",
        "Flat white is stronger than latte, but still creamy because of the milk.":
            "Flat white este mai intens decât latte, dar rămâne cremos datorită laptelui.",
        "Cold brew can have a high caffeine level. It is refreshing, but should be consumed moderately.":
            "Cold brew poate avea multă cofeină. Este răcoritor, dar ar trebui consumat moderat.",
    }

    return known.get(text.strip(), text)

def find_cafes_for_terms(cafes: list, terms: list) -> list:
    normalized_terms = [normalize_text_basic(t) for t in terms if t]

    matches = []
    for cafe in cafes:
        blob = normalize_text_basic(" ".join([
            cafe.name or "",
            cafe.city or "",
            cafe.area or "",
            cafe.tags or "",
            cafe.address or "",
            cafe.about_text or "",
            cafe.menu_text or "",
            cafe.products_text or "",
        ]))

        if any(term and term in blob for term in normalized_terms):
            matches.append(cafe)

    return matches[:5]


def find_review_based_cafes_for_drink(db: Session, drink_name: str, limit: int = 5) -> list:
    wanted = normalize_drink_name(drink_name)

    rows = (
        db.query(Review, Cafenele)
        .join(Cafenele, Review.cafe_id == Cafenele.id)
        .all()
    )

    stats = {}

    for review, cafe in rows:
        items = split_items(review.purchased_items)

        for item in items:
            norm_item = normalize_drink_name(item)

            if norm_item == wanted:
                if cafe.id not in stats:
                    stats[cafe.id] = {
                        "cafe": cafe,
                        "count": 0,
                        "rating_sum": 0,
                        "positive": 0,
                    }

                stats[cafe.id]["count"] += 1
                stats[cafe.id]["rating_sum"] += review.rating

                if review.sentiment_label == "positive":
                    stats[cafe.id]["positive"] += 1

    results = []

    for data in stats.values():
        count = data["count"]
        avg_rating = round(data["rating_sum"] / count, 2) if count else 0

        results.append({
            "cafe": data["cafe"],
            "count": count,
            "avg_rating": avg_rating,
            "positive": data["positive"],
        })

    results.sort(
        key=lambda x: (-x["avg_rating"], -x["count"], -x["positive"], x["cafe"].name)
    )

    return results[:limit]

def build_profile_identity(
    total_reviews: int,
    cafes_visited: int,
    positive_percent: float,
    top_drink: Optional[str],
):
    if cafes_visited >= 8:
        return ProfileIdentityOut(
            badge="Coffee Explorer",
            subtitle="You love discovering many different coffee spots."
        )

    if top_drink == "cappuccino":
        return ProfileIdentityOut(
            badge="Cappuccino Loyalist",
            subtitle="You clearly have a soft spot for cappuccino."
        )

    if positive_percent >= 70:
        return ProfileIdentityOut(
            badge="Kind Reviewer",
            subtitle="Your reviews are usually warm and positive."
        )

    if total_reviews >= 6:
        return ProfileIdentityOut(
            badge="Honest Reviewer",
            subtitle="You consistently leave useful feedback."
        )

    return ProfileIdentityOut(
        badge="Coffee Lover",
        subtitle="Your coffee journey on WhereToCofi is just getting started."
    )



# =============================== SCHEMAS ===================================

class SignupIn(BaseModel):
    prenume: str = Field(strip_whitespace=True, min_length=1, max_length=50)
    nume: str = Field(strip_whitespace=True, min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    id: int
    prenume: str
    nume: str
    mail: EmailStr
    role: Literal["user", "admin"]


class AdminCreateUserIn(BaseModel):
    prenume: str = Field(strip_whitespace=True, min_length=1, max_length=50)
    nume: str = Field(strip_whitespace=True, min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    role: Literal["user", "admin"] = "user"


class AdminUpdateUserIn(BaseModel):
    password: Optional[str] = Field(default=None, min_length=6, max_length=72)
    role: Optional[Literal["user", "admin"]] = None


class AdminListUserOut(BaseModel):
    id: int
    prenume: str
    nume: str
    mail: EmailStr
    role: Literal["user", "admin"]
    created_at: datetime


class CafeOut(BaseModel):
    id: int
    slug: str
    name: str
    city: str
    address: str
    area: Optional[str] = None
    tags: Optional[str] = None
    hours_text: Optional[str] = None
    about_text: Optional[str] = None
    menu_text: Optional[str] = None
    products_text: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class CafePhotoOut(BaseModel):
    id: int
    cafe_id: int
    user_id: int
    image_url: str
    original_name: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    caption: Optional[str] = None
    created_at: datetime
    user_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ProfilePhotoOut(BaseModel):
    id: int
    cafe_id: int
    cafe_slug: str
    cafe_name: str
    image_url: str
    caption: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CafeBaseIn(BaseModel):
    # EXACT ce trimite app.js: name, area, tags, location, hours, about, menu, products
    name: str = Field(min_length=1, max_length=120)
    city: str = Field("București", max_length=80)
    area: Optional[str] = Field(default=None, max_length=255)
    tags: Optional[str] = Field(default=None, max_length=255)
    location: str = Field(min_length=1, max_length=255)
    hours: Optional[str] = None
    about: Optional[str] = None
    menu: Optional[str] = None
    products: Optional[str] = None


class CafeCreateIn(CafeBaseIn):
    pass


class CafeUpdateIn(BaseModel):
    slug: Optional[str] = None
    name: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    tags: Optional[str] = None
    location: Optional[str] = None
    hours: Optional[str] = None
    about: Optional[str] = None
    menu: Optional[str] = None
    products: Optional[str] = None


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    receipt_number: str = Field(strip_whitespace=True, min_length=2, max_length=80)
    purchased_items: str = Field(strip_whitespace=True, min_length=1, max_length=500)
    guest_first_name: Optional[str] = Field(default=None, strip_whitespace=True, min_length=1, max_length=50)
    guest_last_name: Optional[str] = Field(default=None, strip_whitespace=True, min_length=1, max_length=50)


class ReviewOut(BaseModel):
    id: int
    rating: int
    comment: Optional[str]
    purchased_items: str
    created_at: datetime
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class CafeShortOut(BaseModel):
    id: int
    slug: str
    name: str
    city: str
    area: Optional[str] = None
    tags: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class ReviewResponse(BaseModel):
    message: str
    review: ReviewOut
    recommendations: List[CafeShortOut] = []


class ReviewWithCafeOut(BaseModel):
    id: int
    rating: int
    comment: Optional[str]

    lang: Optional[str] = None
    comment_ro: Optional[str] = None
    comment_en: Optional[str] = None
    sentiment_label: Optional[str] = None
    sentiment_score: Optional[float] = None

    translated_at: Optional[str] = None
    translation_provider: Optional[str] = None
    purchased_items: str
    created_at: datetime
    cafe_slug: str
    cafe_name: str
    city: str
    area: Optional[str] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class FavCafeOut(BaseModel):
    slug: str
    name: str
    city: str
    area: Optional[str] = None
    tags: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class CafecitoToggleIn(BaseModel):
    slug: str

class TranslateOut(BaseModel):
    review_id: int
    source_lang: Optional[str] = None
    translated_text_ro: str
    provider: str = "google"
    cached: bool = False

class SentimentAnalyticsOut(BaseModel):
    total_reviews: int
    positive: int
    neutral: int
    negative: int
    positive_percent: float
    neutral_percent: float
    negative_percent: float

class ProfileQuickStatsOut(BaseModel):
    total_reviews: int
    cafes_visited: int
    avg_rating: float
    verified_visits: int
    favorites_count: int


class ProfileSentimentOut(BaseModel):
    positive: int
    neutral: int
    negative: int
    positive_percent: float
    neutral_percent: float
    negative_percent: float
    dominant_label: Optional[str] = None


class ProfileDrinkOut(BaseModel):
    name: str
    count: int


class ProfileIdentityOut(BaseModel):
    badge: str
    subtitle: str


class ProfileHeaderOut(BaseModel):
    id: int
    prenume: str
    nume: str
    mail: EmailStr
    role: Literal["user", "admin"]


class ProfileDashboardOut(BaseModel):
    user: ProfileHeaderOut
    stats: ProfileQuickStatsOut
    sentiment: ProfileSentimentOut
    favorite_drinks: List[ProfileDrinkOut]
    favorite_cafes: List[FavCafeOut]
    identity: ProfileIdentityOut
    reviews: List[ReviewWithCafeOut]

class AiAskIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class AiAskOut(BaseModel):
    answer: str
    source: str

# ============================ FASTAPI APP =================================

app = FastAPI(title="WhereToCofi (Auth + Cafenele, SQLite)")
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================== STARTUP HOOKS ================================

@app.on_event("startup")
def ensure_default_admin():
    with SessionLocal() as db:
        if db.query(Cafegii).filter(Cafegii.role == "admin").first():
            return
        if ADMIN_EMAIL and ADMIN_PASSWORD:
            if not db.query(Cafegii).filter(Cafegii.mail == ADMIN_EMAIL).first():
                admin = Cafegii(
                    prenume=ADMIN_PRENUME,
                    nume=ADMIN_NUME,
                    mail=ADMIN_EMAIL,
                    parola=hash_password(ADMIN_PASSWORD),
                    role="admin",
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                db.add(admin)
                db.commit()


@app.on_event("startup")
def seed_cafenele():
    with SessionLocal() as db:
        if db.query(Cafenele).count() > 0:
            return

        data = [
            Cafenele(
                slug="ceaicoffski",
                name="Ceaicoffski",
                city="București",
                address="ParkLake Shopping Center, București",
                area="ParkLake",
                tags="specialty, cozy",
                hours_text="Mon–Sun · 07:00 – 19:00",
                about_text="Un coffee spot cozy în ParkLake, perfect pentru pauze de lucru sau citit.",
                menu_text=(
                    "Espresso-based drinks, V60, batch brew, matcha, home-made cookies. "
                    "Prices 12–25 lei."
                ),
                products_text=(
                    "They work mainly with specialty roasters from Romania and Europe, "
                    "focusing on light roasted beans and seasonal origins."
                ),
            ),
            Cafenele(
                slug="ivcs",
                name="Italian Vintage Coffee Shop",
                city="București",
                address="Str. X, București",
                area="Centru",
                tags="italian, vintage",
                hours_text="Mon–Fri · 08:00 – 19:00 · Sat–Sun · 09:00 – 18:00",
                about_text="Cozy Italian-style coffee shop with lots of vintage details and sweet pastries.",
                menu_text="Espresso, cappuccino, latte, affogato, tiramisu, cannoli. Prices 10–28 lei.",
                products_text=(
                    "They use Italian blends tailored for cappuccinos and lattes, "
                    "with a creamy texture and low acidity."
                ),
            ),
            Cafenele(
                slug="sotto",
                name="Sotto",
                city="București",
                address="Str. Y, București",
                area="Dorobanți",
                tags="minimal, specialty",
                hours_text="Mon–Sun · 08:30 – 20:00",
                about_text="Minimalist specialty coffee shop with clean design and calm atmosphere.",
                menu_text="Espresso, flat white, cold brew, limited pastry selection.",
                products_text="Mostly Nordic-style light roast coffees, focusing on fruity and floral notes.",
            ),
            Cafenele(
                slug="ulu",
                name="ULU Coffee House",
                city="Bucharest",
                address="Str. Z, București",
                area="Titan",
                tags="nordic, kiosk",
                hours_text="Mon–Fri · 07:30 – 18:30 · Sat–Sun · 09:00 – 17:00",
                about_text="Surf inspired place, chill vibes, coffee shop with outdoor seating and relaxed vibe.",
                menu_text="Espresso, batch brew, seasonal signature drinks, small snacks.",
                products_text="Uses mainly Nordic roasters, focusing on transparent, traceable origins and seasonal lots.",
            ),
        ]

        db.add_all(data)
        db.commit()

# =============================== ROUTES ====================================

@app.get("/")
def root():
    return {"status": "ok", "service": "auth+coffee"}

# ---------- SIGNUP / LOGIN / ME ----------

@app.post("/signup", response_model=UserOut)
def signup(payload: SignupIn, db: Session = Depends(get_db)):
    if db.query(Cafegii).filter(Cafegii.mail == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")
    cafegiu = Cafegii(
        prenume=payload.prenume,
        nume=payload.nume,
        mail=payload.email,
        parola=hash_password(payload.password),
        role="user",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(cafegiu)
    db.commit()
    db.refresh(cafegiu)
    return UserOut(
        id=cafegiu.id,
        prenume=cafegiu.prenume,
        nume=cafegiu.nume,
        mail=cafegiu.mail,
        role=cafegiu.role,
    )


@app.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    cafegiu = db.query(Cafegii).filter(Cafegii.mail == payload.email).first()
    if not cafegiu or not verify_password(payload.password, cafegiu.parola):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token(cafegiu.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": cafegiu.id, "prenume": cafegiu.prenume, "nume": cafegiu.nume, "role": cafegiu.role},
    }


@app.get("/me", response_model=UserOut)
def me(current_user: Cafegii = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        prenume=current_user.prenume,
        nume=current_user.nume,
        mail=current_user.mail,
        role=current_user.role,
    )

#=============================MY PROFILE========================================
@app.get("/profile/me/dashboard", response_model=ProfileDashboardOut)
def profile_dashboard(
    current_user: Cafegii = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # reviews user
    rows = (
        db.query(Review, Cafenele, Cafegii)
        .join(Cafenele, Review.cafe_id == Cafenele.id)
        .outerjoin(Cafegii, Review.user_id == Cafegii.id)
        .filter(Review.user_id == current_user.id)
        .order_by(Review.created_at.desc())
        .all()
    )

    reviews_out: List[ReviewWithCafeOut] = []
    all_items: List[str] = []

    ratings = []
    cafes_seen = set()
    verified_visits = 0

    positive = 0
    neutral = 0
    negative = 0

    for r, c, u in rows:
        ratings.append(r.rating)
        cafes_seen.add(c.id)

        if r.receipt_number:
            verified_visits += 1

        if r.sentiment_label == "positive":
            positive += 1
        elif r.sentiment_label == "neutral":
            neutral += 1
        elif r.sentiment_label == "negative":
            negative += 1

        all_items.extend(split_items(r.purchased_items))

        reviews_out.append(
            ReviewWithCafeOut(
                id=r.id,
                rating=r.rating,
                comment=r.comment,
                lang=r.lang,
                comment_ro=r.comment_ro,
                comment_en=r.comment_en,
                sentiment_label=r.sentiment_label,
                sentiment_score=r.sentiment_score,
                translated_at=r.translated_at,
                translation_provider=r.translation_provider,
                purchased_items=r.purchased_items,
                created_at=r.created_at,
                cafe_slug=c.slug,
                cafe_name=c.name,
                city=c.city,
                area=c.area,
                user_id=r.user_id,
                user_name=f"{current_user.prenume} {current_user.nume}",
            )
        )

    total_reviews = len(reviews_out)
    cafes_visited = len(cafes_seen)
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0

    sentiment_total = positive + neutral + negative
    if sentiment_total:
        positive_percent = round(positive / sentiment_total * 100, 1)
        neutral_percent = round(neutral / sentiment_total * 100, 1)
        negative_percent = round(negative / sentiment_total * 100, 1)
    else:
        positive_percent = neutral_percent = negative_percent = 0.0

    dominant_label = None
    if sentiment_total:
        dominant_label = max(
            [
                ("positive", positive),
                ("neutral", neutral),
                ("negative", negative),
            ],
            key=lambda x: x[1]
        )[0]

    # favorite drinks
    counter = {}
    for raw_item in all_items:
        norm = normalize_drink_name(raw_item)
        if not norm:
            continue
        counter[norm] = counter.get(norm, 0) + 1

    top_drinks_sorted = sorted(counter.items(), key=lambda x: (-x[1], x[0]))[:3]
    favorite_drinks = [
        ProfileDrinkOut(name=name.title(), count=count)
        for name, count in top_drinks_sorted
    ]

    # favorites preview
    fav_rows = (
        db.query(Cafecito, Cafenele)
        .join(Cafenele, Cafecito.cafe_id == Cafenele.id)
        .filter(Cafecito.user_id == current_user.id)
        .order_by(Cafecito.created_at.desc())
        .limit(3)
        .all()
    )
    favorite_cafes = [
        FavCafeOut(
            slug=c.slug,
            name=c.name,
            city=c.city,
            area=c.area,
            tags=c.tags
        )
        for _, c in fav_rows
    ]

    favorites_count = (
        db.query(Cafecito)
        .filter(Cafecito.user_id == current_user.id)
        .count()
    )

    top_drink_name = top_drinks_sorted[0][0] if top_drinks_sorted else None
    identity = build_profile_identity(
        total_reviews=total_reviews,
        cafes_visited=cafes_visited,
        positive_percent=positive_percent,
        top_drink=top_drink_name,
    )

    return ProfileDashboardOut(
        user=ProfileHeaderOut(
            id=current_user.id,
            prenume=current_user.prenume,
            nume=current_user.nume,
            mail=current_user.mail,
            role=current_user.role,
        ),
        stats=ProfileQuickStatsOut(
            total_reviews=total_reviews,
            cafes_visited=cafes_visited,
            avg_rating=avg_rating,
            verified_visits=verified_visits,
            favorites_count=favorites_count,
        ),
        sentiment=ProfileSentimentOut(
            positive=positive,
            neutral=neutral,
            negative=negative,
            positive_percent=positive_percent,
            neutral_percent=neutral_percent,
            negative_percent=negative_percent,
            dominant_label=dominant_label,
        ),
        favorite_drinks=favorite_drinks,
        favorite_cafes=favorite_cafes,
        identity=identity,
        reviews=reviews_out,
    )

@app.get("/profile/me/photos", response_model=List[ProfilePhotoOut])
def profile_my_photos(
    current_user: Cafegii = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CafePhoto, Cafenele)
        .join(Cafenele, CafePhoto.cafe_id == Cafenele.id)
        .filter(CafePhoto.user_id == current_user.id)
        .order_by(CafePhoto.created_at.desc())
        .all()
    )

    return [
        ProfilePhotoOut(
            id=photo.id,
            cafe_id=photo.cafe_id,
            cafe_slug=cafe.slug,
            cafe_name=cafe.name,
            image_url=photo.image_url,
            caption=photo.caption,
            created_at=photo.created_at,
        )
        for photo, cafe in rows
    ]

@app.delete("/profile/me/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_profile_photo(
    photo_id: int,
    current_user: Cafegii = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    photo = db.get(CafePhoto, photo_id)

    if not photo:
        raise HTTPException(status_code=404, detail="Poza nu există.")

    # aici este verificarea importantă:
    # userul poate șterge doar poza lui
    if photo.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Nu poți șterge o poză încărcată de alt utilizator."
        )

    # ștergem fișierul fizic din uploads/cafes
    if photo.image_url:
        filename = os.path.basename(photo.image_url)
        disk_path = os.path.join(CAFE_UPLOAD_DIR, filename)

        try:
            if os.path.exists(disk_path):
                os.remove(disk_path)
        except Exception as e:
            logger.warning("Could not delete user photo file %s: %s", disk_path, e)

    # ștergem poza și din baza de date
    db.delete(photo)
    db.commit()

    return
# ======================== ADMIN – USERS ====================================

@app.get("/admin/users", response_model=List[AdminListUserOut])
def admin_list_users(_: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    rows = db.query(Cafegii).order_by(Cafegii.created_at.desc()).all()
    return [
        AdminListUserOut(
            id=r.id, prenume=r.prenume, nume=r.nume, mail=r.mail, role=r.role, created_at=r.created_at
        )
        for r in rows
    ]


@app.post("/admin/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def admin_create_user(payload: AdminCreateUserIn, _: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    if db.query(Cafegii).filter(Cafegii.mail == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")
    u = Cafegii(
        prenume=payload.prenume,
        nume=payload.nume,
        mail=payload.email,
        parola=hash_password(payload.password),
        role=payload.role,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return UserOut(id=u.id, prenume=u.prenume, nume=u.nume, mail=u.mail, role=u.role)


@app.patch("/admin/users/{user_id}", response_model=UserOut)
def admin_update_user(
    user_id: int,
    payload: AdminUpdateUserIn,
    admin: Cafegii = Depends(admin_required),
    db: Session = Depends(get_db),
):
    u = db.get(Cafegii, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User inexistent")

    if payload.password:
        u.parola = hash_password(payload.password)
    if payload.role:
        if admin.id == user_id and payload.role != "admin":
            raise HTTPException(status_code=400, detail="Nu îți poți schimba propriul rol din admin în user.")
        u.role = payload.role

    u.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(u)
    return UserOut(id=u.id, prenume=u.prenume, nume=u.nume, mail=u.mail, role=u.role)


@app.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_user(user_id: int, admin: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Nu poți șterge propriul cont admin.")
    u = db.get(Cafegii, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User inexistent")
    db.delete(u)
    db.commit()
    return

# ============================ CAFENELE PUBLIC ==============================

@app.get("/cafenele", response_model=List[CafeOut])
def list_cafenele(db: Session = Depends(get_db)):
    return db.query(Cafenele).order_by(Cafenele.name.asc()).all()


@app.get("/cafenele/{slug}", response_model=CafeOut)
def get_cafenea(slug: str, db: Session = Depends(get_db)):
    r = db.query(Cafenele).filter(Cafenele.slug == slug).first()
    if not r:
        raise HTTPException(status_code=404, detail="Coffee shop not found.")
    return r

@app.get("/cafenele/{slug}/photos", response_model=List[CafePhotoOut])
def list_cafe_photos(slug: str, db: Session = Depends(get_db)):
    cafe = db.query(Cafenele).filter(Cafenele.slug == slug).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Coffee shop not found.")

    rows = (
        db.query(CafePhoto, Cafegii)
        .join(Cafegii, CafePhoto.user_id == Cafegii.id)
        .filter(CafePhoto.cafe_id == cafe.id)
        .order_by(CafePhoto.created_at.desc())
        .all()
    )

    return [
        CafePhotoOut(
            id=photo.id,
            cafe_id=photo.cafe_id,
            user_id=photo.user_id,
            image_url=photo.image_url,
            original_name=photo.original_name,
            mime_type=photo.mime_type,
            size_bytes=photo.size_bytes,
            caption=photo.caption,
            created_at=photo.created_at,
            user_name=f"{user.prenume} {user.nume}",
        )
        for photo, user in rows
    ]


@app.post("/cafenele/{slug}/photos", response_model=CafePhotoOut, status_code=status.HTTP_201_CREATED)
async def upload_cafe_photo(
    slug: str,
    photo: UploadFile = File(...),
    caption: Optional[str] = Form(default=None),
    current_user: Cafegii = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cafe = db.query(Cafenele).filter(Cafenele.slug == slug).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Coffee shop not found.")

    if not photo.content_type or not photo.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Poți încărca doar fișiere de tip imagine.")

    content = await photo.read()

    max_size = 5 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="Imaginea este prea mare. Limita este 5 MB.")

    ext = os.path.splitext(photo.filename or "")[1].lower()
    allowed_ext = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

    if ext not in allowed_ext:
        ext = ".jpg"

    safe_name = f"cafe_{cafe.id}_user_{current_user.id}_{uuid.uuid4().hex}{ext}"
    disk_path = os.path.join(CAFE_UPLOAD_DIR, safe_name)

    with open(disk_path, "wb") as f:
        f.write(content)

    public_url = f"/uploads/cafes/{safe_name}"

    db_photo = CafePhoto(
        cafe_id=cafe.id,
        user_id=current_user.id,
        image_url=public_url,
        original_name=photo.filename,
        mime_type=photo.content_type,
        size_bytes=len(content),
        caption=(caption or "").strip() or None,
        created_at=datetime.utcnow(),
    )

    db.add(db_photo)
    db.commit()
    db.refresh(db_photo)

    return CafePhotoOut(
        id=db_photo.id,
        cafe_id=db_photo.cafe_id,
        user_id=db_photo.user_id,
        image_url=db_photo.image_url,
        original_name=db_photo.original_name,
        mime_type=db_photo.mime_type,
        size_bytes=db_photo.size_bytes,
        caption=db_photo.caption,
        created_at=db_photo.created_at,
        user_name=f"{current_user.prenume} {current_user.nume}",
    )

@app.delete("/admin/cafe-photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_cafe_photo(
    photo_id: int,
    _: Cafegii = Depends(admin_required),
    db: Session = Depends(get_db),
):
    photo = db.get(CafePhoto, photo_id)

    if not photo:
        raise HTTPException(status_code=404, detail="Poza nu există.")

    # Ștergem fișierul fizic din backend/uploads/cafes
    if photo.image_url:
        filename = os.path.basename(photo.image_url)
        disk_path = os.path.join(CAFE_UPLOAD_DIR, filename)

        try:
            if os.path.exists(disk_path):
                os.remove(disk_path)
        except Exception as e:
            logger.warning("Could not delete photo file %s: %s", disk_path, e)

    # Ștergem înregistrarea din baza de date
    db.delete(photo)
    db.commit()

    return

# ============================ REVIEWS PUBLIC ===============================

@app.get("/reviews", response_model=List[ReviewWithCafeOut])
def list_reviews(db: Session = Depends(get_db)):
    rows = (
        db.query(Review, Cafenele, Cafegii)
        .join(Cafenele, Review.cafe_id == Cafenele.id)
        .outerjoin(Cafegii, Review.user_id == Cafegii.id)
        .order_by(Review.created_at.desc())
        .limit(300)
        .all()
    )

    out: List[ReviewWithCafeOut] = []
    for r, c, u in rows:
        out.append(
            ReviewWithCafeOut(
                id=r.id,
                rating=r.rating,
                comment=r.comment,
                lang=r.lang,
                comment_ro=r.comment_ro,
                comment_en=r.comment_en,
                sentiment_label=r.sentiment_label,
                sentiment_score=r.sentiment_score,
                translated_at=r.translated_at,
                translation_provider=r.translation_provider,
                purchased_items=r.purchased_items,
                created_at=r.created_at,
                cafe_slug=c.slug,
                cafe_name=c.name,
                city=c.city,
                area=c.area,
                user_id=r.user_id,
                user_name=(
                    f"{u.prenume} {u.nume}"
                    if u
                    else (
                        f"{r.guest_first_name} {r.guest_last_name}"
                        if r.guest_first_name and r.guest_last_name
                        else "Guest"
                    )
                ),
            )
        )
    return out

# ============================ REVIEWS CHECK RECEIPT ===============================

@app.get("/cafenele/{slug}/receipts/check")
def check_receipt(slug: str, number: str, db: Session = Depends(get_db)):
    cafe = db.query(Cafenele).filter(Cafenele.slug == slug).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Coffee shop not found.")

    n = normalize_receipt(number)
    exists = db.query(Review).filter(Review.cafe_id == cafe.id, Review.receipt_number == n).first()
    return {"available": (exists is None)}

# =========================== REVIEWS FUNC =================================

@app.post("/cafenele/{slug}/reviews", response_model=ReviewResponse)
def add_review_for_cafe(
    slug: str,
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: Optional[Cafegii] = Depends(get_optional_user),
):
    cafe = db.query(Cafenele).filter(Cafenele.slug == slug).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Coffee shop not found.")

    receipt = normalize_receipt(payload.receipt_number)

    # guest requirements
    guest_first = payload.guest_first_name.strip() if payload.guest_first_name else None
    guest_last = payload.guest_last_name.strip() if payload.guest_last_name else None
    if current_user is None and (not guest_first or not guest_last):
        raise HTTPException(
            status_code=400,
            detail="Pentru review fără cont, prenumele și numele sunt obligatorii."
        )

    review = Review(
        user_id=current_user.id if current_user else None,
        cafe_id=cafe.id,
        rating=payload.rating,
        comment=payload.comment,
        receipt_number=receipt,
        purchased_items=payload.purchased_items.strip(),
        guest_first_name=guest_first,
        guest_last_name=guest_last,
    )

    db.add(review)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "This receipt has already been used for review validation. "
                "You have reached the maximum number of reviews. "
                "Please contact the address listed in the Contact section for any further requests."
            ),
        )

    db.refresh(review)

    # ------------------ LANGUAGE + NORMALIZATION ------------------
    if review.comment and review.comment.strip():
        try:
            client = translate.Client()

            detection = client.detect_language(review.comment)
            review.lang = (detection.get("language") or "").lower() or None
            src_lang = review.lang

            # varianta în engleză pentru ML
            if src_lang == "en":
                review.comment_en = review.comment
            else:
                tr_en = client.translate(review.comment, target_language="en")
                review.comment_en = html.unescape(tr_en.get("translatedText") or "")

            # varianta în română pentru UI / traducere locală
            if src_lang == "ro":
                review.comment_ro = review.comment
            else:
                tr_ro = client.translate(review.comment, target_language="ro")
                review.comment_ro = html.unescape(tr_ro.get("translatedText") or "")

            review.translated_at = datetime.utcnow().isoformat()
            review.translation_provider = "google"

            db.commit()
            db.refresh(review)

        except Exception as e:
            logger.warning("Translation normalize failed for review_id=%s: %s", review.id, e)
            db.rollback()

    # ------------------ SENTIMENT ------------------
    text_for_analysis = review.comment_en or review.comment
    if text_for_analysis:
        label, score = analyze_sentiment(text_for_analysis)
        review.sentiment_label = label
        review.sentiment_score = score

        try:
            db.commit()
            db.refresh(review)
        except Exception as e:
            logger.warning("Sentiment save failed for review_id=%s: %s", review.id, e)
            db.rollback()

    # recommendations only if 5 and only logged-in users
    recommendations: List[Cafenele] = []
    if payload.rating == 5:
        rows_user_ids = (
            db.query(Review.user_id)
            .filter(
                Review.cafe_id == cafe.id,
                Review.rating == 5,
                Review.user_id.isnot(None)
            )
            .distinct()
            .all()
        )
        user_ids = [row[0] for row in rows_user_ids if row[0] is not None]
        if user_ids:
            recommendations = (
                db.query(Cafenele)
                .join(Review, Review.cafe_id == Cafenele.id)
                .filter(
                    Review.user_id.in_(user_ids),
                    Review.rating == 5,
                    Cafenele.id != cafe.id
                )
                .distinct()
                .limit(8)
                .all()
            )

    out_name = (
        f"{current_user.prenume} {current_user.nume}"
        if current_user
        else f"{review.guest_first_name} {review.guest_last_name}"
    )

    return ReviewResponse(
        message="Review added successfully",
        review=ReviewOut(
            id=review.id,
            rating=review.rating,
            comment=review.comment,
            purchased_items=review.purchased_items,
            created_at=review.created_at,
            user_id=review.user_id,
            user_name=out_name,
        ),
        recommendations=[
            CafeShortOut(
                id=c.id,
                slug=c.slug,
                name=c.name,
                city=c.city,
                area=c.area,
                tags=c.tags
            )
            for c in recommendations
        ],
    )


# ========================== MY CAFECITOS (FAVORITE) =========================

@app.post("/cafecitos/toggle")
def toggle_cafecito(
    payload: CafecitoToggleIn, 
    current_user: Cafegii = Depends(get_current_user), 
    db: Session = Depends(get_db)):
    cafe = db.query(Cafenele).filter(Cafenele.slug == payload.slug).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Coffee shop not found.")

    fav = db.query(Cafecito).filter(Cafecito.user_id == current_user.id, Cafecito.cafe_id == cafe.id).first()
    if fav:
        db.delete(fav)
        db.commit()
        return {"is_favorite": False}

    new_fav = Cafecito(user_id=current_user.id, cafe_id=cafe.id)
    db.add(new_fav)
    db.commit()
    return {"is_favorite": True}


@app.get("/cafecitos", response_model=List[FavCafeOut])
def list_cafecitos(current_user: Cafegii = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Cafecito, Cafenele)
        .join(Cafenele, Cafecito.cafe_id == Cafenele.id)
        .filter(Cafecito.user_id == current_user.id)
        .order_by(Cafenele.name.asc())
        .all()
    )
    out: List[FavCafeOut] = []
    for _, c in rows:
        out.append(FavCafeOut(slug=c.slug, name=c.name, city=c.city, area=c.area, tags=c.tags))
    return out

# ============================ CAFENELE – ADMIN =============================

@app.get("/admin/cafes", response_model=List[CafeOut])
def admin_list_cafes(_: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    return db.query(Cafenele).order_by(Cafenele.name.asc()).all()


@app.post("/admin/cafes", response_model=CafeOut, status_code=status.HTTP_201_CREATED)
def admin_create_cafe(payload: CafeCreateIn, _: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    base_slug = slugify(payload.name)
    slug = base_slug
    i = 1
    while db.query(Cafenele).filter(Cafenele.slug == slug).first():
        i += 1
        slug = f"{base_slug}-{i}"

    cafe = Cafenele(
        slug=slug,
        name=payload.name,
        city=payload.city,
        address=payload.location,
        area=payload.area,
        tags=payload.tags,
        hours_text=payload.hours,
        about_text=payload.about,
        menu_text=payload.menu,
        products_text=payload.products,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(cafe)
    db.commit()
    db.refresh(cafe)
    return cafe


@app.patch("/admin/cafes/{cafe_id}", response_model=CafeOut)
def admin_update_cafe(cafe_id: int, payload: CafeUpdateIn, _: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    cafe = db.get(Cafenele, cafe_id)
    if not cafe:
        raise HTTPException(status_code=404, detail="Coffee shop not found.")

    if payload.slug is not None:
        new_slug = payload.slug.strip()
        if not new_slug:
            raise HTTPException(status_code=400, detail="Slug-ul nu poate fi gol.")
        exists = db.query(Cafenele).filter(Cafenele.slug == new_slug, Cafenele.id != cafe_id).first()
        if exists:
            raise HTTPException(status_code=409, detail="Slug already exists.")
        cafe.slug = new_slug

    if payload.name is not None:
        cafe.name = payload.name
    if payload.city is not None:
        cafe.city = payload.city
    if payload.area is not None:
        cafe.area = payload.area
    if payload.tags is not None:
        cafe.tags = payload.tags
    if payload.location is not None:
        cafe.address = payload.location
    if payload.hours is not None:
        cafe.hours_text = payload.hours
    if payload.about is not None:
        cafe.about_text = payload.about
    if payload.menu is not None:
        cafe.menu_text = payload.menu
    if payload.products is not None:
        cafe.products_text = payload.products

    cafe.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cafe)
    return cafe


@app.delete("/admin/cafes/{cafe_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_cafe(cafe_id: int, _: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    cafe = db.get(Cafenele, cafe_id)
    if not cafe:
        raise HTTPException(status_code=404, detail="Coffee shop not found.")
    db.delete(cafe)
    db.commit()
    return




# ============================ TRANSLATE =============================
class StaticTranslateRequest(BaseModel):
    texts: List[str]
    target: str = "ro"


TRANSLATION_CACHE_FILE = os.path.join(
    os.path.dirname(__file__),
    "data",
    "static_translation_cache.json"
)


def load_static_translation_cache() -> dict:
    try:
        with open(TRANSLATION_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_static_translation_cache(cache: dict) -> None:
    os.makedirs(os.path.dirname(TRANSLATION_CACHE_FILE), exist_ok=True)

    with open(TRANSLATION_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


@app.post("/translate/static")
def translate_static(payload: StaticTranslateRequest):
    try:
        joined_text = "||".join(payload.texts)
        cache_key = hashlib.md5(
            f"{payload.target}::{joined_text}".encode("utf-8")
        ).hexdigest()

        cache = load_static_translation_cache()

        if cache_key in cache:
            return {
                "translations": cache[cache_key],
                "target": payload.target,
                "provider": "cache",
                "cached": True
            }

        client = translate.Client()
        translations = []

        for item in payload.texts:
            clean_item = (item or "").strip()

            if not clean_item:
                translations.append("")
                continue

            result = client.translate(
                clean_item,
                target_language=payload.target,
                format_="text"
            )

            translated = result.get("translatedText") or ""
            translations.append(html.unescape(translated))

        cache[cache_key] = translations
        save_static_translation_cache(cache)

        return {
            "translations": translations,
            "target": payload.target,
            "provider": "google",
            "cached": False
        }

    except Exception as e:
        logger.exception("Static translation failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Eroare la traducerea paginii About"
        )
    
@app.post("/reviews/{review_id}/translate", response_model=TranslateOut)
def translate_review(review_id: int, db: Session = Depends(get_db)):
    r: Review = db.get(Review, review_id)
    if not r:
        raise HTTPException(status_code=404, detail="Review inexistent")

    if not r.comment or not r.comment.strip():
        raise HTTPException(status_code=400, detail="Review-ul nu are text de tradus")

    # ✅ dacă avem deja traducerea, o returnăm (cache)
    if r.comment_ro and r.comment_ro.strip():
        return TranslateOut(
            review_id=r.id,
            source_lang=r.lang,
            translated_text_ro=r.comment_ro,
            provider=r.translation_provider or "google",
            cached=True,
        )

    try:
        client = translate.Client()

        # detect language
        detection = client.detect_language(r.comment)
        src_lang = detection.get("language")

        # translate to Romanian
        tr = client.translate(r.comment, target_language="ro")
        translated = tr.get("translatedText") or ""
        translated = html.unescape(translated)

    except Exception as e:
        logger.exception("Translate failed: %s", e)
        raise HTTPException(status_code=500, detail="Eroare la traducere (Google Translate)")

    # save cache in DB
    r.lang = src_lang
    r.comment_ro = translated
    r.translated_at = datetime.utcnow().isoformat()
    r.translation_provider = "google"
    db.commit()

    return TranslateOut(
        review_id=r.id,
        source_lang=src_lang,
        translated_text_ro=translated,
        provider="google",
        cached=False,
    )

@app.post("/admin/reviews/backfill-lang")
def backfill_lang(_: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    client = translate.Client()

    # ia doar review-urile fără lang
    rows = (
        db.query(Review)
        .filter(Review.lang.is_(None))
        .filter(Review.comment.isnot(None))
        .all()
    )

    updated = 0
    for r in rows:
        txt = (r.comment or "").strip()
        if not txt:
            continue
        try:
            det = client.detect_language(txt)
            r.lang = (det.get("language") or "").lower() or None
            updated += 1
        except Exception as e:
            logger.warning("detect_language failed for review_id=%s: %s", r.id, e)

    db.commit()
    return {"updated": updated, "total_missing_before": len(rows)}

@app.post("/admin/reviews/backfill-ml")
def backfill_ml(_: Cafegii = Depends(admin_required), db: Session = Depends(get_db)):
    client = translate.Client()

    rows = (
        db.query(Review)
        .filter(Review.comment.isnot(None))
        .all()
    )

    updated = 0

    for r in rows:
        txt = (r.comment or "").strip()
        if not txt:
            continue

        try:
            # 1. detect language dacă lipsește
            if not r.lang:
                det = client.detect_language(txt)
                r.lang = (det.get("language") or "").lower() or None

            src_lang = r.lang

            # 2. comment_en
            if not r.comment_en:
                if src_lang == "en":
                    r.comment_en = txt
                else:
                    tr_en = client.translate(txt, target_language="en")
                    r.comment_en = html.unescape(tr_en.get("translatedText") or "")

            # 3. comment_ro
            if not r.comment_ro:
                if src_lang == "ro":
                    r.comment_ro = txt
                else:
                    tr_ro = client.translate(txt, target_language="ro")
                    r.comment_ro = html.unescape(tr_ro.get("translatedText") or "")

            # 4. sentiment
            text_for_analysis = r.comment_en or txt
            if text_for_analysis and (r.sentiment_label is None or r.sentiment_score is None):
                label, score = analyze_sentiment(text_for_analysis)
                r.sentiment_label = label
                r.sentiment_score = score

            # 5. metadata
            if not r.translated_at:
                r.translated_at = datetime.utcnow().isoformat()
            if not r.translation_provider:
                r.translation_provider = "google"

            updated += 1

        except Exception as e:
            logger.warning("Backfill ML failed for review_id=%s: %s", r.id, e)

    db.commit()
    return {"updated": updated, "total_reviews_checked": len(rows)}

# ============================ ML =============================

@app.get("/analytics/sentiment", response_model=SentimentAnalyticsOut)
def sentiment_analytics(db: Session = Depends(get_db)):
    total = db.query(Review).filter(Review.sentiment_label.isnot(None)).count()

    if total == 0:
        return SentimentAnalyticsOut(
            total_reviews=0,
            positive=0,
            neutral=0,
            negative=0,
            positive_percent=0.0,
            neutral_percent=0.0,
            negative_percent=0.0,
        )

    positive = db.query(Review).filter(Review.sentiment_label == "positive").count()
    neutral = db.query(Review).filter(Review.sentiment_label == "neutral").count()
    negative = db.query(Review).filter(Review.sentiment_label == "negative").count()

    return SentimentAnalyticsOut(
        total_reviews=total,
        positive=positive,
        neutral=neutral,
        negative=negative,
        positive_percent=round(positive / total * 100, 1),
        neutral_percent=round(neutral / total * 100, 1),
        negative_percent=round(negative / total * 100, 1),
    )

# ============================ AI COFFEE ASSISTANT =============================

def build_ai_cafe_context(db: Session, current_user: Optional[Cafegii]) -> str:
    cafe_rows = (
        db.query(
            Cafenele,
            func.count(Review.id).label("review_count"),
            func.avg(Review.rating).label("avg_rating"),
        )
        .outerjoin(Review, Review.cafe_id == Cafenele.id)
        .group_by(Cafenele.id)
        .order_by(Cafenele.name.asc())
        .all()
    )

    cafe_lines = []
    for cafe, review_count, avg_rating in cafe_rows[:12]:
        menu = "; ".join(
            part for part in [
                (cafe.menu_text or "").strip(),
                (cafe.products_text or "").strip(),
            ]
            if part
        )
        cafe_lines.append(
            "- {name} | city: {city} | area: {area} | address: {address} | "
            "tags: {tags} | hours: {hours} | rating: {rating}/5 from {count} reviews | "
            "menu/products: {menu}".format(
                name=cafe.name,
                city=cafe.city or "unknown",
                area=cafe.area or "unknown",
                address=cafe.address or "unknown",
                tags=cafe.tags or "none",
                hours=cafe.hours_text or "unknown",
                rating=round(float(avg_rating or 0), 2),
                count=int(review_count or 0),
                menu=menu[:700] or "unknown",
            )
        )

    recent_review_rows = (
        db.query(Review, Cafenele)
        .join(Cafenele, Review.cafe_id == Cafenele.id)
        .order_by(Review.created_at.desc())
        .limit(10)
        .all()
    )

    review_lines = []
    for review, cafe in recent_review_rows:
        comment = (review.comment_en or review.comment_ro or review.comment or "").strip()
        items = (review.purchased_items or "").strip()
        review_lines.append(
            f"- {cafe.name}: {review.rating}/5; items: {items or 'unknown'}; "
            f"sentiment: {review.sentiment_label or 'unknown'}; comment: {comment[:280] or 'none'}"
        )

    user_context = "User is not logged in."
    if current_user:
        user_reviews = (
            db.query(Review, Cafenele)
            .join(Cafenele, Review.cafe_id == Cafenele.id)
            .filter(Review.user_id == current_user.id)
            .order_by(Review.created_at.desc())
            .limit(8)
            .all()
        )
        favorite_counts = {}
        for review, _ in user_reviews:
            for item in split_items(review.purchased_items):
                normalized = normalize_drink_name(item)
                if normalized:
                    favorite_counts[normalized] = favorite_counts.get(normalized, 0) + 1
        favorite_drinks = ", ".join(
            name for name, _ in sorted(favorite_counts.items(), key=lambda x: (-x[1], x[0]))[:5]
        )
        user_context = (
            f"Logged-in user: {current_user.prenume} {current_user.nume}. "
            f"Likely favorite drinks from recent reviews: {favorite_drinks or 'not enough data'}."
        )

    return (
        "WhereToCofi app data snapshot:\n\n"
        "Cafes:\n" + ("\n".join(cafe_lines) or "No cafes saved yet.") + "\n\n"
        "Recent public reviews:\n" + ("\n".join(review_lines) or "No reviews saved yet.") + "\n\n"
        "User context:\n" + user_context
    )


def extract_openai_text(response_payload: dict) -> str:
    if response_payload.get("output_text"):
        return str(response_payload["output_text"]).strip()

    chunks = []
    for item in response_payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                chunks.append(str(content["text"]))

    return "\n".join(chunks).strip()


def ask_openai_coffee_assistant(question: str, context: str) -> str:
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI assistant is not configured. Set OPENAI_API_KEY in backend/.env.",
        )

    body = {
        "model": OPENAI_MODEL,
        "store": False,
        "input": [
            {
                "role": "developer",
                "content": (
                    "You are the WhereToCofi virtual coffee assistant. "
                    "Answer in the same language as the user. Be concise, warm, and practical. "
                    "Use the app data snapshot for cafe recommendations, ratings, menus, and user preferences. "
                    "If the data is not enough, say that clearly and offer a useful general coffee answer. "
                    "Do not invent cafes, ratings, menu items, reviews, or user history."
                ),
            },
            {"role": "user", "content": context},
            {"role": "user", "content": question},
        ],
    }

    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=OPENAI_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        logger.error("OpenAI API HTTP error: %s", detail)
        raise HTTPException(status_code=502, detail="OpenAI API returned an error.")
    except Exception as e:
        logger.exception("OpenAI API request failed: %s", e)
        raise HTTPException(status_code=502, detail="AI assistant could not reach OpenAI API.")

    answer = extract_openai_text(payload)
    if not answer:
        raise HTTPException(status_code=502, detail="OpenAI API returned an empty answer.")
    return answer


@app.post("/ai/ask", response_model=AiAskOut)
def ai_ask(
    payload: AiAskIn,
    current_user: Optional[Cafegii] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    question = payload.question.strip()
    context = build_ai_cafe_context(db, current_user)
    answer = ask_openai_coffee_assistant(question, context)
    return AiAskOut(answer=answer, source=f"OpenAI Responses API ({OPENAI_MODEL}) + database")

    q = normalize_text_basic(question)
    answer_in_ro = is_romanian_question(question)

    ai_data = load_ai_data()
    drinks = ai_data["drinks"]
    methods = ai_data["methods"]
    beans = ai_data["beans"]
    rules = ai_data["rules"]

    cafes = db.query(Cafenele).all()

    matched_drinks = find_exact_or_related(drinks, question) if not any(word in q for word in ["review", "reviews", "recenzii", "rating"]) else []
    matched_methods = find_exact_or_related(methods, question)
    matched_beans = find_exact_or_related(beans, question)
    matched_rule = detect_ai_rule(question, rules)

    account_hint = ""
    if not current_user:
        account_hint = (
            " Pentru recomandări personalizate pe baza review-urilor tale, autentifică-te."
            if answer_in_ro
            else " Log in for personalized recommendations based on your reviews."
        )

        # Review/café ranking questions
    review_rank_markers = [
        "best reviews", "highest reviews", "top reviews", "best rated",
        "highest rated", "top rated",
        "cele mai bune review", "cele mai bune recenzii",
        "cele mai bune ratinguri", "cel mai bun rating",
        "care cafenea are cele mai bune recenzii",
        "care cafenea are cel mai bun rating",
        "top cafenele"
    ]

    if any(marker in q for marker in review_rank_markers):
        rows = (
            db.query(
                Cafenele,
                func.count(Review.id).label("review_count"),
                func.avg(Review.rating).label("avg_rating")
            )
            .join(Review, Review.cafe_id == Cafenele.id)
            .group_by(Cafenele.id)
            .having(func.count(Review.id) > 0)
            .order_by(func.avg(Review.rating).desc(), func.count(Review.id).desc())
            .limit(5)
            .all()
        )

        if not rows:
            return AiAskOut(
                source="reviews database",
                answer=(
                    "Nu am încă suficiente review-uri ca să fac un top al cafenelelor."
                    if answer_in_ro
                    else "I do not have enough reviews yet to rank cafés."
                )
            )

        if answer_in_ro:
            lines = [
                f"{cafe.name} — {round(float(avg_rating or 0), 2)}/5 din {review_count} review-uri"
                for cafe, review_count, avg_rating in rows
            ]

            return AiAskOut(
                source="reviews database",
                answer=(
                    "Pe baza review-urilor utilizatorilor, cafenelele cu cele mai bune ratinguri sunt: "
                    + "; ".join(lines)
                    + "."
                )
            )

        lines = [
            f"{cafe.name} — {round(float(avg_rating or 0), 2)}/5 from {review_count} reviews"
            for cafe, review_count, avg_rating in rows
        ]

        return AiAskOut(
            source="reviews database",
            answer=(
                "Based on user reviews, the best rated cafés are: "
                + "; ".join(lines)
                + "."
            )
        )
    
    # 1. Favorite drink din review-uri
    favorite_markers = [
        "bautura mea", "băutura mea", "preferata mea", "preferată mea",
        "ce beau eu", "my favorite", "my drink", "what do i drink"
    ]

    if any(normalize_text_basic(m) in q for m in favorite_markers):
        if not current_user:
            return AiAskOut(
                source="database",
                answer=(
                    "Nu pot calcula băutura ta preferată pentru că nu ești autentificat(ă)."
                    if answer_in_ro
                    else "I cannot calculate your favorite drink because you are not logged in."
                )
            )

        user_reviews = (
            db.query(Review)
            .filter(Review.user_id == current_user.id)
            .all()
        )

        counter = {}
        for review in user_reviews:
            for item in split_items(review.purchased_items):
                norm = normalize_drink_name(item)
                if norm:
                    counter[norm] = counter.get(norm, 0) + 1

        if not counter:
            return AiAskOut(
                source="database",
                answer=(
                    "Nu am încă suficiente produse cumpărate în review-urile tale ca să detectez băutura preferată."
                    if answer_in_ro
                    else "I do not have enough purchased items from your reviews to detect your favorite drink yet."
                )
            )

        top_drink, count = sorted(counter.items(), key=lambda x: (-x[1], x[0]))[0]

        return AiAskOut(
            source="database",
            answer=(
                f"Pe baza produselor cumpărate din review-urile tale, băutura ta cea mai frecventă este {top_drink.title()} ({count}x)."
                if answer_in_ro
                else f"Based on your purchased items, your most frequent drink is {top_drink.title()} ({count}x)."
            )
        )

    # 2. Reguli de recomandare: tare, seara, rece, lapte, fără lapte
    if matched_rule:
        rec_drinks = matched_rule.get("recommended_drinks", [])
        avoid_drinks = matched_rule.get("avoid_drinks", [])
        explanation = matched_rule.get("explanation_ro" if answer_in_ro else "explanation_en", "")
        health_note = matched_rule.get("health_note_ro" if answer_in_ro else "health_note_en", "")

        cafe_matches = find_cafes_for_terms(cafes, rec_drinks)
        cafes_text = format_list([c.name for c in cafe_matches])

        if answer_in_ro:
            return AiAskOut(
                source="coffee_recommendation_rules.json + database",
                answer=(
                    f"{explanation} "
                    f"Îți recomand: {format_list(rec_drinks)}. "
                    f"Aș evita: {format_list(avoid_drinks)}. "
                    f"Cafenele posibile din aplicație: {cafes_text}. "
                    f"{health_note}"
                    f"{account_hint}"
                )
            )

        return AiAskOut(
            source="coffee_recommendation_rules.json + database",
            answer=(
                f"{explanation} "
                f"I recommend: {format_list(rec_drinks)}. "
                f"I would avoid: {format_list(avoid_drinks)}. "
                f"Possible cafés from the app: {cafes_text}. "
                f"{health_note}"
                f"{account_hint}"
            )
        )
    
        # 2.5. Recomandare cafenea pe baza review-urilor pentru o băutură
    where_markers = ["unde", "where", "find", "gasi", "găsi", "bea", "drink", "good", "bun", "buna", "bună"]

    if matched_drinks and any(marker in q for marker in where_markers):
        d = matched_drinks[0]
        drink_name = d.get("name", "")
        review_matches = find_review_based_cafes_for_drink(db, drink_name)

        if review_matches:
            lines = []

            for item in review_matches:
                cafe = item["cafe"]
                lines.append(
                    f"{cafe.name} — rating mediu {item['avg_rating']}/5 din {item['count']} review-uri"
                    if answer_in_ro
                    else f"{cafe.name} — average rating {item['avg_rating']}/5 from {item['count']} reviews"
                )

            if answer_in_ro:
                return AiAskOut(
                    source="reviews database + coffee_knowledge.json",
                    answer=(
                        f"Pentru {drink_name.title()}, pe baza review-urilor din aplicație, îți recomand: "
                        + "; ".join(lines)
                        + "."
                        + account_hint
                    )
                )

            return AiAskOut(
                source="reviews database + coffee_knowledge.json",
                answer=(
                    f"For {drink_name.title()}, based on reviews in the app, I recommend: "
                    + "; ".join(lines)
                    + "."
                    + account_hint
                )
            )

        # dacă nu există review-uri pentru băutura respectivă, cade pe meniuri

    # 3. Întrebări despre ingrediente / gust / cofeină pentru băuturi
    if matched_drinks:
        d = matched_drinks[0]
        name = d.get("name", "drink").title()
        ingredients = format_ai_list(d.get("ingredients", []), answer_in_ro)
        taste = format_ai_list(d.get("taste_profile", []), answer_in_ro)
        caffeine = translate_ai_term(d.get("caffeine_level", "unknown"), answer_in_ro)
        intensity = translate_ai_term(d.get("intensity", "unknown"), answer_in_ro)
        similar = format_ai_list(d.get("similar_drinks", []), answer_in_ro)
        health_note = translate_ai_sentence(d.get("health_note", ""), answer_in_ro)

        cafe_matches = find_cafes_for_terms(cafes, [d.get("name", "")])
        cafes_text = format_list([c.name for c in cafe_matches])

        if answer_in_ro:
            return AiAskOut(
                source="coffee_knowledge.json + database",
                answer=(
                    f"{name}: ingrediente — {ingredients}. "
                    f"Gust: {taste}. Intensitate: {intensity}. Cofeină: {caffeine}. "
                    f"Băuturi similare: {similar}. "
                    f"Cafenele unde apare posibil în meniu: {cafes_text}. "
                    f"{health_note}"
                    f"{account_hint}"
                )
            )

        return AiAskOut(
            source="coffee_knowledge.json + database",
            answer=(
                f"{name}: ingredients — {ingredients}. "
                f"Taste: {taste}. Intensity: {intensity}. Caffeine: {caffeine}. "
                f"Similar drinks: {similar}. "
                f"Possible cafés where it appears in the menu: {cafes_text}. "
                f"{health_note}"
                f"{account_hint}"
            )
        )

    # 4. Întrebări despre metode de preparare
    if matched_methods:
        m = matched_methods[0]

        if answer_in_ro:
            return AiAskOut(
                source="brewing_methods.json",
                answer=(
                    f"{m.get('name', '').title()} este o metodă din categoria {m.get('category', 'necunoscută')}. "
                    f"{m.get('description', '')} "
                    f"Profil de gust: {format_list(m.get('taste_profile', []))}. "
                    f"Este potrivită pentru: {format_list(m.get('best_for', []))}."
                    f"{account_hint}"
                )
            )

        return AiAskOut(
            source="brewing_methods.json",
            answer=(
                f"{m.get('name', '').title()} is a {m.get('category', 'unknown')} method. "
                f"{m.get('description', '')} "
                f"Taste profile: {format_list(m.get('taste_profile', []))}. "
                f"Best for: {format_list(m.get('best_for', []))}."
                f"{account_hint}"
            )
        )

    # 5. Întrebări despre boabe
    if matched_beans:
        b = matched_beans[0]

        if answer_in_ro:
            return AiAskOut(
                source="coffee_beans.json",
                answer=(
                    f"{b.get('name', '').title()} este un tip de cafea cu profil: {format_list(b.get('taste_profile', []))}. "
                    f"Cofeină: {b.get('caffeine_level', 'necunoscut')}. "
                    f"Este recomandată pentru: {format_list(b.get('recommended_for', []))}. "
                    f"Nu este ideală pentru: {format_list(b.get('not_recommended_for', []))}. "
                    f"{b.get('health_note', '')}"
                    f"{account_hint}"
                )
            )

        return AiAskOut(
            source="coffee_beans.json",
            answer=(
                f"{b.get('name', '').title()} has this profile: {format_list(b.get('taste_profile', []))}. "
                f"Caffeine: {b.get('caffeine_level', 'unknown')}. "
                f"Recommended for: {format_list(b.get('recommended_for', []))}. "
                f"Not ideal for: {format_list(b.get('not_recommended_for', []))}. "
                f"{b.get('health_note', '')}"
                f"{account_hint}"
            )
        )

    # 6. Căutare cafenea/zonă
    cafe_matches = []
    useful_words = [
        w for w in q.split()
        if len(w) >= 4 and w not in {
            "unde", "care", "este", "sunt", "vreau", "cafea",
            "cafenea", "cafenele", "coffee", "drink", "with"
        }
    ]

    for cafe in cafes:
        blob = normalize_text_basic(" ".join([
            cafe.name or "",
            cafe.city or "",
            cafe.area or "",
            cafe.tags or "",
            cafe.address or "",
            cafe.about_text or "",
            cafe.menu_text or "",
            cafe.products_text or "",
        ]))

        if any(w in blob for w in useful_words):
            cafe_matches.append(cafe)

    if cafe_matches:
        cafes_text = format_list([c.name for c in cafe_matches])

        return AiAskOut(
            source="database",
            answer=(
                f"Am găsit în aplicație: {cafes_text}. Recomandarea este bazată strict pe datele salvate despre cafenele."
                if answer_in_ro
                else f"I found these in the app: {cafes_text}. This is based strictly on stored café data."
            )
        )

    # 7. Fallback strict
    return AiAskOut(
        source="database + json files",
        answer=(
            "Nu am găsit o potrivire clară în datele aplicației. Întreabă-mă despre o băutură, o metodă, un tip de boabe, o zonă sau o recomandare de tip: cafea tare, cafea seara, cafea rece, cu lapte sau fără lapte."
            if answer_in_ro
            else "I could not find a clear match in the app data. Ask me about a drink, brewing method, bean type, area, or recommendation such as strong coffee, evening coffee, cold coffee, milk-based coffee or no-milk coffee."
        )
    )
