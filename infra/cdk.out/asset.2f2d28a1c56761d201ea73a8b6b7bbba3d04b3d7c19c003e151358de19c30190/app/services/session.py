"""
Session Management Service

Handles creation, validation, and destruction of user sessions.

SECURITY NOTE:
- Sessions are for authorization only
- Sessions do NOT contain or grant access to encryption keys
- All cryptographic operations happen client-side
"""

from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session as DBSession
from app.models.session import Session
from app.models.user import User


class SessionService:
    """Service for managing user sessions"""
    
    def __init__(self, db: DBSession):
        self.db = db
    
    def create_session(self, user: User) -> Session:
        """
        Create a new session for a user.
        
        Returns a Session object with a secure random token.
        """
        session = Session(user_id=user.id)
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session
    
    def get_session_by_token(self, token: str) -> Optional[Session]:
        """
        Retrieve a session by its token.
        
        Returns None if session doesn't exist or is expired.
        """
        session = self.db.query(Session).filter(Session.token == token).first()
        
        if session is None:
            return None
        
        # Check expiration
        if session.is_expired:
            self.delete_session(session)
            return None
        
        return session
    
    def get_user_from_token(self, token: str) -> Optional[User]:
        """
        Get the user associated with a session token.
        
        Returns None if session is invalid or expired.
        """
        session = self.get_session_by_token(token)
        if session is None:
            return None
        return session.user
    
    def delete_session(self, session: Session) -> None:
        """Delete a session (logout)"""
        self.db.delete(session)
        self.db.commit()
    
    def delete_session_by_token(self, token: str) -> bool:
        """
        Delete a session by its token.
        
        Returns True if session was found and deleted, False otherwise.
        """
        session = self.db.query(Session).filter(Session.token == token).first()
        if session:
            self.db.delete(session)
            self.db.commit()
            return True
        return False
    
    def delete_all_user_sessions(self, user_id: str) -> int:
        """
        Delete all sessions for a user (logout from all devices).
        
        Returns the number of sessions deleted.
        """
        count = self.db.query(Session).filter(Session.user_id == user_id).delete()
        self.db.commit()
        return count
    
    def cleanup_expired_sessions(self) -> int:
        """
        Remove all expired sessions from the database.
        
        Should be called periodically (e.g., via cron job).
        Returns the number of sessions deleted.
        """
        count = self.db.query(Session).filter(
            Session.expires_at < datetime.utcnow()
        ).delete()
        self.db.commit()
        return count
