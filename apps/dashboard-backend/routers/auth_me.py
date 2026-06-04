from fastapi import APIRouter, Depends

from deps.rbac import Principal, get_current_principal

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
async def get_me(principal: Principal = Depends(get_current_principal)):
    return {
        "id": principal.user_id,
        "email": principal.email,
        "display_name": principal.display_name,
        "global_role": principal.global_role,
        "can_manage_users": principal.can_manage_users,
        "can_view_system": principal.can_access_system,
        "allowed_factory_ids": (
            None
            if principal.allowed_factory_ids is None
            else sorted(principal.allowed_factory_ids)
        ),
    }
