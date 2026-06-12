from __future__ import annotations

from sqlalchemy.orm import Session

from models import Tag


def list_tags(db: Session, product_id: int | None = None) -> list[Tag]:
    q = db.query(Tag).order_by(Tag.name.asc())
    if product_id is not None:
        q = q.filter(Tag.product_id == product_id)
    return q.all()


def list_tag_names(db: Session, product_id: int | None = None) -> list[str]:
    return [t.name for t in list_tags(db, product_id)]


def tag_exists(db: Session, name: str, product_id: int) -> bool:
    return (
        db.query(Tag)
        .filter(Tag.product_id == product_id, Tag.name == name)
        .first()
        is not None
    )


def create_tag(db: Session, name: str, product_id: int) -> Tag:
    tag = Tag(name=name, product_id=product_id)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def ensure_tags(db: Session, tag_names: list[str], product_id: int | None) -> None:
    """Register tags used on resources so they appear in the tag library for that product."""
    if not product_id:
        return
    added = False
    existing = {
        t.name
        for t in db.query(Tag).filter(Tag.product_id == product_id).all()
    }
    for raw in tag_names:
        name = raw.strip()
        if not name or name in existing:
            continue
        db.add(Tag(name=name, product_id=product_id))
        existing.add(name)
        added = True
    if added:
        db.commit()
