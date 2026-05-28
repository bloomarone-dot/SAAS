import unicodedata
import re

from app.modules.catalog.models import MenuItem


BEVERAGE_KEYWORDS = {
    "alcool",
    "biere",
    "boisson",
    "boissons",
    "bouteille",
    "brasserie",
    "champagne",
    "cocktail",
    "coca",
    "cafe",
    "eau",
    "guinness",
    "fanta",
    "gin",
    "jus",
    "liqueur",
    "limonade",
    "rhum",
    "soda",
    "smoothie",
    "spiritueux",
    "sprite",
    "tequila",
    "the",
    "sucrerie",
    "vin",
    "whisky",
    "whiskey",
    "vodka",
}


def normalize_text(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in normalized if not unicodedata.combining(char)).lower()


def classify_sale_channel(*values: str | None) -> str:
    text = " ".join(normalize_text(value) for value in values)
    tokens = set(re.findall(r"[a-z0-9]+", text))
    return "BOISSON" if tokens.intersection(BEVERAGE_KEYWORDS) else "REPAS"


def classify_menu_item(item: MenuItem) -> str:
    category = getattr(item, "category", None)
    return classify_sale_channel(
        item.name,
        item.description,
        category.name if category else None,
        category.description if category else None,
    )
