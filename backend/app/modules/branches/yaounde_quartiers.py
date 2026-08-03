"""Quartiers de livraison Yaoundé avec frais par zone (FCFA).

Zones indicatives depuis le centre / axes denses :
- 500  : proche
- 1000 : intermédiaire
- 1500 : éloigné
- 2000 : périphérie
"""

from __future__ import annotations

# Quartier -> frais de livraison (FCFA)
YAOUNDE_QUARTIER_FEES: dict[str, int] = {
    # Zone proche — 500
    "Bastos": 500,
    "Bessengué": 500,
    "Briqueterie": 500,
    "Carrière": 500,
    "Centre-ville": 500,
    "Elig-Essono": 500,
    "Elig-Edzoa": 500,
    "Fouda": 500,
    "Golf": 500,
    "Hippodrome": 500,
    "Madagascar": 500,
    "Mokolo": 500,
    "Nlongkak": 500,
    "Tsinga": 500,
    # Zone intermédiaire — 1000
    "Biyem-Assi": 1000,
    "Ekounou": 1000,
    "Emombo": 1000,
    "Essos": 1000,
    "Etoudi": 1000,
    "Etoug-Ebé": 1000,
    "Kondengui": 1000,
    "Mballa II": 1000,
    "Melen": 1000,
    "Mvog-Ada": 1000,
    "Mvog-Atangana Mballa": 1000,
    "Mvog-Mbi": 1000,
    "Ngoa-Ekélé": 1000,
    "Nkomkana": 1000,
    "Obili": 1000,
    "Tongolo": 1000,
    # Zone éloignée — 1500
    "Ahala": 1500,
    "Damas": 1500,
    "Ebaa": 1500,
    "Efoulan": 1500,
    "Ekie": 1500,
    "Etetak": 1500,
    "Lendom": 1500,
    "Messame-Ndongo": 1500,
    "Messassi": 1500,
    "Mimboman": 1500,
    "Mvog-Betsi": 1500,
    "Ngousso": 1500,
    "Nkolbikok": 1500,
    "Nkolbisson": 1500,
    "Nkolmesseng": 1500,
    "Nkol-Messeng": 1500,
    "Nkomo": 1500,
    "Nsam": 1500,
    "Nsam-Ekaza": 1500,
    "Odza": 1500,
    "Oliga": 1500,
    "Santa Barbara": 1500,
    "Simbock": 1500,
    # Périphérie — 2000
    "Awae": 2000,
    "Mbankolo": 2000,
    "Mvan": 2000,
    "Ndamvout": 2000,
    "Ngoulemakong": 2000,
    "Nkol-Afeme": 2000,
    "Nkol-Ebogo": 2000,
    "Nkol-Eton": 2000,
    "Nkol-Foulou": 2000,
    "Nkol-Ndongo": 2000,
    "Nkolondom": 2000,
    "Olembe": 2000,
}

YAOUNDE_QUARTIERS: tuple[str, ...] = tuple(YAOUNDE_QUARTIER_FEES.keys())

DEFAULT_QUARTIER_FEE = 1000


def fee_for_quartier(name: str | None, fallback: float | int = DEFAULT_QUARTIER_FEE) -> int:
    """Retourne le tarif FCFA d'un quartier Yaoundé (insensible à la casse)."""
    key = (name or "").strip().lower()
    if not key:
        return int(fallback)
    for quartier, fee in YAOUNDE_QUARTIER_FEES.items():
        if quartier.lower() == key:
            return int(fee)
    return int(fallback)
