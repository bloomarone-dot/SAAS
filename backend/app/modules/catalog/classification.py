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
    "cola",
    "cafe",
    "eau",
    "fanta",
    "gazeuse",
    "gazeuses",
    "gazeur",
    "gin",
    "guinness",
    "jus",
    "liqueur",
    "limonade",
    "malta",
    "pepsi",
    "rhum",
    "soda",
    "soft",
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


# Boissons servies au bar sans passage cuisine (vin, whisky, sodas…).
BAR_ONLY_KEYWORDS = {
    "alcool",
    "biere",
    "bouteille",
    "brasserie",
    "champagne",
    "coca",
    "cola",
    "fanta",
    "gazeuse",
    "gazeur",
    "gin",
    "guinness",
    "limonade",
    "liqueur",
    "rhum",
    "soda",
    "spiritueux",
    "sprite",
    "tequila",
    "vin",
    "vodka",
    "whisky",
    "whiskey",
}

# Boissons préparées en cuisine (ex. jus naturel pressé).
KITCHEN_BEVERAGE_PHRASES = (
    "jus naturel",
    "jus frais",
    "jus maison",
    "jus presse",
    "jus pressé",
    "smoothie",
    "cocktail fruit",
)


def requires_kitchen_preparation(
    *values: str | None,
    sale_channel: str = "REPAS",
    explicit: bool | None = None,
) -> bool:
    """Indique si un article doit générer un ticket cuisine."""
    if explicit is not None:
        return explicit
    if sale_channel == "EMBALLAGE":
        return False

    text = " ".join(normalize_text(value) for value in values)
    for phrase in KITCHEN_BEVERAGE_PHRASES:
        if phrase in text:
            return True

    tokens = set(re.findall(r"[a-z0-9]+", text))
    if sale_channel == "BOISSON":
        if tokens.intersection(BAR_ONLY_KEYWORDS):
            return False
        if "jus" in tokens:
            return False
        return False

    return True


def requires_kitchen_for_menu_item(item: MenuItem) -> bool:
    category = getattr(item, "category", None)
    explicit = getattr(item, "requires_kitchen", None)
    return requires_kitchen_preparation(
        item.name,
        item.description,
        category.name if category else None,
        category.description if category else None,
        sale_channel=item.sale_channel or classify_menu_item(item),
        explicit=explicit,
    )
