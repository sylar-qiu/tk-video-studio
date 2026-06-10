from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from models import ConcatProject, ExportJob


def next_export_name(db: Session) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    prefix = f"成片_{today}-"
    names = [
        row[0]
        for row in db.query(ExportJob.name).filter(ExportJob.name.startswith(prefix)).all()
    ]
    max_seq = 0
    for name in names:
        tail = name[len(prefix) :]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1}"


def next_project_name(db: Session) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    prefix = f"脚本_{today}-"
    legacy_prefix = f"工作台_{today}-"
    names = [
        row[0]
        for row in db.query(ConcatProject.name)
        .filter(
            (ConcatProject.name.startswith(prefix))
            | (ConcatProject.name.startswith(legacy_prefix))
        )
        .all()
    ]
    max_seq = 0
    for name in names:
        if name.startswith(prefix):
            tail = name[len(prefix) :]
        else:
            tail = name[len(legacy_prefix) :]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1}"


def next_batch_project_name(db: Session) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    prefix = f"批量脚本_{today}-"
    names = [
        row[0]
        for row in db.query(ConcatProject.name).filter(ConcatProject.name.startswith(prefix)).all()
    ]
    max_seq = 0
    for name in names:
        tail = name[len(prefix) :]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1}"
