"""
File Storage Service - Zero-Knowledge Encrypted File Storage

SECURITY PRINCIPLES:
1. Backend NEVER decrypts files
2. Backend NEVER sees original filenames
3. Backend stores files with UUID names only
4. All metadata is encrypted client-side
5. Backend is cryptographically blind to file contents

STORAGE BACKENDS:
- Local filesystem (development)
- AWS S3 (production/Lambda)

FILE LIFECYCLE:
1. Client generates random FileKey
2. Client encrypts file content with FileKey (secretstream)
3. Client encrypts FileKey with VaultKey (XChaCha20-Poly1305)
4. Client encrypts filename with FileKey
5. Client uploads: encrypted content + encrypted metadata
6. Backend stores as opaque blobs
"""

import os
import uuid
import aiofiles
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any, BinaryIO
from sqlalchemy.orm import Session as DBSession
from app.models.file import File
from app.models.user import User
from app.config import get_settings

settings = get_settings()


class FileService:
    """
    Zero-Knowledge File Storage Service.
    
    SECURITY:
    - Stores only encrypted blobs (cannot decrypt)
    - Uses UUID for storage paths (no filename leakage)
    - Validates ownership for all operations
    
    Supports both local filesystem and S3 storage.
    """
    
    def __init__(self, db: DBSession):
        self.db = db
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.use_s3 = settings.USE_S3_STORAGE and settings.S3_BUCKET_NAME
        
        if self.use_s3:
            from app.services.s3_storage import S3StorageService
            self.s3_service = S3StorageService()
    
    def _ensure_upload_dir(self, user_id: str) -> Path:
        """Ensure user's upload directory exists (local storage only)"""
        user_dir = self.upload_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir
    
    def _get_storage_path(self, user_id: str, file_id: str) -> Path:
        """Get the storage path for a file (local storage only)"""
        return self.upload_dir / user_id / file_id
    
    async def save_file(
        self,
        user: User,
        encrypted_content: bytes,
        encrypted_file_key: Dict[str, Any],
        encrypted_filename: Dict[str, Any],
        encrypted_mime_type: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Optional[File], Optional[str]]:
        """
        Save an encrypted file.
        
        SECURITY:
        - encrypted_content: Already encrypted by client
        - encrypted_file_key: FileKey encrypted with VaultKey
        - encrypted_filename: Original filename encrypted with FileKey
        - Backend cannot decrypt any of these
        
        Args:
            user: Authenticated user
            encrypted_content: Encrypted file bytes
            encrypted_file_key: FileKey encrypted with VaultKey (dict)
            encrypted_filename: Filename encrypted with FileKey (dict)
            encrypted_mime_type: MIME type encrypted with FileKey (optional, dict)
        
        Returns: (file_record, error_message)
        """
        file_id = str(uuid.uuid4())
        
        try:
            if self.use_s3:
                # Save to S3
                success, error = await self.s3_service.save_file(
                    user_id=user.id,
                    file_id=file_id,
                    encrypted_content=encrypted_content,
                )
                if not success:
                    return None, error
                storage_path = f"s3://{settings.S3_BUCKET_NAME}/files/{user.id}/{file_id}"
            else:
                # Save to local filesystem
                user_dir = self._ensure_upload_dir(user.id)
                storage_path_local = str(user_dir / file_id)
                relative_path = f"{user.id}/{file_id}"
                
                async with aiofiles.open(storage_path_local, 'wb') as f:
                    await f.write(encrypted_content)
                
                storage_path = relative_path
            
            # Create database record
            file_record = File(
                id=file_id,
                user_id=user.id,
                encrypted_file_key=encrypted_file_key,
                encrypted_filename=encrypted_filename,
                encrypted_mime_type=encrypted_mime_type,
                storage_path=storage_path,
                encrypted_size=len(encrypted_content),
            )
            
            self.db.add(file_record)
            self.db.commit()
            self.db.refresh(file_record)
            
            return file_record, None
            
        except Exception as e:
            self.db.rollback()
            # Clean up file if database operation failed
            if self.use_s3:
                await self.s3_service.delete_file(user.id, file_id)
            else:
                storage_path = self._get_storage_path(user.id, file_id)
                if storage_path.exists():
                    storage_path.unlink()
            return None, f"Failed to save file: {str(e)}"
    
    def get_file_by_id(self, file_id: str, user_id: str) -> Optional[File]:
        """
        Get a file record by ID, verifying ownership.
        
        SECURITY: Always verify user owns the file.
        """
        return self.db.query(File).filter(
            File.id == file_id,
            File.user_id == user_id
        ).first()
    
    def list_files(self, user: User) -> List[File]:
        """
        List all files for a user.
        
        Returns encrypted metadata - client must decrypt.
        """
        return self.db.query(File).filter(
            File.user_id == user.id
        ).order_by(File.created_at.desc()).all()
    
    async def read_file_content(self, file_record: File) -> Tuple[Optional[bytes], Optional[str]]:
        """
        Read encrypted file content from storage.
        
        SECURITY: Content is encrypted - backend cannot read it.
        
        Args:
            file_record: File database record
        
        Returns: (encrypted_bytes, error_message)
        """
        try:
            if self.use_s3:
                # Read from S3
                content, error = await self.s3_service.read_file(
                    user_id=file_record.user_id,
                    file_id=file_record.id,
                )
                return content, error
            else:
                # Read from local filesystem
                storage_path = self.upload_dir / file_record.storage_path
                
                if not storage_path.exists():
                    return None, "File not found on disk"
                
                async with aiofiles.open(storage_path, 'rb') as f:
                    content = await f.read()
                
                return content, None
            
        except Exception as e:
            return None, f"Failed to read file: {str(e)}"
    
    async def delete_file(self, file_record: File) -> Tuple[bool, Optional[str]]:
        """
        Delete a file and its database record.
        
        Args:
            file_record: File to delete
        
        Returns: (success, error_message)
        """
        try:
            if self.use_s3:
                # Delete from S3
                success, error = await self.s3_service.delete_file(
                    user_id=file_record.user_id,
                    file_id=file_record.id,
                )
                if not success:
                    return False, error
            else:
                # Delete from local filesystem
                storage_path = self.upload_dir / file_record.storage_path
                if storage_path.exists():
                    storage_path.unlink()
            
            # Delete from database
            self.db.delete(file_record)
            self.db.commit()
            
            return True, None
            
        except Exception as e:
            self.db.rollback()
            return False, f"Failed to delete file: {str(e)}"
    
    def get_file_count(self, user: User) -> int:
        """Get total number of files for a user"""
        return self.db.query(File).filter(File.user_id == user.id).count()
    
    def get_total_size(self, user: User) -> int:
        """Get total encrypted storage size for a user"""
        from sqlalchemy import func
        result = self.db.query(func.sum(File.encrypted_size)).filter(
            File.user_id == user.id
        ).scalar()
        return result or 0
