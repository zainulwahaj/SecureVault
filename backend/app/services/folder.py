"""
Folder Service — Encrypted hierarchical folder management

Backend is cryptographically blind to folder names.
"""

from typing import Optional, Tuple, List
from sqlalchemy.orm import Session as DBSession
from app.models.folder import Folder
from app.models.file import File
from app.models.user import User


class FolderService:
    """CRUD operations for encrypted folders."""

    def __init__(self, db: DBSession):
        self.db = db

    def create_folder(
        self,
        user: User,
        encrypted_name: dict,
        parent_id: Optional[str] = None,
    ) -> Tuple[Optional[Folder], Optional[str]]:
        """Create a new encrypted folder. Returns (folder, error)."""
        if parent_id:
            parent = self.db.query(Folder).filter(
                Folder.id == parent_id,
                Folder.user_id == user.id,
            ).first()
            if not parent:
                return None, "Parent folder not found"

        folder = Folder(
            user_id=user.id,
            parent_id=parent_id,
            encrypted_name=encrypted_name,
        )
        self.db.add(folder)
        self.db.commit()
        self.db.refresh(folder)
        return folder, None

    def list_folders(
        self,
        user: User,
        parent_id: Optional[str] = None,
    ) -> List[Folder]:
        """List folders at a given level (root if parent_id is None)."""
        q = self.db.query(Folder).filter(Folder.user_id == user.id)
        if parent_id is not None:
            q = q.filter(Folder.parent_id == parent_id)
        else:
            q = q.filter(Folder.parent_id.is_(None))
        return q.order_by(Folder.created_at.desc()).all()

    def get_folder(self, folder_id: str, user_id: str) -> Optional[Folder]:
        """Get a single folder verifying ownership."""
        return self.db.query(Folder).filter(
            Folder.id == folder_id,
            Folder.user_id == user_id,
        ).first()

    def rename_folder(
        self,
        folder: Folder,
        encrypted_name: dict,
    ) -> Folder:
        """Update a folder's encrypted name."""
        folder.encrypted_name = encrypted_name
        self.db.commit()
        self.db.refresh(folder)
        return folder

    def move_folder(
        self,
        folder: Folder,
        new_parent_id: Optional[str],
        user_id: str,
    ) -> Tuple[Optional[Folder], Optional[str]]:
        """Move a folder to a new parent. Returns (folder, error)."""
        if new_parent_id:
            # Prevent moving into self or descendant
            if new_parent_id == folder.id:
                return None, "Cannot move folder into itself"
            if self._is_descendant(folder.id, new_parent_id):
                return None, "Cannot move folder into one of its descendants"
            parent = self.db.query(Folder).filter(
                Folder.id == new_parent_id,
                Folder.user_id == user_id,
            ).first()
            if not parent:
                return None, "Target folder not found"

        folder.parent_id = new_parent_id
        self.db.commit()
        self.db.refresh(folder)
        return folder, None

    def delete_folder(self, folder: Folder) -> Tuple[bool, Optional[str]]:
        """Delete a folder and cascade (children + files handled via FK)."""
        try:
            self.db.delete(folder)
            self.db.commit()
            return True, None
        except Exception as e:
            self.db.rollback()
            return False, str(e)

    # ------------------------------------------------------------------

    def _is_descendant(self, ancestor_id: str, candidate_id: str) -> bool:
        """Check whether candidate_id is a descendant of ancestor_id."""
        current = self.db.query(Folder).filter(Folder.id == candidate_id).first()
        while current:
            if current.parent_id == ancestor_id:
                return True
            current = self.db.query(Folder).filter(Folder.id == current.parent_id).first() if current.parent_id else None
        return False
