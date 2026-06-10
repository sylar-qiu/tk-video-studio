from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Asset, ExportJob, Product, ProductCategory, Shot, Work
from schemas import CategoryCreate, CategoryOut, CategoryUpdate, ProductCreate, ProductOut, ProductUpdate
from services.products import build_category_tree, category_path, product_to_out
from services.resource_stats import (
    on_product_created,
    on_product_deleted,
    on_product_tags_changed,
)
from services.tags import ensure_tags

router = APIRouter(prefix="/api")


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return build_category_tree(db)


@router.post("/categories", response_model=CategoryOut)
def create_category(body: CategoryCreate, db: Session = Depends(get_db)):
    if body.parent_id is not None and not db.get(ProductCategory, body.parent_id):
        raise HTTPException(404, "父类目不存在")
    cat = ProductCategory(
        name=body.name.strip(),
        parent_id=body.parent_id,
        sort_order=body.sort_order,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        parent_id=cat.parent_id,
        sort_order=cat.sort_order,
        path=category_path(cat, db) or cat.name,
        children=[],
    )


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.get(ProductCategory, category_id)
    if not cat:
        raise HTTPException(404, "类目不存在")
    if body.parent_id is not None:
        if body.parent_id == category_id:
            raise HTTPException(400, "不能将类目设为自己的子级")
        if body.parent_id and not db.get(ProductCategory, body.parent_id):
            raise HTTPException(404, "父类目不存在")
        cat.parent_id = body.parent_id
    if body.name is not None:
        cat.name = body.name.strip()
    if body.sort_order is not None:
        cat.sort_order = body.sort_order
    db.commit()
    db.refresh(cat)
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        parent_id=cat.parent_id,
        sort_order=cat.sort_order,
        path=category_path(cat, db) or cat.name,
        children=[],
    )


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.get(ProductCategory, category_id)
    if not cat:
        raise HTTPException(404, "类目不存在")
    children = db.query(ProductCategory).filter(ProductCategory.parent_id == category_id).count()
    if children:
        raise HTTPException(400, "请先删除或移走子类目")
    products = db.query(Product).filter(Product.category_id == category_id).count()
    if products:
        raise HTTPException(400, "该类目下仍有产品，无法删除")
    db.delete(cat)
    db.commit()
    return {"ok": True}


@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    products = db.query(Product).order_by(Product.id.desc()).all()
    return [product_to_out(p, db) for p in products]


@router.post("/products", response_model=ProductOut)
def create_product(body: ProductCreate, db: Session = Depends(get_db)):
    if body.category_id is not None and not db.get(ProductCategory, body.category_id):
        raise HTTPException(404, "类目不存在")
    product = Product(name=body.name.strip(), category_id=body.category_id)
    product.tags = body.tags
    if product.tags:
        ensure_tags(db, product.tags)
    db.add(product)
    db.flush()
    on_product_created(db, product)
    db.commit()
    db.refresh(product)
    return product_to_out(product, db)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, body: ProductUpdate, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "产品不存在")
    if body.name is not None:
        product.name = body.name.strip()
    if body.category_id is not None:
        if body.category_id and not db.get(ProductCategory, body.category_id):
            raise HTTPException(404, "类目不存在")
        product.category_id = body.category_id or None
    if body.tags is not None:
        old_tags = list(product.tags)
        product.tags = body.tags
        ensure_tags(db, product.tags)
        on_product_tags_changed(db, old_tags, product.tags)
    db.commit()
    db.refresh(product)
    return product_to_out(product, db)


@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "产品不存在")
    in_use = (
        db.query(Asset).filter(Asset.product_id == product_id).count()
        + db.query(Shot).filter(Shot.product_id == product_id).count()
        + db.query(ExportJob).filter(ExportJob.product_id == product_id).count()
        + db.query(Work).filter(Work.product_id == product_id).count()
    )
    if in_use:
        raise HTTPException(400, "该产品下仍有资源，无法删除")
    on_product_deleted(db, product)
    db.delete(product)
    db.commit()
    return {"ok": True}
