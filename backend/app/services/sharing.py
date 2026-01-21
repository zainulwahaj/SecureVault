"""
Sharing Service - Envelope Encryption for File Sharing

SECURITY PRINCIPLES:
1. Backend NEVER decrypts files or FileKeys
2. Sharing uses envelope encryption (re-encrypt FileKey for recipient)
3. All crypto operations happen client-side
4. Backend only stores and retrieves encrypted blobs

SHARING FLOW:
1. Owner wants to share file with recipient
2. Client fetches recipient's public key from backend
3. Client encrypts FileKey with recipient's public key (crypto_box_seal)
4. Backend stores the encrypted FileKey for recipient
5. Recipient fetches the shared file
6. Recipient decrypts FileKey with their private key
7. Recipient decrypts file content with FileKey
"""

from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import or_
from app.models.user import User
from app.models.file import File
from app.models.shared_file import SharedFile


class SharingService:
    """
    Zero-Knowledge File Sharing Service.
    
    SECURITY:
    - Stores only encrypted FileKeys
    - Cannot decrypt any shared data
    - Verifies ownership before sharing
    """
    
    def __init__(self, db: DBSession):
        self.db = db
    
    def search_users(self, query: str, current_user_id: str, limit: int = 10) -> List[User]:
        """
        Search for users by email (for sharing UI).
        
        Only returns users who have a public key set (can receive shared files).
        Excludes the current user.
        """
        return self.db.query(User).filter(
            User.email.ilike(f"%{query}%"),
            User.id != current_user_id,
            User.public_key.isnot(None),  # Must have public key to receive shares
        ).limit(limit).all()
    
    def get_user_public_key(self, user_id: str) -> Optional[User]:
        """Get a user's public key for sharing"""
        return self.db.query(User).filter(
            User.id == user_id,
            User.public_key.isnot(None),
        ).first()
    
    def share_file(
        self,
        file_id: str,
        owner: User,
        recipient_id: str,
        encrypted_file_key_for_recipient: Dict[str, Any],
    ) -> Tuple[Optional[SharedFile], Optional[str]]:
        """
        Share a file with another user.
        
        SECURITY:
        - Verifies owner owns the file
        - Verifies recipient exists and has public key
        - Stores encrypted FileKey (cannot decrypt)
        
        Args:
            file_id: ID of file to share
            owner: Current user (file owner)
            recipient_id: User to share with
            encrypted_file_key_for_recipient: FileKey encrypted with recipient's public key
        
        Returns: (SharedFile, error_message)
        """
        # Verify owner owns the file
        file = self.db.query(File).filter(
            File.id == file_id,
            File.user_id == owner.id
        ).first()
        
        if not file:
            return None, "File not found or you don't own it"
        
        # Verify recipient exists and has public key
        recipient = self.db.query(User).filter(
            User.id == recipient_id,
            User.public_key.isnot(None),
        ).first()
        
        if not recipient:
            return None, "Recipient not found or cannot receive shared files"
        
        # Can't share with yourself
        if recipient_id == owner.id:
            return None, "Cannot share file with yourself"
        
        # Check if already shared
        existing = self.db.query(SharedFile).filter(
            SharedFile.file_id == file_id,
            SharedFile.recipient_id == recipient_id,
        ).first()
        
        if existing:
            return None, "File is already shared with this user"
        
        # Create share record
        share = SharedFile(
            file_id=file_id,
            owner_id=owner.id,
            recipient_id=recipient_id,
            encrypted_file_key_for_recipient=encrypted_file_key_for_recipient,
        )
        
        self.db.add(share)
        self.db.commit()
        self.db.refresh(share)
        
        return share, None
    
    def unshare_file(
        self,
        file_id: str,
        owner: User,
        recipient_id: str,
    ) -> Tuple[bool, Optional[str]]:
        """
        Remove sharing access for a user.
        
        Args:
            file_id: ID of file to unshare
            owner: Current user (must be file owner)
            recipient_id: User to remove access from
        
        Returns: (success, error_message)
        """
        share = self.db.query(SharedFile).filter(
            SharedFile.file_id == file_id,
            SharedFile.owner_id == owner.id,
            SharedFile.recipient_id == recipient_id,
        ).first()
        
        if not share:
            return False, "Share not found"
        
        self.db.delete(share)
        self.db.commit()
        
        return True, None
    
    def get_files_shared_with_me(self, user: User) -> List[SharedFile]:
        """
        Get all files shared with the current user.
        
        Returns SharedFile records with file and owner info.
        """
        return self.db.query(SharedFile).filter(
            SharedFile.recipient_id == user.id
        ).all()
    
    def get_files_shared_by_me(self, user: User) -> List[SharedFile]:
        """
        Get all files the current user has shared.
        
        Returns SharedFile records with file and recipient info.
        """
        return self.db.query(SharedFile).filter(
            SharedFile.owner_id == user.id
        ).all()
    
    def get_share_by_id(
        self, 
        file_id: str, 
        user_id: str
    ) -> Optional[SharedFile]:
        """
        Get a specific share record.
        
        User can be either owner or recipient.
        """
        return self.db.query(SharedFile).filter(
            SharedFile.file_id == file_id,
            or_(
                SharedFile.owner_id == user_id,
                SharedFile.recipient_id == user_id,
            )
        ).first()
    
    def get_shared_file_for_recipient(
        self,
        file_id: str,
        recipient: User,
    ) -> Optional[SharedFile]:
        """
        Get a shared file record for a specific recipient.
        
        Used when recipient wants to download a shared file.
        """
        return self.db.query(SharedFile).filter(
            SharedFile.file_id == file_id,
            SharedFile.recipient_id == recipient.id,
        ).first()
    
    def update_user_keypair(
        self,
        user: User,
        public_key: str,
        encrypted_private_key: Dict[str, Any],
    ) -> User:
        """
        Update a user's keypair for envelope encryption.
        
        Called during registration or key rotation.
        
        Args:
            user: User to update
            public_key: X25519 public key (base64)
            encrypted_private_key: Private key encrypted with VaultKey
        """
        user.public_key = public_key
        user.encrypted_private_key = encrypted_private_key
        self.db.commit()
        self.db.refresh(user)
        return user
