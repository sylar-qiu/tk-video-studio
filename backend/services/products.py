from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Asset, ExportJob, Product, ProductCategory, Shot, Tag, Work
from schemas import CategoryOut, ProductOut, ProductStats


def category_path(category: ProductCategory | None, db: Session) -> str | None:
    if not category:
        return None
    parts: list[str] = []
    current: ProductCategory | None = category
    seen: set[int] = set()
    while current and current.id not in seen:
        seen.add(current.id)
        parts.append(current.name)
        if current.parent_id is None:
            break
        current = db.get(ProductCategory, current.parent_id)
    return " > ".join(reversed(parts))


def build_category_tree(db: Session) -> list[CategoryOut]:
    cats = db.query(ProductCategory).order_by(
        ProductCategory.sort_order.asc(), ProductCategory.id.asc(),
    ).all()
    by_parent: dict[int | None, list[ProductCategory]] = {}
    for c in cats:
        by_parent.setdefault(c.parent_id, []).append(c)

    def walk(parent_id: int | None, prefix: list[str]) -> list[CategoryOut]:
        nodes: list[CategoryOut] = []
        for c in by_parent.get(parent_id, []):
            path_parts = prefix + [c.name]
            path = " > ".join(path_parts)
            nodes.append(CategoryOut(
                id=c.id,
                name=c.name,
                parent_id=c.parent_id,
                sort_order=c.sort_order,
                path=path,
                children=walk(c.id, path_parts),
            ))
        return nodes

    return walk(None, [])


def product_stats(db: Session, product_id: int) -> ProductStats:
    return ProductStats(
        assets=db.query(func.count(Asset.id)).filter(Asset.product_id == product_id).scalar() or 0,
        shots=db.query(func.count(Shot.id)).filter(Shot.product_id == product_id).scalar() or 0,
        exports=db.query(func.count(ExportJob.id)).filter(ExportJob.product_id == product_id).scalar() or 0,
        works=db.query(func.count(Work.id)).filter(Work.product_id == product_id).scalar() or 0,
        tags=db.query(func.count(Tag.id)).filter(Tag.product_id == product_id).scalar() or 0,
    )


def product_to_out(product: Product, db: Session) -> ProductOut:
    cat = db.get(ProductCategory, product.category_id) if product.category_id else None
    return ProductOut(
        id=product.id,
        name=product.name,
        category_id=product.category_id,
        category_path=category_path(cat, db),
        tags=product.tags,
        stats=product_stats(db, product.id),
        created_at=product.created_at,
    )


def product_name_map(db: Session) -> dict[int, str]:
    return {p.id: p.name for p in db.query(Product).all()}
