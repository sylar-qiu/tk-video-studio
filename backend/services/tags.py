from __future__ import annotations

from sqlalchemy.orm import Session

from models import Tag


def list_tags(db: Session) -> list[Tag]:
    return db.query(Tag).order_by(Tag.name.asc()).all()


def list_tag_names(db: Session) -> list[str]:
    return [t.name for t in list_tags(db)]


def tag_exists(db: Session, name: str) -> bool:
    return db.query(Tag).filter(Tag.name == name).first() is not None


def create_tag(db: Session, name: str) -> Tag:
    tag = Tag(name=name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def ensure_tags(db: Session, tag_names: list[str]) -> None:
    """Register tags used on resources so they appear in the tag library."""
    added = False
    existing = {t.name for t in db.query(Tag).all()}
    for raw in tag_names:
        name = raw.strip()
        if not name or name in existing:
            continue
        db.add(Tag(name=name))
        existing.add(name)
        added = True
    if added:
        db.commit()
