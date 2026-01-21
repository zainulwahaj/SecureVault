"""
AWS Lambda Handler for FastAPI Application

Uses Mangum to adapt FastAPI to AWS Lambda + API Gateway.
This file is the entry point for Lambda invocations.
"""

from mangum import Mangum
from app.main import app
from app.database import init_db

# Initialize database tables on cold start
# This runs once when Lambda container starts
init_db()

# Create Lambda handler
# Mangum wraps FastAPI to work with AWS Lambda
handler = Mangum(app, lifespan="off")
