import enum


class Role(str, enum.Enum):
    """Roles metier servant de base aux permissions et aux menus."""

    SUPERADMIN = "SUPERADMIN"
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    SERVEUR = "SERVEUR"
    CUISINE = "CUISINE"
    CAISSE = "CAISSE"
    STOCK = "STOCK"
    COMPTABLE = "COMPTABLE"


class Permission(str, enum.Enum):
    """Droits applicatifs attribuables finement a chaque utilisateur."""

    RESTAURANT_SETTINGS_READ = "restaurant.settings.read"
    RESTAURANT_SETTINGS_UPDATE = "restaurant.settings.update"
    BRANCH_READ = "branch.read"
    BRANCH_CREATE = "branch.create"
    BRANCH_UPDATE = "branch.update"
    USER_READ = "user.read"
    USER_CREATE = "user.create"
    USER_UPDATE = "user.update"
    USER_PERMISSIONS_UPDATE = "user.permissions.update"
    SERVICE_READ = "service.read"
    SERVICE_UPDATE = "service.update"
    KITCHEN_READ = "kitchen.read"
    KITCHEN_UPDATE = "kitchen.update"
    CASHIER_READ = "cashier.read"
    CASHIER_UPDATE = "cashier.update"
    STOCK_READ = "stock.read"
    STOCK_UPDATE = "stock.update"
    ACCOUNTING_READ = "accounting.read"
    ACCOUNTING_UPDATE = "accounting.update"


# Permissions obtenues automatiquement via le role. Les permissions explicites
# de UserPermission peuvent completer ces droits utilisateur par utilisateur.
ROLE_DEFAULT_PERMISSIONS: dict[Role, set[Permission]] = {
    Role.SUPERADMIN: set(Permission),
    Role.ADMIN: {
        Permission.RESTAURANT_SETTINGS_READ,
        Permission.RESTAURANT_SETTINGS_UPDATE,
        Permission.BRANCH_READ,
        Permission.BRANCH_CREATE,
        Permission.BRANCH_UPDATE,
        Permission.USER_READ,
        Permission.USER_CREATE,
        Permission.USER_UPDATE,
        Permission.USER_PERMISSIONS_UPDATE,
        Permission.SERVICE_READ,
        Permission.SERVICE_UPDATE,
        Permission.KITCHEN_READ,
        Permission.KITCHEN_UPDATE,
        Permission.CASHIER_READ,
        Permission.CASHIER_UPDATE,
        Permission.STOCK_READ,
        Permission.STOCK_UPDATE,
        Permission.ACCOUNTING_READ,
        Permission.ACCOUNTING_UPDATE,
    },
    Role.MANAGER: {
        Permission.BRANCH_READ,
        Permission.USER_READ,
        Permission.SERVICE_READ,
        Permission.SERVICE_UPDATE,
        Permission.KITCHEN_READ,
        Permission.CASHIER_READ,
        Permission.CASHIER_UPDATE,
        Permission.STOCK_READ,
        Permission.STOCK_UPDATE,
    },
    Role.SERVEUR: {Permission.SERVICE_READ, Permission.SERVICE_UPDATE},
    Role.CUISINE: {Permission.KITCHEN_READ, Permission.KITCHEN_UPDATE, Permission.STOCK_READ, Permission.STOCK_UPDATE},
    Role.CAISSE: {Permission.CASHIER_READ, Permission.CASHIER_UPDATE},
    Role.STOCK: {Permission.STOCK_READ, Permission.STOCK_UPDATE, Permission.ACCOUNTING_READ, Permission.ACCOUNTING_UPDATE},
    Role.COMPTABLE: {
        Permission.STOCK_READ,
        Permission.STOCK_UPDATE,
        Permission.ACCOUNTING_READ,
        Permission.ACCOUNTING_UPDATE,
    },
}
