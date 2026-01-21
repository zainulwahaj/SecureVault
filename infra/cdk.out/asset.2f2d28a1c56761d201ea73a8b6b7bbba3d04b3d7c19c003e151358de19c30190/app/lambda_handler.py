"""
AWS Lambda Handler for FastAPI Application

Uses Mangum to adapt FastAPI to AWS Lambda + API Gateway.
This file is the entry point for Lambda invocations.
"""

from mangum import Mangum
from app.main import app

# Create Lambda handler
# Mangum wraps FastAPI to work with AWS Lambda
handler = Mangum(app, lifespan="off")
