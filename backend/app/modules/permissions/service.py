from app.modules.permissions.models import Permission, ROLE_DEFAULT_PERMISSIONS, Role
from app.modules.permissions.schemas import PermissionGroupPublic, PermissionPublic, RolePresetPublic


PERMISSION_LABELS: dict[Permission, str] = {
    Permission.RESTAURANT_SETTINGS_READ: "Voir la configuration du restaurant",
    Permission.RESTAURANT_SETTINGS_UPDATE: "Modifier la configuration du restaurant",
    Permission.BRANCH_READ: "Voir les branches",
    Permission.BRANCH_CREATE: "Creer des branches",
    Permission.BRANCH_UPDATE: "Modifier les branches",
    Permission.USER_READ: "Voir le personnel",
    Permission.USER_CREATE: "Creer le personnel",
    Permission.USER_UPDATE: "Modifier le personnel",
    Permission.USER_PERMISSIONS_UPDATE: "Attribuer les permissions",
    Permission.SERVICE_READ: "Voir le service en salle",
    Permission.SERVICE_UPDATE: "Gerer le service en salle",
    Permission.KITCHEN_READ: "Voir la cuisine",
    Permission.KITCHEN_UPDATE: "Gerer la cuisine",
    Permission.CASHIER_READ: "Voir la caisse",
    Permission.CASHIER_UPDATE: "Gerer la caisse",
    Permission.STOCK_READ: "Voir les stocks",
    Permission.STOCK_UPDATE: "Gerer les stocks",
    Permission.ACCOUNTING_READ: "Voir la comptabilite",
    Permission.ACCOUNTING_UPDATE: "Gerer la comptabilite",
}

PERMISSION_GROUPS: tuple[tuple[str, str, str, tuple[Permission, ...]], ...] = (
    (
        "restaurant",
        "Restaurant",
        "Configuration du restaurant, branches et informations tenant.",
        (
            Permission.RESTAURANT_SETTINGS_READ,
            Permission.RESTAURANT_SETTINGS_UPDATE,
            Permission.BRANCH_READ,
            Permission.BRANCH_CREATE,
            Permission.BRANCH_UPDATE,
        ),
    ),
    (
        "users",
        "Personnel et accès",
        "Création des comptes, modification du personnel et attribution des droits.",
        (
            Permission.USER_READ,
            Permission.USER_CREATE,
            Permission.USER_UPDATE,
            Permission.USER_PERMISSIONS_UPDATE,
        ),
    ),
    (
        "service",
        "Service en salle",
        "Commandes, tables, suivi serveur et actions de service.",
        (Permission.SERVICE_READ, Permission.SERVICE_UPDATE),
    ),
    (
        "kitchen",
        "Cuisine",
        "Préparation des commandes, disponibilité des plats et suivi cuisine.",
        (Permission.KITCHEN_READ, Permission.KITCHEN_UPDATE),
    ),
    (
        "cashier",
        "Caisse",
        "Encaissements, reçus, remises autorisées et clôture de caisse.",
        (Permission.CASHIER_READ, Permission.CASHIER_UPDATE),
    ),
    (
        "stock",
        "Stock",
        "Entrées, sorties, seuils d'alerte, inventaires et mouvements.",
        (Permission.STOCK_READ, Permission.STOCK_UPDATE),
    ),
    (
        "accounting",
        "Comptabilité",
        "Dépenses, bénéfices, rapports financiers et suivi comptable.",
        (Permission.ACCOUNTING_READ, Permission.ACCOUNTING_UPDATE),
    ),
)

ROLE_LABELS: dict[Role, tuple[str, str]] = {
    Role.MANAGER: ("Manager", "Supervise le service, la cuisine, la caisse et une partie du stock."),
    Role.SERVEUR: ("Serveur / Serveuse", "Prend les commandes, suit les tables et sert les clients."),
    Role.CUISINE: ("Cuisine", "Traite les commandes à préparer et les disponibilités des plats."),
    Role.CAISSE: ("Caisse", "Encaisse les commandes, imprime les reçus et clôture son service."),
    Role.STOCK: ("Gestionnaire de stock", "Suit les produits, mouvements, seuils et inventaires."),
    Role.COMPTABLE: ("Comptable", "Suit les dépenses, rapports et données comptables."),
}


def get_permissions() -> list[PermissionPublic]:
    """Retourne le catalogue plat des permissions attribuables."""
    return [
        PermissionPublic(key=permission, label=PERMISSION_LABELS[permission])
        for permission in sorted(Permission, key=lambda item: item.value)
    ]


def get_permission_groups() -> list[PermissionGroupPublic]:
    """Retourne le catalogue groupe par module fonctionnel."""
    return [
        PermissionGroupPublic(
            key=key,
            label=label,
            description=description,
            permissions=[
                PermissionPublic(key=permission, label=PERMISSION_LABELS[permission])
                for permission in permissions
            ],
        )
        for key, label, description, permissions in PERMISSION_GROUPS
    ]


def get_role_presets() -> list[RolePresetPublic]:
    """Retourne les permissions par defaut des roles operationnels."""
    return [
        RolePresetPublic(
            role=role,
            label=ROLE_LABELS[role][0],
            description=ROLE_LABELS[role][1],
            permissions=sorted(ROLE_DEFAULT_PERMISSIONS.get(role, set()), key=lambda item: item.value),
        )
        for role in ROLE_LABELS
    ]

