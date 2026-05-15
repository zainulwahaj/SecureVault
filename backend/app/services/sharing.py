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

from datetime import datetime
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from app.models.user import User
from app.models.file import File
from app.models.shared_file import SharedFile
from app.models.user_key import UserKey
from app.models.device_key import DeviceKey
from app.models.share_envelope import ShareEnvelope
from app.models.shared_link import SharedLink
from app.services.key_directory import KeyDirectoryService, SHARING_KEY_TYPE, public_key_fingerprint


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
        self.keys = KeyDirectoryService(db)

    def _attach_key_info(self, user: User) -> Optional[User]:
        key = self.keys.ensure_sharing_key(user)
        if not key:
            return None
        self.ensure_default_device_key(user, key)
        setattr(user, "sharing_key_id", key.id)
        setattr(user, "sharing_key_fingerprint", key.fingerprint)
        setattr(user, "sharing_device_keys", self.list_device_keys(user))
        return user

    def _attach_existing_key_info(self, user: User, key: UserKey) -> User:
        self.ensure_default_device_key(user, key)
        setattr(user, "sharing_key_id", key.id)
        setattr(user, "sharing_key_fingerprint", key.fingerprint)
        setattr(user, "sharing_device_keys", self.list_device_keys(user))
        return user

    def ensure_default_device_key(self, user: User, user_key: Optional[UserKey] = None) -> Optional[DeviceKey]:
        """Materialize the legacy account sharing key as the user's default device key."""
        key = user_key or self.keys.ensure_sharing_key(user)
        if not key:
            return None
        existing = self.db.query(DeviceKey).filter(
            DeviceKey.user_id == user.id,
            DeviceKey.encryption_public_key == key.public_key,
            DeviceKey.revoked_at.is_(None),
        ).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                self.db.commit()
            return existing
        device_key = DeviceKey(
            user_id=user.id,
            device_label="Default sharing key",
            encryption_public_key=key.public_key,
            signing_public_key=None,
            fingerprint=key.fingerprint,
            is_active=True,
        )
        self.db.add(device_key)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return self.db.query(DeviceKey).filter(
                DeviceKey.user_id == user.id,
                DeviceKey.encryption_public_key == key.public_key,
                DeviceKey.revoked_at.is_(None),
            ).first()
        self.db.refresh(device_key)
        return device_key

    def list_device_keys(self, user: User) -> List[DeviceKey]:
        self.ensure_default_device_key(user)
        return self.db.query(DeviceKey).filter(
            DeviceKey.user_id == user.id,
            DeviceKey.is_active.is_(True),
            DeviceKey.revoked_at.is_(None),
        ).order_by(DeviceKey.created_at.asc()).all()

    def register_device_key(
        self,
        user: User,
        encryption_public_key: str,
        signing_public_key: Optional[str] = None,
        device_label: Optional[str] = None,
    ) -> Tuple[Optional[DeviceKey], Optional[str]]:
        try:
            fingerprint = public_key_fingerprint(encryption_public_key)
        except ValueError as exc:
            return None, str(exc)

        existing = self.db.query(DeviceKey).filter(
            DeviceKey.user_id == user.id,
            DeviceKey.encryption_public_key == encryption_public_key,
            DeviceKey.revoked_at.is_(None),
        ).first()
        if existing:
            existing.device_label = device_label or existing.device_label
            existing.signing_public_key = signing_public_key or existing.signing_public_key
            existing.is_active = True
            self.db.commit()
            self.db.refresh(existing)
            return existing, None

        key = DeviceKey(
            user_id=user.id,
            device_label=device_label,
            encryption_public_key=encryption_public_key,
            signing_public_key=signing_public_key,
            fingerprint=fingerprint,
            is_active=True,
        )
        self.db.add(key)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "Device key already exists"
        self.db.refresh(key)
        return key, None

    def revoke_device_key(self, user: User, device_key_id: str) -> Tuple[bool, Optional[str]]:
        key = self.db.query(DeviceKey).filter(
            DeviceKey.id == device_key_id,
            DeviceKey.user_id == user.id,
            DeviceKey.revoked_at.is_(None),
        ).first()
        if not key:
            return False, "Device key not found"
        active_count = self.db.query(DeviceKey).filter(
            DeviceKey.user_id == user.id,
            DeviceKey.is_active.is_(True),
            DeviceKey.revoked_at.is_(None),
        ).count()
        if active_count <= 1:
            return False, "Cannot revoke the last active sharing device key"
        now = datetime.utcnow()
        key.is_active = False
        key.revoked_at = now
        self.db.query(ShareEnvelope).filter(
            ShareEnvelope.recipient_device_key_id == key.id,
            ShareEnvelope.revoked_at.is_(None),
        ).update({"revoked_at": now}, synchronize_session=False)
        self.db.commit()
        return True, None
    
    def search_users(self, query: str, current_user_id: str, limit: int = 10) -> List[User]:
        """
        Search for users by email (for sharing UI).
        
        Only returns users who have a public key set (can receive shared files).
        Excludes the current user.
        """
        rows = self.db.query(User, UserKey).join(
            UserKey,
            and_(
                UserKey.user_id == User.id,
                UserKey.key_type == SHARING_KEY_TYPE,
                UserKey.public_key == User.public_key,
                UserKey.is_active.is_(True),
                UserKey.revoked_at.is_(None),
            ),
        ).filter(
            User.email.ilike(f"%{query}%"),
            User.id != current_user_id,
        ).limit(limit).all()
        return [self._attach_existing_key_info(user, key) for user, key in rows]
    
    def get_user_public_key(self, user_id: str) -> Optional[User]:
        """Get a user's public key for sharing"""
        row = self.db.query(User, UserKey).join(
            UserKey,
            and_(
                UserKey.user_id == User.id,
                UserKey.key_type == SHARING_KEY_TYPE,
                UserKey.public_key == User.public_key,
                UserKey.is_active.is_(True),
                UserKey.revoked_at.is_(None),
            ),
        ).filter(User.id == user_id).first()
        if not row:
            return None
        user, key = row
        return self._attach_existing_key_info(user, key)
    
    def share_file(
        self,
        file_id: str,
        owner: User,
        recipient_id: str,
        encrypted_file_key_for_recipient: Dict[str, Any],
        permission: str = "read",
        expires_at: Optional[datetime] = None,
        recipient_public_key_fingerprint: Optional[str] = None,
        device_envelopes: Optional[List[Dict[str, Any]]] = None,
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
        if permission != "read":
            return None, "Unsupported share permission"

        # Verify owner owns the file
        file = self.db.query(File).filter(
            File.id == file_id,
            File.user_id == owner.id,
            File.deleted_at.is_(None),
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

        recipient_key = self.keys.ensure_sharing_key(recipient)
        if not recipient_key:
            return None, "Recipient does not have an active sharing key"
        if not recipient_public_key_fingerprint:
            return None, "Recipient public key fingerprint is required"
        if recipient_public_key_fingerprint != recipient_key.fingerprint:
            return None, "Recipient public key fingerprint changed"
        
        now = datetime.utcnow()

        # Check if already shared. Expired shares are materialized as revoked so
        # the active partial unique index remains aligned with access policy.
        existing = self.db.query(SharedFile).filter(
            SharedFile.file_id == file_id,
            SharedFile.recipient_id == recipient_id,
            SharedFile.revoked_at.is_(None),
        ).first()

        if existing and existing.expires_at is not None and existing.expires_at <= now:
            existing.revoked_at = now
            self.db.flush()
            existing = None

        if existing:
            return None, "File is already shared with this user"
        
        active_device_keys = self.list_device_keys(recipient)
        if not active_device_keys:
            return None, "Recipient does not have an active device key"
        device_key_by_id = {key.id: key for key in active_device_keys}
        envelope_payloads: List[Dict[str, Any]] = []
        if device_envelopes:
            for envelope in device_envelopes:
                device_key = device_key_by_id.get(envelope.get("recipientDeviceKeyId"))
                if not device_key:
                    return None, "Recipient device key is not active"
                if envelope.get("recipientDeviceKeyFingerprint") != device_key.fingerprint:
                    return None, "Recipient device key fingerprint changed"
                envelope_payloads.append({
                    "device_key": device_key,
                    "encrypted_file_key": envelope.get("encryptedFileKey"),
                })
        else:
            default_device_key = self.ensure_default_device_key(recipient, recipient_key)
            if not default_device_key:
                return None, "Recipient does not have an active device key"
            envelope_payloads.append({
                "device_key": default_device_key,
                "encrypted_file_key": encrypted_file_key_for_recipient,
            })

        # Create share record and per-device envelopes. The legacy share column
        # remains populated for existing clients; the envelope table is the new
        # authoritative key-delivery surface.
        share = SharedFile(
            file_id=file_id,
            owner_id=owner.id,
            recipient_id=recipient_id,
            encrypted_file_key_for_recipient=encrypted_file_key_for_recipient,
            recipient_key_id=recipient_key.id,
            permission=permission,
            expires_at=expires_at,
        )
        self.db.add(share)
        self.db.flush()
        for payload in envelope_payloads:
            self.db.add(ShareEnvelope(
                share_id=share.id,
                recipient_device_key_id=payload["device_key"].id,
                recipient_user_key_id=recipient_key.id,
                encrypted_file_key=payload["encrypted_file_key"],
                key_version=1,
            ))
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "File is already shared with this user"
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
            SharedFile.revoked_at.is_(None),
        ).first()
        
        if not share:
            return False, "Share not found"
        
        now = datetime.utcnow()
        share.revoked_at = now
        for envelope in share.envelopes:
            if envelope.revoked_at is None:
                envelope.revoked_at = now
        self.db.commit()
        
        return True, None
    
    def get_files_shared_with_me(self, user: User) -> List[SharedFile]:
        """
        Get all files shared with the current user.
        
        Returns SharedFile records with file and owner info.
        """
        return self.db.query(SharedFile).join(File, SharedFile.file_id == File.id).filter(
            SharedFile.recipient_id == user.id,
            SharedFile.revoked_at.is_(None),
            or_(SharedFile.expires_at.is_(None), SharedFile.expires_at > datetime.utcnow()),
            File.deleted_at.is_(None),
        ).all()
    
    def get_files_shared_by_me(self, user: User) -> List[SharedFile]:
        """
        Get all files the current user has shared.
        
        Returns SharedFile records with file and recipient info.
        """
        return self.db.query(SharedFile).join(File, SharedFile.file_id == File.id).filter(
            SharedFile.owner_id == user.id,
            SharedFile.revoked_at.is_(None),
            or_(SharedFile.expires_at.is_(None), SharedFile.expires_at > datetime.utcnow()),
            File.deleted_at.is_(None),
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
        return self.db.query(SharedFile).join(File, SharedFile.file_id == File.id).filter(
            SharedFile.file_id == file_id,
            SharedFile.recipient_id == user_id,
            SharedFile.revoked_at.is_(None),
            or_(SharedFile.expires_at.is_(None), SharedFile.expires_at > datetime.utcnow()),
            File.deleted_at.is_(None),
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
        return self.db.query(SharedFile).join(File, SharedFile.file_id == File.id).filter(
            SharedFile.file_id == file_id,
            SharedFile.recipient_id == recipient.id,
            SharedFile.revoked_at.is_(None),
            or_(SharedFile.expires_at.is_(None), SharedFile.expires_at > datetime.utcnow()),
            File.deleted_at.is_(None),
        ).first()
    
    def update_user_keypair(
        self,
        user: User,
        public_key: str,
        encrypted_private_key: str,
    ) -> Tuple[Optional[User], Optional[str]]:
        """
        Update a user's keypair for envelope encryption.
        
        Called during registration or key rotation.
        
        Args:
            user: User to update
            public_key: X25519 public key (base64)
            encrypted_private_key: Private key encrypted with VaultKey
        """
        if public_key != user.public_key:
            active_inbound = self.db.query(SharedFile).filter(
                SharedFile.recipient_id == user.id,
                SharedFile.revoked_at.is_(None),
                or_(SharedFile.expires_at.is_(None), SharedFile.expires_at > datetime.utcnow()),
            ).first()
            if active_inbound:
                return None, "Cannot rotate sharing key while active inbound shares exist"
            key = self.keys.rotate_sharing_key(user, public_key)
        else:
            key = self.keys.ensure_sharing_key(user)
            if not key:
                return None, "Invalid sharing public key"

        user.encrypted_private_key = encrypted_private_key
        self.db.commit()
        self.db.refresh(user)
        setattr(user, "sharing_key_id", key.id)
        setattr(user, "sharing_key_fingerprint", key.fingerprint)
        return user, None


    def strong_revoke_share(
        self,
        file_id: str,
        owner: User,
        recipient_id: str,
    ) -> Tuple[bool, Optional[str]]:
        """Soft-revoke a recipient and mark their device envelopes revoked.

        Cryptographic strong revocation still requires the client to re-encrypt
        file content with a new FileKey and re-share fresh envelopes for any
        remaining recipients; the backend cannot perform that re-encryption in a
        zero-knowledge system. This endpoint makes the server-side access cut
        explicit and audit-friendly.
        """
        return self.unshare_file(file_id, owner, recipient_id)

    def rotate_file_envelopes(
        self,
        file: File,
        owner: User,
        recipient_envelopes: List[Dict[str, Any]],
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Atomic share-envelope rotation after a FileKey rewrap.

        For each currently-active recipient on `file`:
          - If new envelopes are supplied, mark the existing ShareEnvelope rows
            revoked, write fresh envelopes at `key_version+1`, and update the
            legacy `encrypted_file_key_for_recipient` column.
          - If no new envelopes are supplied, revoke the share entirely (the
            recipient is being cut out by this rotation).
        All public links on `file` are deactivated because their FileKey wrap
        was bound to the old key.

        Returns a summary dict on success or an error string. The caller is
        responsible for committing the surrounding transaction (this method
        only flushes).
        """
        now = datetime.utcnow()
        active_shares = self.db.query(SharedFile).filter(
            SharedFile.file_id == file.id,
            SharedFile.owner_id == owner.id,
            SharedFile.revoked_at.is_(None),
            or_(SharedFile.expires_at.is_(None), SharedFile.expires_at > now),
        ).all()

        envelopes_by_recipient: Dict[str, Dict[str, Any]] = {}
        for env in recipient_envelopes:
            recipient_id = env.get("recipientId")
            if not recipient_id:
                return None, "recipientId is required for every envelope"
            if recipient_id in envelopes_by_recipient:
                return None, "Duplicate recipient in rotation payload"
            envelopes_by_recipient[recipient_id] = env

        rotated_share_ids: List[str] = []
        revoked_share_ids: List[str] = []

        for share in active_shares:
            new_envelope = envelopes_by_recipient.pop(share.recipient_id, None)
            if new_envelope is None:
                # Recipient was not re-wrapped — strong-revoke them.
                share.revoked_at = now
                for env_row in share.envelopes:
                    if env_row.revoked_at is None:
                        env_row.revoked_at = now
                revoked_share_ids.append(share.id)
                continue

            recipient_key = share.recipient_key
            if not recipient_key:
                recipient_key = self.keys.ensure_sharing_key(share.recipient)
                if not recipient_key:
                    return None, "Recipient has no active sharing key"
            expected_fp = new_envelope.get("recipientPublicKeyFingerprint")
            if not expected_fp:
                return None, "Recipient public key fingerprint is required"
            if expected_fp != recipient_key.fingerprint:
                return None, (
                    f"Recipient {share.recipient_id} public key fingerprint changed; abort rotation"
                )

            device_envelopes = new_envelope.get("deviceEnvelopes") or []
            active_device_keys = self.list_device_keys(share.recipient)
            device_key_by_id = {k.id: k for k in active_device_keys}
            payloads: List[Dict[str, Any]] = []
            if device_envelopes:
                for entry in device_envelopes:
                    device_key = device_key_by_id.get(entry.get("recipientDeviceKeyId"))
                    if not device_key:
                        return None, "Recipient device key is not active"
                    if entry.get("recipientDeviceKeyFingerprint") != device_key.fingerprint:
                        return None, "Recipient device key fingerprint changed"
                    payloads.append({
                        "device_key": device_key,
                        "encrypted_file_key": entry.get("encryptedFileKey"),
                    })
            else:
                default_device_key = self.ensure_default_device_key(share.recipient, recipient_key)
                if not default_device_key:
                    return None, "Recipient has no active device key"
                payloads.append({
                    "device_key": default_device_key,
                    "encrypted_file_key": new_envelope.get("encryptedFileKeyForRecipient"),
                })

            # Compute the next key_version for this share.
            current_max = self.db.query(ShareEnvelope.key_version).filter(
                ShareEnvelope.share_id == share.id,
            ).order_by(ShareEnvelope.key_version.desc()).first()
            next_version = (current_max[0] if current_max else 0) + 1

            # Revoke the old envelopes and write the new ones.
            for env_row in share.envelopes:
                if env_row.revoked_at is None:
                    env_row.revoked_at = now
            for payload in payloads:
                self.db.add(ShareEnvelope(
                    share_id=share.id,
                    recipient_device_key_id=payload["device_key"].id,
                    recipient_user_key_id=recipient_key.id,
                    encrypted_file_key=payload["encrypted_file_key"],
                    key_version=next_version,
                ))
            share.encrypted_file_key_for_recipient = new_envelope.get("encryptedFileKeyForRecipient")
            share.recipient_key_id = recipient_key.id
            rotated_share_ids.append(share.id)

        if envelopes_by_recipient:
            unknown = ", ".join(envelopes_by_recipient.keys())
            return None, f"Envelopes supplied for non-active recipients: {unknown}"

        # Deactivate any public links — their stored FileKey wrap is now stale.
        links = self.db.query(SharedLink).filter(
            SharedLink.file_id == file.id,
            SharedLink.is_active.is_(True),
        ).all()
        revoked_link_ids: List[str] = []
        for link in links:
            link.is_active = False
            revoked_link_ids.append(link.id)

        self.db.flush()
        next_key_version = max(
            (e.key_version for s in active_shares for e in s.envelopes),
            default=1,
        )
        return (
            {
                "rotatedShareIds": rotated_share_ids,
                "revokedShareIds": revoked_share_ids,
                "revokedLinkIds": revoked_link_ids,
                "keyVersion": next_key_version,
            },
            None,
        )
