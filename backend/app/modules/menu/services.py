from sqlalchemy.orm import Session

from app.modules.catalog.classification import classify_sale_channel
from app.modules.menu.models import CategoryModel, DishModel
from app.modules.menu.schemas import CategoryCreate, DishCreate, DishUpdate


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
    def get_categories_by_restaurant(db: Session, restaurant_id: str):
        return (
            db.query(CategoryModel)
            .filter(CategoryModel.restaurant_id == restaurant_id)
            .order_by(CategoryModel.created_at.desc())
            .all()
        )

    @staticmethod
    def delete_category(db: Session, restaurant_id: str, category_id: str):
        category = db.get(CategoryModel, category_id)
        if not category or category.restaurant_id != restaurant_id:
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
            price=dish_data.price,
            cost_per_dish=dish_data.cost_per_dish,
            image_url=dish_data.image_url,
            is_available=dish_data.is_available,
        )
        category = db.get(CategoryModel, dish.category_id) if dish.category_id else None
        dish.sale_channel = classify_sale_channel(
            dish.name,
            dish.description,
            category.name if category else None,
            category.description if category else None,
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
        dish = db.get(DishModel, dish_id)
        if not dish or dish.restaurant_id != restaurant_id:
            return None

        update_data = dish_data.dict(exclude_unset=True)
        category_id = update_data.get("category_id")
        if category_id and not MenuService.category_belongs_to_restaurant(db, restaurant_id, category_id):
            return None

        for key, value in update_data.items():
            setattr(dish, key, value)
        category = db.get(CategoryModel, dish.category_id) if dish.category_id else None
        dish.sale_channel = classify_sale_channel(
            dish.name,
            dish.description,
            category.name if category else None,
            category.description if category else None,
        )
        db.commit()
        db.refresh(dish)
        return dish

    @staticmethod
    def toggle_dish_availability(db: Session, restaurant_id: str, dish_id: str):
        dish = db.get(DishModel, dish_id)
        if not dish or dish.restaurant_id != restaurant_id:
            return None
        dish.is_available = not dish.is_available
        db.commit()
        db.refresh(dish)
        return dish

    @staticmethod
    def delete_dish(db: Session, restaurant_id: str, dish_id: str):
        dish = db.get(DishModel, dish_id)
        if not dish or dish.restaurant_id != restaurant_id:
            return False
        dish.is_available = False
        db.commit()
        return True

    @staticmethod
    def category_belongs_to_restaurant(db: Session, restaurant_id: str, category_id: str) -> bool:
        category = db.get(CategoryModel, category_id)
        return bool(category and category.restaurant_id == restaurant_id)
