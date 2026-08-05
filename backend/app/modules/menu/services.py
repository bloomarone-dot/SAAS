from sqlalchemy.orm import Session

from app.modules.catalog.classification import classify_sale_channel, requires_kitchen_preparation
from app.modules.menu.models import CategoryModel, DishModel
from app.modules.menu.schemas import CategoryCreate, DishCreate, DishUpdate
from app.tenancy import tenant_find


class MenuService:
    @staticmethod
    def create_category(db: Session, restaurant_id: str, category_data: CategoryCreate):
        category = CategoryModel(
            restaurant_id=restaurant_id,
            name=category_data.name,
            description=category_data.description,
            image_url=category_data.image_url,
        )
        db.add(category)
        db.commit()
        db.refresh(category)
        return category

    @staticmethod
    def get_restaurant_catalog(db: Session, restaurant_id: str, include_unavailable: bool = True):
        categories = (
            db.query(CategoryModel)
            .filter(CategoryModel.restaurant_id == restaurant_id, CategoryModel.is_active.is_(True))
            .order_by(CategoryModel.created_at.desc())
            .all()
        )
        dish_query = db.query(DishModel).filter(DishModel.restaurant_id == restaurant_id)
        if not include_unavailable:
            dish_query = dish_query.filter(DishModel.is_available.is_(True))
        dishes = dish_query.order_by(DishModel.created_at.desc()).all()
        return categories, dishes

    @staticmethod
    def get_categories_by_restaurant(db: Session, restaurant_id: str):
        return (
            db.query(CategoryModel)
            .filter(CategoryModel.restaurant_id == restaurant_id)
            .order_by(CategoryModel.created_at.desc())
            .all()
        )

    @staticmethod
    def update_category(db: Session, restaurant_id: str, category_id: str, category_data):
        category = tenant_find(db, CategoryModel, category_id, restaurant_id)
        if not category:
            return None
        update_data = category_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(category, key, value)
        db.commit()
        db.refresh(category)
        return category

    @staticmethod
    def delete_category(db: Session, restaurant_id: str, category_id: str):
        category = tenant_find(db, CategoryModel, category_id, restaurant_id)
        if not category:
            return False
        category.is_active = False
        for dish in category.items:
            dish.is_available = False
        db.commit()
        return True

    @staticmethod
    def create_dish(db: Session, restaurant_id: str, dish_data: DishCreate):
        if dish_data.category_id and not MenuService.category_belongs_to_restaurant(
            db, restaurant_id, dish_data.category_id
        ):
            return None

        dish = DishModel(
            restaurant_id=restaurant_id,
            category_id=dish_data.category_id,
            name=dish_data.name,
            description=dish_data.description,
            price=round(float(dish_data.price)),
            cost_per_dish=round(float(dish_data.cost_per_dish or 0)),
            image_url=dish_data.image_url,
            is_available=dish_data.is_available,
        )
        category = tenant_find(db, CategoryModel, dish.category_id, restaurant_id)
        dish.sale_channel = classify_sale_channel(
            dish.name,
            dish.description,
            category.name if category else None,
            category.description if category else None,
        )
        dish.requires_kitchen = requires_kitchen_preparation(
            dish.name,
            dish.description,
            category.name if category else None,
            category.description if category else None,
            sale_channel=dish.sale_channel,
            explicit=dish_data.requires_kitchen,
        )
        db.add(dish)
        db.commit()
        db.refresh(dish)
        return dish

    @staticmethod
    def get_dishes_by_category(
        db: Session,
        restaurant_id: str,
        category_id: str,
        include_unavailable: bool = True,
    ):
        query = db.query(DishModel).filter(
            DishModel.restaurant_id == restaurant_id,
            DishModel.category_id == category_id,
        )
        if not include_unavailable:
            query = query.filter(DishModel.is_available.is_(True))
        return query.order_by(DishModel.created_at.desc()).all()

    @staticmethod
    def update_dish(db: Session, restaurant_id: str, dish_id: str, dish_data: DishUpdate):
        dish = tenant_find(db, DishModel, dish_id, restaurant_id)
        if not dish:
            return None

        update_data = dish_data.dict(exclude_unset=True)
        category_id = update_data.get("category_id")
        if category_id and not MenuService.category_belongs_to_restaurant(db, restaurant_id, category_id):
            return None

        for key, value in update_data.items():
            if key in {"price", "cost_per_dish"} and value is not None:
                value = round(float(value))
            setattr(dish, key, value)
        category = tenant_find(db, CategoryModel, dish.category_id, restaurant_id)
        previous_channel = dish.sale_channel
        dish.sale_channel = classify_sale_channel(
            dish.name,
            dish.description,
            category.name if category else None,
            category.description if category else None,
        )
        explicit_kitchen = update_data.get("requires_kitchen") if "requires_kitchen" in update_data else None
        if explicit_kitchen is not None:
            dish.requires_kitchen = bool(explicit_kitchen)
        elif dish.sale_channel != previous_channel or dish.requires_kitchen is None:
            dish.requires_kitchen = requires_kitchen_preparation(
                dish.name,
                dish.description,
                category.name if category else None,
                category.description if category else None,
                sale_channel=dish.sale_channel,
            )
        db.commit()
        db.refresh(dish)
        return dish

    @staticmethod
    def toggle_dish_availability(db: Session, restaurant_id: str, dish_id: str):
        dish = tenant_find(db, DishModel, dish_id, restaurant_id)
        if not dish:
            return None
        dish.is_available = not dish.is_available
        db.commit()
        db.refresh(dish)
        return dish

    @staticmethod
    def delete_dish(db: Session, restaurant_id: str, dish_id: str):
        dish = tenant_find(db, DishModel, dish_id, restaurant_id)
        if not dish:
            return False
        dish.is_available = False
        db.commit()
        return True

    @staticmethod
    def category_belongs_to_restaurant(db: Session, restaurant_id: str, category_id: str) -> bool:
        return tenant_find(db, CategoryModel, category_id, restaurant_id) is not None
