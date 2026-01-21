"""
S3 Storage Service - Cloud File Storage for AWS Lambda

SECURITY:
- All files stored encrypted (client-side encryption)
- S3 bucket has server-side encryption enabled
- Files stored with UUID keys (no filename leakage)
- Presigned URLs for secure upload/download
"""

import uuid
from typing import Optional, Tuple, Dict, Any
import boto3
from botocore.exceptions import ClientError
from app.config import get_settings

settings = get_settings()


class S3StorageService:
    """
    S3 Storage Service for encrypted files.
    
    SECURITY:
    - Files are already encrypted client-side
    - S3 adds server-side encryption (AES-256)
    - Presigned URLs expire quickly
    """
    
    def __init__(self):
        self.s3 = boto3.client('s3', region_name=settings.AWS_REGION)
        self.bucket = settings.S3_BUCKET_NAME
    
    def _get_object_key(self, user_id: str, file_id: str) -> str:
        """Generate S3 object key"""
        return f"files/{user_id}/{file_id}"
    
    async def save_file(
        self,
        user_id: str,
        file_id: str,
        encrypted_content: bytes,
    ) -> Tuple[bool, Optional[str]]:
        """
        Save encrypted file to S3.
        
        Args:
            user_id: User's ID
            file_id: File's unique ID
            encrypted_content: Already encrypted bytes
        
        Returns: (success, error_message)
        """
        try:
            key = self._get_object_key(user_id, file_id)
            
            self.s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=encrypted_content,
                ContentType='application/octet-stream',
                # S3 adds server-side encryption on top of client encryption
                ServerSideEncryption='AES256',
                Metadata={
                    'user-id': user_id,
                    'encrypted': 'true',
                }
            )
            
            return True, None
            
        except ClientError as e:
            return False, f"S3 upload failed: {str(e)}"
        except Exception as e:
            return False, f"Failed to save to S3: {str(e)}"
    
    async def read_file(
        self,
        user_id: str,
        file_id: str,
    ) -> Tuple[Optional[bytes], Optional[str]]:
        """
        Read encrypted file from S3.
        
        Args:
            user_id: User's ID
            file_id: File's unique ID
        
        Returns: (encrypted_bytes, error_message)
        """
        try:
            key = self._get_object_key(user_id, file_id)
            
            response = self.s3.get_object(
                Bucket=self.bucket,
                Key=key,
            )
            
            content = response['Body'].read()
            return content, None
            
        except self.s3.exceptions.NoSuchKey:
            return None, "File not found in S3"
        except ClientError as e:
            return None, f"S3 download failed: {str(e)}"
        except Exception as e:
            return None, f"Failed to read from S3: {str(e)}"
    
    async def delete_file(
        self,
        user_id: str,
        file_id: str,
    ) -> Tuple[bool, Optional[str]]:
        """
        Delete file from S3.
        
        Args:
            user_id: User's ID
            file_id: File's unique ID
        
        Returns: (success, error_message)
        """
        try:
            key = self._get_object_key(user_id, file_id)
            
            self.s3.delete_object(
                Bucket=self.bucket,
                Key=key,
            )
            
            return True, None
            
        except ClientError as e:
            return False, f"S3 delete failed: {str(e)}"
        except Exception as e:
            return False, f"Failed to delete from S3: {str(e)}"
    
    def generate_presigned_upload_url(
        self,
        user_id: str,
        file_id: str,
        expires_in: int = 3600,
    ) -> Optional[str]:
        """
        Generate a presigned URL for direct upload to S3.
        
        Useful for large file uploads to bypass Lambda payload limits.
        
        Args:
            user_id: User's ID
            file_id: File's unique ID
            expires_in: URL expiration time in seconds
        
        Returns: Presigned URL or None
        """
        try:
            key = self._get_object_key(user_id, file_id)
            
            url = self.s3.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket,
                    'Key': key,
                    'ContentType': 'application/octet-stream',
                },
                ExpiresIn=expires_in,
            )
            
            return url
            
        except Exception:
            return None
    
    def generate_presigned_download_url(
        self,
        user_id: str,
        file_id: str,
        expires_in: int = 3600,
    ) -> Optional[str]:
        """
        Generate a presigned URL for direct download from S3.
        
        Args:
            user_id: User's ID
            file_id: File's unique ID
            expires_in: URL expiration time in seconds
        
        Returns: Presigned URL or None
        """
        try:
            key = self._get_object_key(user_id, file_id)
            
            url = self.s3.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket,
                    'Key': key,
                },
                ExpiresIn=expires_in,
            )
            
            return url
            
        except Exception:
            return None
