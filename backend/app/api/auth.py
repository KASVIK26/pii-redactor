from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from supabase import create_client, Client
from app.core.config import settings

router = APIRouter()
security = HTTPBearer()

# Initialize Supabase client
def get_supabase_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

class UserCreate(BaseModel):
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

@router.post("/signup", response_model=Token)
async def signup(user_data: UserCreate):
    """Register a new user"""
    supabase = get_supabase_client()
    
    try:
        response = supabase.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password
        })
        
        if response.user:
            return {
                "access_token": response.session.access_token,
                "token_type": "bearer",
                "user": response.user.model_dump()
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User registration failed"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    """Authenticate user and return token"""
    supabase = get_supabase_client()
    
    try:
        response = supabase.auth.sign_in_with_password({
            "email": user_data.email,
            "password": user_data.password
        })
        
        if response.user:
            return {
                "access_token": response.session.access_token,
                "token_type": "bearer",
                "user": response.user.model_dump()
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )

@router.post("/logout")
async def logout(token: str = Depends(security)):
    """Logout user"""
    supabase = get_supabase_client()
    
    try:
        supabase.auth.sign_out()
        return {"message": "Successfully logged out"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/profile")
async def get_profile(token: str = Depends(security)):
    """Get current user profile"""
    supabase = get_supabase_client()
    
    try:
        user = supabase.auth.get_user(token.credentials)
        if user:
            return user.user.model_dump()
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token verification failed"
        )